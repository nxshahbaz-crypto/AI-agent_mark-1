-- Minimal health check table schema for Supabase
CREATE TABLE IF NOT EXISTS public._health_check (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable Row Level Security (RLS) and allow public read access for connection checks
ALTER TABLE public._health_check ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to health check"
  ON public._health_check
  FOR SELECT
  TO anon, authenticated
  USING (true);
