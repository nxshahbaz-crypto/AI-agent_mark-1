// ═══════════════════════════════════════════════════════════════════
// Phase 5.5 — Provider Abstraction & Failover Tests
//
// Tests provider router, automatic failover, error classification,
// tool-calling compatibility, environment configuration, and secret
// masking using mocked providers. Zero Gemini or Groq API calls.
// Run: npm run test:providers
// ═══════════════════════════════════════════════════════════════════

import {
  ProviderRouter,
  classifyError,
  sanitizeErrorMessage,
} from "./providers/provider-router.js";
import { GeminiProvider } from "./providers/gemini-provider.js";
import { GroqProvider } from "./providers/groq-provider.js";
import { ToolRegistry } from "./tool-registry.js";
import { buildContext } from "./context-manager.js";

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

// ─── Mock Provider Helper ─────────────────────────────────────────
class MockProvider {
  constructor(name, responseOrError) {
    this.name = name;
    this.responseOrError = responseOrError;
    this.calls = [];
  }

  async sendMessage(params) {
    this.calls.push(params);
    if (typeof this.responseOrError === "function") {
      return await this.responseOrError(params);
    }
    if (
      this.responseOrError instanceof Error ||
      (this.responseOrError && (this.responseOrError.status || this.responseOrError.code))
    ) {
      throw this.responseOrError;
    }
    return this.responseOrError || { text: `Reply from ${this.name}`, provider: this.name, toolCalls: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 1. ERROR CLASSIFICATION TESTS
// ═══════════════════════════════════════════════════════════════════
function testErrorClassification() {
  console.log("🧪 1. ERROR CLASSIFICATION TESTS\n" + "═".repeat(55));

  // Recoverable errors
  const rateLimitErr = { status: 429, message: "Resource has been exhausted (quota)" };
  const rateLimitClass = classifyError(rateLimitErr);
  assert("Status 429 classified as recoverable rate_limit", rateLimitClass.recoverable === true && rateLimitClass.reason === "rate_limit");

  const timeoutErr = { code: "ETIMEDOUT", message: "Connect timeout" };
  const timeoutClass = classifyError(timeoutErr);
  assert("ETIMEDOUT classified as recoverable timeout", timeoutClass.recoverable === true && timeoutClass.reason === "timeout");

  const server503Err = { status: 503, message: "The service is temporarily overloaded" };
  const server503Class = classifyError(server503Err);
  assert("Status 503 classified as recoverable server_error", server503Class.recoverable === true && server503Class.reason === "server_error");

  const server500Err = { status: 500, message: "Internal server error" };
  const server500Class = classifyError(server500Err);
  assert("Status 500 classified as recoverable server_error", server500Class.recoverable === true && server500Class.reason === "server_error");

  const networkErr = { code: "ECONNRESET", message: "Connection reset by peer" };
  const networkClass = classifyError(networkErr);
  assert("ECONNRESET classified as recoverable network_error", networkClass.recoverable === true && networkClass.reason === "network_error");

  // Non-recoverable errors
  const auth401Err = { status: 401, message: "API_KEY_INVALID" };
  const auth401Class = classifyError(auth401Err);
  assert("Status 401 classified as non-recoverable auth_error", auth401Class.recoverable === false && auth401Class.reason === "auth_error");

  const auth403Err = { status: 403, message: "Permission denied" };
  const auth403Class = classifyError(auth403Err);
  assert("Status 403 classified as non-recoverable auth_error", auth403Class.recoverable === false && auth403Class.reason === "auth_error");

  const notFound404Err = { status: 404, message: "models/gemini-invalid is not found" };
  const notFound404Class = classifyError(notFound404Err);
  assert("Status 404 classified as non-recoverable not_found", notFound404Class.recoverable === false && notFound404Class.reason === "not_found");
}

// ═══════════════════════════════════════════════════════════════════
// 2. FAILOVER BEHAVIOR TESTS
// ═══════════════════════════════════════════════════════════════════
async function testFailoverBehavior() {
  console.log("\n🧪 2. FAILOVER ROUTER TESTS\n" + "═".repeat(55));

  // ── Case A: Gemini succeeds → Groq is NOT called ──
  console.log("\n── Case A: Primary succeeds → Fallback is NOT called ──");
  const mockGeminiSuccess = new MockProvider("gemini", { text: "Success from Gemini", provider: "gemini", toolCalls: [] });
  const mockGroqUncalled = new MockProvider("groq", { text: "Should never be called", provider: "groq", toolCalls: [] });

  const routerSuccess = new ProviderRouter({
    primary: "gemini",
    fallback: "groq",
    providers: { gemini: mockGeminiSuccess, groq: mockGroqUncalled },
  });

  const resSuccess = await routerSuccess.sendMessage({ message: "Hello" });
  assert("Gemini returned text", resSuccess.text === "Success from Gemini");
  assert("Provider is gemini", resSuccess.provider === "gemini");
  assert("Fallback is false", resSuccess.fallback === false);
  assert("Gemini was called exactly once", mockGeminiSuccess.calls.length === 1);
  assert("Groq was NEVER called", mockGroqUncalled.calls.length === 0);

  // ── Case B: Gemini rate-limits (429) → Groq is called and succeeds ──
  console.log("\n── Case B: Primary rate-limits (429) → Fallback is called ──");
  const mockGeminiRateLimit = new MockProvider("gemini", { status: 429, message: "Resource exhausted (quota)" });
  const mockGroqSuccess = new MockProvider("groq", { text: "Fallback reply from Groq", provider: "groq", toolCalls: [] });

  const routerRateLimit = new ProviderRouter({
    primary: "gemini",
    fallback: "groq",
    providers: { gemini: mockGeminiRateLimit, groq: mockGroqSuccess },
  });

  const resRateLimit = await routerRateLimit.sendMessage({ message: "Hello" });
  assert("Groq returned text", resRateLimit.text === "Fallback reply from Groq");
  assert("Provider is groq", resRateLimit.provider === "groq");
  assert("Fallback is true", resRateLimit.fallback === true);
  assert("Fallback reason is rate_limit", resRateLimit.fallbackReason === "rate_limit");
  assert("Gemini was attempted", mockGeminiRateLimit.calls.length === 1);
  assert("Groq was called as fallback", mockGroqSuccess.calls.length === 1);

  // ── Case C: Gemini timeout → Groq is called ──
  console.log("\n── Case C: Primary timeout → Fallback is called ──");
  const mockGeminiTimeout = new MockProvider("gemini", { code: "ETIMEDOUT", message: "Gateway timeout" });
  const mockGroqTimeoutFallback = new MockProvider("groq", { text: "Groq after timeout", provider: "groq", toolCalls: [] });

  const routerTimeout = new ProviderRouter({
    primary: "gemini",
    fallback: "groq",
    providers: { gemini: mockGeminiTimeout, groq: mockGroqTimeoutFallback },
  });

  const resTimeout = await routerTimeout.sendMessage({ message: "Hello" });
  assert("Fallback succeeded after timeout", resTimeout.fallback === true);
  assert("Fallback reason is timeout", resTimeout.fallbackReason === "timeout");

  // ── Case D: Gemini 5xx server error → Groq is called ──
  console.log("\n── Case D: Primary temporary 5xx → Fallback is called ──");
  const mockGemini503 = new MockProvider("gemini", { status: 503, message: "Service Unavailable" });
  const mockGroq503Fallback = new MockProvider("groq", { text: "Groq after 503", provider: "groq", toolCalls: [] });

  const router503 = new ProviderRouter({
    primary: "gemini",
    fallback: "groq",
    providers: { gemini: mockGemini503, groq: mockGroq503Fallback },
  });

  const res503 = await router503.sendMessage({ message: "Hello" });
  assert("Fallback succeeded after 503", res503.fallback === true);
  assert("Fallback reason is server_error", res503.fallbackReason === "server_error");

  // ── Case E: Gemini permanent/auth error (401) → No fallback attempted ──
  console.log("\n── Case E: Primary auth error (401) → No fallback ──");
  const mockGeminiAuth = new MockProvider("gemini", { status: 401, message: "API key not valid" });
  const mockGroqAuthFallback = new MockProvider("groq", { text: "Should not run", provider: "groq", toolCalls: [] });

  const routerAuth = new ProviderRouter({
    primary: "gemini",
    fallback: "groq",
    providers: { gemini: mockGeminiAuth, groq: mockGroqAuthFallback },
  });

  let authThrown = false;
  try {
    await routerAuth.sendMessage({ message: "Hello" });
  } catch (err) {
    authThrown = true;
    assert("Auth error re-thrown", err.status === 401 || err.message.includes("API key"));
  }
  assert("Router threw on auth error", authThrown === true);
  assert("Groq was NOT called on auth error", mockGroqAuthFallback.calls.length === 0);

  // ── Case F: Gemini fails + Groq also fails → Clear combined error ──
  console.log("\n── Case F: Primary fails + Fallback fails → Combined error ──");
  const mockGeminiDoubleFail = new MockProvider("gemini", { status: 429, message: "Gemini 429" });
  const mockGroqDoubleFail = new MockProvider("groq", { status: 500, message: "Groq 500" });

  const routerDoubleFail = new ProviderRouter({
    primary: "gemini",
    fallback: "groq",
    providers: { gemini: mockGeminiDoubleFail, groq: mockGroqDoubleFail },
  });

  let doubleFailThrown = false;
  try {
    await routerDoubleFail.sendMessage({ message: "Hello" });
  } catch (err) {
    doubleFailThrown = true;
    assert("Error mentions primary provider", err.message.includes("gemini"));
    assert("Error mentions fallback provider", err.message.includes("groq"));
  }
  assert("Router threw on double failure", doubleFailThrown === true);
}

// ═══════════════════════════════════════════════════════════════════
// 3. REVERSE CONFIGURATION TESTS
// ═══════════════════════════════════════════════════════════════════
async function testReverseConfiguration() {
  console.log("\n🧪 3. ENVIRONMENT & REVERSE CONFIGURATION TESTS\n" + "═".repeat(55));

  // Swap primary to groq and fallback to gemini
  const mockGroqPrimary = new MockProvider("groq", { status: 429, message: "Groq busy" });
  const mockGeminiFallback = new MockProvider("gemini", { text: "Gemini as fallback", provider: "gemini", toolCalls: [] });

  const reverseRouter = new ProviderRouter({
    primary: "groq",
    fallback: "gemini",
    providers: { groq: mockGroqPrimary, gemini: mockGeminiFallback },
  });

  const res = await reverseRouter.sendMessage({ message: "Reverse test" });
  assert("Groq was called first as primary", mockGroqPrimary.calls.length === 1);
  assert("Gemini was called as fallback", mockGeminiFallback.calls.length === 1);
  assert("Response provider is gemini", res.provider === "gemini");
  assert("Response fallback is true", res.fallback === true);
}

// ═══════════════════════════════════════════════════════════════════
// 4. TOOL-CALLING PARITY & REGISTRY INTEGRATION
// ═══════════════════════════════════════════════════════════════════
async function testToolCallingParity() {
  console.log("\n🧪 4. TOOL-CALLING COMPATIBILITY TESTS\n" + "═".repeat(55));

  const registry = new ToolRegistry();
  registry.register({
    name: "calculator",
    description: "Evaluates math expression",
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
    execute: (args) => ({ result: 42 }),
  });

  // Verify getOpenAIToolDefinitions
  const openAiDefs = registry.getOpenAIToolDefinitions();
  assert("getOpenAIToolDefinitions returns array", Array.isArray(openAiDefs));
  assert("Has 1 tool declaration", openAiDefs.length === 1);
  assert("Tool type is function", openAiDefs[0].type === "function");
  assert("Tool function name is calculator", openAiDefs[0].function.name === "calculator");
  assert("Tool function has parameters", openAiDefs[0].function.parameters.properties.expression !== undefined);

  // Test GeminiProvider tool execution loop with mock client
  let geminiTurn = 0;
  const mockGeminiChat = {
    sendMessage: async (params) => {
      geminiTurn++;
      if (geminiTurn === 1) {
        // First turn: model requests tool call
        return {
          functionCalls: [
            { id: "call_1", name: "calculator", args: { expression: "6 * 7" } },
          ],
        };
      } else {
        // Second turn: model receives result and returns final answer
        return {
          text: "The result is 42.",
        };
      }
    },
  };

  const mockGeminiClient = {
    chats: {
      create: () => mockGeminiChat,
    },
  };

  const geminiProvider = new GeminiProvider({
    apiKey: "fake-key",
    client: mockGeminiClient,
  });

  const geminiRes = await geminiProvider.sendMessage({
    message: "What is 6 * 7?",
    registry,
  });

  assert("Gemini provider returned final answer", geminiRes.text === "The result is 42.");
  assert("Gemini recorded calculator toolCall", geminiRes.toolCalls.includes("calculator"));

  // Test GroqProvider tool execution loop with mock client
  let groqTurn = 0;
  const mockGroqClient = {
    chat: {
      completions: {
        create: async (params) => {
          groqTurn++;
          if (groqTurn === 1) {
            // First turn: assistant requests tool call
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "call_groq_1",
                        type: "function",
                        function: {
                          name: "calculator",
                          arguments: JSON.stringify({ expression: "6 * 7" }),
                        },
                      },
                    ],
                  },
                },
              ],
            };
          } else {
            // Second turn: assistant gives text response
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Groq calculated 42.",
                  },
                },
              ],
            };
          }
        },
      },
    },
  };

  const groqProvider = new GroqProvider({
    apiKey: "fake-key",
    client: mockGroqClient,
  });

  const groqRes = await groqProvider.sendMessage({
    message: "What is 6 * 7?",
    registry,
  });

  assert("Groq provider returned final answer", groqRes.text === "Groq calculated 42.");
  assert("Groq recorded calculator toolCall", groqRes.toolCalls.includes("calculator"));
}

