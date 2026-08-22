import { executeTool } from "./tools.js";

// ─── Determine Mode ─────────────────────────────────────────────
// npm run test:local  → runs local tool tests only (zero API calls)
// npm test            → runs local tests, then API tests if quota allows
const mode = process.argv[2] || "all";

// ═════════════════════════════════════════════════════════════════
// LOCAL TOOL TESTS — no Gemini API calls, no quota consumed
// ═════════════════════════════════════════════════════════════════
function runLocalTests() {
  console.log("🧪 LOCAL TOOL TESTS (zero API calls)\n" + "=".repeat(50));

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

  // ── Calculator ──
  console.log("\n── calculator ──");
  const calc1 = executeTool("calculator", { expression: "25 * 48" });
  assert("25 * 48 = 1200", calc1.result === 1200);

  const calc2 = executeTool("calculator", { expression: "(10 + 5) / 3" });
  assert("(10+5)/3 = 5", calc2.result === 5);

  const calc3 = executeTool("calculator", { expression: "100 + 200 + 300" });
  assert("100+200+300 = 600", calc3.result === 600);

  const calc4 = executeTool("calculator", { expression: "10 / 0" });
  assert("10/0 → not finite → error", calc4.error !== undefined);

  const calcBad1 = executeTool("calculator", { expression: "rm -rf /" });
  assert("dangerous string → error", calcBad1.error !== undefined);

  const calcBad2 = executeTool("calculator", {});
  assert("empty args → error", calcBad2.error !== undefined);

  const calcBad3 = executeTool("calculator", { expression: 12345 });
  assert("non-string expression → error", calcBad3.error !== undefined);

  // ── Current Time ──
  console.log("\n── current_time ──");
  const time = executeTool("current_time", {});
  assert("returns dateTime", typeof time.dateTime === "string" && time.dateTime.length > 0);
  assert("returns timezone", typeof time.timezone === "string" && time.timezone.length > 0);

  // ── Weather (mock) ──
  console.log("\n── get_weather ──");
  const weather = executeTool("get_weather", { city: "Hyderabad" });
  assert("returns correct city", weather.city === "Hyderabad");
  assert("returns temperature", weather.temperature !== undefined);
  assert("contains mock disclaimer", weather.note && weather.note.includes("mock"));

  const weatherBad = executeTool("get_weather", {});
  assert("missing city → error", weatherBad.error !== undefined);

  // ── Unknown tool ──
  console.log("\n── edge cases ──");
  const unknown = executeTool("nonexistent_tool", {});
  assert("unknown tool → error", unknown.error !== undefined);

  const nullArgs = executeTool("calculator", null);
  assert("null args → error (no crash)", nullArgs.error !== undefined);

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Local: ${passed} passed, ${failed} failed\n`);
  return failed;
}

// ═════════════════════════════════════════════════════════════════
// API INTEGRATION TESTS — consumes Gemini API quota
// ═════════════════════════════════════════════════════════════════
async function runApiTests() {
  // Dynamic imports so local mode doesn't touch dotenv/genai at all
  await import("dotenv/config");
  const { GoogleGenAI } = await import("@google/genai");
  const { SYSTEM_INSTRUCTION, MODEL, MAX_TURNS, MAX_RETRIES, BASE_DELAY_MS, MAX_DELAY_MS } =
    await import("./config.js");
  const { toolDeclarations } = await import("./tools.js");

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY || API_KEY === "your_api_key_here") {
    console.error("❌ Missing GEMINI_API_KEY — skipping API tests.\n");
    return 1;
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // Retry wrapper (mirrors index.js)
  async function sendWithRetry(chat, params) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await chat.sendMessage(params);
      } catch (error) {
        if (error.status === 429 && attempt < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
          console.log(`  ⏳ Rate limited. Retrying in ${delay / 1000}s... (${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
  }

  const testMessages = [
    { input: "Hi", expect: "greeting — no tool" },
    { input: "What is 25 * 48?", expect: "calculator tool" },
    { input: "What time is it?", expect: "current_time tool" },
  ];

  console.log("🧪 API INTEGRATION TESTS (consumes quota)\n" + "=".repeat(50));

  const history = [];
  let passed = 0;
  let failed = 0;
  let apiCalls = 0;

  for (let i = 0; i < testMessages.length; i++) {
    const { input, expect } = testMessages[i];
    console.log(`\n── Test ${i + 1}/${testMessages.length}: ${expect} ──`);
    console.log(`You: ${input}`);

    try {
      const recentHistory = history.slice(-MAX_TURNS * 2);
      const chat = ai.chats.create({
        model: MODEL,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: toolDeclarations,
        },
        history: recentHistory,
      });

      let response = await sendWithRetry(chat, { message: input });
      apiCalls++;

      // Handle tool calls
      const toolsUsed = [];
      while (response.functionCalls && response.functionCalls.length > 0) {
        const toolParts = response.functionCalls.map((fc) => {
          toolsUsed.push(fc.name);
          const result = executeTool(fc.name, fc.args || {});
          return {
            functionResponse: { id: fc.id, name: fc.name, response: result },
          };
        });
        response = await sendWithRetry(chat, { message: toolParts });
        apiCalls++;
      }

      const reply = response.text;
      history.push(
        { role: "user", parts: [{ text: input }] },
        { role: "model", parts: [{ text: reply }] }
      );

      if (toolsUsed.length > 0) console.log(`  🔧 Tools: ${toolsUsed.join(", ")}`);
      console.log(`Atlas: ${reply}`);
      console.log("✅ Responded");
      passed++;
    } catch (error) {
      if (error.status === 429) {
        console.error("❌ Rate limited after retries — stopping API tests.");
        failed++;
        break;
      }
      const safeMsg = (error.message || "Unknown")
        .replace(process.env.GEMINI_API_KEY, "[REDACTED]")
        .replace(/key=[^&\s]+/gi, "key=[REDACTED]");
      console.error(`❌ Failed: ${safeMsg}`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 API: ${passed} passed, ${failed} failed`);
  console.log(`📡 Total Gemini API calls made: ${apiCalls}\n`);
  return failed;
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  let totalFailed = 0;

  // Run local tool tests (unless api-only mode)
  if (mode !== "api") {
    totalFailed += runLocalTests();
  }

  // Run API integration tests (unless local-only mode)
  if (mode !== "local") {
    totalFailed += await runApiTests();
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main();
