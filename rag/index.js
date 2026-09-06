// ═══════════════════════════════════════════════════════════════════
// Phase 7 — RAG Module Exports
// ═══════════════════════════════════════════════════════════════════

export { chunkText } from "./chunker.js";
export {
  generateEmbedding,
  generateMockEmbedding,
  cosineSimilarity,
} from "./embeddings.js";
export {
  ingestDocument,
  deleteDocument,
  ingestBatch,
} from "./ingestion.js";
export {
  retrieveKnowledge,
  formatKnowledgeContext,
  formatAugmentedPrompt,
} from "./retriever.js";
