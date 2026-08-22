// ─── Tool Declarations (Gemini function calling format) ──────────

export const toolDeclarations = [
  {
    functionDeclarations: [
      {
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
      },
      {
        name: "current_time",
        description: "Returns the current local date and time.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
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
      },
    ],
  },
];

// ─── Tool Implementations ────────────────────────────────────────

function calculator(args) {
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
}

function currentTime() {
  return {
    dateTime: new Date().toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function getWeather(args) {
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
}

// ─── Tool Executor ───────────────────────────────────────────────

const toolMap = {
  calculator,
  current_time: currentTime,
  get_weather: getWeather,
};

export function executeTool(name, args) {
  const fn = toolMap[name];
  if (!fn) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    return fn(args || {});
  } catch (e) {
    return { error: `Tool "${name}" crashed: ${e.message}` };
  }
}
