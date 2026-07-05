# Aegis — Security Overview

> **Status:** Stub v0.1 · published as part of Phase 0 of `plan.md`.
> A full `THREAT_MODEL.md` follows before v1.0 GA.

## 1. Zero-knowledge invariant

Aegis is an **end-to-end encrypted** TOTP authenticator. The Aegis team and
its infrastructure providers can never read your TOTP seeds.

- Your passphrase never leaves your browser tab.
- Your Data Encryption Key (DEK) is derived from your passphrase on your
  device using PBKDF2-SHA256 (600 000 iterations, OWASP baseline; Argon2id
  planned for `VAULT_CRYPTO_VERSION = 2`).
- Every TOTP secret is encrypted with your DEK using AES-GCM (256-bit key,
  fresh 96-bit random IV per encryption) **before** it is sent to Supabase.
- The DEK itself is stored server-side only in an AES-GCM-wrapped form,
  wrapped by a Key Encryption Key (KEK) derived from your passphrase.

If you forget your passphrase and don't have your **recovery key**, your
codes are unrecoverable — by design. That is what "zero-knowledge" means.

## 2. Cryptographic parameters (`VAULT_CRYPTO_VERSION = 1`)

| Primitive           | Value                                         |
| ------------------- | --------------------------------------------- |
| KDF                 | PBKDF2-HMAC-SHA-256, 600 000 iterations       |
| KDF salt            | 16 random bytes per user (from `crypto.getRandomValues`) |
| DEK / KEK           | AES-256-GCM                                   |
| IV                  | 96 random bits per encryption / wrap          |
| Passphrase encoding | UTF-8 after `String.prototype.normalize("NFKC")` |
| Storage             | Supabase Postgres `bytea` (via `\x…` hex literals) |

Full spec: [`src/lib/vault-crypto.ts`](./src/lib/vault-crypto.ts).
Golden vectors: [`tests/crypto/`](./tests/crypto).

## 3. What Aegis stores server-side

Per user:
- `profiles.*` — display name, avatar URL, onboarding timestamp,
  UI preferences (auto-lock, hide-codes). **No secrets.**
- `vault_meta.kdf_salt` — 16 random bytes. Public knowledge is fine.
- `vault_meta.recovery_wrapped_key` + `recovery_wrapped_key_iv` —
  DEK wrapped under a *recovery key*, so a user can restore access
  from a printed 24-word recovery paper.
- `vault_meta.passphrase_hint` — optional short string, chosen by the
  user, never exposed to any admin surface.
- `vault_accounts.*` — issuer, label, algorithm, digits, period (metadata)
  and `secret_ciphertext` + `secret_iv` (opaque bytes).

## 4. What Aegis explicitly does **not** store

- Plaintext TOTP seeds.
- Plaintext passphrases.
- The DEK in a form recoverable without the passphrase or the recovery key.
- Analytics or tracking cookies.
- The user's phone number.

## 5. Authorization model

Row Level Security (RLS) is the **only** server-side authorization surface.
Every user-owned table is filtered by `auth.uid() = user_id`; the
`service_role` key is never used from a client.

Admin surfaces (Phase 6) get `SELECT` on aggregated views only; the RLS
policy on `vault_accounts` grants **zero** admin access, even to
ciphertext.

## 6. Session model

- Supabase session tokens live in a first-party HTTP-only cookie
  (default TanStack Start integration via `@/integrations/supabase/auth-attacher.ts`).
- The DEK lives in **module-scope memory** (`src/lib/vault-session.ts`) —
  never `localStorage`, never `sessionStorage`, never IndexedDB.
- Hard refresh / tab close = DEK lost = vault re-locks.
- Configurable auto-lock re-locks the vault after inactivity
  (`AUTO_LOCK_OPTIONS` in `vault-session.ts`).

## 7. Coordinated disclosure

If you believe you have found a security issue in Aegis:

1. Email **security@aegis.app** (PGP key to be published before GA).
2. Please **do not** open a public GitHub issue.
3. We aim to acknowledge within 48 hours and to ship a fix or public
   advisory within 30 days.

We commit to a public post-mortem for any incident that materially
weakens the zero-knowledge invariant.

## 8. Change log

| Version | Date       | Change                                       |
| ------- | ---------- | -------------------------------------------- |
| v0.1    | 2026-01    | Initial stub. Documents current v1 crypto.   |

---

*See also: [`plan.md`](./plan.md), [`PROJECT_IDENTITY.md`](./PROJECT_IDENTITY.md),
[`COMPETITOR_STRATEGY.md`](./COMPETITOR_STRATEGY.md).*
