// ═══════════════════════════════════════════════════════════════════
// Phase 4C — Tool Registry Tests
// Tests registration, discovery, execution, validation, and removal.
// Zero Gemini API calls consumed.
// Run: npm run test:registry
// ═══════════════════════════════════════════════════════════════════

import { ToolRegistry } from "./tool-registry.js";
import { registry, executeTool } from "./tools.js";

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 1. REGISTRY CLASS TESTS (isolated instance)
// ═══════════════════════════════════════════════════════════════════

function testRegistryCore() {
  console.log("🧪 TOOL REGISTRY TESTS (zero API calls)\n" + "═".repeat(55));

  const reg = new ToolRegistry();

  // ── Registration ──
  console.log("\n── Registration ──");

  reg.register({
    name: "test_add",
    description: "Adds two numbers.",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
    },
    execute: (args) => ({ result: args.a + args.b }),
  });

  assert("Tool registered successfully", reg.has("test_add"));
  assert("Registry size is 1", reg.size === 1);

  // Chaining
  reg
    .register({
      name: "test_greet",
      description: "Returns a greeting.",
      parameters: { type: "object", properties: {} },
      execute: () => ({ message: "Hello!" }),
    })
    .register({
      name: "test_upper",
      description: "Uppercases a string.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      execute: (args) => ({ result: args.text.toUpperCase() }),
    });

  assert("Chained registration: 3 tools", reg.size === 3);

  // ── Registration Validation ──
  console.log("\n── Registration Validation ──");

  try {
    reg.register({ description: "no name", execute: () => {} });
    assert("Missing name throws", false);
  } catch (e) {
    assert("Missing name throws error", e.message.includes("name"));
  }

  try {
    reg.register({ name: "x", execute: () => {} });
    assert("Missing description throws", false);
  } catch (e) {
    assert("Missing description throws error", e.message.includes("description"));
  }

  try {
    reg.register({ name: "x", description: "x" });
    assert("Missing execute throws", false);
  } catch (e) {
    assert("Missing execute throws error", e.message.includes("execute"));
  }

  // ── Discovery ──
  console.log("\n── Discovery ──");

  assert("has('test_add') is true", reg.has("test_add"));
  assert("has('nonexistent') is false", reg.has("nonexistent") === false);

  const tools = reg.listTools();
  assert("listTools returns array", Array.isArray(tools));
  assert("listTools has 3 entries", tools.length === 3);
  assert("listTools contains 'test_add'", tools.includes("test_add"));
  assert("listTools contains 'test_greet'", tools.includes("test_greet"));
  assert("listTools contains 'test_upper'", tools.includes("test_upper"));

  const tool = reg.getTool("test_add");
  assert("getTool returns tool config", tool !== undefined);
  assert("getTool has correct name", tool.name === "test_add");
  assert("getTool has execute function", typeof tool.execute === "function");
  assert("getTool for unknown returns undefined", reg.getTool("nope") === undefined);

  // ── Gemini Definitions Format ──
  console.log("\n── Gemini Tool Definitions ──");

  const defs = reg.getToolDefinitions();
  assert("Returns array", Array.isArray(defs));
  assert("Has exactly 1 element (wrapper)", defs.length === 1);
  assert("Element has functionDeclarations", Array.isArray(defs[0].functionDeclarations));
  assert("3 function declarations", defs[0].functionDeclarations.length === 3);

  const addDef = defs[0].functionDeclarations.find((d) => d.name === "test_add");
  assert("Declaration has name", addDef.name === "test_add");
  assert("Declaration has description", addDef.description === "Adds two numbers.");
  assert("Declaration has parameters", addDef.parameters !== undefined);
  assert("Declaration does NOT have execute", addDef.execute === undefined);

  // ── Execution ──
  console.log("\n── Execution ──");

  const addResult = reg.executeTool("test_add", { a: 3, b: 7 });
  assert("test_add(3,7) = 10", addResult.result === 10);

  const greetResult = reg.executeTool("test_greet", {});
  assert("test_greet returns greeting", greetResult.message === "Hello!");

  const upperResult = reg.executeTool("test_upper", { text: "hello" });
  assert("test_upper('hello') = 'HELLO'", upperResult.result === "HELLO");

  const unknownResult = reg.executeTool("nonexistent", {});
  assert("Unknown tool → error", unknownResult.error !== undefined);
  assert("Error mentions 'Unknown tool'", unknownResult.error.includes("Unknown tool"));

  // Tool that crashes
  reg.register({
    name: "crasher",
    description: "A tool that always throws.",
    execute: () => { throw new Error("intentional crash"); },
  });
  const crashResult = reg.executeTool("crasher", {});
  assert("Crashed tool returns error (no throw)", crashResult.error !== undefined);
  assert("Error mentions crash", crashResult.error.includes("crashed"));

  // Null args
  const nullResult = reg.executeTool("test_add", null);
  assert("Null args does not crash", nullResult !== undefined);

  // ── Argument Validation ──
  console.log("\n── Argument Validation ──");

  const valid1 = reg.validateToolArguments("test_add", { a: 1, b: 2 });
  assert("Valid args → { valid: true }", valid1.valid === true);

  const invalid1 = reg.validateToolArguments("test_add", { a: 1 });
  assert("Missing 'b' → { valid: false }", invalid1.valid === false);
  assert("Error mentions 'b'", invalid1.error.includes("b"));

  const invalid2 = reg.validateToolArguments("test_add", {});
  assert("Missing both → { valid: false }", invalid2.valid === false);
  assert("Error mentions 'a'", invalid2.error.includes("a"));

  const validNoReq = reg.validateToolArguments("test_greet", {});
  assert("No required params → always valid", validNoReq.valid === true);

  const unknownValidation = reg.validateToolArguments("nonexistent", {});
  assert("Unknown tool validation → { valid: false }", unknownValidation.valid === false);

  const nullValidation = reg.validateToolArguments("test_add", null);
  assert("Null args validation → { valid: false }", nullValidation.valid === false);

  // ── Unregister ──
  console.log("\n── Unregister ──");

  assert("Unregister existing tool → true", reg.unregister("test_greet") === true);
  assert("Tool no longer exists", reg.has("test_greet") === false);
  assert("Registry size decreased", reg.size === 3); // test_add, test_upper, crasher
  assert("Unregister nonexistent → false", reg.unregister("not_here") === false);

  // ── Re-register (replacement) ──
  console.log("\n── Re-register (replacement) ──");

  reg.register({
    name: "test_add",
    description: "Adds two numbers (v2).",
    parameters: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] },
    execute: (args) => ({ result: args.a + args.b + 100 }),
  });
  const v2Result = reg.executeTool("test_add", { a: 1, b: 2 });
  assert("Re-registered tool uses new implementation", v2Result.result === 103);
  assert("Description updated", reg.getTool("test_add").description === "Adds two numbers (v2).");

  // ── Clear ──
  console.log("\n── Clear ──");

  reg.clear();
  assert("After clear, size is 0", reg.size === 0);
  assert("After clear, listTools is empty", reg.listTools().length === 0);
  assert("After clear, getToolDefinitions is empty", reg.getToolDefinitions().length === 0);
}

