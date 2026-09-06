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
      // 1. Direct OpenAI/Groq messages
      if (item.role === "assistant" && item.tool_calls) {
        messages.push({
          role: "assistant",
          content: item.content || null,
          tool_calls: item.tool_calls,
        });
        continue;
      }

      if (item.role === "tool") {
        messages.push({
          role: "tool",
          tool_call_id: item.tool_call_id,
          name: item.name,
          content: typeof item.content === "string" ? item.content : JSON.stringify(item.content),
        });
        continue;
      }

      // 2. Gemini formatted messages
      if (item.parts && Array.isArray(item.parts)) {
        const functionCalls = item.parts.filter((p) => p.functionCall);
        const functionResponses = item.parts.filter((p) => p.functionResponse);

        if (functionCalls.length > 0) {
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: functionCalls.map((p, idx) => ({
              id: p.functionCall.id || `call_${idx}`,
              type: "function",
              function: {
                name: p.functionCall.name,
                arguments: JSON.stringify(p.functionCall.args || {}),
              },
            })),
          });
          continue;
        }

        if (functionResponses.length > 0) {
          for (const p of functionResponses) {
            messages.push({
              role: "tool",
              tool_call_id: p.functionResponse.id || p.functionResponse.name,
              name: p.functionResponse.name,
              content:
                typeof p.functionResponse.response === "string"
                  ? p.functionResponse.response
                  : JSON.stringify(p.functionResponse.response),
            });
          }
          continue;
        }

        const text = item.parts
          .map((p) => p.text || "")
          .filter(Boolean)
          .join("\n");
        if (text) {
          const role = item.role === "model" ? "assistant" : item.role;
          messages.push({ role, content: text });
        }
        continue;
      }

      // 3. Fallback string content
      if (typeof item.content === "string" && item.content) {
        const role = item.role === "model" ? "assistant" : item.role;
        messages.push({ role, content: item.content });
      }
    }

    if (message) {
      if (typeof message === "string") {
        messages.push({ role: "user", content: message });
      } else if (Array.isArray(message)) {
        for (const p of message) {
          if (p.functionResponse) {
            messages.push({
              role: "tool",
              tool_call_id: p.functionResponse.id || p.functionResponse.name,
              name: p.functionResponse.name,
              content:
                typeof p.functionResponse.response === "string"
                  ? p.functionResponse.response
                  : JSON.stringify(p.functionResponse.response),
            });
          }
        }
      }
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
        // Handle Groq Llama-3.3 tool_use_failed special token quirk (e.g. calculator<|channel|>commentary)
        const failedGenStr =
          (error.error && error.error.failed_generation) ||
          (error.error && error.error.error && error.error.error.failed_generation) ||
          error.failed_generation;

        const isToolUseFailed =
          error.code === "tool_use_failed" ||
          (error.error && error.error.code === "tool_use_failed") ||
          (error.error && error.error.error && error.error.error.code === "tool_use_failed");

        if (isToolUseFailed && failedGenStr) {
          try {
            const failedGen = JSON.parse(failedGenStr);
            if (failedGen && failedGen.name) {
              const cleanName = failedGen.name.replace(/<\|.*?\|>/g, "").trim();
              return {
                choices: [
                  {
                    message: {
                      content: null,
                      tool_calls: [
                        {
                          id: `call_${Date.now()}`,
                          type: "function",
                          function: {
                            name: cleanName,
                            arguments:
                              typeof failedGen.arguments === "string"
                                ? failedGen.arguments
                                : JSON.stringify(failedGen.arguments || {}),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
          } catch {
            // continue to normal error handling
          }
        }

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
   * Sends a message through Groq and handles tool calls.
   *
   * @param {object} params
   * @param {string|Array} params.message - User prompt text or tool responses
   * @param {Array} [params.history] - Array of messages from context manager
   * @param {string} [params.systemInstruction] - System prompt
   * @param {object} [params.registry] - ToolRegistry instance
   * @param {number} [params.maxOutputTokens] - Max tokens to generate
   * @param {number} [params.maxToolPayloadSize] - Max characters per tool payload
   * @param {boolean} [params.executeTools=true] - If false, returns toolCalls immediately without looping
   * @returns {Promise<{ text: string, provider: string, toolCalls: Array, raw: object }>}
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

    // Prepare OpenAI-format tool definitions
    let tools = [];
    if (registry && typeof registry.getOpenAIToolDefinitions === "function") {
      tools = registry.getOpenAIToolDefinitions();
    } else if (registry && typeof registry.getToolDefinitions === "function") {
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

      // When executeTools is false, return immediately so the Agent can drive the step loop
      if (executeTools === false) {
        const toolCalls = (responseMessage.tool_calls || []).map((tc) => {
          let fnArgs = {};
          try {
            fnArgs = JSON.parse(tc.function.arguments || "{}");
          } catch {
            fnArgs = {};
          }
          return {
            id: tc.id,
            name: tc.function.name,
            args: fnArgs,
          };
        });

        return {
          text: responseMessage.content || "",
          provider: this.name,
          toolCalls,
          raw: response,
        };
      }

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
