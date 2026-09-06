-- ═══════════════════════════════════════════════════════════════════
-- Atlas AI — Database Schema
-- Phase 4A: Health check table
-- Phase 4B: Persistent conversation memory (conversations + messages)
-- ═══════════════════════════════════════════════════════════════════

-- ─── Health Check (Phase 4A) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._health_check (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public._health_check ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to health check" ON public._health_check;
DROP POLICY IF EXISTS "Allow public read access to health_check" ON public._health_check;
CREATE POLICY "Allow public read access to health check"
  ON public._health_check
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── Conversations (Phase 4B) ────────────────────────────────────
-- Stores one row per conversation session.
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text DEFAULT 'Untitled Conversation' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Development-only: allow full CRUD via anon key (no auth yet)
DROP POLICY IF EXISTS "Allow full access to conversations (dev)" ON public.conversations;
CREATE POLICY "Allow full access to conversations (dev)"
  ON public.conversations
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ─── Messages (Phase 4B) ─────────────────────────────────────────
-- Stores individual messages linked to a conversation.
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'model')),
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Development-only: allow full CRUD via anon key (no auth yet)
DROP POLICY IF EXISTS "Allow full access to messages (dev)" ON public.messages;
CREATE POLICY "Allow full access to messages (dev)"
  ON public.messages
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ─── Indexes ─────────────────────────────────────────────────────
-- Speeds up "get recent messages for a conversation" queries.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at);

-- ═══════════════════════════════════════════════════════════════════
-- Phase 7 — RAG / Knowledge Base (pgvector)
-- ═══════════════════════════════════════════════════════════════════

-- ─── Enable pgvector Extension ────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Knowledge Chunks Table ───────────────────────────────────────
-- Stores text chunks and their 768-dimensional embeddings.
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(768),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Development-only: allow full CRUD via anon key (no auth yet)
DROP POLICY IF EXISTS "Allow full access to knowledge_chunks (dev)" ON public.knowledge_chunks;
CREATE POLICY "Allow full access to knowledge_chunks (dev)"
  ON public.knowledge_chunks
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ─── Vector Index ─────────────────────────────────────────────────
-- HNSW index for fast cosine distance similarity queries.
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Document index for fast document-level lookups and deletes.
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id
  ON public.knowledge_chunks (document_id);

-- ─── match_knowledge_chunks RPC Function ─────────────────────────
-- Performs cosine similarity vector search and returns top matches.
CREATE OR REPLACE FUNCTION match_knowledge_chunks (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  document_id text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    knowledge_chunks.id,
    knowledge_chunks.document_id,
    knowledge_chunks.content,
    knowledge_chunks.metadata,
    1 - (knowledge_chunks.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks
  WHERE 1 - (knowledge_chunks.embedding <=> query_embedding) >= match_threshold
  ORDER BY knowledge_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

