-- =========================================================
-- Phase 1.1 · Defensive size caps on vault_accounts
-- =========================================================
-- The zero-knowledge invariant means the server can never inspect the
-- contents of `secret_ciphertext` — but it CAN and MUST bound its size,
-- to prevent a malicious/compromised client from bloating a user's row
-- and to keep our storage costs predictable.
--
-- Realistic sizes for `VAULT_CRYPTO_VERSION = 1`:
--   secret_ciphertext ≈ base32 secret (≤ ~256 bytes plaintext) + AES-GCM
--                       auth tag (16 bytes) = well under 512 bytes.
--   secret_iv         = exactly 12 bytes (AES-GCM 96-bit IV).
--
-- We also cap `issuer` and `label` (which are metadata, not encrypted) to
-- keep the vault UI predictable and to prevent XSS-vector-length games.

ALTER TABLE public.vault_accounts
  ADD CONSTRAINT vault_accounts_secret_ciphertext_size
    CHECK (octet_length(secret_ciphertext) BETWEEN 16 AND 512);

ALTER TABLE public.vault_accounts
  ADD CONSTRAINT vault_accounts_secret_iv_size
    CHECK (octet_length(secret_iv) = 12);

ALTER TABLE public.vault_accounts
  ADD CONSTRAINT vault_accounts_issuer_len
    CHECK (char_length(issuer) <= 120);

ALTER TABLE public.vault_accounts
  ADD CONSTRAINT vault_accounts_label_len
    CHECK (char_length(label) <= 120);

ALTER TABLE public.vault_accounts
  ADD CONSTRAINT vault_accounts_icon_slug_len
    CHECK (icon_slug IS NULL OR char_length(icon_slug) <= 80);

-- Per-user cap. 500 is generous — the highest-power-user we've ever
-- surveyed had ~140 TOTP accounts. Beyond 500, something is wrong.
CREATE OR REPLACE FUNCTION public.enforce_vault_accounts_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT count(*) INTO n
    FROM public.vault_accounts
   WHERE user_id = NEW.user_id;
  IF n >= 500 THEN
    RAISE EXCEPTION 'vault_accounts limit reached (500 per user)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_vault_accounts_cap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vault_accounts_cap_trigger ON public.vault_accounts;
CREATE TRIGGER vault_accounts_cap_trigger
BEFORE INSERT ON public.vault_accounts
FOR EACH ROW EXECUTE FUNCTION public.enforce_vault_accounts_cap();
