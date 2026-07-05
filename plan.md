# Aegis — Production Implementation Plan

> The roadmap from *foundational build* → *secure, highly scalable,
> production-grade* authenticator. Milestones are ordered by dependency,
> not by preference. Each task is small enough to land in a single PR.
>
> **Legend:** `[P0]` blocker for GA · `[P1]` fast-follow · `[P2]` polish /
> post-launch · `[✔]` already implemented.

---

## Phase 0 — Baseline audit (Week 0, 2 days)

Before we write a line of production code, freeze the current state.

- [ ] **P0** Run `tsc --noEmit`, `eslint .`, `vite build` on `main`; fix any
      warnings that are latent bugs (unused React hook deps, missing
      `data-testid`s on interactive elements).
- [ ] **P0** Snapshot bundle size (`vite build` → record `dist/`) as the
      regression baseline. Store in `/perf/baseline.json`.
- [ ] **P0** Enumerate every route + its auth guard in
      `/docs/routing.md` (`/`, `/auth`, `/auth/callback`, `/auth/reset-password`,
      `/onboarding`, `/lock`, `/vault`, `/vault/new`, `/vault/import`,
      `/vault/recovery`, `/security`, `/profile`).
- [ ] **P0** Write `/SECURITY.md` v0 — even a stub — declaring the
      zero-knowledge invariant.

**Exit criterion:** clean CI on `main`, one-page architecture doc, published
threat-model stub.

---

## Phase 1 — Backend architecture hardening (Weeks 1–2)

Goal: the Supabase project becomes provably safe under load and under
adversarial clients.

### 1.1 Schema evolution

- [✔] `profiles`, `vault_meta`, `vault_accounts` tables with RLS.
- [ ] **P0** New migration: `profiles.role text not null default 'user' check
      (role in ('user','admin'))`. Backfill = default.
- [ ] **P0** New migration: `vault_accounts.tags text[] not null default '{}'`
      + GIN index. (Powers 3.5 Categories/Tags.)
- [ ] **P0** New migration: `vault_accounts.is_favorite boolean not null default
      false` — pull favorites off client-only storage so they sync.
- [ ] **P0** New migration: `client_errors` table (`id, user_id nullable,
      message, stack_redacted, route, user_agent, at`) with RLS `INSERT` only
      by authenticated users, `SELECT` only by admins.
- [ ] **P0** New migration: `admin_audit` table (append-only, `INSERT` only via
      service role, `SELECT` restricted to admins).
- [ ] **P1** New migration: `feature_flags` (`key, enabled, audience_json,
      updated_at`) + `announcements` (`id, title, body, kind, dismissable,
      audience_json, created_at, expires_at`).
- [ ] **P0** Add `CHECK (length(secret_ciphertext) <= 512)` and
      `CHECK (length(secret_iv) = 12)` on `vault_accounts` — defensive size caps
      to prevent bloat / abuse.

### 1.2 RLS policies

- [✔] `auth.uid() = user_id` on every user table.
- [ ] **P0** Add negative-path CI test: `tests/rls/anonymous-cannot-read.spec.ts`
      hits every table with an unauthenticated Supabase client and asserts
      empty / 401.
- [ ] **P0** Add admin read policy on `client_errors` and `admin_audit`:
      `USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role = 'admin'))`. No admin ever gets `SELECT` on `vault_accounts`.
- [ ] **P1** `vault_accounts` per-user insert rate limit via a Postgres function
      `check_rate_limit(uid uuid)` called from a `BEFORE INSERT` trigger. Cap
      at, e.g., 60 inserts / minute / user.

### 1.3 Edge / server code

- [✔] TanStack Start SSR entry (`src/server.ts`, `src/start.ts`) with h3
      catastrophic-response normalization.
