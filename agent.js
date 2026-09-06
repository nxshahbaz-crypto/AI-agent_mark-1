// ═══════════════════════════════════════════════════════════════════
// Phase 6 — Multi-Step Agent Planning
//
// Orchestrates multi-step tool execution pipelines.
// Allows Atlas to decide and execute multiple independent or dependent
// tools in sequence, bounds execution to MAX_AGENT_STEPS (default 5),
// halts on unrecoverable errors, and utilizes the Provider Router for
// automatic Gemini -> Groq failover at any step.
// ═══════════════════════════════════════════════════════════════════

import {
  MAX_AGENT_STEPS,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_PAYLOAD_SIZE,
  SYSTEM_INSTRUCTION,
} from "./config.js";
import { truncatePayload } from "./context-manager.js";

export class Agent {
  /**
   * @param {object} options
   * @param {object} options.router - ProviderRouter instance
   * @param {object} options.registry - ToolRegistry instance
   * @param {number} [options.maxSteps] - Maximum steps per turn (default: 5)
   * @param {string} [options.systemInstruction] - System prompt
   * @param {number} [options.maxOutputTokens] - Token generation limit
   * @param {number} [options.maxToolPayloadSize] - Tool payload truncate limit
   */
  constructor(options = {}) {
    this.router = options.router;
    this.registry = options.registry;
    this.maxSteps = options.maxSteps || MAX_AGENT_STEPS || 5;
    this.systemInstruction = options.systemInstruction || SYSTEM_INSTRUCTION;
    this.maxOutputTokens = options.maxOutputTokens || MAX_OUTPUT_TOKENS;
    this.maxToolPayloadSize = options.maxToolPayloadSize || MAX_TOOL_PAYLOAD_SIZE;
  }

