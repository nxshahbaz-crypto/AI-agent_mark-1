// ═════════════════════════════════════════════════════════════════
// Phase 4B — Supabase Persistent Memory Tests
// Tests conversation CRUD and message persistence against live Supabase.
// Zero Gemini API calls consumed.
// Run: npm run test:supabase-memory
// ═════════════════════════════════════════════════════════════════

import {
  supabase,
  testConnection,
  createConversation,
  saveMessage,
  getRecentMessages,
} from "./supabase.js";

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

// ─── Cleanup helper ─────────────────────────────────────────────
// Removes test data created during this run (best-effort).
async function cleanup(conversationId) {
  if (!conversationId) return;
  // Messages cascade-delete when conversation is deleted
  await supabase.from("conversations").delete().eq("id", conversationId);
}

// ─── Main test runner ───────────────────────────────────────────
async function runSupabaseMemoryTests() {
  console.log("🧪 SUPABASE PERSISTENT MEMORY TESTS (zero Gemini API calls)\n" + "═".repeat(55));

  // ── Prerequisite: Supabase must be reachable ──
  console.log("\n── Connection Check ──");
  const conn = await testConnection();
  assert("Supabase is reachable", conn.ok);
  if (!conn.ok) {
    console.error(`\n❌ Cannot reach Supabase: ${conn.message}`);
    console.error("   Make sure .env has valid SUPABASE_URL and SUPABASE_ANON_KEY.");
    console.error("   Run the schema.sql in Supabase SQL Editor first.\n");
    process.exit(1);
  }

  let testConversationId = null;

  try {
    // ── 1. Create a conversation ──
    console.log("\n── Create Conversation ──");
    const conversation = await createConversation("Test Session (Phase 4B)");
    testConversationId = conversation.id;
    assert("Conversation created successfully", !!conversation.id);
    assert("Title matches", conversation.title === "Test Session (Phase 4B)");
    assert("Has created_at timestamp", !!conversation.created_at);
    assert("Has updated_at timestamp", !!conversation.updated_at);
    console.log(`   ID: ${conversation.id}`);

    // ── 2. Save a user message ──
    console.log("\n── Save User Message ──");
    const userMsg = await saveMessage(testConversationId, "user", "Hello, Atlas!");
    assert("User message saved", !!userMsg.id);
    assert("User message role is 'user'", userMsg.role === "user");
    assert("User message content matches", userMsg.content === "Hello, Atlas!");
    assert("User message has conversation_id", userMsg.conversation_id === testConversationId);

    // ── 3. Save an assistant (model) message ──
    console.log("\n── Save Model Message ──");
    // Small delay to ensure ordering by created_at
    await new Promise((r) => setTimeout(r, 50));
    const modelMsg = await saveMessage(testConversationId, "model", "Hi! How can I help you?");
    assert("Model message saved", !!modelMsg.id);
    assert("Model message role is 'model'", modelMsg.role === "model");
    assert("Model message content matches", modelMsg.content === "Hi! How can I help you?");

    // ── 4. Save additional messages for ordering test ──
    console.log("\n── Save Additional Messages ──");
    await new Promise((r) => setTimeout(r, 50));
    const msg3 = await saveMessage(testConversationId, "user", "What is 2+2?");
    await new Promise((r) => setTimeout(r, 50));
    const msg4 = await saveMessage(testConversationId, "model", "2+2 equals 4.");
    assert("Third message saved", !!msg3.id);
    assert("Fourth message saved", !!msg4.id);

    // ── 5. Retrieve recent messages ──
    console.log("\n── Retrieve Recent Messages ──");
    const messages = await getRecentMessages(testConversationId, 10);
    assert("Retrieved messages array", Array.isArray(messages));
    assert("Got all 4 messages", messages.length === 4);

    // ── 6. Verify ordering (chronological — oldest first) ──
    console.log("\n── Verify Ordering ──");
    if (messages.length === 4) {
      assert("Message 1 is user 'Hello, Atlas!'", messages[0].role === "user" && messages[0].content === "Hello, Atlas!");
      assert("Message 2 is model 'Hi! How can I help you?'", messages[1].role === "model" && messages[1].content === "Hi! How can I help you?");
      assert("Message 3 is user 'What is 2+2?'", messages[2].role === "user" && messages[2].content === "What is 2+2?");
      assert("Message 4 is model '2+2 equals 4.'", messages[3].role === "model" && messages[3].content === "2+2 equals 4.");

      // Verify timestamps are in ascending order
      const timestamps = messages.map((m) => new Date(m.created_at).getTime());
      const isAscending = timestamps.every((t, i) => i === 0 || t >= timestamps[i - 1]);
      assert("Timestamps are in ascending order", isAscending);
    }

    // ── 7. Test LIMIT behavior ──
    console.log("\n── Test LIMIT Behavior ──");
    const limited = await getRecentMessages(testConversationId, 2);
    assert("LIMIT 2 returns exactly 2 messages", limited.length === 2);
    assert("LIMIT 2 returns the 2 most recent messages", limited[0].content === "What is 2+2?" && limited[1].content === "2+2 equals 4.");

    // ── 8. Test error cases ──
    console.log("\n── Error Handling ──");
    try {
      await saveMessage(null, "user", "test");
      assert("saveMessage(null) throws", false);
    } catch (e) {
      assert("saveMessage(null) throws error", e.message.includes("requires"));
    }

    try {
      await getRecentMessages(null);
      assert("getRecentMessages(null) throws", false);
    } catch (e) {
      assert("getRecentMessages(null) throws error", e.message.includes("requires"));
    }

    // ── 9. Default title test ──
    console.log("\n── Default Title ──");
    const defaultConv = await createConversation();
    assert("Default title starts with 'Session'", defaultConv.title.startsWith("Session"));
    // Cleanup the extra conversation
    await cleanup(defaultConv.id);

  } catch (err) {
    console.error(`\n💥 Unexpected error: ${err.message}`);
    console.error(err.stack);
    failed++;
  } finally {
    // ── Cleanup test data ──
    console.log("\n── Cleanup ──");
    await cleanup(testConversationId);
    console.log("  🧹 Test data removed.");
  }

  // ── Summary ──
  console.log("\n" + "═".repeat(55));
  console.log(`📊 Supabase Memory Tests: ${passed} passed, ${failed} failed`);
  console.log(`📡 Gemini API calls made: 0\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runSupabaseMemoryTests();