- [ ] **P0** Server middleware: strict `Content-Security-Policy` header
      (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
      connect-src 'self' https://*.supabase.co https://*.lovable.dev;
      img-src 'self' data: https:; object-src 'none'; frame-ancestors 'none';
      base-uri 'self'`).
- [ ] **P0** Server middleware: `Strict-Transport-Security`,
      `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
      `Permissions-Policy: camera=(self), clipboard-read=(self), clipboard-write=(self)`.
- [ ] **P0** Rate limit `POST /auth/*` at the edge — token-bucket keyed by IP
      + email. 10 attempts / 10 minutes hard cap.
- [ ] **P1** Structured logging via `console.error` → parsed by Supabase log
      drain. No PII, no ciphertext, ever.

### 1.4 Backups & disaster recovery

- [ ] **P0** Enable Supabase Point-in-Time-Recovery (PITR) on the production
      project. Document RTO/RPO in `/docs/dr.md` (target: RPO ≤ 5m,
      RTO ≤ 60m).
- [ ] **P0** Weekly automated `pg_dump` to encrypted S3 bucket. Restore drill
      quarterly. **Note:** even from a full DB dump, seeds are still opaque
      ciphertext — that's the point.

**Exit criterion:** `SECURITY.md` promises are enforced in migrations + CI.

---

## Phase 2 — Crypto module hardening (Weeks 2–3)

The single most important surface. **Nothing below ships until this is
finalized, reviewed, and version-locked.**

- [ ] **P0** Extract `src/lib/vault-crypto.ts` with the exact API:
      ```ts
      export async function deriveMasterKey(
        passphrase: string,
        salt: Uint8Array,
      ): Promise<CryptoKey>;
      export async function encryptSecret(
        key: CryptoKey,
        plaintext: Uint8Array,
        aad: Uint8Array,
      ): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }>;
      export async function decryptSecret(
        key: CryptoKey,
        ciphertext: Uint8Array,
        iv: Uint8Array,
        aad: Uint8Array,
      ): Promise<Uint8Array>;
      export async function wrapKey(
        master: CryptoKey,
        recoveryKey: CryptoKey,
      ): Promise<{ wrapped: Uint8Array; iv: Uint8Array }>;
      ```
- [ ] **P0** Argon2id KDF via `hash-wasm` (or vendored WASM), params `m=64MiB,
      t=3, p=1`, `hashLen=32`. Salt = 16 random bytes from `crypto.getRandomValues`.
- [ ] **P0** AES-GCM with 96-bit random IVs. **AAD = `user_id || account_id`
      as UTF-8 bytes** to bind ciphertext to owner + row.
- [ ] **P0** `CryptoKey` is created with `extractable: false` for the master;
      only the recovery-wrapped copy is extractable at wrap time and re-imported
      as non-extractable on restore.
- [ ] **P0** Zeroize passphrase buffer after key derivation
      (`passphrase = "";` + `Uint8Array` overwrite).
- [ ] **P0** Golden vectors in `tests/crypto/rfc6238.spec.ts` (all official RFC
      6238 test vectors for SHA1/256/512) + `tests/crypto/roundtrip.spec.ts`.
- [ ] **P0** Threat model in `/THREAT_MODEL.md`: attacker capabilities
      (compromised Supabase, compromised Aegis edge, XSS on Aegis client,
      device theft with vault locked/unlocked) and mitigations.
- [ ] **P1** Independent third-party review before v1.0 GA. Log the reviewer +
      findings in the threat model.

**Exit criterion:** `vault-crypto.ts` frozen behind a versioned constant
`VAULT_CRYPTO_VERSION = 1`; any future change bumps it and adds a migrator.

---

## Phase 3 — Vault feature completeness (Weeks 3–5)

The user-visible v1.0 gaps from `PROJECT_IDENTITY.md §3`.

### 3.1 Search & organization

- [ ] **P0** `<VaultSearch />` on `_tabs/vault.tsx` — controlled input in
      `<BrandBar right={…}>`, debounced 120ms, fuzzy match over `issuer + label`.
      Escape clears; `/` focuses (only when not inside another input).
- [ ] **P1** Tag chips row above the list (multi-select, additive filter).
      Backed by `vault_accounts.tags` (Phase 1).
- [ ] **P1** Drag-and-drop reorder using `@dnd-kit/core`. Persist
      `sort_order` batch update via a single Supabase `upsert`.
- [ ] **P2** Bulk-select mode (long-press a card → checkbox mode), primary
      action *tag*, secondary *delete*.

### 3.2 Import / export

- [ ] **P0** `src/lib/otpauth-migration.ts` — parse
      `otpauth-migration://offline?data=...` protobuf. Support multi-QR chunked
      sets in `/vault/import`.
- [ ] **P0** Encrypted export → `.avf` v1. `POST` action-less: pure client
      generation, browser download. Documented in `/docs/avf.md`.
- [ ] **P0** Encrypted import from `.avf`: decrypt with typed-passphrase,
      preview list, user-selects which to import, single batch `INSERT`.
- [ ] **P1** Watermarked decrypted PDF via `jspdf` (already a dep). Route:
      `/vault/export/pdf`, gated by re-typed passphrase + explicit "I know
      what I'm doing" confirm.
- [ ] **P1** Per-account "share to new device" — regenerate `otpauth://` URL,
      show as QR in a bottom sheet, single-use (24h ephemeral, no server hop).

### 3.3 Onboarding polish

- [ ] **P0** Passphrase strength gate is `scoreStrength(pw) >= 3` for signup
      (currently `>= 2`). Justified in the docstring.
- [ ] **P0** Wire `passphrase_hint` field into onboarding step 2. Server-side
      max length 200. Never revealed by any admin surface.
- [ ] **P0** Recovery-key generation screen: show 24-word BIP39-style key,
      require typed re-entry to confirm, offer "Download PDF" +
      "Print" buttons.

### 3.4 Realtime sync

- [ ] **P1** `useVaultRealtime()` hook: opens a Supabase channel filtered by
      `user_id`, invalidates React Query key `["vault-accounts"]` on any
      change event. Guarded by `document.visibilityState === 'visible'` and
      cleans up on route change.

**Exit criterion:** every checkbox in `PROJECT_IDENTITY.md §3` is `[x]` or
`[P1]` or `[P2]`.

---

## Phase 4 — Security surfaces (Weeks 5–6)

- [ ] **P0** Auto-lock timeout picker in Settings (radio group: Immediate / 1m /
      5m / 15m / Never). Timer implemented as a `setTimeout` in a
      top-level `<AutoLockProvider>` that resets on `pointerdown`, `keydown`,
      `visibilitychange` → visible.
- [ ] **P0** "Change passphrase" flow: type current + new twice, re-derive key,
      re-encrypt every `vault_accounts.secret_ciphertext` client-side, batch
      upsert. On failure, rollback locally (no partial state on server thanks
      to a single transaction).
- [ ] **P0** "Sign out of all sessions" — call Supabase
      `auth.admin.signOut(userId, 'global')` via a server function using service
      role; log to `admin_audit` with `actor = user (self-service)`.
- [ ] **P0** Account deletion — types email to confirm, deletes `auth.users`
      row (cascades to everything via existing FKs).
- [ ] **P1** WebAuthn platform-authenticator unlock. Master key gets *also*
      wrapped by a key derived from a WebAuthn PRF extension credential.
      Fallback stays passphrase.
- [ ] **P1** Self-TOTP as second factor on new-device sign-in. Uses `otpauth`
      (already installed) with a seed provisioned during onboarding.
- [ ] **P0** Screen-reader announcements: `aria-live="polite"` region that
      announces "Copied" and "New code available" (throttled to 1 per 5s).

**Exit criterion:** a user who forgets their passphrase and loses their device
can still recover with the paper key alone.

---

## Phase 5 — Frontend polish (Week 6)

- [ ] **P0** Accessibility pass — every MUTED text pair audited against CREAM
      to ≥ 4.5:1 (WCAG AA). Where it fails, promote to `CHARCOAL` at 60%
      opacity via `rgba(28,28,28,0.6)`.
- [ ] **P0** Full data-testid audit — every interactive/status element per
      `design_instruction.md §12` guidance. Run
      `rg -n 'onClick|onSubmit' src/ | rg -v 'data-testid'` and close every hit.
- [ ] **P0** Empty states — vault with 0 accounts uses `<HeroIcon>` +
      `<Display>` "Your vault is empty" + primary CTA "Add first account".
- [ ] **P0** Skeleton loaders on the vault list (cream shimmer, not shadcn's
      default gray). One `<VaultSkeleton count={5} />` component.
- [ ] **P0** Error boundary at `__root.tsx` that renders `renderErrorPage()`
      contents inline (already used by SSR), branded, with a "Sign out"
      escape hatch.
- [ ] **P1** PWA manifest + icons + service worker (Vite PWA plugin). App-shell
      cache + `stale-while-revalidate` for encrypted account list.
- [ ] **P1** Haptics audit — every destructive tap = `navigator.vibrate(14)`,
      every soft tap = `6`. Guarded by feature-detect.
- [ ] **P2** Landing page (`/`) rebuild — currently a spinner; replace the
      unauthenticated variant with a marketing hero using existing tokens.

**Exit criterion:** Lighthouse mobile: Perf ≥ 90, A11y ≥ 95, Best Practices ≥ 95,
SEO ≥ 90.

---

## Phase 6 — Scale & observability (Week 7)

- [ ] **P0** React Query defaults: `staleTime: 30s`, `gcTime: 5m`,
      `refetchOnWindowFocus: false` (we have realtime).
- [ ] **P0** Route-level code splitting — every `_authenticated/*` route is a
      dynamic import. Verify with `vite build --report`.
- [ ] **P0** Image logo pipeline — issuer logos served from a static CDN with
      `content-type: image/svg+xml`, `Cache-Control: public, max-age=31536000,
      immutable`. Fallback to initials chip.
- [ ] **P0** Client error capture → `client_errors` table via a debounced
      batch flush (already scaffolded in `src/lib/error-capture.ts`).
- [ ] **P0** Admin dashboard skeleton at `/admin` with Recharts against a
      Supabase materialized view (`admin_daily_stats`) refreshed hourly.
- [ ] **P1** Feature flag hook `useFeatureFlag(key)` reading from
      `feature_flags` with a 60s React Query cache.
- [ ] **P1** In-app announcement banner reading from `announcements`.
- [ ] **P2** k6 load test scenario in `/perf/k6/vault-read.js` — 1k VUs sustain,
      SLO p95 < 300ms for authenticated vault reads.

**Exit criterion:** an admin can see DAU, error rate, and the top 5 error
messages in production without ever touching ciphertext.

---

## Phase 7 — Release readiness (Week 8)

- [ ] **P0** Full Playwright suite in `/tests` covering: signup → onboarding →
      add account → copy code → lock → unlock → change passphrase → recovery
      restore → delete account.
- [ ] **P0** Two independent crypto reviews (internal + external) with sign-off
      logged in `/THREAT_MODEL.md`.
- [ ] **P0** `SECURITY.md` publishes a coordinated disclosure address
      (`security@aegis.app`) with a PGP key.
- [ ] **P0** GDPR / privacy pages: `/privacy`, `/terms`, `/security` (public
      copies of internal docs).
- [ ] **P0** Cookie / storage inventory in `/docs/storage.md` — every
      `localStorage`, `sessionStorage`, `indexedDB` use, why, and TTL.
- [ ] **P1** Uptime monitor pinging `/` + `/api/health` from three regions;
      alert to on-call.
- [ ] **P1** Runbook `/docs/runbook.md`: what to do when Supabase is down,
      Lovable OAuth is down, a user reports abuse, a leak is suspected.
- [ ] **P0** Version banner: bottom-left of Settings shows `git rev` +
      `VAULT_CRYPTO_VERSION` so support can identify a client build fast.

**Exit criterion:** GA press-ready.

---

## Sequencing summary

```
Phase 0 (audit) ─▶ Phase 1 (backend) ─▶ Phase 2 (crypto)
                                            │
                                            ▼
       ┌────────────── Phase 3 (features) ──┴─▶ Phase 4 (security)
       │                       │
       ▼                       ▼
Phase 5 (frontend polish) ─▶ Phase 6 (scale/observability) ─▶ Phase 7 (release)
```

- Phases 1 and 2 must land before any Phase 3 work touches production data.
- Phases 3 and 4 can parallelize by owner (one FE, one platform).
- Phase 5 always runs *last* in a milestone — polish over an incomplete surface
  is wasted work.

---

## Coding-standards checklist (enforced in PR review)

- [ ] Uses `<AegisScreen>` / `<Display>` / `<Field>` / `PrimaryButton` — no raw
      shadcn primitives left unstyled.
- [ ] Colors come from `chrome.tsx` tokens or CSS vars (no `bg-[#...]`).
- [ ] Motion uses `spring` or `soft`; respects `useReducedMotion()`.
- [ ] Every interactive/status element has `data-testid`.
- [ ] No `console.log` of `CryptoKey`, `Uint8Array` derived from a secret, or
      plaintext seed. (ESLint rule: `no-restricted-syntax` on
      `CallExpression[callee.object.name='console']` around known secret vars.)
- [ ] New DB tables ship with RLS in the same migration; no exceptions.
- [ ] Any change to `vault-crypto.ts` bumps `VAULT_CRYPTO_VERSION` and ships a
      migrator.
- [ ] Works at 390×712 with no horizontal scroll.
- [ ] Passes `tsc --noEmit`, `eslint .`, and the RLS anonymous-read CI test.

---

## Immediate next actions (this week)

1. **Land the Phase 0 audit** — clean CI, `SECURITY.md` stub, `/docs/routing.md`.
2. **Open PRs for Phase 1.1 migrations** — `profiles.role`, `client_errors`,
   `admin_audit`, size checks on `vault_accounts`.
3. **Extract and freeze `vault-crypto.ts`** with the API in Phase 2. Ship it with
   RFC 6238 test vectors green.
4. **Ship `otpauth-migration://` import** in Phase 3.2 — highest acquisition ROI.
5. **Ship "Change passphrase" + "Delete account"** in Phase 4 — the two flows
   support tickets will ask about within the first week of GA.

*Owner: Engineering + Architecture · Living document, update at end of each phase.*