// ═══════════════════════════════════════════════════════════════════
// 2. DEFAULT REGISTRY TESTS (the actual tools.js registry)
// ═══════════════════════════════════════════════════════════════════

function testDefaultRegistry() {
  console.log("\n\n" + "═".repeat(55));
  console.log("🧪 DEFAULT REGISTRY TESTS (calculator, current_time, get_weather)");
  console.log("═".repeat(55));

  // ── Default tools are registered ──
  console.log("\n── Default Tools Present ──");

  assert("Registry has calculator", registry.has("calculator"));
  assert("Registry has current_time", registry.has("current_time"));
  assert("Registry has get_weather", registry.has("get_weather"));
  assert("Registry size is 3", registry.size === 3);

  // ── Backward-compatible executeTool works ──
  console.log("\n── Backward-Compatible executeTool ──");

  const calc = executeTool("calculator", { expression: "25 * 48" });
  assert("executeTool('calculator') works", calc.result === 1200);

  const time = executeTool("current_time", {});
  assert("executeTool('current_time') works", typeof time.dateTime === "string");

  const weather = executeTool("get_weather", { city: "Hyderabad" });
  assert("executeTool('get_weather') works", weather.city === "Hyderabad");

  const unknown = executeTool("nonexistent", {});
  assert("executeTool unknown → error", unknown.error !== undefined);

  // ── Gemini definitions are correct ──
  console.log("\n── Gemini Definitions ──");

  const defs = registry.getToolDefinitions();
  assert("Definitions array has 1 element", defs.length === 1);
  assert("Has 3 function declarations", defs[0].functionDeclarations.length === 3);

  const calcDef = defs[0].functionDeclarations.find((d) => d.name === "calculator");
  assert("Calculator declaration exists", calcDef !== undefined);
  assert("Calculator has required: ['expression']", JSON.stringify(calcDef.parameters.required) === '["expression"]');

  // ── Validation on default tools ──
  console.log("\n── Validation on Default Tools ──");

  const calcValid = registry.validateToolArguments("calculator", { expression: "1+1" });
  assert("Calculator valid with expression", calcValid.valid === true);

  const calcInvalid = registry.validateToolArguments("calculator", {});
  assert("Calculator invalid without expression", calcInvalid.valid === false);

  const timeValid = registry.validateToolArguments("current_time", {});
  assert("current_time valid with no args", timeValid.valid === true);

  const weatherValid = registry.validateToolArguments("get_weather", { city: "Delhi" });
  assert("get_weather valid with city", weatherValid.valid === true);

  const weatherInvalid = registry.validateToolArguments("get_weather", {});
  assert("get_weather invalid without city", weatherInvalid.valid === false);
}