  /**
   * Runs the multi-step planning loop for a user request.
   *
   * @param {object} params
   * @param {string} params.message - User prompt text
   * @param {Array} [params.history] - Array of messages from context manager
   * @returns {Promise<{ text: string, steps: number, toolCalls: string[], stepsDetails: Array, provider: string, fallback: boolean, error?: string, maxStepsReached?: boolean }>}
   */
  async run({ message, history = [] }) {
    if (!this.router) {
      throw new Error("Agent cannot run without a ProviderRouter instance.");
    }

    const workingHistory = [...history];
    const allToolsUsed = [];
    const stepsDetails = [];
    let step = 0;
    let activeProvider = "unknown";
    let wasFallback = false;
    let currentPrompt = message;

    while (step < this.maxSteps) {
      step++;

      // Send current prompt/history through Provider Router (handles primary -> fallback failover)
      const stepResponse = await this.router.sendMessage({
        message: currentPrompt,
        history: workingHistory,
        systemInstruction: this.systemInstruction,
        registry: this.registry,
        executeTools: false, // Let Agent drive the step loop
        maxOutputTokens: this.maxOutputTokens,
        maxToolPayloadSize: this.maxToolPayloadSize,
      });

      activeProvider = stepResponse.provider || activeProvider;
      if (stepResponse.fallback) {
        wasFallback = true;
      }

      // Case 1: Model finished and returned final text (no tool calls)
      if (!stepResponse.toolCalls || stepResponse.toolCalls.length === 0) {
        stepsDetails.push({
          step,
          type: "final_response",
          text: stepResponse.text,
          provider: stepResponse.provider,
          fallback: stepResponse.fallback || false,
        });

        return {
          text: stepResponse.text || "",
          steps: step,
          toolCalls: allToolsUsed,
          stepsDetails,
          provider: activeProvider,
          fallback: wasFallback,
        };
      }

      // Case 2: Model requested tool calls
      console.log(`  📍 [Step ${step}/${this.maxSteps}] Agent executing ${stepResponse.toolCalls.length} tool(s)...`);

      // Ensure user prompt is recorded in history before model function call turn
      if (step === 1) {
        workingHistory.push({
          role: "user",
          parts: [{ text: message }],
        });
      } else if (currentPrompt && Array.isArray(currentPrompt)) {
        workingHistory.push({
          role: "user",
          parts: currentPrompt,
        });
      }

      // Record model's tool calls in working history
      workingHistory.push({
        role: "model",
        parts: stepResponse.toolCalls.map((tc) => ({
          functionCall: {
            id: tc.id,
            name: tc.name,
            args: tc.args || {},
          },
        })),
      });

      const toolResponses = [];
      let hasUnrecoverableError = false;
      let unrecoverableErrorMessage = "";

      for (const tc of stepResponse.toolCalls) {
        allToolsUsed.push(tc.name);
        console.log(`  🔧 Tool call: ${tc.name}(${JSON.stringify(tc.args || {})})`);

        const rawResult = this.registry
          ? this.registry.executeTool(tc.name, tc.args || {})
          : { error: `Tool registry not available for ${tc.name}` };

        // Check for unrecoverable errors (security violations, syntax crashes, missing tools)
        if (
          rawResult &&
          (rawResult.unrecoverable ||
            rawResult.fatal ||
            (rawResult.error && rawResult.error.startsWith("Unknown tool:")))
        ) {
          hasUnrecoverableError = true;
          unrecoverableErrorMessage = rawResult.error;
          console.error(`  ❌ [Unrecoverable Error] ${tc.name}: ${rawResult.error}. Halting plan.`);
          break;
        }

        const result = truncatePayload(rawResult, this.maxToolPayloadSize);
        console.log(`  📦 Result: ${JSON.stringify(result)}`);

        toolResponses.push({
          functionResponse: {
            id: tc.id,
            name: tc.name,
            response: result,
          },
        });
      }

      // If an unrecoverable tool error occurred, stop immediately
      if (hasUnrecoverableError) {
        stepsDetails.push({
          step,
          type: "unrecoverable_error",
          error: unrecoverableErrorMessage,
        });

        return {
          text: `I encountered an unrecoverable error while executing a tool: ${unrecoverableErrorMessage}`,
          steps: step,
          toolCalls: allToolsUsed,
          stepsDetails,
          provider: activeProvider,
          fallback: wasFallback,
          error: unrecoverableErrorMessage,
        };
      }

      // Record step details
      stepsDetails.push({
        step,
        type: "tool_execution",
        toolCalls: stepResponse.toolCalls.map((t) => t.name),
        provider: stepResponse.provider,
        fallback: stepResponse.fallback || false,
      });

      // Check if max steps reached
      if (step >= this.maxSteps) {
        console.warn(`  ⚠️ Maximum step limit (${this.maxSteps}) reached. Halting tool execution.`);

        // Append final tool responses to history
        workingHistory.push({
          role: "user",
          parts: toolResponses,
        });

        // Request final synthesis without further tool calls
        try {
          const finalSynthesis = await this.router.sendMessage({
            message: "Maximum step limit reached. Please summarize your final response based on the results obtained so far.",
            history: workingHistory,
            systemInstruction: this.systemInstruction,
            registry: null,
            executeTools: false,
          });

          return {
            text: finalSynthesis.text || "Maximum step limit reached. Unable to complete all steps.",
            steps: step,
            toolCalls: allToolsUsed,
            stepsDetails,
            provider: finalSynthesis.provider || activeProvider,
            fallback: wasFallback || finalSynthesis.fallback || false,
            maxStepsReached: true,
          };
        } catch {
          return {
            text: `Maximum step limit (${this.maxSteps}) reached. Halting execution.`,
            steps: step,
            toolCalls: allToolsUsed,
            stepsDetails,
            provider: activeProvider,
            fallback: wasFallback,
            maxStepsReached: true,
          };
        }
      }

      // Pass tool responses as the prompt for the next step
      currentPrompt = toolResponses;
    }

    return {
      text: "Multi-step plan finished.",
      steps: step,
      toolCalls: allToolsUsed,
      stepsDetails,
      provider: activeProvider,
      fallback: wasFallback,
    };
  }
}
