/**
 * Generates a clean, ChatGPT-like conversation title (3-6 words)
 * locally and deterministically from the user's first message.
 * Zero external API calls consumed.
 *
 * Example:
 * "How do I implement binary search in Java?" -> "Binary Search in Java"
 * "Explain quantum computing simply" -> "Quantum Computing"
 * "Build a travel planner for Tokyo" -> "Travel Planner for Tokyo"
 */
export function generateConversationTitle(message) {
  if (!message || typeof message !== "string") return "New Conversation";

  let clean = message.trim();

  // Strip common system or mode tags e.g. [Reasoning Mode], [Web Search Active]
  clean = clean.replace(/^\[.*?\]\s*/g, "");

  // Remove trailing punctuation marks
  clean = clean.replace(/[?.!;,]+$/, "").trim();

  // Common question / command filler intros to remove
  const fillerPatterns = [
    /^(can you\s+(please\s+)?(explain|tell me about|help me with|write|show me|describe|summarize))\s+/i,
    /^(please\s+(explain|tell me about|help me with|write|show me|describe|summarize))\s+/i,
    /^(how do (i|we|you)\s+implement\s+)/i,
    /^(how do (i|we|you)\s+)/i,
    /^(how to\s+implement\s+)/i,
    /^(how to\s+)/i,
    /^(what (is|are|was|were)\s+(the\s+)?)/i,
    /^(why (is|are|does|do)\s+)/i,
    /^(give me\s+(a|an|the|some)?\s*)/i,
    /^(i need\s+(a|an|the|some|help with)?\s*)/i,
    /^(could you\s+(please\s+)?)/i,
    /^(explain\s+(to me\s+)?)/i,
    /^(write\s+(a|an|the)?\s*)/i,
    /^(build\s+(a|an|the)?\s*)/i,
    /^(create\s+(a|an|the)?\s*)/i,
    /^(generate\s+(a|an|the)?\s*)/i,
  ];

  let core = clean;
  for (const pattern of fillerPatterns) {
    if (pattern.test(core)) {
      core = core.replace(pattern, "").trim();
      break;
    }
  }

  // Split into words
  const words = core.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    const rawWords = clean.split(/\s+/).slice(0, 5);
    return rawWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  // Take 3 to 6 words
  const titleWords = words.slice(0, Math.min(words.length, 5));

  // Capitalize into Title Case while preserving minor words in lowercase (except first word)
  const minorWords = new Set([
    "a", "an", "the", "and", "but", "or", "for", "nor", "on", "at", "to", "from", "by", "in", "of", "with",
  ]);

  const formatted = titleWords.map((word, index) => {
    // Preserve words that look like code or acronyms (e.g. "DSA", "API", "RAG", "Java", "JSON")
    if (word === word.toUpperCase() && word.length > 1) {
      return word;
    }
    const lower = word.toLowerCase();
    if (index > 0 && minorWords.has(lower)) {
      return lower;
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  return formatted.join(" ");
}
