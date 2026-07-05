-- =========================================================
-- Phase 1.1 · Client error capture
-- =========================================================
-- Backing table for `src/lib/error-capture.ts`. Every unhandled client
-- error the SPA sees can be batched-flushed here so admins can spot
-- regressions in production.
--
-- Design constraints:
--   - Never store PII. `message` and `stack_redacted` must be scrubbed
--     client-side before insert (email regex, JWT regex, base64 seeds).
--   - Never store ciphertext, IVs, or anything from `vault_accounts`.
--   - Users can INSERT their own rows (or anonymous rows) but never
--     SELECT anything. Only admins can SELECT.
--   - The table is append-only from the client — no UPDATE / DELETE
--     policies for authenticated users.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  stack_redacted TEXT,
  route TEXT,
  user_agent TEXT,
  build_sha TEXT,
  vault_crypto_version SMALLINT,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT client_errors_message_len CHECK (char_length(message) BETWEEN 1 AND 2000),
  CONSTRAINT client_errors_stack_len   CHECK (stack_redacted IS NULL OR char_length(stack_redacted) <= 8000),
  CONSTRAINT client_errors_route_len   CHECK (route IS NULL OR char_length(route) <= 500),
  CONSTRAINT client_errors_ua_len      CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
  CONSTRAINT client_errors_build_len   CHECK (build_sha IS NULL OR char_length(build_sha) <= 64)
);

CREATE INDEX IF NOT EXISTS client_errors_at_idx           ON public.client_errors (at DESC);
CREATE INDEX IF NOT EXISTS client_errors_user_id_at_idx   ON public.client_errors (user_id, at DESC);
CREATE INDEX IF NOT EXISTS client_errors_route_at_idx     ON public.client_errors (route, at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- INSERT: authenticated users insert rows for themselves; anonymous users
-- may insert anonymous rows (user_id null) so we can capture errors
-- from unauthenticated flows (`/auth`, `/auth/callback`).
CREATE POLICY "Users can insert own client errors"
  ON public.client_errors FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anon can insert anonymous client errors"
  ON public.client_errors FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- SELECT: admins only.
CREATE POLICY "Admins can read all client errors"
  ON public.client_errors FOR SELECT TO authenticated
  USING (public.is_admin());

-- No UPDATE / DELETE policies for authenticated — table is append-only
-- from the client's perspective. Service role bypasses RLS for cleanup.

GRANT SELECT, INSERT ON public.client_errors TO authenticated;
GRANT INSERT ON public.client_errors TO anon;
GRANT ALL ON public.client_errors TO service_role;

-- Housekeeping: keep 90 days by default. Service role can run this via a
-- Supabase scheduled function.
CREATE OR REPLACE FUNCTION public.purge_old_client_errors(retain_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM public.client_errors
   WHERE at < now() - make_interval(days => retain_days);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_client_errors(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_client_errors(INTEGER) TO service_role;
