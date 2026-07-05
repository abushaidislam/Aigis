-- =========================================================
-- Phase 1.1 · Admin audit log
-- =========================================================
-- Append-only audit trail for every action taken by an Aegis admin
-- (Phase 6 dashboard, support tools). This table is *not* writable from
-- the client — only the service role can INSERT, so every write goes
-- through a server-side Supabase function that first checks `is_admin()`.
--
-- The point is forensic: if something is ever amiss, we can answer
-- "which admin looked at what, and when?"

CREATE TABLE IF NOT EXISTS public.admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_kind TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip INET,
  user_agent TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT admin_audit_action_len   CHECK (char_length(action) BETWEEN 1 AND 100),
  CONSTRAINT admin_audit_target_kind_len CHECK (target_kind IS NULL OR char_length(target_kind) <= 60),
  CONSTRAINT admin_audit_target_id_len CHECK (target_id   IS NULL OR char_length(target_id) <= 100),
  CONSTRAINT admin_audit_ua_len       CHECK (user_agent IS NULL OR char_length(user_agent) <= 500)
);

CREATE INDEX IF NOT EXISTS admin_audit_at_idx              ON public.admin_audit (at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_actor_at_idx        ON public.admin_audit (actor_user_id, at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target_at_idx       ON public.admin_audit (target_user_id, at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_action_at_idx       ON public.admin_audit (action, at DESC);

ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

-- SELECT: admins only.
CREATE POLICY "Admins can read admin audit"
  ON public.admin_audit FOR SELECT TO authenticated
  USING (public.is_admin());

-- No INSERT / UPDATE / DELETE policies for authenticated — the only way
-- to write is via service_role (in a server-side edge function that
-- validates the caller is an admin *before* inserting).

GRANT SELECT ON public.admin_audit TO authenticated;
GRANT ALL ON public.admin_audit TO service_role;

-- Convenience: prevent even service_role from mutating history in a way
-- that leaves no fingerprint. We forbid UPDATE and DELETE at the table
-- level by not granting them to any role except through explicit ALTER.
REVOKE UPDATE, DELETE ON public.admin_audit FROM service_role;

-- Note: service_role can still be granted UPDATE/DELETE later via a
-- one-off migration if we ever need to purge stale rows (e.g. GDPR
-- erasure of an actor). Doing so intentionally requires a migration,
-- which is itself part of the audit trail.
