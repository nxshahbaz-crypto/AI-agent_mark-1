// ═══════════════════════════════════════════════════════════════════
// Phase 4C — Tool Registry
//
// A domain-agnostic registry that allows tools to be registered,
// described to Gemini, validated, executed, and removed without
// modifying the agent core.
//
// Usage:
//   import { ToolRegistry } from './tool-registry.js';
//   const registry = new ToolRegistry();
//   registry.register({ name, description, parameters, execute });
// ═══════════════════════════════════════════════════════════════════

export class ToolRegistry {
  constructor() {
    /** @type {Map<string, {name:string, description:string, parameters:object, execute:function}>} */
    this._tools = new Map();
  }

  // ─── register() ────────────────────────────────────────────────
  // Adds a tool to the registry. Validates the config shape.
  // Returns `this` for chaining: registry.register(a).register(b)
  register({ name, description, parameters, execute }) {
    if (!name || typeof name !== "string") {
      throw new Error("Tool registration failed: 'name' (string) is required.");
    }
    if (!description || typeof description !== "string") {
      throw new Error(`Tool registration failed for '${name}': 'description' (string) is required.`);
    }
    if (typeof execute !== "function") {
      throw new Error(`Tool registration failed for '${name}': 'execute' (function) is required.`);
    }

    this._tools.set(name, {
      name,
      description,
      parameters: parameters || { type: "object", properties: {} },
      execute,
    });

    return this; // chainable
  }

  // ─── unregister() ──────────────────────────────────────────────
  // Removes a tool by name. Returns true if it existed, false otherwise.
  unregister(name) {
    return this._tools.delete(name);
  }

  // ─── has() ─────────────────────────────────────────────────────
  // Returns true if a tool with the given name is registered.
  has(name) {
    return this._tools.has(name);
  }

  // ─── listTools() ───────────────────────────────────────────────
  // Returns an array of registered tool names.
  listTools() {
    return [...this._tools.keys()];
  }

  // ─── getTool() ─────────────────────────────────────────────────
  // Returns the full tool config object, or undefined if not found.
  getTool(name) {
    return this._tools.get(name);
  }

  // ─── getToolDefinitions() ──────────────────────────────────────
  // Returns tool declarations in the format Gemini expects:
  //   [{ functionDeclarations: [{ name, description, parameters }, ...] }]
  // If no tools are registered, returns an empty array.
  getToolDefinitions() {
    if (this._tools.size === 0) return [];

    const declarations = [...this._tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    return [{ functionDeclarations: declarations }];
  }

  // ─── executeTool() ─────────────────────────────────────────────
  // Executes a registered tool by name with the given arguments.
  // Returns { error } if the tool is not found or crashes.
  // The agent core calls this without knowing what the tool does.
  executeTool(name, args) {
    const tool = this._tools.get(name);
    if (!tool) {
      return { error: `Unknown tool: ${name}` };
    }
    try {
      return tool.execute(args || {});
    } catch (e) {
      return { error: `Tool "${name}" crashed: ${e.message}` };
    }
  }

  // ─── validateToolArguments() ───────────────────────────────────
  // Checks whether the provided args satisfy the tool's required params.
  // Returns { valid: true } or { valid: false, error: "..." }.
  // Does NOT validate types — only checks presence of required keys.
  validateToolArguments(name, args) {
    const tool = this._tools.get(name);
    if (!tool) {
      return { valid: false, error: `Unknown tool: ${name}` };
    }

    const params = tool.parameters;
    if (!params || !params.required || params.required.length === 0) {
      return { valid: true };
    }

    const provided = args || {};
    const missing = params.required.filter((key) => !(key in provided));

    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required argument(s): ${missing.join(", ")}`,
      };
    }

    return { valid: true };
  }

  // ─── clear() ───────────────────────────────────────────────────
  // Removes all registered tools. Useful for testing.
  clear() {
    this._tools.clear();
  }

  // ─── size ──────────────────────────────────────────────────────
  // Returns the number of registered tools.
  get size() {
    return this._tools.size;
  }
}
