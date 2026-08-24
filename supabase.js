import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// ─── Environment Validation ─────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const PLACEHOLDERS = ["your_supabase_url_here", "your_supabase_anon_key_here"];

if (!SUPABASE_URL || PLACEHOLDERS.includes(SUPABASE_URL)) {
  console.error("❌ Missing SUPABASE_URL. Add it to your .env file.");
  console.error("   Get it from: https://supabase.com/dashboard → Project Settings → API");
  process.exit(1);
}

if (!SUPABASE_ANON_KEY || PLACEHOLDERS.includes(SUPABASE_ANON_KEY)) {
  console.error("❌ Missing SUPABASE_ANON_KEY. Add it to your .env file.");
  console.error("   Get it from: https://supabase.com/dashboard → Project Settings → API");
  process.exit(1);
}

// ─── Supabase Client ─────────────────────────────────────────────
// Credentials are NEVER logged. Only the client is exported.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Connection Test ─────────────────────────────────────────────
// Lightweight query to verify Supabase is reachable.
// Does not require any tables to exist.
export async function testConnection() {
  try {
    // Query a non-existent table — Supabase returns a structured error
    // (not a network error) if it's reachable. A network failure throws.
    const { error } = await supabase.from("_health_check").select("*").limit(1);

    // A missing table error ("relation does not exist" or "schema cache") means Supabase IS reachable
    if (
      error &&
      (error.code === "PGRST116" ||
        error.message?.includes("relation") ||
        error.message?.includes("schema cache") ||
        error.message?.includes("does not exist"))
    ) {
      return { ok: true, message: "Supabase connected (table '_health_check' not created yet)." };
    }

    if (error) {
      return { ok: true, message: `Supabase reachable. Server response: ${error.message}` };
    }

    return { ok: true, message: "Supabase connected successfully." };
  } catch (err) {
    return {
      ok: false,
      message: `Cannot reach Supabase: ${err.message}`.replace(
        SUPABASE_ANON_KEY,
        "[REDACTED]"
      ),
    };
  }
}

// ═════════════════════════════════════════════════════════════════
// Phase 4B — Persistent Conversation Memory
// ═════════════════════════════════════════════════════════════════

// ─── createConversation() ────────────────────────────────────────
// Creates a new conversation row and returns the full record.
// Optionally accepts a title (defaults to timestamp-based title).
export async function createConversation(title) {
  const conversationTitle = title || `Session ${new Date().toLocaleString()}`;

  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: conversationTitle })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return data;
}

// ─── saveMessage() ───────────────────────────────────────────────
// Inserts a single message into the messages table.
// role must be 'user' or 'model'.
// Also touches the parent conversation's updated_at timestamp.
export async function saveMessage(conversationId, role, content) {
  if (!conversationId || !role || !content) {
    throw new Error("saveMessage requires conversationId, role, and content.");
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save message: ${error.message}`);
  }

  // Update the conversation's updated_at timestamp (fire-and-forget)
  supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .then(); // intentionally not awaited — non-critical

  return data;
}

// ─── getRecentMessages() ─────────────────────────────────────────
// Retrieves the N most recent messages for a conversation,
// ordered oldest-first (ascending) so they can be fed into history.
// Default limit: 20 messages (10 turns).
export async function getRecentMessages(conversationId, limit = 20) {
  if (!conversationId) {
    throw new Error("getRecentMessages requires a conversationId.");
  }

  // Sub-query approach: get the N newest rows, then re-sort ascending.
  // Supabase doesn't support nested ORDER BY, so we fetch descending
  // and reverse in JS for correct chronological order.
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to retrieve messages: ${error.message}`);
  }

  // Reverse to chronological order (oldest first)
  return (data || []).reverse();
}

// ─── Run as standalone script ────────────────────────────────────
// Allows: node supabase.js
const isMain = process.argv[1]?.endsWith("supabase.js");
if (isMain) {
  console.log("🔌 Testing Supabase connection...\n");
  const result = await testConnection();
  if (result.ok) {
    console.log(`✅ ${result.message}`);
  } else {
    console.error(`❌ ${result.message}`);
    process.exit(1);
  }
}
