-- =========================================================
-- Phase 1.2 · Per-user insert rate limit on vault_accounts
-- =========================================================
-- Cap the burst rate at which a single user can insert vault accounts.
-- Realistic worst case for a legitimate user is a bulk import of ~150
-- rows over a few seconds; we allow 200 in any rolling 60-second window
-- and slam the door on anything higher.
--
-- Combined with the 500-per-user cap in
-- `20260706100300_vault_accounts_size_checks.sql`, this bounds both the
-- *rate* and the *total* damage a compromised session can do.

CREATE OR REPLACE FUNCTION public.enforce_vault_accounts_insert_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent INTEGER;
BEGIN
  SELECT count(*) INTO recent
    FROM public.vault_accounts
   WHERE user_id = NEW.user_id
     AND created_at > now() - INTERVAL '60 seconds';

  IF recent >= 200 THEN
    RAISE EXCEPTION
      'vault_accounts insert rate limit exceeded (200 / 60s per user)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_vault_accounts_insert_rate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vault_accounts_insert_rate_trigger ON public.vault_accounts;
CREATE TRIGGER vault_accounts_insert_rate_trigger
BEFORE INSERT ON public.vault_accounts
FOR EACH ROW EXECUTE FUNCTION public.enforce_vault_accounts_insert_rate();
