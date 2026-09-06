// ═══════════════════════════════════════════════════════════════════
// Phase 7 — RAG / Knowledge Base Tests
//
// Tests chunking, 768-dimension embeddings, ingestion pipeline,
// top-k retrieval, relevance threshold filtering, empty results,
// context limit protection, and agent injection.
// Consumes ZERO Gemini or Supabase API quota (all mocked).
// Run: npm run test:rag
// ═══════════════════════════════════════════════════════════════════

import { chunkText } from "./rag/chunker.js";
import {
  generateMockEmbedding,
  cosineSimilarity,
} from "./rag/embeddings.js";
import { ingestDocument, deleteDocument } from "./rag/ingestion.js";
import {
  retrieveKnowledge,
  formatKnowledgeContext,
  formatAugmentedPrompt,
} from "./rag/retriever.js";
import {
  EMBEDDING_DIMENSION,
  RAG_TOP_K,
  RAG_SIMILARITY_THRESHOLD,
  RAG_MAX_CONTEXT_TOKENS,
} from "./config.js";

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

// ─── Mock Supabase Client for Testing ────────────────────────────
class MockSupabaseClient {
  constructor() {
    this.tables = {
      knowledge_chunks: [],
    };
    this.rpcCalls = [];
    this.mockRpcResult = [];
  }

