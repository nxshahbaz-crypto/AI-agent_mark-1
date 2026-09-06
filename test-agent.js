// ═══════════════════════════════════════════════════════════════════
// Phase 6 — Multi-Step Agent Planning Tests
//
// Tests multi-step planning, independent tools, sequential/dependent
// tools, maximum-step protection, unrecoverable tool failure handling,
// and provider fallback during a multi-step task.
// Zero Gemini or Groq API calls consumed (all mocked).
// Run: npm run test:agent
// ═══════════════════════════════════════════════════════════════════

import { Agent } from "./agent.js";
import { ToolRegistry } from "./tool-registry.js";
import { ProviderRouter } from "./providers/provider-router.js";

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

// ─── Mock Provider Helper for Step-by-Step Testing ────────────────
class StepMockProvider {
  constructor(name, stepHandlers) {
    this.name = name;
    this.stepHandlers = stepHandlers; // array of functions or responses
    this.callCount = 0;
    this.historyReceived = [];
  }

  async sendMessage(params) {
    this.callCount++;
    this.historyReceived.push(params);

    const handler = this.stepHandlers[this.callCount - 1];
    if (!handler) {
      return { text: `Default response from ${this.name}`, provider: this.name, toolCalls: [] };
    }

    if (typeof handler === "function") {
      return await handler(params);
    }
    if (handler instanceof Error || (handler && handler.status)) {
      throw handler;
    }
    return handler;
  }
}

// Helper to set up default tool registry with calculator & weather
function createTestRegistry() {
  const registry = new ToolRegistry();

  registry.register({
    name: "calculator",
    description: "Evaluates arithmetic expressions",
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
    execute(args) {
      const { expression } = args || {};
      if (expression === "UNRECOVERABLE_SYNTAX_CRASH") {
        return { error: "Fatal parser error", unrecoverable: true };
      }
      try {
        const result = Function(`"use strict"; return (${expression})`)();
        return { expression, result };
      } catch (e) {
        return { error: e.message };
      }
    },
  });

  registry.register({
    name: "get_weather",
    description: "Gets weather for a city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
    execute(args) {
      return {
        city: args.city || "Unknown",
        temperature: "28°C",
        condition: "Partly cloudy",
      };
    },
  });

  return registry;
}

// ═══════════════════════════════════════════════════════════════════
// 1. SINGLE-STEP TOOL USE
// ═══════════════════════════════════════════════════════════════════
async function testSingleStepTool() {
  console.log("🧪 1. SINGLE-STEP TOOL USE\n" + "═".repeat(55));

  const registry = createTestRegistry();

  // Step 1: requests calculator; Step 2: returns final text answer
  const mockGemini = new StepMockProvider("gemini", [
    {
      text: "",
      toolCalls: [{ id: "c1", name: "calculator", args: { expression: "25 * 48" } }],
      provider: "gemini",
    },
    {
      text: "25 * 48 is 1,200.",
      toolCalls: [],
      provider: "gemini",
    },
  ]);

  const router = new ProviderRouter({
    primary: "gemini",
    providers: { gemini: mockGemini },
  });

  const agent = new Agent({ router, registry });
  const result = await agent.run({ message: "What is 25 * 48?" });

  assert("Returns final text answer", result.text === "25 * 48 is 1,200.");
  assert("Took 2 steps (1 tool + 1 synthesis)", result.steps === 2);
  assert("Tool calls contains calculator", result.toolCalls.includes("calculator"));
  assert("Provider is gemini", result.provider === "gemini");
  assert("Fallback is false", result.fallback === false);
}

