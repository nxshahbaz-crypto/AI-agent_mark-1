// ═══════════════════════════════════════════════════════════════
// Quick schema migration script — applies schema.sql to Supabase
// Uses the Supabase Management API (requires service_role key or
// SQL execution via the REST endpoint).
//
// For Supabase hosted projects, the anon key cannot run raw DDL.
// This script creates tables via the Supabase JS client .rpc()
// if a function exists, otherwise prints instructions.
// ═══════════════════════════════════════════════════════════════

import "dotenv/config";
import { supabase } from "./supabase.js";

async function applySchema() {
  console.log("🗃  Applying Phase 4B schema to Supabase...\n");

  // Try creating the conversations table
  console.log("── Creating 'conversations' table ──");
  const { error: convErr } = await supabase.from("conversations").select("id").limit(1);

  if (convErr && convErr.message?.includes("schema cache")) {
    console.log("   Table does not exist yet.");
    console.log("\n" + "═".repeat(60));
    console.log("⚠️  The Supabase JS client cannot execute raw DDL (CREATE TABLE).");
    console.log("   Please run the following steps manually:\n");
    console.log("   1. Open: https://supabase.com/dashboard");
    console.log("   2. Navigate to your project → SQL Editor");
    console.log("   3. Paste the contents of schema.sql");
    console.log("   4. Click 'Run'\n");
    console.log("   Then re-run: npm run test:supabase-memory");
    console.log("═".repeat(60) + "\n");
  } else if (convErr) {
    console.log(`   ⚠️  Unexpected error: ${convErr.message}`);
  } else {
    console.log("   ✅ Table already exists.");

    // Check messages table too
    const { error: msgErr } = await supabase.from("messages").select("id").limit(1);
    if (msgErr) {
      console.log(`   ⚠️  'messages' table issue: ${msgErr.message}`);
    } else {
      console.log("   ✅ 'messages' table already exists.");
    }
    console.log("\n✅ Schema is ready. Run: npm run test:supabase-memory\n");
  }
}

applySchema();