// ═══════════════════════════════════════════════════════════════════
// 5. CONTEXT MANAGER INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════
async function testContextManagerIntegration() {
  console.log("\n🧪 5. CONTEXT MANAGER INTEGRATION TESTS\n" + "═".repeat(55));

  const history = [
    { role: "user", parts: [{ text: "Old message 1" }] },
    { role: "model", parts: [{ text: "Old reply 1" }] },
    { role: "user", parts: [{ text: "Recent message" }] },
    { role: "model", parts: [{ text: "Recent reply" }] },
  ];

  // Budget allows only the most recent turn
  const { context, stats } = buildContext(history, 25);
  assert("Context budget trimmed history", stats.trimmed === true);

  let capturedHistory = null;
  const mockCapturingProvider = new MockProvider("gemini", (params) => {
    capturedHistory = params.history;
    return { text: "Context test reply", provider: "gemini", toolCalls: [] };
  });

  const router = new ProviderRouter({
    primary: "gemini",
    providers: { gemini: mockCapturingProvider },
  });

  await router.sendMessage({
    message: "Latest question",
    history: context,
  });

  assert("Provider received trimmed context only", capturedHistory.length === context.length);
  assert("Old message not sent to provider", !capturedHistory.some((m) => m.parts[0].text === "Old message 1"));
}

