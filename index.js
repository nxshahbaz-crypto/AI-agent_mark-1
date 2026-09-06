import "dotenv/config";
import readline from "readline";
import {
  SYSTEM_INSTRUCTION,
  MAX_TURNS,
  MAX_CONTEXT_TOKENS,
  MAX_OUTPUT_TOKENS,
  AI_PRIMARY_PROVIDER,
  AI_FALLBACK_PROVIDER,
} from "./config.js";
import { registry } from "./tools.js";
import { createConversation, saveMessage, getRecentMessages } from "./supabase.js";
import { buildContext, estimateTokens } from "./context-manager.js";
import { createDefaultRouter, sanitizeErrorMessage } from "./providers/provider-router.js";

// ─── Configuration Validation ───────────────────────────────────
// Primary provider key is required; fallback key is optional unless invoked.
const primaryProvider = AI_PRIMARY_PROVIDER || "gemini";
const fallbackProvider = AI_FALLBACK_PROVIDER || "groq";

if (primaryProvider === "gemini") {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey === "your_api_key_here" || geminiKey === "your_gemini_api_key") {
    console.error("❌ Missing GEMINI_API_KEY. Add it to your .env file.");
    console.error("   Get one at: https://aistudio.google.com/apikey");
    process.exit(1);
  }
} else if (primaryProvider === "groq") {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey === "your_groq_api_key") {
    console.error("❌ Missing GROQ_API_KEY. Add it to your .env file.");
    console.error("   Get one at: https://console.groq.com/keys");
    process.exit(1);
  }
}

// Initialize the Provider Router (Gemini primary -> Groq fallback)
const router = createDefaultRouter();

// ─── Conversation Memory ─────────────────────────────────────────
// In-memory history for the current session; also persisted to Supabase.
// Only the budget-managed context is sent to the active provider.
const conversationHistory = [];

// Active Supabase conversation ID (set during startup)
let activeConversationId = null;

// ─── Terminal Interface ──────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ─── Persistence Helper ─────────────────────────────────────────
// Saves a message to Supabase without blocking the chat loop.
// Errors are logged but never crash the agent.
function persistMessage(role, content) {
  if (!activeConversationId) return;

  saveMessage(activeConversationId, role, content).catch((err) => {
    console.error(`  ⚠️  Failed to persist ${role} message: ${err.message}`);
  });
}

// ─── Main Chat Loop ─────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   🤖  Atlas AI  —  Phase 5.5 (Provider Abstraction)     ║");
  console.log(`║   Primary: ${primaryProvider.padEnd(10)} Fallback: ${fallbackProvider.padEnd(23)}║`);
  console.log("║   Type your message and press Enter.                     ║");
  console.log("║   Type 'exit' to quit.                                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // ── Initialize Supabase conversation ──
  try {
    const conversation = await createConversation();
    activeConversationId = conversation.id;
    console.log(`💾 Conversation saved: ${conversation.title}`);
    console.log(`   ID: ${activeConversationId}\n`);

    // Optionally load recent messages from previous sessions
    const recentFromDb = await getRecentMessages(activeConversationId, MAX_TURNS * 2);
    if (recentFromDb.length > 0) {
      for (const msg of recentFromDb) {
        conversationHistory.push({
          role: msg.role,
          parts: [{ text: msg.content }],
        });
      }
      console.log(`📜 Loaded ${recentFromDb.length} messages from database.\n`);
    }
  } catch (err) {
    console.warn(`⚠️  Supabase persistence unavailable: ${err.message}`);
    console.warn("   Continuing with in-memory history only.\n");
  }

  while (true) {
    const userInput = await ask("You: ");

    // Handle exit
    if (userInput.trim().toLowerCase() === "exit") {
      console.log("\n👋 Goodbye!\n");
      rl.close();
      break;
    }

    // Reject empty or whitespace-only input
    if (!userInput.trim()) {
      console.log("⚠️  Please type a message.\n");
      continue;
    }

    try {
      // Estimate tokens for the new message to reserve budget
      const userMsgTokens = estimateTokens({ role: "user", parts: [{ text: userInput }] });
      const availableBudget = Math.max(0, MAX_CONTEXT_TOKENS - userMsgTokens);

      // Manage context budget (applies equally to Gemini and Groq)
      const { context, stats } = buildContext(conversationHistory, availableBudget);

      console.log(
        `  📊 Context: ${stats.sent}/${stats.considered} msgs | ~${stats.estimatedTokens + userMsgTokens} tokens | Trimmed: ${stats.trimmed ? "Yes" : "No"} | Tools: ${stats.toolResultsIncluded}`
      );

      // Send message through provider router (automatic failover if primary encounters recoverable error)
      const response = await router.sendMessage({
        message: userInput,
        history: context,
        systemInstruction: SYSTEM_INSTRUCTION,
        registry,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });

      const replyText = response.text;

      // Append both user and model messages to in-memory history
      conversationHistory.push(
        { role: "user", parts: [{ text: userInput }] },
        { role: "model", parts: [{ text: replyText }] }
      );

      // Persist both messages to Supabase (non-blocking)
      persistMessage("user", userInput);
      persistMessage("model", replyText);

      console.log(`\nAtlas: ${replyText}\n`);
    } catch (error) {
      const safeMessage = sanitizeErrorMessage(error.message || "Unknown error");

      if (error.status === 401 || error.status === 403) {
        console.error("\n❌ Authentication failed. Check your API credentials in .env.\n");
      } else if (error.status === 404) {
        console.error("\n❌ Model not found. The model name may be invalid or unavailable.\n");
      } else if (error.status === 429) {
        console.error("\n⏳ Rate limit reached on all available providers. Please wait and try again.\n");
      } else {
        console.error(`\n❌ AI Provider error: ${safeMessage}\n`);
      }
    }
  }
}

main();
