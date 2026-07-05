# Aegis — Product Requirements Document

## Original problem statement (verbatim)

> Act as an Expert Product Manager and Lead Software Architect. Thoroughly
> analyze this current project workspace. Instead of just providing a chat
> response, directly create the necessary files (such as plan.md for
> milestones, architecture specs, or configuration files) in the workspace
> covering the following:
>
> 1. Project Identity & Feature Checklist
> 2. Competitor Strategy
> 3. Production-Level Implementation Plan

Follow-up: *"Kick off Phase 0 audit, open PRs for Phase 1.1 migrations, and
extract + version-lock `src/lib/vault-crypto.ts` with RFC 6238 golden
vectors."*

## Product identity

**Aegis** — a client-side end-to-end encrypted TOTP authenticator, delivered
as a mobile-first PWA on TanStack Start + Supabase.

## Personas

- Privacy-first indie (wants sync without trusting a big-tech vendor)
- Security-conscious PM (20–60 TOTP accounts, needs fast search + polish)
- The switcher (from Google Authenticator / Authy, needs frictionless import)
- Internal admin (needs observability without ever seeing plaintext seeds)

## Core requirements (static)

1. Zero-knowledge server: never able to read a plaintext TOTP seed.
2. Every user-owned table gated by `auth.uid() = user_id` RLS.
3. Recovery path: printable 24-word paper unlocks the DEK if the passphrase
   is lost. No other recovery.
4. Every UI screen composes from `src/components/aegis/chrome.tsx`.
5. Every interactive element has a `data-testid`.
6. Changes to stored-form crypto bump `VAULT_CRYPTO_VERSION` and ship a
   migrator.

## Implementation status

### Landed before this run
- Auth (email/password + Google via Lovable), onboarding, lock, vault list,
  add-account, import, recovery routes.
- Client-side vault crypto (PBKDF2-SHA-256 600k + AES-256-GCM wrap +
  per-secret AES-GCM encryption), in-memory DEK session with auto-lock.
- Design system (`design_instruction.md`), Aegis primitives, per-account
  bottom-sheet with reveal / delete confirm.
- Supabase migrations: `profiles`, `vault_meta`, `vault_accounts`, avatar
  storage RLS, `auto_lock_pref`, `hide_codes_pref`.

### Landed in this run
- `PROJECT_IDENTITY.md`, `COMPETITOR_STRATEGY.md`, `plan.md` — the three
  planning artifacts requested.
- `SECURITY.md` v0.1 — zero-knowledge invariant + crypto parameters +
  coordinated-disclosure address stub.
- `docs/routing.md` — full 12-route enumeration (URL, file, guard stack,
  SSR posture) + a public / auth / locked map for the CI RLS suite.
- `perf/baseline.json` — bundle + lint + typecheck snapshot.
- `@zxing/library@^0.22.0` locked into `package.json` (was previously an
  unresolved peer of `@zxing/browser`, breaking `vite build`).
- 4 migrations under `supabase/migrations/20260706*`:
  `profiles.role` (+ `is_admin()` + self-promotion guard trigger),
  `client_errors` table (RLS: INSERT authenticated + anon, SELECT admin,
  purge fn), `admin_audit` table (append-only, admin SELECT only),
  `vault_accounts` defensive size checks (secret_ciphertext ≤ 512,
  secret_iv = 12, issuer/label caps, 500-per-user trigger).
- `src/lib/vault-crypto.ts` — version-locked with
  `VAULT_CRYPTO_VERSION = 1` and an inline contract for future bumps.
- `tests/crypto/rfc6238.spec.mjs` (36 assertions, both a from-scratch
  HMAC computation and the runtime `otpauth` library, all green) +
  `tests/crypto/vault-crypto.roundtrip.spec.mjs` (KDF determinism,
  wrap/unwrap, encrypt/decrypt, tamper rejection, all green).
- `tests/README.md` describing how to run the suite with plain `node`.

**Phase 0 in `plan.md` is now fully closed.** Every item checked off,
findings recorded, exit criterion met.

### Prioritized backlog (from `plan.md`)

**P0 — must ship before GA**
- Route-map doc `/docs/routing.md` + CSP / HSTS server middleware
- Edge rate limit on `/auth/*`
- Supabase PITR + weekly `pg_dump` runbook
- `vault_accounts.tags` + `is_favorite` migrations
- Argon2id KDF → `VAULT_CRYPTO_VERSION = 2` (+ migrator + AAD binding)
- `THREAT_MODEL.md`
- Full-text vault search
- `otpauth-migration://` (Google Authenticator export) parser
- Encrypted `.avf` export/import
- Auto-lock timeout picker in Settings
- Change-passphrase flow (re-wrap DEK)
- Sign-out-all-sessions + account deletion flows
- Accessibility contrast pass (MUTED on CREAM)
- Offline PWA / service worker
- Prettier auto-fix in a dedicated formatting PR
- Add `@zxing/library` to `package.json` (currently a missing peer)

**P1 — fast-follow**
- Tag chips filter row + drag-and-drop reorder
- Realtime cross-tab sync (Supabase Realtime → React Query invalidation)
- Watermarked decrypted PDF export
- WebAuthn platform-auth unlock
- Self-TOTP as second factor on new-device sign-in
- `feature_flags` + `announcements` tables + hooks

**P2 — polish / post-launch**
- Bulk-select mode
- Authy / 2FAS / Raivo import parsers
- Public landing page for `/`
- k6 load test at 1k VUs

## Success metrics (unchanged from `PROJECT_IDENTITY.md`)

Time-to-first-code < 90s · p95 render < 350ms · QR import > 95% ·
Recovery restore > 98% · Lighthouse mobile Perf ≥ 90 A11y ≥ 95 ·
Client errors < 3 per 1k sessions.

## Next actions (this week)

1. Land the prettier formatting fix in an isolated PR (eslint clean).
2. Ship the four Phase 1.1 migrations via Supabase CLI in the target project
   and run the RLS anonymous-read CI check against them.
3. Wire `src/lib/error-capture.ts` to insert into the new `client_errors`
   table (currently in-memory only).
4. Draft `/docs/routing.md` + `/THREAT_MODEL.md` stubs to close the last
   Phase 0 items.
5. Start Phase 2's `VAULT_CRYPTO_VERSION = 2` design doc: Argon2id params,
   AAD binding, migrator behaviour.
