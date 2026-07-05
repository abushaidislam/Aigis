-- =========================================================
-- Phase 1.1 · Admin role on profiles
-- =========================================================
-- Adds a `role` column to `public.profiles` so a small number of Aegis
-- operators can access aggregated admin views (Phase 6). RLS on user-owned
-- tables still filters strictly by `auth.uid()` — the admin role never gets
-- SELECT on `vault_accounts` or `vault_meta`.
--
-- Values:
--   'user'  — default; every existing profile is backfilled to this.
--   'admin' — must be set manually via a service-role query. There is no
--             self-service path to admin. There is no UI to change it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin'));

CREATE INDEX IF NOT EXISTS profiles_role_admin_idx
  ON public.profiles (id)
  WHERE role = 'admin';

-- Helper: is the current caller an admin? Used from admin-only policies in
-- later migrations. SECURITY DEFINER because callers may not have SELECT on
-- `profiles` from every context.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Guard against non-admin self-promotion. Existing user UPDATE policy on
-- profiles lets a user update their own row; without this trigger they
-- could set `role = 'admin'` on themselves. Only service_role bypasses
-- triggers via SECURITY DEFINER paths.
CREATE OR REPLACE FUNCTION public.prevent_role_self_promotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Any change to `role` must come from service_role. Any other caller
    -- (including an authenticated user updating their own profile) is
    -- silently forced back to the previous value.
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_role_self_promotion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_role_self_promotion ON public.profiles;
CREATE TRIGGER profiles_prevent_role_self_promotion
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_promotion();
