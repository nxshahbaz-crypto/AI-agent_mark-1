// ═══════════════════════════════════════════════════════════════════
// Phase 7 — RAG Ingestion Pipeline
//
// Ingests documents into the knowledge base:
// 1. Chunks document text without LLM summarization.
// 2. Generates 768-dimensional embeddings for each chunk.
// 3. Upserts chunks + metadata + embeddings into Supabase (knowledge_chunks).
// Supports custom embedding generators and mock clients for testing.
// ═══════════════════════════════════════════════════════════════════

import { chunkText } from "./chunker.js";
import { generateEmbedding } from "./embeddings.js";
import { supabase as defaultSupabase } from "../supabase.js";

/**
 * Ingests a single document into the Supabase knowledge_chunks table.
 *
 * @param {object} doc
 * @param {string} [doc.id] - Document ID (e.g. "faq-refunds")
 * @param {string} doc.content - Text content of the document
 * @param {object} [doc.metadata] - Optional metadata (title, category, source)
 * @param {object} [options]
 * @param {Function} [options.embedFn] - Custom embedding generator (defaults to generateEmbedding)
 * @param {object} [options.supabaseClient] - Custom Supabase client (for testing)
 * @param {number} [options.chunkSize] - Character size per chunk
 * @param {number} [options.chunkOverlap] - Character overlap between chunks
 * @returns {Promise<{ documentId: string, chunksCreated: number, chunkIds: string[] }>}
 */
export async function ingestDocument(doc, options = {}) {
  if (!doc || !doc.content || typeof doc.content !== "string") {
    throw new Error("ingestDocument requires a document object with a string 'content' field.");
  }

  const documentId = doc.id || `doc_${Date.now()}`;
  const embedFn = options.embedFn || generateEmbedding;
  const client = options.supabaseClient || defaultSupabase;

  // 1. Chunk document
  const chunks = chunkText({
    text: doc.content,
    documentId,
    chunkSize: options.chunkSize,
    chunkOverlap: options.chunkOverlap,
    metadata: doc.metadata || {},
  });

  if (chunks.length === 0) {
    return { documentId, chunksCreated: 0, chunkIds: [] };
  }

  // 2. Generate embeddings for each chunk (768-dimensional)
  const rowsToInsert = [];
  for (const chunk of chunks) {
    const embedding = await embedFn(chunk.content);
    rowsToInsert.push({
      document_id: documentId,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding,
    });
  }

  // 3. Insert into Supabase knowledge_chunks
  const { data, error } = await client
    .from("knowledge_chunks")
    .insert(rowsToInsert)
    .select("id");

  if (error) {
    throw new Error(`Failed to insert knowledge chunks into Supabase: ${error.message}`);
  }

  const chunkIds = (data || []).map((row) => row.id);

  return {
    documentId,
    chunksCreated: rowsToInsert.length,
    chunkIds,
  };
}

/**
 * Deletes all chunks associated with a specific document ID.
 *
 * @param {string} documentId
 * @param {object} [options]
 * @param {object} [options.supabaseClient]
 * @returns {Promise<{ documentId: string, deleted: boolean }>}
 */
export async function deleteDocument(documentId, options = {}) {
  if (!documentId) {
    throw new Error("deleteDocument requires a documentId.");
  }

  const client = options.supabaseClient || defaultSupabase;
  const { error } = await client
    .from("knowledge_chunks")
    .delete()
    .eq("document_id", documentId);

  if (error) {
    throw new Error(`Failed to delete document chunks from Supabase: ${error.message}`);
  }

  return { documentId, deleted: true };
}

/**
 * Ingests a batch of documents sequentially or in parallel.
 *
 * @param {Array<object>} documents - Array of { id, content, metadata }
 * @param {object} [options]
 * @returns {Promise<Array<{ documentId: string, chunksCreated: number }>>}
 */
export async function ingestBatch(documents, options = {}) {
  if (!Array.isArray(documents)) {
    throw new Error("ingestBatch requires an array of document objects.");
  }

  const results = [];
  for (const doc of documents) {
    const res = await ingestDocument(doc, options);
    results.push(res);
  }

  return results;
}