// ═══════════════════════════════════════════════════════════════════
// 2. MULTIPLE INDEPENDENT TOOLS
// ═══════════════════════════════════════════════════════════════════
async function testMultipleIndependentTools() {
  console.log("\n🧪 2. MULTIPLE INDEPENDENT TOOLS\n" + "═".repeat(55));

  const registry = createTestRegistry();

  // Step 1: Model requests both get_weather and calculator in parallel
  // Step 2: Model synthesizes both results
  const mockGemini = new StepMockProvider("gemini", [
    {
      text: "",
      toolCalls: [
        { id: "w1", name: "get_weather", args: { city: "Delhi" } },
        { id: "c1", name: "calculator", args: { expression: "25 * 48" } },
      ],
      provider: "gemini",
    },
    {
      text: "The weather in Delhi is 28°C and 25 * 48 = 1200.",
      toolCalls: [],
      provider: "gemini",
    },
  ]);

  const router = new ProviderRouter({
    primary: "gemini",
    providers: { gemini: mockGemini },
  });

  const agent = new Agent({ router, registry });
  const result = await agent.run({
    message: "What is the weather in Delhi and calculate 25 * 48",
  });

  assert("Returns combined answer", result.text.includes("Delhi") && result.text.includes("1200"));
  assert("Both tools recorded", result.toolCalls.includes("get_weather") && result.toolCalls.includes("calculator"));
  assert("Both tools executed in parallel step 1", mockGemini.callCount === 2);
}

// ═══════════════════════════════════════════════════════════════════
// 3. SEQUENTIAL / DEPENDENT TOOLS
// ═══════════════════════════════════════════════════════════════════
async function testSequentialDependentTools() {
  console.log("\n🧪 3. SEQUENTIAL / DEPENDENT TOOLS\n" + "═".repeat(55));

  const registry = createTestRegistry();

  // Step 1: Call get_weather
  // Step 2: Inspect weather result (28°C), and call calculator with (28 * 9/5) + 32
  // Step 3: Return final synthesized answer
  let receivedWeatherInStep2 = false;

  const mockGemini = new StepMockProvider("gemini", [
    {
      text: "",
      toolCalls: [{ id: "w1", name: "get_weather", args: { city: "Delhi" } }],
      provider: "gemini",
    },
    (params) => {
      // Verify Step 2 received Step 1's weather result
      const lastMsg = Array.isArray(params.message) ? params.message[0] : null;
      if (lastMsg && lastMsg.functionResponse && lastMsg.functionResponse.response.temperature === "28°C") {
        receivedWeatherInStep2 = true;
      }
      return {
        text: "",
        toolCalls: [{ id: "c1", name: "calculator", args: { expression: "(28 * 9/5) + 32" } }],
        provider: "gemini",
      };
    },
    {
      text: "The weather in Delhi is 28°C (82.4°F).",
      toolCalls: [],
      provider: "gemini",
    },
  ]);

  const router = new ProviderRouter({
    primary: "gemini",
    providers: { gemini: mockGemini },
  });

  const agent = new Agent({ router, registry });
  const result = await agent.run({
    message: "Check Delhi weather and convert temperature to Fahrenheit",
  });

  assert("Step 2 received Step 1 tool output", receivedWeatherInStep2 === true);
  assert("Returns dependent conversion answer", result.text.includes("82.4°F"));
  assert("Total steps is 3", result.steps === 3);
  assert("Tools called in sequence: weather then calculator", result.toolCalls[0] === "get_weather" && result.toolCalls[1] === "calculator");
}

// ═══════════════════════════════════════════════════════════════════
// 4. MAXIMUM-STEP PROTECTION
// ═══════════════════════════════════════════════════════════════════
async function testMaximumStepProtection() {
  console.log("\n🧪 4. MAXIMUM-STEP PROTECTION\n" + "═".repeat(55));

  const registry = createTestRegistry();

  // A provider that tries to call a tool endlessly
  const endlessHandlers = [];
  for (let i = 0; i < 10; i++) {
    endlessHandlers.push({
      text: "",
      toolCalls: [{ id: `loop_${i}`, name: "calculator", args: { expression: "1 + 1" } }],
      provider: "gemini",
    });
  }
  // Synthesis handler if requested
  endlessHandlers.push({
    text: "Synthesized summary after max steps.",
    toolCalls: [],
    provider: "gemini",
  });

  const mockEndless = new StepMockProvider("gemini", endlessHandlers);
  const router = new ProviderRouter({
    primary: "gemini",
    providers: { gemini: mockEndless },
  });

  const agent = new Agent({ router, registry, maxSteps: 5 });
  const result = await agent.run({ message: "Run forever" });

  assert("Execution halted at max steps (5)", result.steps === 5);
  assert("Flag maxStepsReached is true", result.maxStepsReached === true);
  assert("Does not execute 10 tool turns", result.toolCalls.length <= 5);
}

