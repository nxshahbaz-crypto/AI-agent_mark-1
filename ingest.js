#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// Phase 7 — Knowledge Ingestion CLI Tool
//
// Usage:
//   node ingest.js <filePath> [documentId]
//   node ingest.js --sample
// ═══════════════════════════════════════════════════════════════════

import "dotenv/config";
import fs from "fs";
import path from "path";
import { ingestDocument } from "./rag/ingestion.js";

const SAMPLE_DOCUMENT = {
  id: "atlas-ai-handbook",
  metadata: { title: "Atlas AI System Handbook", category: "documentation" },
  content: `Atlas AI System Handbook & Policies

1. Purpose and Overview
Atlas AI is a modular, multi-provider AI assistant designed for high-reliability agentic tasks, fast failover, and autonomous tool calling. It supports sequential multi-step planning, persistent conversation memory via Supabase, and dynamic knowledge base retrieval using pgvector.

2. Refund and Billing Policy
All subscriptions to Atlas AI premium services are subject to our 14-day refund policy. If a user is not completely satisfied with the agent's performance within the first 14 days of activation, a full refund can be requested via support@atlas-ai.example. Refunds are processed back to the original payment method within 5 to 7 business days.

3. Architecture and Providers
Atlas utilizes Google Gemini (gemini-3.6-flash) as its primary LLM provider. In the event of rate limits (HTTP 429) or transient 5xx server errors, Atlas automatically fails over to Groq (llama-3.3-70b-versatile). The Tool Registry and Multi-Step Agent loop allow Atlas to execute independent tools in parallel or dependent tools in sequence, bounded by a maximum of 5 steps to ensure safety.

4. Data Privacy and Security
Atlas never leaks API keys or internal secrets. Sensitive tokens in error messages are sanitized with [REDACTED]. Conversation history is saved to Supabase with Row Level Security (RLS) enabled.`,
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--sample") {
    console.log("📚 Ingesting sample knowledge base document: 'atlas-ai-handbook'...\n");
    try {
      const res = await ingestDocument(SAMPLE_DOCUMENT);
      console.log(`✅ Successfully ingested '${res.documentId}'!`);
      console.log(`   Created ${res.chunksCreated} knowledge chunks in Supabase (knowledge_chunks).\n`);
      process.exit(0);
    } catch (err) {
      console.error(`❌ Ingestion failed: ${err.message}`);
      process.exit(1);
    }
  }

  const filePath = args[0];
  const docId = args[1] || path.basename(filePath, path.extname(filePath));

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.log("\nUsage:\n  node ingest.js <filePath> [documentId]\n  node ingest.js --sample\n");
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    console.log(`📖 Ingesting '${filePath}' as document ID '${docId}' (${content.length} characters)...`);

    const res = await ingestDocument({
      id: docId,
      content,
      metadata: { source: filePath, ingestedAt: new Date().toISOString() },
    });

    console.log(`✅ Successfully ingested '${res.documentId}'!`);
    console.log(`   Created ${res.chunksCreated} knowledge chunks in Supabase.\n`);
  } catch (err) {
    console.error(`❌ Ingestion failed: ${err.message}`);
    process.exit(1);
  }
}

main();
