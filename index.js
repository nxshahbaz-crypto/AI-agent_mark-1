import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import readline from "readline";
import {
  SYSTEM_INSTRUCTION, MODEL, MAX_TURNS,
  MAX_RETRIES, BASE_DELAY_MS, MAX_DELAY_MS,
} from "./config.js";
import { registry } from "./tools.js";
import { createConversation, saveMessage, getRecentMessages } from "./supabase.js";

// ─── Configuration ───────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY || API_KEY === "your_api_key_here") {
  console.error("❌ Missing GEMINI_API_KEY. Add it to your .env file.");
  console.error("   Get one at: https://aistudio.google.com/apikey");
  process.exit(1);
}

// Initialize the Gemini client
const ai = new GoogleGenAI({ apiKey: API_KEY });

// ─── Conversation Memory ─────────────────────────────────────────
// In-memory history for the current session; also persisted to Supabase.
// Only the last MAX_TURNS are sent to Gemini.
const conversationHistory = [];

// Active Supabase conversation ID (set during startup)
let activeConversationId = null;

// ─── Exponential Backoff ─────────────────────────────────────────
// Wraps chat.sendMessage with retry logic for HTTP 429 rate limits.
// Delays: 2s → 4s → 8s (capped at 30s). Gives up after MAX_RETRIES.
async function sendWithRetry(chat, params) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await chat.sendMessage(params);
    } catch (error) {
      if (error.status === 429 && attempt < MAX_RETRIES) {
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
        console.log(`  ⏳ Rate limited. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error; // Re-throw non-429 errors or if retries exhausted
    }
  }
}

// ─── Terminal Interface ──────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ─── Tool Call Handler ───────────────────────────────────────────
// Processes Gemini's function call requests, executes tools, sends
// results back, and loops until Gemini gives a text response.
async function handleToolCalls(chat, response) {
  while (response.functionCalls && response.functionCalls.length > 0) {
    const toolParts = response.functionCalls.map((fc) => {
      console.log(`  🔧 Tool call: ${fc.name}(${JSON.stringify(fc.args || {})})`);
      const result = registry.executeTool(fc.name, fc.args || {});
      console.log(`  📦 Result: ${JSON.stringify(result)}`);
      return {
        functionResponse: {
          id: fc.id,
          name: fc.name,
          response: result,
        },
      };
    });

    // Send tool results back to Gemini with retry protection
    response = await sendWithRetry(chat, { message: toolParts });
  }
  return response;
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
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   🤖  Atlas AI  —  Phase 4C (Registry)  ║");
  console.log("║   Type your message and press Enter.     ║");
  console.log("║   Type 'exit' to quit.                   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  // ── Initialize Supabase conversation ──
  try {
    const conversation = await createConversation();
    activeConversationId = conversation.id;
    console.log(`💾 Conversation saved: ${conversation.title}`);
    console.log(`   ID: ${activeConversationId}\n`);

    // Optionally load recent messages from previous sessions
    // (useful if resuming — for now we start fresh each session)
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
      // Sliding window: only send the most recent turns to control tokens
      const recentHistory = conversationHistory.slice(-MAX_TURNS * 2);

      // Create chat with system instruction, tools, and recent history
      const chat = ai.chats.create({
        model: MODEL,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: registry.getToolDefinitions(),
        },
        history: recentHistory,
      });

      // Send message to Gemini (with retry on 429)
      let response = await sendWithRetry(chat, { message: userInput });

      // If Gemini requested tool calls, handle them
      response = await handleToolCalls(chat, response);

      const replyText = response.text;

      // Append both user and model messages to in-memory history (no duplicates)
      conversationHistory.push(
        { role: "user", parts: [{ text: userInput }] },
        { role: "model", parts: [{ text: replyText }] }
      );

      // Persist both messages to Supabase (non-blocking)
      persistMessage("user", userInput);
      persistMessage("model", replyText);

      console.log(`\nAtlas: ${replyText}\n`);
    } catch (error) {
      // Sanitize error message — never expose API key or env vars
      const safeMessage = (error.message || "Unknown error")
        .replace(process.env.GEMINI_API_KEY, "[REDACTED]")
        .replace(/key=[^&\s]+/gi, "key=[REDACTED]");

      if (error.status === 401 || error.status === 403) {
        console.error("\n❌ Authentication failed. Check your GEMINI_API_KEY in .env.\n");
      } else if (error.status === 404) {
        console.error("\n❌ Model not found. The model name may be invalid or unavailable.\n");
      } else if (error.status === 429) {
        console.error("\n⏳ Rate limit reached after all retries. Please wait a minute and try again.\n");
      } else {
        console.error(`\n❌ Gemini API error: ${safeMessage}\n`);
      }
    }
  }
}

main();