  from(table) {
    const self = this;
    return {
      insert(rows) {
        const rowsArray = Array.isArray(rows) ? rows : [rows];
        const inserted = rowsArray.map((r, i) => ({
          id: `chunk_id_${Date.now()}_${i}`,
          ...r,
          created_at: new Date().toISOString(),
        }));
        self.tables[table] = (self.tables[table] || []).concat(inserted);

        return {
          select(cols) {
            return Promise.resolve({ data: inserted, error: null });
          },
        };
      },
      delete() {
        return {
          eq(column, value) {
            if (self.tables[table]) {
              self.tables[table] = self.tables[table].filter((row) => row[column] !== value);
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
  }

  rpc(funcName, params) {
    this.rpcCalls.push({ funcName, params });
    return Promise.resolve({ data: this.mockRpcResult, error: null });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 1. CHUNKING & BOUNDARY TESTS
// ═══════════════════════════════════════════════════════════════════
function testChunking() {
  console.log("🧪 1. CHUNKING & BOUNDARY TESTS\n" + "═".repeat(55));

  const text = `Section 1: Overview
Atlas AI is a modular multi-provider AI assistant built for high-reliability agentic tasks.
It features automatic failover between Gemini and Groq.

Section 2: Memory and RAG
The persistent conversation memory is backed by Supabase.
RAG retrieval uses pgvector with 768-dimensional embeddings.

Section 3: Safety Guardrails
Strict step limits prevent infinite loops.
All API keys are redacted from error logs.`;

  const chunks = chunkText({
    text,
    documentId: "test-doc",
    chunkSize: 150,
    chunkOverlap: 40,
    metadata: { source: "manual" },
  });

  assert("Generates multiple chunks for long text", chunks.length >= 2);
  assert("First chunk has documentId", chunks[0].documentId === "test-doc");
  assert("First chunk has chunkIndex = 0", chunks[0].chunkIndex === 0);
  assert("Chunks contain metadata", chunks[0].metadata.source === "manual");
  assert("Metadata has totalChunks matching count", chunks[0].metadata.totalChunks === chunks.length);

  // Verify chunk size does not wildly exceed target
  const allWithinReason = chunks.every((c) => c.content.length <= 160);
  assert("All chunks are bounded near chunkSize", allWithinReason);

  // Empty or whitespace text returns empty array
  assert("Empty string produces 0 chunks", chunkText({ text: "" }).length === 0);
  assert("Whitespace string produces 0 chunks", chunkText({ text: "   \n\t  " }).length === 0);
  assert("Null text produces 0 chunks", chunkText({ text: null }).length === 0);
}

// ═══════════════════════════════════════════════════════════════════
// 2. EMBEDDING DIMENSIONS & VECTOR INTEGRITY TESTS
// ═══════════════════════════════════════════════════════════════════
function testEmbeddingDimensions() {
  console.log("\n🧪 2. EMBEDDING DIMENSIONS & VECTOR INTEGRITY\n" + "═".repeat(55));

  assert("EMBEDDING_DIMENSION is strictly 768", EMBEDDING_DIMENSION === 768);

  const mockVec = generateMockEmbedding("What is the refund policy for Atlas AI?");
  assert("Mock embedding produces exactly 768 dimensions", mockVec.length === 768);
  assert("Every element in vector is a number", mockVec.every((v) => typeof v === "number" && !isNaN(v)));

  // Test vector normalization: L2 norm should be approximately 1.0
  let sumSq = 0;
  for (const v of mockVec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  assert("Vector is unit-normalized (magnitude ≈ 1.0)", Math.abs(norm - 1.0) < 0.01);

  // Test cosine similarity calculation
  const vecA = generateMockEmbedding("refund policy cancel subscription");
  const vecB = generateMockEmbedding("how do I get a refund for my subscription");
  const vecC = generateMockEmbedding("astrophysics quantum mechanics black holes");

  const simAB = cosineSimilarity(vecA, vecB);
  const simAC = cosineSimilarity(vecA, vecC);

  assert("Related texts have higher similarity than unrelated texts", simAB > simAC);
  assert("Identical vector similarity is 1.0", Math.abs(cosineSimilarity(vecA, vecA) - 1.0) < 0.001);
}

// ═══════════════════════════════════════════════════════════════════
// 3. INGESTION PIPELINE TESTS
// ═══════════════════════════════════════════════════════════════════
async function testIngestionPipeline() {
  console.log("\n🧪 3. INGESTION PIPELINE TESTS\n" + "═".repeat(55));

  const mockClient = new MockSupabaseClient();
  let embeddingCallCount = 0;

  const customMockEmbed = async (text) => {
    embeddingCallCount++;
    return generateMockEmbedding(text);
  };

  const doc = {
    id: "handbook-101",
    content: "Atlas AI has a 14-day refund policy. Requests are processed within 5 business days.\n\nAll tools are domain agnostic.",
    metadata: { title: "Handbook" },
  };

  const res = await ingestDocument(doc, {
    embedFn: customMockEmbed,
    supabaseClient: mockClient,
    chunkSize: 80,
    chunkOverlap: 20,
  });

  assert("Ingest returns documentId", res.documentId === "handbook-101");
  assert("Ingest reports chunksCreated > 0", res.chunksCreated > 0);
  assert("Generated chunk IDs array", res.chunkIds.length === res.chunksCreated);
  assert("Embeddings generated for all chunks", embeddingCallCount === res.chunksCreated);

  const storedRows = mockClient.tables.knowledge_chunks;
  assert("Stored rows exist in mock Supabase", storedRows.length === res.chunksCreated);
  assert("Stored row has document_id", storedRows[0].document_id === "handbook-101");
  assert("Stored row embedding has 768 dimensions", storedRows[0].embedding.length === 768);

  // Test deletion
  await deleteDocument("handbook-101", { supabaseClient: mockClient });
  assert("Document chunks deleted from table", mockClient.tables.knowledge_chunks.length === 0);
}

// ═══════════════════════════════════════════════════════════════════
// 4. RETRIEVAL & TOP-K RANKING TESTS
// ═══════════════════════════════════════════════════════════════════
async function testRetrieval() {
  console.log("\n🧪 4. RETRIEVAL & TOP-K RANKING TESTS\n" + "═".repeat(55));

  const mockClient = new MockSupabaseClient();
  mockClient.mockRpcResult = [
    {
      id: "c1",
      document_id: "handbook",
      content: "All subscriptions have a 14-day refund policy.",
      metadata: { source: "policies.md" },
      similarity: 0.88,
    },
    {
      id: "c2",
      document_id: "faq",
      content: "Refunds are processed back to the original payment method.",
      metadata: { source: "faq.md" },
      similarity: 0.82,
    },
    {
      id: "c3",
      document_id: "general",
      content: "Atlas AI is built with Node.js and Gemini.",
      metadata: { source: "about.md" },
      similarity: 0.65,
    },
  ];

  const result = await retrieveKnowledge("How do I get a refund?", {
    supabaseClient: mockClient,
    embedFn: async (txt) => generateMockEmbedding(txt),
    topK: 2,
    threshold: 0.7,
  });

  assert("Calls match_knowledge_chunks RPC", mockClient.rpcCalls.length === 1);
  assert("Passes 768-dim query_embedding", mockClient.rpcCalls[0].params.query_embedding.length === 768);
  assert("Passes match_threshold = 0.7", mockClient.rpcCalls[0].params.match_threshold === 0.7);
  assert("Passes match_count = 2", mockClient.rpcCalls[0].params.match_count === 2);

  assert("Returns top chunks", result.chunks.length === 2);
  assert("Chunks are sorted by similarity descending", result.chunks[0].similarity >= result.chunks[1].similarity);
  assert("First chunk is highest match (0.88)", result.chunks[0].similarity === 0.88);
}

// ═══════════════════════════════════════════════════════════════════
// 5. RELEVANCE THRESHOLD FILTERING TESTS
// ═══════════════════════════════════════════════════════════════════
async function testRelevanceThreshold() {
  console.log("\n🧪 5. RELEVANCE THRESHOLD FILTERING\n" + "═".repeat(55));

  const mockClient = new MockSupabaseClient();
  mockClient.mockRpcResult = [
    { id: "c1", document_id: "doc1", content: "Highly relevant", similarity: 0.92 },
    { id: "c2", document_id: "doc2", content: "Moderately relevant", similarity: 0.68 },
    { id: "c3", document_id: "doc3", content: "Low relevance chunk", similarity: 0.45 },
  ];

  // Threshold 0.6 should filter out the 0.45 chunk
  const resThreshold06 = await retrieveKnowledge("query", {
    supabaseClient: mockClient,
    embedFn: async (txt) => generateMockEmbedding(txt),
    threshold: 0.6,
  });

  assert("Filters out chunks below threshold 0.6", resThreshold06.chunks.length === 2);
  assert("Does not include 0.45 similarity chunk", !resThreshold06.chunks.some((c) => c.similarity < 0.6));

  // High threshold 0.95 should filter out all except >= 0.95
  const resThreshold095 = await retrieveKnowledge("query", {
    supabaseClient: mockClient,
    embedFn: async (txt) => generateMockEmbedding(txt),
    threshold: 0.95,
  });

  assert("High threshold 0.95 leaves 0 chunks", resThreshold095.chunks.length === 0);
}

// ═══════════════════════════════════════════════════════════════════
// 6. EMPTY RESULTS & DEGRADATION TESTS
// ═══════════════════════════════════════════════════════════════════
async function testEmptyResults() {
  console.log("\n🧪 6. EMPTY RESULTS & DEGRADATION\n" + "═".repeat(55));

  const mockClient = new MockSupabaseClient();
  mockClient.mockRpcResult = []; // No matches found

  const emptyRes = await retrieveKnowledge("Unknown topic", {
    supabaseClient: mockClient,
    embedFn: async (txt) => generateMockEmbedding(txt),
  });

  assert("Empty matches returns chunks: []", Array.isArray(emptyRes.chunks) && emptyRes.chunks.length === 0);
  assert("totalFound is 0", emptyRes.totalFound === 0);
  assert("tokenEstimate is 0", emptyRes.tokenEstimate === 0);

  // Formatting helpers
  const emptyContext = formatKnowledgeContext([]);
  assert("formatKnowledgeContext([]) returns empty string", emptyContext === "");

  const emptyAugmented = formatAugmentedPrompt("Hello Atlas", []);
  assert("formatAugmentedPrompt with empty chunks returns original message", emptyAugmented === "Hello Atlas");

  // Empty query string
  const emptyQueryRes = await retrieveKnowledge("   ");
  assert("Whitespace query returns empty result without calling database", emptyQueryRes.chunks.length === 0);
}

// ═══════════════════════════════════════════════════════════════════
// 7. CONTEXT LIMITS PROTECTION TESTS
// ═══════════════════════════════════════════════════════════════════
async function testContextLimitsProtection() {
  console.log("\n🧪 7. CONTEXT LIMITS PROTECTION\n" + "═".repeat(55));

  const mockClient = new MockSupabaseClient();
  // 5 large chunks, each ~200 characters (~50 tokens)
  mockClient.mockRpcResult = [
    { id: "c1", document_id: "doc1", content: "A".repeat(200), similarity: 0.95 },
    { id: "c2", document_id: "doc1", content: "B".repeat(200), similarity: 0.90 },
    { id: "c3", document_id: "doc1", content: "C".repeat(200), similarity: 0.85 },
    { id: "c4", document_id: "doc1", content: "D".repeat(200), similarity: 0.80 },
    { id: "c5", document_id: "doc1", content: "E".repeat(200), similarity: 0.75 },
  ];

  // Set tight maxTokens budget = 80 tokens (can only hold 1-2 chunks)
  const res = await retrieveKnowledge("query", {
    supabaseClient: mockClient,
    embedFn: async (txt) => generateMockEmbedding(txt),
    maxTokens: 80,
    topK: 5,
    threshold: 0.5,
  });

  assert("Oversized chunks are capped by maxTokens", res.chunks.length < 5);
  assert("Accepted chunks fit within token limit", res.tokenEstimate <= 120);
  assert("Highest similarity chunk is prioritized", res.chunks[0].id === "c1");
}

// ═══════════════════════════════════════════════════════════════════
// 8. RAG AGENT INJECTION & FORMATTING TESTS
// ═══════════════════════════════════════════════════════════════════
function testContextFormattingAndInjection() {
  console.log("\n🧪 8. RAG AGENT INJECTION & FORMATTING\n" + "═".repeat(55));

  const chunks = [
    {
      documentId: "handbook.md",
      similarity: 0.89,
      content: "All subscriptions include a 14-day full refund guarantee.",
    },
    {
      documentId: "faq.md",
      similarity: 0.81,
      content: "Refunds take 5-7 business days to reflect in your account.",
    },
  ];

  const formatted = formatKnowledgeContext(chunks);
  assert("Formatted context includes header tag", formatted.includes("[Relevant Knowledge Base Information]"));
  assert("Formatted context includes document source", formatted.includes("handbook.md"));
  assert("Formatted context includes similarity percentage", formatted.includes("89.0%"));
  assert("Formatted context includes chunk content", formatted.includes("14-day full refund guarantee"));
  assert("Formatted context includes footer tag", formatted.includes("[End Knowledge Base Information]"));

  const prompt = formatAugmentedPrompt("What is the refund policy?", chunks);
  assert("Augmented prompt contains knowledge context", prompt.includes("[Relevant Knowledge Base Information]"));
  assert("Augmented prompt contains original user question", prompt.includes("User Question: What is the refund policy?"));
}

// ═══════════════════════════════════════════════════════════════════
// Main Runner
// ═══════════════════════════════════════════════════════════════════
async function main() {
  testChunking();
  testEmbeddingDimensions();
  await testIngestionPipeline();
  await testRetrieval();
  await testRelevanceThreshold();
  await testEmptyResults();
  await testContextLimitsProtection();
  testContextFormattingAndInjection();

  console.log("\n" + "═".repeat(55));
  console.log(`📊 RAG / Knowledge Base Tests: ${passed} passed, ${failed} failed`);
  console.log(`📡 Gemini API calls made: 0 (all mocked)\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