// ═══════════════════════════════════════════════════════════════════
// 3. DOMAIN-AGNOSTIC PROOF (simulate hackathon tool swap)
// ═══════════════════════════════════════════════════════════════════

function testDomainAgnostic() {
  console.log("\n\n" + "═".repeat(55));
  console.log("🧪 DOMAIN-AGNOSTIC PROOF (hackathon tool swap simulation)");
  console.log("═".repeat(55));

  const hackathonRegistry = new ToolRegistry();

  // Simulate "Hackathon A" tools
  console.log("\n── Hackathon A: Campus Navigator ──");

  hackathonRegistry.register({
    name: "search_faculty",
    description: "Search for faculty members by name or department.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Faculty name or department" },
      },
      required: ["query"],
    },
    execute: (args) => ({ faculty: `Dr. Smith (${args.query} dept)`, office: "Room 204" }),
  });

  hackathonRegistry.register({
    name: "search_building",
    description: "Find a campus building by name.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Building name" },
      },
      required: ["name"],
    },
    execute: (args) => ({ building: args.name, location: "North Campus, Block C" }),
  });

  assert("Hackathon A: 2 tools registered", hackathonRegistry.size === 2);
  assert("Hackathon A: has search_faculty", hackathonRegistry.has("search_faculty"));
  assert("Hackathon A: has search_building", hackathonRegistry.has("search_building"));

  const faculty = hackathonRegistry.executeTool("search_faculty", { query: "CS" });
  assert("search_faculty returns result", faculty.faculty.includes("Dr. Smith"));

  const defs = hackathonRegistry.getToolDefinitions();
  assert("Hackathon A: Gemini gets 2 declarations", defs[0].functionDeclarations.length === 2);

  // Now swap to "Hackathon B" tools
  console.log("\n── Hackathon B: E-commerce (swap) ──");

  hackathonRegistry.clear();

  hackathonRegistry.register({
    name: "search_products",
    description: "Search products in the catalog.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    execute: (args) => ({ products: [`${args.query} Widget`, `${args.query} Pro`] }),
  });

  hackathonRegistry.register({
    name: "get_order",
    description: "Retrieve order details by order ID.",
    parameters: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    },
    execute: (args) => ({ orderId: args.orderId, status: "shipped" }),
  });

  assert("Hackathon B: 2 tools registered (old cleared)", hackathonRegistry.size === 2);
  assert("Hackathon B: campus tools gone", hackathonRegistry.has("search_faculty") === false);
  assert("Hackathon B: has search_products", hackathonRegistry.has("search_products"));
  assert("Hackathon B: has get_order", hackathonRegistry.has("get_order"));

  const order = hackathonRegistry.executeTool("get_order", { orderId: "ORD-123" });
  assert("get_order returns status", order.status === "shipped");

  const defsB = hackathonRegistry.getToolDefinitions();
  assert("Hackathon B: Gemini gets 2 new declarations", defsB[0].functionDeclarations.length === 2);
  assert("Hackathon B: first tool is search_products", defsB[0].functionDeclarations[0].name === "search_products");
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

testRegistryCore();
testDefaultRegistry();
testDomainAgnostic();

console.log("\n" + "═".repeat(55));
console.log(`📊 Tool Registry Tests: ${passed} passed, ${failed} failed`);
console.log(`📡 Gemini API calls made: 0\n`);

process.exit(failed > 0 ? 1 : 0);
