// ═══════════════════════════════════════════════════════════════════
// Phase 7 — RAG Embedding Generation
//
// Generates 768-dimensional embeddings using Gemini's gemini-embedding-2
// model via @google/genai with outputDimensionality=768.
// Also provides a deterministic 768-dimensional mock embedding generator
// for unit tests to consume zero Gemini API quota.
// ═══════════════════════════════════════════════════════════════════

import { GoogleGenAI } from "@google/genai";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSION } from "../config.js";

let genAIClient = null;

/**
 * Returns a singleton or custom GoogleGenAI client.
 */
function getClient(apiKey) {
  if (apiKey) {
    return new GoogleGenAI({ apiKey });
  }
  if (!genAIClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.includes("your_")) {
      throw new Error("Missing GEMINI_API_KEY for embedding generation.");
    }
    genAIClient = new GoogleGenAI({ apiKey: key });
  }
  return genAIClient;
}

/**
 * Generates an embedding vector using gemini-embedding-2.
 * Output dimensionality is strictly configured to 768.
 *
 * @param {string} text - The input text to embed
 * @param {object} [options]
 * @param {string} [options.apiKey] - Optional custom API key
 * @param {object} [options.client] - Optional pre-initialized client
 * @param {string} [options.model] - Model name (default: gemini-embedding-2)
 * @param {number} [options.dimension] - Vector dimension (default: 768)
 * @returns {Promise<number[]>} 768-dimensional float array
 */
export async function generateEmbedding(text, options = {}) {
  if (!text || typeof text !== "string") {
    throw new Error("generateEmbedding requires a non-empty string.");
  }

  const client = options.client || getClient(options.apiKey);
  const model = options.model || EMBEDDING_MODEL;
  const dimension = options.dimension || EMBEDDING_DIMENSION;

  const response = await client.models.embedContent({
    model,
    contents: text,
    config: {
      outputDimensionality: dimension,
    },
  });

  const values = response.embedding?.values || response.embeddings?.[0]?.values;

  if (!values || !Array.isArray(values)) {
    throw new Error("Failed to extract embedding values from Gemini API response.");
  }

  if (values.length !== dimension) {
    // Ensure strict dimension adherence
    return values.slice(0, dimension);
  }

  return values;
}

/**
 * Generates a deterministic, normalized 768-dimensional float vector.
 * Consumes 0 Gemini API quota. Perfect for unit testing vector similarity,
 * top-k ranking, threshold filtering, and database operations.
 *
 * @param {string} text - Input text
 * @param {number} [dimension=768] - Vector length
 * @returns {number[]} Unit-normalized 768-dimensional float array
 */
export function generateMockEmbedding(text, dimension = EMBEDDING_DIMENSION) {
  const vector = new Array(dimension).fill(0);
  const str = String(text || "").toLowerCase();

  if (!str.trim()) {
    return vector;
  }

  // Tokenize into simple words
  const words = str.match(/\w+/g) || [];

  for (const word of words) {
    // Generate a pseudo-hash from the word
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }

    // Spread hash impact across several deterministic buckets
    for (let k = 0; k < 5; k++) {
      const idx = Math.abs((hash + k * 1337)) % dimension;
      vector[idx] += 1.0 / (k + 1);
    }
  }

  // Normalize to unit vector (L2 norm = 1.0) so dot product equals cosine similarity
  let sumSq = 0;
  for (let i = 0; i < dimension; i++) {
    sumSq += vector[i] * vector[i];
  }

  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < dimension; i++) {
      vector[i] = Number((vector[i] / norm).toFixed(6));
    }
  }

  return vector;
}

/**
 * Computes cosine similarity between two numeric vectors.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Value between -1.0 and 1.0
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dotProduct / denom;
}
