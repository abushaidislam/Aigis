-- =========================================================
-- Phase 1.1 · Feature flags + announcements (P1)
-- =========================================================
-- Server-side toggles + banners. Neither table is user-owned; both are
-- **read** by every authenticated user but **written** only by admins
-- (via the admin dashboard planned in Phase 6).
--
-- Design notes:
--   * `audience_json` is a jsonb envelope like
--       { "all": true }
--       { "user_ids": ["uuid","uuid"] }
--       { "percentage": 10 }                 -- Phase 6 gradual rollouts
--       { "roles": ["admin"] }
--     The client is the one that evaluates this against its own identity,
--     because the alternative — a server RPC per flag — would be a
--     hot-path cost with zero benefit for a zero-knowledge app.
--   * Announcements have an `expires_at` so we can queue release notes
--     without needing to remember to unpublish them.
--   * Both tables have an INSERT/UPDATE/DELETE policy of **service_role
--     only** — RLS enforces that even a compromised admin session can't
--     mutate them via the anon key.

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  audience_json JSONB NOT NULL DEFAULT '{"all": true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feature_flags_key_len CHECK (char_length(key) BETWEEN 1 AND 80),
  CONSTRAINT feature_flags_desc_len CHECK (description IS NULL OR char_length(description) <= 400)
);

CREATE TRIGGER feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Every authenticated user may read every flag; the client picks which
-- to honor via `audience_json`. Anonymous users can read nothing.
CREATE POLICY "Authenticated users can read feature flags"
  ON public.feature_flags FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info'
    CHECK (kind IN ('info', 'warning', 'incident')),
  dismissable BOOLEAN NOT NULL DEFAULT true,
  audience_json JSONB NOT NULL DEFAULT '{"all": true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT announcements_title_len CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT announcements_body_len  CHECK (char_length(body)  BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS announcements_expires_idx
  ON public.announcements (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Any authenticated user reads non-expired announcements; the client
-- filters by `audience_json` locally.
CREATE POLICY "Authenticated users can read live announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (expires_at IS NULL OR expires_at > now());

GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
