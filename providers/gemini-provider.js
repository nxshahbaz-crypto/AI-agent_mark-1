// ═══════════════════════════════════════════════════════════════════
// Phase 5.5 — Gemini Provider
//
// Encapsulates all Google Gemini SDK interactions behind the common
// provider interface, preserving exponential backoff, tool calling,
// and token management limits.
// ═══════════════════════════════════════════════════════════════════

import { GoogleGenAI } from "@google/genai";
import {
  MODEL,
  MAX_RETRIES,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_PAYLOAD_SIZE,
} from "../config.js";
import { truncatePayload } from "../context-manager.js";

export class GeminiProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey] - Gemini API Key (defaults to process.env.GEMINI_API_KEY)
   * @param {string} [options.model] - Model name (defaults to config.MODEL)
   * @param {object} [options.client] - Pre-instantiated GoogleGenAI client (useful for mocks)
   * @param {number} [options.maxRetries] - Max 429 retries
   * @param {number} [options.baseDelayMs] - Starting backoff delay
   * @param {number} [options.maxDelayMs] - Maximum backoff delay
   */
  constructor(options = {}) {
    this.name = "gemini";
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.model = options.model || MODEL;
    this.client = options.client || null;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : MAX_RETRIES;
    this.baseDelayMs = options.baseDelayMs !== undefined ? options.baseDelayMs : BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs !== undefined ? options.maxDelayMs : MAX_DELAY_MS;
  }

  /**
   * Gets or initializes the GoogleGenAI client.
   */
  getClient() {
    if (this.client) return this.client;

    if (!this.apiKey || this.apiKey === "your_api_key_here") {
      const error = new Error("Missing GEMINI_API_KEY in environment variables.");
      error.status = 401;
      throw error;
    }

    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    return this.client;
  }

  /**
   * Exponential backoff retry loop for HTTP 429 rate limits.
   */
  async sendWithRetry(chat, params) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await chat.sendMessage(params);
      } catch (error) {
        const isRateLimit = error.status === 429 || (error.message && error.message.includes("429"));
        if (isRateLimit && attempt < this.maxRetries) {
          const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt), this.maxDelayMs);
          console.log(`  ⏳ [Gemini] Rate limited. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${this.maxRetries})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Sends a message through Gemini and handles any requested tool calls.
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
    executeTools = true,
  }) {
    const client = this.getClient();

    // Prepare Gemini tool definitions
    const tools = registry ? registry.getToolDefinitions() : [];

    // Create chat session with system instruction, tools, and context history
    const chat = client.chats.create({
      model: this.model,
      config: {
        systemInstruction,
        tools,
        maxOutputTokens,
      },
      history,
    });

    // Send the user input
    let response = await this.sendWithRetry(chat, { message });

    // When executeTools is false, return immediately so the Agent can drive the step loop
    if (executeTools === false) {
      const toolCalls = (response.functionCalls || []).map((fc) => ({
        id: fc.id,
        name: fc.name,
        args: fc.args || {},
      }));

      return {
        text: response.text || "",
        provider: this.name,
        toolCalls,
        raw: response,
      };
    }

    // Handle tool calls in a loop until Gemini produces final text (default standalone mode)
    const toolsUsed = [];
    while (response.functionCalls && response.functionCalls.length > 0) {
      const toolParts = [];
      for (const fc of response.functionCalls) {
        toolsUsed.push(fc.name);
        console.log(`  🔧 Tool call: ${fc.name}(${JSON.stringify(fc.args || {})})`);
        const rawResult = registry
          ? registry.executeTool(fc.name, fc.args || {})
          : { error: `Tool registry not available for ${fc.name}` };
        const result = truncatePayload(rawResult, maxToolPayloadSize);
        console.log(`  📦 Result: ${JSON.stringify(result)}`);

        toolParts.push({
          functionResponse: {
            id: fc.id,
            name: fc.name,
            response: result,
          },
        });
      }

      response = await this.sendWithRetry(chat, { message: toolParts });
    }

    return {
      text: response.text || "",
      provider: this.name,
      toolCalls: toolsUsed,
      raw: response,
    };
  }
}
