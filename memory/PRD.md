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
- **Planning docs (session 1):** `PROJECT_IDENTITY.md`, `COMPETITOR_STRATEGY.md`,
  `plan.md`.
- **Phase 0 (session 2):** `SECURITY.md`, `docs/routing.md`,
  `perf/baseline.json`, `@zxing/library` locked in `package.json`, initial 4
  migrations, `VAULT_CRYPTO_VERSION`, RFC 6238 golden vectors, roundtrip tests.
- **Phase 1 (this session):**
  - 3 more migrations: `20260706100400_vault_accounts_tags_favorite.sql`
    (tags array + GIN + `is_favorite` + partial index),
    `20260706100500_feature_flags_announcements.sql` (both tables + RLS +
    audience_json envelope), `20260706100600_vault_accounts_insert_rate_limit.sql`
    (200 inserts / 60s / user BEFORE INSERT trigger).
  - `src/lib/security-headers.server.ts` — full CSP + HSTS + Permissions-Policy
    + COOP/CORP header set. Wired into `src/server.ts::fetch` so every SSR /
    edge response carries the hardening headers.
  - `src/lib/server-log.server.ts` — structured JSON logger with automatic
    redaction of JWTs, `sb_*` keys, emails, base32 seeds, `\x` bytea literals.
    Wired into `src/server.ts` for h3 swallowed errors + 5xx + uncaught edge.
  - `src/lib/client-error-report.ts` — client-side reporter that batches +
    redacts + inserts into `client_errors`. Auto-hooks `window.onerror` /
    `unhandledrejection`, and is called from the `__root.tsx` React error
    boundary alongside `reportLovableError`. Silent-fails; capped 20 inserts
    per session-minute.
  - `tests/rls/anonymous-cannot-read.spec.mjs` — signed-out `fetch` against
    PostgREST for every user-owned + admin-only + auth-only-readable table.
    **Passes 7/7 against the production Supabase URL.**
  - `docs/dr.md` — full disaster-recovery runbook: PITR + weekly pg_dump,
    RTO/RPO targets, 5 incident scenarios, on-call checklist.
- **Regression check:** `tsc --noEmit` clean, `vite build` clean (Cloudflare
  Workers server + client bundles), RFC 6238 golden vectors + AES-GCM
  roundtrip both green, RLS smoke test 7/7.

**Phase 0 + Phase 1 in `plan.md` are now fully closed.** Every item
checked off, findings recorded, exit criteria met.

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
