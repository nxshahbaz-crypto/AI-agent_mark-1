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
