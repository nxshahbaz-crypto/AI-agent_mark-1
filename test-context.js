// ═══════════════════════════════════════════════════════════════════
// Phase 5 — Context Manager Tests
// Tests history trimming, token budgeting, deduplication, and
// tool payload truncation. Zero Gemini API calls consumed.
// Run: npm run test:context
// ═══════════════════════════════════════════════════════════════════

import { buildContext, truncatePayload, estimateTokens } from "./context-manager.js";

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

// ═══════════════════════════════════════════════════════════════════
// 1. TOKEN ESTIMATION
// ═══════════════════════════════════════════════════════════════════

function testTokenEstimation() {
  console.log("🧪 TOKEN ESTIMATION TESTS\n" + "═".repeat(55));

  const text = "12345678"; // 8 chars -> 2 tokens (heuristic: Math.ceil(length / 4))
  const tokens = estimateTokens(text);
  assert("8 chars = 2 tokens", tokens === 2);

  const obj = { msg: "hi" }; // stringified: '{"msg":"hi"}' (12 chars -> 3 tokens)
  const objTokens = estimateTokens(obj);
  assert("Object token estimation works", objTokens === 3);

  assert("Null estimation is 0", estimateTokens(null) === 0);
}

// ═══════════════════════════════════════════════════════════════════
// 2. PAYLOAD TRUNCATION
// ═══════════════════════════════════════════════════════════════════

function testPayloadTruncation() {
  console.log("\n🧪 PAYLOAD TRUNCATION TESTS\n" + "═".repeat(55));

  const smallObj = { result: "success" };
  const truncatedSmall = truncatePayload(smallObj, 100);
  assert("Small payload is untouched", truncatedSmall === smallObj);

  const largeObj = { data: "x".repeat(100) };
  // stringified length is around 111 chars
  const truncatedLarge = truncatePayload(largeObj, 50);
  
  assert("Large payload is truncated into an object", typeof truncatedLarge === "object");
  assert("Truncated object contains _meta flag", truncatedLarge._meta !== undefined);
  assert("Truncated object data is short", truncatedLarge.data.length < 100);
  assert("Truncated object data contains TRUNCATED label", truncatedLarge.data.includes("TRUNCATED"));
}

// ═══════════════════════════════════════════════════════════════════
// 3. CONTEXT SELECTION (Deduplication, Budgeting)
// ═══════════════════════════════════════════════════════════════════

function testContextSelection() {
  console.log("\n🧪 CONTEXT SELECTION TESTS\n" + "═".repeat(55));

  // Empty history
  const emptyRes = buildContext([], 1000);
  assert("Empty history returns empty context", emptyRes.context.length === 0);
  assert("Empty history stats are zeroed", emptyRes.stats.sent === 0);

  // Exact duplicates removal
  const msg1 = { role: "user", parts: [{ text: "Hello" }] };
  const msg2 = { role: "model", parts: [{ text: "Hi" }] };
  const duplicateHistory = [msg1, msg2, msg1, msg2];
  
  const dupRes = buildContext(duplicateHistory, 1000);
  assert("Duplicate history length is reduced", dupRes.context.length === 2);
  assert("Kept recent duplicates (chronological order)", 
    dupRes.context[0].role === "user" && dupRes.context[1].role === "model");

  // Token Budget Enforcement (Trimming)
  // Each msg is ~33 chars -> ~9 tokens
  const budgetHistory = [];
  for (let i = 0; i < 10; i++) {
    budgetHistory.push({ role: "user", parts: [{ text: `Message ${i}` }] });
  }

  // Set max tokens to allow exactly 3 messages (3 * 12 = 36 tokens)
  const budgetRes = buildContext(budgetHistory, 40);
  assert("History is trimmed to fit budget", budgetRes.context.length === 3);
  assert("Trimmed flag is set", budgetRes.stats.trimmed === true);
  assert("Preserves the MOST RECENT messages", budgetRes.context[2].parts[0].text === "Message 9");

  // Tool Result Counting
  const toolHistory = [
    { role: "user", parts: [{ text: "calculate" }] },
    { role: "model", parts: [{ functionCall: { name: "calc" } }] },
    { role: "user", parts: [{ functionResponse: { name: "calc", response: { result: 1 } } }] }
  ];
  
  const toolRes = buildContext(toolHistory, 1000);
  assert("Counts tool results correctly", toolRes.stats.toolResultsIncluded === 1);

  // Very Large Synthetic History (performance & bounds check)
  const hugeHistory = [];
  for (let i = 0; i < 1000; i++) {
    hugeHistory.push({ role: "user", parts: [{ text: `Load test ${i}` }] });
  }
  const hugeRes = buildContext(hugeHistory, 100);
  assert("Handles huge history quickly and bounds it", hugeRes.stats.trimmed === true);
  assert("Sent messages is small", hugeRes.stats.sent < 20);
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

testTokenEstimation();
testPayloadTruncation();
testContextSelection();

console.log("\n" + "═".repeat(55));
console.log(`📊 Context Tests: ${passed} passed, ${failed} failed`);
console.log(`📡 Gemini API calls made: 0\n`);

process.exit(failed > 0 ? 1 : 0);
