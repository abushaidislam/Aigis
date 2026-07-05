-- =========================================================
-- Phase 1.1 · Tags + is_favorite on vault_accounts
-- =========================================================
-- Move two pieces of state off the client and into the row so they sync
-- across devices:
--
--   `tags`         — user-defined labels for filtering (Phase 3.5).
--                    Empty array by default; GIN index for fast membership.
--   `is_favorite`  — pin/unpin state; currently kept in localStorage
--                    (`src/lib/favorites.ts`) which means a new browser
--                    starts with everything un-pinned. This migration
--                    provides the server side; the client migrator is a
--                    Phase 3.1 follow-up.

ALTER TABLE public.vault_accounts
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.vault_accounts
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

-- Defensive caps (mirrors the size discipline in
-- `20260706100300_vault_accounts_size_checks.sql`).
ALTER TABLE public.vault_accounts
  ADD CONSTRAINT vault_accounts_tags_count
    CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 20);

-- Individual tag length cap. Postgres has no per-element CHECK syntax,
-- so we enforce it via a trigger.
CREATE OR REPLACE FUNCTION public.check_vault_accounts_tag_lengths()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  t TEXT;
BEGIN
  IF NEW.tags IS NULL THEN
    RETURN NEW;
  END IF;
  FOREACH t IN ARRAY NEW.tags LOOP
    IF t IS NULL OR char_length(t) = 0 OR char_length(t) > 40 THEN
      RAISE EXCEPTION 'each vault_accounts.tags element must be 1..40 chars'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vault_accounts_tag_lengths_trigger ON public.vault_accounts;
CREATE TRIGGER vault_accounts_tag_lengths_trigger
BEFORE INSERT OR UPDATE OF tags ON public.vault_accounts
FOR EACH ROW EXECUTE FUNCTION public.check_vault_accounts_tag_lengths();

-- Indexes.
CREATE INDEX IF NOT EXISTS vault_accounts_tags_gin_idx
  ON public.vault_accounts USING GIN (tags);

-- Partial index — favorites listing only cares about the pinned rows.
CREATE INDEX IF NOT EXISTS vault_accounts_favorite_partial_idx
  ON public.vault_accounts (user_id, sort_order, created_at)
  WHERE is_favorite = true;
