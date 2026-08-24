// ═══════════════════════════════════════════════════════════════════
// Phase 5 — Context & Token Management
//
// Provides lightweight, deterministic strategies for managing API 
// token limits, trimming old history, deduplicating messages, and 
// safeguarding against excessively large tool payloads.
// ═══════════════════════════════════════════════════════════════════

/**
 * Estimates the number of tokens in an object.
 * Uses a deterministic heuristic (1 token ≈ 4 characters).
 */
export function estimateTokens(obj) {
  if (!obj) return 0;
  const str = typeof obj === "string" ? obj : JSON.stringify(obj);
  return Math.ceil(str.length / 4);
}

/**
 * Truncates a tool payload if it exceeds the maximum allowed size.
 * Keeps data small to prevent blowing up the context budget.
 */
export function truncatePayload(payload, maxLength) {
  if (!payload) return payload;
  
  const str = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (str.length <= maxLength) return payload;

  const truncatedStr = str.substring(0, maxLength) + "... [TRUNCATED FOR CONTEXT LIMITS]";
  
  // Return as an object so Gemini understands it was truncated
  return {
    _meta: "Result truncated due to size limits",
    data: truncatedStr
  };
}

/**
 * Selects the most relevant recent messages from the conversation history
 * that fit within the given token budget.
 * 
 * - Works backwards (newest to oldest)
 * - Removes exact duplicate messages
 * - Preserves chronolical order
 * - Reports selection statistics
 */
export function buildContext(history, maxTokens) {
  const stats = {
    considered: history ? history.length : 0,
    sent: 0,
    estimatedTokens: 0,
    trimmed: false,
    toolResultsIncluded: 0
  };

  if (!history || history.length === 0) {
    return { context: [], stats };
  }

  const selected = [];
  let currentTokens = 0;
  const seenHashes = new Set();

  // Iterate backwards to prioritize recent messages
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    
    // Deduplication (simple string match)
    const msgHash = JSON.stringify(msg);
    if (seenHashes.has(msgHash)) {
      continue;
    }

    const tokens = estimateTokens(msg);
    
    // If this message puts us over the budget, we stop
    if (currentTokens + tokens > maxTokens) {
      stats.trimmed = true;
      break;
    }

    // Accept message
    seenHashes.add(msgHash);
    selected.unshift(msg); // Add to front to preserve chronological order
    currentTokens += tokens;
    stats.sent++;

    // Track if it contains tool results
    if (msg.parts && msg.parts.some(p => p.functionResponse)) {
      stats.toolResultsIncluded++;
    }
  }

  stats.estimatedTokens = currentTokens;
  return { context: selected, stats };
}