// ═══════════════════════════════════════════════════════════════════
// 5. TOOL FAILURE HANDLING
// ═══════════════════════════════════════════════════════════════════
async function testToolFailureHandling() {
  console.log("\n🧪 5. TOOL FAILURE HANDLING\n" + "═".repeat(55));

  const registry = createTestRegistry();

  // Model attempts to call an unknown tool or a fatal unrecoverable crash
  const mockGemini = new StepMockProvider("gemini", [
    {
      text: "",
      toolCalls: [{ id: "bad_1", name: "nonexistent_danger_tool", args: {} }],
      provider: "gemini",
    },
    {
      text: "Should never reach step 2",
      toolCalls: [],
      provider: "gemini",
    },
  ]);

  const router = new ProviderRouter({
    primary: "gemini",
    providers: { gemini: mockGemini },
  });

  const agent = new Agent({ router, registry });
  const result = await agent.run({ message: "Run bad tool" });

  assert("Halts on unrecoverable tool error", result.error !== undefined);
  assert("Reports error in response text", result.text.includes("unrecoverable error"));
  assert("Did not execute step 2", mockGemini.callCount === 1);
}

// ═══════════════════════════════════════════════════════════════════
// 6. PROVIDER FALLBACK DURING A MULTI-STEP TASK
// ═══════════════════════════════════════════════════════════════════
async function testProviderFallbackDuringMultiStep() {
  console.log("\n🧪 6. PROVIDER FALLBACK DURING MULTI-STEP TASK\n" + "═".repeat(55));

  const registry = createTestRegistry();

  // Gemini succeeds on Step 1 (returns weather call)
  // Gemini FAILS on Step 2 with 429 rate limit
  const mockGemini = new StepMockProvider("gemini", [
    {
      text: "",
      toolCalls: [{ id: "w1", name: "get_weather", args: { city: "Delhi" } }],
      provider: "gemini",
    },
    {
      status: 429,
      message: "Gemini quota exceeded on turn 2",
    },
  ]);

  // Groq serves as fallback: receives Step 2 and finishes the task
  const mockGroq = new StepMockProvider("groq", [
    {
      text: "Groq completed the task: Weather in Delhi is 28°C.",
      toolCalls: [],
      provider: "groq",
    },
  ]);

  const router = new ProviderRouter({
    primary: "gemini",
    fallback: "groq",
    providers: { gemini: mockGemini, groq: mockGroq },
  });

  const agent = new Agent({ router, registry });
  const result = await agent.run({ message: "Multi-step failover test" });

  assert("Gemini was called for step 1", mockGemini.callCount >= 1);
  assert("Groq was called as fallback on step 2", mockGroq.callCount === 1);
  assert("Fallback flag is true", result.fallback === true);
  assert("Active provider is groq", result.provider === "groq");
  assert("Task completed successfully", result.text.includes("Groq completed the task"));
}

// ═══════════════════════════════════════════════════════════════════
// Main Runner
// ═══════════════════════════════════════════════════════════════════
async function main() {
  await testSingleStepTool();
  await testMultipleIndependentTools();
  await testSequentialDependentTools();
  await testMaximumStepProtection();
  await testToolFailureHandling();
  await testProviderFallbackDuringMultiStep();

  console.log("\n" + "═".repeat(55));
  console.log(`📊 Multi-Step Agent Tests: ${passed} passed, ${failed} failed`);
  console.log(`📡 Gemini / Groq API calls made: 0 (all mocked)\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