// ═══════════════════════════════════════════════════════════════════
// 6. SECRET REDACTION & OBSERVABILITY TESTS
// ═══════════════════════════════════════════════════════════════════
function testSecretRedaction() {
  console.log("\n🧪 6. SECRET REDACTION TESTS\n" + "═".repeat(55));

  const fakeGeminiKey = "AIzaSyFakeGeminiKey98765";
  const fakeGroqKey = "gsk_fakeGroqSecretKey12345";

  process.env.GEMINI_API_KEY = fakeGeminiKey;
  process.env.GROQ_API_KEY = fakeGroqKey;

  const rawError = `Failed at https://api.groq.com/v1?key=${fakeGeminiKey} with Bearer ${fakeGroqKey}`;
  const sanitized = sanitizeErrorMessage(rawError);

  assert("Gemini key is redacted", !sanitized.includes(fakeGeminiKey));
  assert("Groq key is redacted", !sanitized.includes(fakeGroqKey));
  assert("Contains [REDACTED] tag", sanitized.includes("[REDACTED]"));
}

// ═══════════════════════════════════════════════════════════════════
// Main Runner
// ═══════════════════════════════════════════════════════════════════
async function main() {
  testErrorClassification();
  await testFailoverBehavior();
  await testReverseConfiguration();
  await testToolCallingParity();
  await testContextManagerIntegration();
  testSecretRedaction();

  console.log("\n" + "═".repeat(55));
  console.log(`📊 Provider Tests: ${passed} passed, ${failed} failed`);
  console.log(`📡 Gemini / Groq API calls made: 0 (all mocked)\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
