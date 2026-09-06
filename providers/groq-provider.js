// ═══════════════════════════════════════════════════════════════════
// Phase 5.5 — Groq Provider
//
// Encapsulates all Groq SDK interactions behind the common provider
// interface. Acts as a resilient fallback provider with full support
// for tool calling, OpenAI-compatible messaging, and context limits.
// ═══════════════════════════════════════════════════════════════════

import Groq from "groq-sdk";
import {
  GROQ_DEFAULT_MODEL,
  MAX_RETRIES,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_PAYLOAD_SIZE,
} from "../config.js";
import { truncatePayload } from "../context-manager.js";

export class GroqProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey] - Groq API Key (defaults to process.env.GROQ_API_KEY)
   * @param {string} [options.model] - Model name (defaults to process.env.GROQ_MODEL or config)
   * @param {object} [options.client] - Pre-instantiated Groq client (useful for mocks)
   * @param {number} [options.maxRetries] - Max 429 retries
   * @param {number} [options.baseDelayMs] - Starting backoff delay
   * @param {number} [options.maxDelayMs] - Maximum backoff delay
   */
  constructor(options = {}) {
    this.name = "groq";
    this.apiKey = options.apiKey || process.env.GROQ_API_KEY;
    this.model = options.model || process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
    this.client = options.client || null;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : MAX_RETRIES;
    this.baseDelayMs = options.baseDelayMs !== undefined ? options.baseDelayMs : BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs !== undefined ? options.maxDelayMs : MAX_DELAY_MS;
  }

  /**
   * Gets or initializes the Groq client lazily.
   * Does NOT fail at startup if Groq is unused.
   */
  getClient() {
    if (this.client) return this.client;

    if (!this.apiKey || this.apiKey === "your_groq_api_key") {
      const error = new Error("Missing GROQ_API_KEY in environment variables.");
      error.status = 401;
      throw error;
    }

    this.client = new Groq({ apiKey: this.apiKey });
    return this.client;
  }

  /**
   * Converts in-memory context history + system instruction into OpenAI/Groq messages.
   */
  buildMessages(history = [], systemInstruction, message) {
    const messages = [];

    if (systemInstruction) {
      messages.push({ role: "system", content: systemInstruction });
    }

    for (const item of history) {
      const role = item.role === "model" ? "assistant" : item.role;
      let text = "";

      if (item.parts && Array.isArray(item.parts)) {
        text = item.parts
          .map((p) => p.text || "")
          .filter(Boolean)
          .join("\n");
      } else if (typeof item.content === "string") {
        text = item.content;
      }

      if (text) {
        messages.push({ role, content: text });
      }
    }

    if (message) {
      messages.push({ role: "user", content: message });
    }

    return messages;
  }

  /**
   * Exponential backoff retry loop for HTTP 429 rate limits.
   */
  async sendWithRetry(client, params) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await client.chat.completions.create(params);
      } catch (error) {
        const isRateLimit = error.status === 429 || (error.message && error.message.includes("429"));
        if (isRateLimit && attempt < this.maxRetries) {
          const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt), this.maxDelayMs);
          console.log(`  ⏳ [Groq] Rate limited. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${this.maxRetries})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Sends a message through Groq and handles tool calls in a multi-turn loop.
   *
   * @param {object} params
   * @param {string} params.message - User prompt text
   * @param {Array} [params.history] - Array of messages from context manager
   * @param {string} [params.systemInstruction] - System prompt
   * @param {object} [params.registry] - ToolRegistry instance
   * @param {number} [params.maxOutputTokens] - Max tokens to generate
   * @param {number} [params.maxToolPayloadSize] - Max characters per tool payload
   * @returns {Promise<{ text: string, provider: string, toolCalls: string[], raw: object }>}
   */
  async sendMessage({
    message,
    history = [],
    systemInstruction,
    registry,
    maxOutputTokens = MAX_OUTPUT_TOKENS,
    maxToolPayloadSize = MAX_TOOL_PAYLOAD_SIZE,
  }) {
    const client = this.getClient();

    // Prepare OpenAI-format tool definitions
    let tools = [];
    if (registry && typeof registry.getOpenAIToolDefinitions === "function") {
      tools = registry.getOpenAIToolDefinitions();
    } else if (registry && typeof registry.getToolDefinitions === "function") {
      // Fallback converter from Gemini format if getOpenAIToolDefinitions is absent
      const geminiDefs = registry.getToolDefinitions();
      if (geminiDefs.length > 0 && geminiDefs[0].functionDeclarations) {
        tools = geminiDefs[0].functionDeclarations.map((fn) => ({
          type: "function",
          function: {
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters,
          },
        }));
      }
    }

    const messages = this.buildMessages(history, systemInstruction, message);
    const toolsUsed = [];

    while (true) {
      const requestPayload = {
        model: this.model,
        messages,
        max_tokens: maxOutputTokens,
      };

      if (tools.length > 0) {
        requestPayload.tools = tools;
        requestPayload.tool_choice = "auto";
      }

      const response = await this.sendWithRetry(client, requestPayload);
      const choice = response.choices && response.choices[0];
      if (!choice) {
        throw new Error("No response choices returned by Groq.");
      }

      const responseMessage = choice.message;

      // If no tool calls requested, return the final text
      if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        return {
          text: responseMessage.content || "",
          provider: this.name,
          toolCalls: toolsUsed,
          raw: response,
        };
      }

      // Assistant message with tool calls must be appended to history
      messages.push(responseMessage);

      // Execute each tool call and append tool response message
      for (const toolCall of responseMessage.tool_calls) {
        const fnName = toolCall.function.name;
        toolsUsed.push(fnName);

        let fnArgs = {};
        try {
          fnArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          fnArgs = {};
        }

        console.log(`  🔧 Tool call: ${fnName}(${JSON.stringify(fnArgs)})`);
        const rawResult = registry
          ? registry.executeTool(fnName, fnArgs)
          : { error: `Tool registry not available for ${fnName}` };
        const result = truncatePayload(rawResult, maxToolPayloadSize);
        console.log(`  📦 Result: ${JSON.stringify(result)}`);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: fnName,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }
    }
  }
}
