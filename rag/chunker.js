// ═══════════════════════════════════════════════════════════════════
// Phase 7 — RAG Chunking Pipeline
//
// Domain-agnostic text chunker that splits documents into manageable,
// overlapping chunks preserving natural linguistic boundaries (paragraphs,
// lines, sentences, words).
// Does NOT use LLM summarization during chunking.
// ═══════════════════════════════════════════════════════════════════

import { RAG_CHUNK_SIZE, RAG_CHUNK_OVERLAP } from "../config.js";

/**
 * Splits text into overlapping chunks respecting boundary separators.
 *
 * @param {object} params
 * @param {string} params.text - Document content text
 * @param {string} [params.documentId] - Unique identifier for the source document
 * @param {number} [params.chunkSize] - Maximum characters per chunk (default: 500)
 * @param {number} [params.chunkOverlap] - Character overlap between consecutive chunks (default: 100)
 * @param {object} [params.metadata] - Additional metadata to attach to every chunk
 * @returns {Array<{ id: string, documentId: string, chunkIndex: number, content: string, metadata: object }>}
 */
export function chunkText({
  text,
  documentId = "doc",
  chunkSize = RAG_CHUNK_SIZE,
  chunkOverlap = RAG_CHUNK_OVERLAP,
  metadata = {},
}) {
  if (!text || typeof text !== "string" || !text.trim()) {
    return [];
  }

  const cleanText = text.trim();
  const docId = documentId || "doc";
  const size = Math.max(10, chunkSize);
  const overlap = Math.max(0, Math.min(chunkOverlap, size - 1));
  const step = size - overlap;

  // Natural separators ordered by preference
  const separators = ["\n\n", "\n", ". ", "? ", "! ", " "];

  const rawChunks = [];
  let startIndex = 0;

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + size;

    if (endIndex >= cleanText.length) {
      // Last chunk reaches the end
      const chunk = cleanText.substring(startIndex).trim();
      if (chunk.length > 0) {
        rawChunks.push(chunk);
      }
      break;
    }

    // Try to find a natural boundary near endIndex (within the last 25% of the window)
    const searchStart = Math.max(startIndex + Math.floor(size * 0.75), startIndex + 1);
    const searchSlice = cleanText.substring(searchStart, endIndex);
    let bestSplit = -1;

    for (const sep of separators) {
      const idx = searchSlice.lastIndexOf(sep);
      if (idx !== -1) {
        bestSplit = searchStart + idx + sep.length;
        break;
      }
    }

    // If no clean boundary found, split strictly at endIndex
    const splitPoint = bestSplit !== -1 ? bestSplit : endIndex;
    const chunk = cleanText.substring(startIndex, splitPoint).trim();
    if (chunk.length > 0) {
      rawChunks.push(chunk);
    }

    // Advance by step or splitPoint - overlap, ensuring forward progress
    const nextStart = Math.max(startIndex + 1, splitPoint - overlap);
    startIndex = nextStart;
  }

  const totalChunks = rawChunks.length;
  return rawChunks.map((content, index) => ({
    id: `${docId}_chunk_${index}`,
    documentId: docId,
    chunkIndex: index,
    content,
    metadata: {
      ...metadata,
      documentId: docId,
      chunkIndex: index,
      totalChunks,
    },
  }));
}
