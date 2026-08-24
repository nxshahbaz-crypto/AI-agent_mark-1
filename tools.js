// ═══════════════════════════════════════════════════════════════════
// Default Tool Definitions — Phase 4C (Registry-based)
//
// This file creates a ToolRegistry instance, registers the default
// tools (calculator, current_time, get_weather), and exports the
// registry plus backward-compatible helpers.
//
// To add/swap tools for a different project, either:
//   1. Modify this file, or
//   2. Import the registry and call registry.register() / .unregister()
// ═══════════════════════════════════════════════════════════════════

import { ToolRegistry } from "./tool-registry.js";

// ─── Create the default registry ─────────────────────────────────
export const registry = new ToolRegistry();

// ─── Calculator ──────────────────────────────────────────────────
registry.register({
  name: "calculator",
  description:
    "Performs basic arithmetic calculations. Use this for any math questions.",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description:
          "The math expression to evaluate, e.g. '25 * 48' or '(10 + 5) / 3'",
      },
    },
    required: ["expression"],
  },
  execute(args) {
    const { expression } = args || {};
    if (!expression || typeof expression !== "string") {
      return { error: "Invalid input. Provide a math expression as a string." };
    }
    // Sanitize: only allow digits, operators, whitespace, parens, decimal points
    if (!/^[\d\s+\-*/().%]+$/.test(expression)) {
      return { error: `Unsafe expression: "${expression}". Only basic arithmetic is allowed.` };
    }
    try {
      const result = Function(`"use strict"; return (${expression})`)();
      if (typeof result !== "number" || !isFinite(result)) {
        return { error: "Expression did not produce a valid number." };
      }
      return { expression, result };
    } catch (e) {
      return { error: `Evaluation failed: ${e.message}` };
    }
  },
});

// ─── Current Time ────────────────────────────────────────────────
registry.register({
  name: "current_time",
  description: "Returns the current local date and time.",
  parameters: {
    type: "object",
    properties: {},
  },
  execute() {
    return {
      dateTime: new Date().toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
});

// ─── Weather (Mock) ──────────────────────────────────────────────
registry.register({
  name: "get_weather",
  description:
    "Returns current weather for a given city. NOTE: This is a mock tool that returns simulated placeholder data, not real weather.",
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "The city name, e.g. 'Hyderabad'",
      },
    },
    required: ["city"],
  },
  execute(args) {
    const { city } = args || {};
    if (!city || typeof city !== "string") {
      return { error: "Please provide a valid city name." };
    }
    // Mock data — clearly labelled as simulated
    return {
      city,
      temperature: "28°C",
      condition: "Partly cloudy",
      humidity: "65%",
      note: "This is simulated mock data, not real weather.",
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// Backward-Compatible Exports
// These ensure test.js and any existing imports continue to work
// without modification.
// ═══════════════════════════════════════════════════════════════════

// Dynamic getter — always reflects the current registry state.
// Use this in index.js: tools: toolDeclarations()
// (Note: the old static array is replaced by a function call)
export const toolDeclarations = registry.getToolDefinitions();

// Delegates to the registry's executeTool method.
export function executeTool(name, args) {
  return registry.executeTool(name, args);
}
