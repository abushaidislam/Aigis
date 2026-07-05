# Aegis — Project Identity & Feature Checklist

> A single source of truth for **what Aegis is**, **who it serves**, and **every
> user-facing and admin-facing capability** that must ship before we call the
> product production-grade. If a feature isn't listed here, it is out of scope
> for v1.0.

---

## 1. Core Identity

| Attribute            | Value                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| **Product name**     | Aegis                                                                                                    |
| **Category**         | End-to-end encrypted TOTP authenticator with cloud sync                                                  |
| **One-liner**        | *A warm, private authenticator for the codes that unlock your life.*                                     |
| **Elevator pitch**   | Aegis is a mobile-first TOTP vault where secrets are encrypted on the device with your passphrase before they ever touch the cloud. Cross-device sync happens over Supabase, but the server (and Aegis) can never read your seeds. |
| **Design metaphor**  | A hand-bound leather field notebook holding cryptographic secrets — cream paper, ink type, quiet luxury. |
| **Primary platform** | Progressive web app (mobile-first, 440px max), TanStack Start SSR + edge fetch handler.                  |
| **Stack**            | TanStack Start · React 19 · TypeScript · Tailwind v4 · Radix/shadcn · Framer Motion · Supabase (Postgres + Auth + RLS) · Lovable Cloud Auth (Google OAuth) · WebCrypto (AES-GCM) · Argon2id KDF. |
| **Trust posture**    | Zero-knowledge for TOTP seeds. Server sees ciphertext + non-secret metadata only.                        |

### Non-goals (v1.0)
- Password manager features (no arbitrary secure notes / logins).
- Enterprise SCIM/SSO federation.
- Hardware key (WebAuthn) provisioning of *other* services — only for unlocking Aegis itself (future).
- Native iOS / Android binaries. PWA install is the ship path.

---

## 2. Target Personas

| Persona                   | What they need Aegis to do                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **The privacy-first indie** | Sync codes across phone + laptop without trusting a big-tech vendor. Wants readable recovery, export, offline.    |
| **The security-conscious PM** | 20–60 accounts across work SaaS. Needs fast search, favorites, categorized views, quick copy, clean UI at scale. |
| **The switcher**            | Migrating from Google Authenticator / Authy. Needs QR + otpauth-migration import, plus a smooth restore flow.    |
| **The support admin (internal)** | Needs to see aggregate health (signups, error rates), roll keys, revoke abuse, and audit access — **without** ever decrypting seeds. |

---

## 3. Must-Have User-Facing Features (v1.0)

### 3.1 Onboarding & Identity
- [x] Email + password sign-up / sign-in (Supabase Auth).
- [x] Google OAuth via Lovable Cloud Auth (redirect flow, `/auth/callback`).
- [x] Password reset (email link → `/auth/reset-password`).
- [x] Password strength meter (client-side scoring).
- [ ] **Email verification enforcement** on sign-up before vault init (P0 gap).
- [x] Onboarding wizard (creates KDF salt, master key, passphrase).
- [ ] **Passphrase hint** field surfaced during onboarding + editable later (schema exists, UI gap).
- [ ] **Recovery key generation** with printable / downloadable PDF sheet (partial: route exists).

### 3.2 Vault (the product)
- [x] Encrypted TOTP account list, sorted by pin + custom order + created.
- [x] Real-time 6-digit code generation (RFC 6238, SHA1/256/512, digits 4–10, period 10–120s).
- [x] Countdown ring + `≤ 5s` warning color + next-code preview.
- [x] Tap-to-copy with 30-second automatic clipboard clear.
- [x] Long-press / right-click → account detail bottom sheet (reveal, meta, remove).
- [x] Favorites (pin/unpin, animated).
- [x] Hide-codes privacy mode (masked dots, toggle in Settings, per-profile pref).
- [x] Delete account with typed confirm bottom sheet.
- [ ] **Full-text / issuer search** in vault header (P0).
- [ ] **Categories / tags** with filter chips (P1).
- [ ] **Reorder via drag-and-drop** (P1 — `sort_order` column exists).
- [ ] **Multi-select bulk actions** (delete, tag, export subset) (P2).

### 3.3 Add / Import
- [x] Manual entry (issuer, label, secret, algorithm, digits, period).
- [x] QR scan via `@zxing/browser` (`otpauth://totp/...`).
- [x] Bulk import route (`vault.import.tsx`).
- [ ] **`otpauth-migration://` (Google Authenticator export) parser** (P0).
- [ ] **Encrypted JSON export / import (Aegis Vault File `.avf`)** (P0).
- [ ] **Import from Authy / 2FAS / Raivo backups** (P2, best-effort).

### 3.4 Security surfaces
- [x] Auto-lock (`_locked` route group, unlock via passphrase).
- [ ] **Configurable auto-lock timeout** (Immediate / 1m / 5m / 15m / Never) in Settings (P0).
- [ ] **Biometric unlock (WebAuthn platform authenticator) wrapping the master key** (P1).
- [ ] **TOTP-protected sign-in on new device** — Aegis itself gets a self-TOTP as a second factor (P1, `otpauth` already installed).
- [x] Recovery-key-wrapped master key stored server-side (`recovery_wrapped_key`).
- [ ] **Recovery flow: paste 24-word / hex recovery key → decrypt master key → set new passphrase** (partial route exists).
- [ ] **Change passphrase** (re-wrap master key, rotate `kdf_salt`) (P0).
- [ ] **Sign out of all sessions** (Supabase RPC + Settings action) (P0).

### 3.5 Profile & Settings
- [x] Profile screen (display name, avatar_url, onboarded_at).
- [x] Security screen (privacy toggle live).
- [ ] **Account deletion (self-service, cascades to `vault_meta`, `vault_accounts`)** (P0).
- [ ] **Theme lock** — Aegis only ships light "cream" theme; document why and expose reduced-motion toggle explicitly (P1).
- [ ] **Language switcher** — English only for v1, structure ready for i18n (P2).

### 3.6 Data portability
- [ ] Encrypted export (`.avf`, versioned envelope, argon2id-wrapped) (P0).
- [ ] Decrypted PDF export (behind explicit typed-passphrase confirm, watermarked, no icons for OCR resistance) (P1).
- [ ] Per-account QR re-share for migration to another device (P1).

### 3.7 Accessibility & UX polish
- [x] Framer-motion respects `prefers-reduced-motion`.
- [x] Focus trap + Escape + focus-restore in every bottom sheet (already implemented in `AccountCard.tsx`).
- [x] Keyboard-operable icon buttons (favorite star).
- [ ] **Screen-reader announcement on code refresh + copy** (`aria-live=polite`) (P0).
- [ ] **High-contrast pass** (WCAG AA on CREAM/CHARCOAL — MUTED text must clear 4.5:1) (P0).
- [ ] **Offline mode / service worker** — vault fully usable without network after first load (P0).

---

## 4. Must-Have Admin / Operator Features (v1.0)

These are for the Aegis team, not end users. Delivered as a separate authenticated
sub-app under `/admin/*` guarded by a `profiles.role = 'admin'` column.

- [ ] **Admin gate** — new `profiles.role` enum (`user` | `admin`), RLS policy that
      lets admins `SELECT` from an aggregated view *only*, never from raw
      ciphertext tables (P0).
- [ ] **Signup / DAU / retention dashboard** (Supabase materialized view + Recharts).
- [ ] **Error-rate dashboard** — fed by `error-capture.ts` → Supabase `client_errors`
      table (redacted stack, no PII).
- [ ] **Abuse controls** — per-user rate-limit toggle on `vault_accounts.insert`,
      soft-lock a user (blocks sign-in without deleting).
- [ ] **Feature flags** — `feature_flags` table with `key`, `enabled`, `audience_json`;
      client reads via React Query.
- [ ] **Announcement banners** — `announcements` table, dismissible on the client,
      targeted by `audience_json`.
- [ ] **Audit log** — every admin action writes to `admin_audit` (actor, action,
      target_user_id, at). Append-only, RLS `INSERT` only via service role.
- [ ] **Data export tooling** — one-click GDPR-style export for a user (metadata
      only; ciphertext is opaque anyway).
- [ ] **Key rotation runbook** — no shared server key exists (by design), but the
      admin must be able to rotate the *Supabase project* JWT secret and revoke
      all sessions.

---

## 5. Cross-cutting Requirements

- **Zero-knowledge invariant.** No API path, no admin tool, no support workflow
  is allowed to read plaintext `secret`. Every design review must ask: *does
  this break zero-knowledge?* If yes, reject.
- **RLS is the ONLY server-side authz.** No client is ever trusted; every
  Supabase table policy is `auth.uid() = user_id` (see current migrations).
- **All secrets stay in `crypto.subtle`.** Never `console.log` a `CryptoKey` or
  a decoded seed. Lint rule TBD.
- **Every interactive element has a `data-testid`** (see §12 of `design_instruction.md`).
- **Every screen validated at 390 × 712** (iPhone 14) with no horizontal scroll.
- **Every destructive action** confirms via bottom sheet (never a browser
  `confirm()`, never a shadcn `AlertDialog`).

---

## 6. Definition of Done (per feature)

A feature is *not* shipped until **all** of the following are true:

1. Types are strict, `eslint` and `tsc --noEmit` pass with zero errors.
2. It uses `<AegisScreen>`, `<Display>`, `<Field>`, `PrimaryButton`, etc. — no
   raw shadcn defaults left unstyled.
3. It has `data-testid` on every interactive + status element.
4. It works with `prefers-reduced-motion: reduce`.
5. It has an RLS policy verified by a signed-out `curl` (should return `[]`).
6. It has at least one Playwright happy-path test in `/tests`.
7. Copy is short, sentence case, explains consequence + recovery.
8. Bundle size delta is documented (`vite build` size-limit).

---

## 7. Success Metrics (v1.0 launch)

| Metric                                  | Target                 |
| --------------------------------------- | ---------------------- |
| Time from sign-up → first code copied   | < 90 seconds           |
| p95 code render latency (cold vault)    | < 350 ms               |
| Successful QR import rate               | > 95 %                 |
| Recovery-key restore success rate       | > 98 %                 |
| Weekly-active / monthly-active          | > 55 %                 |
| Lighthouse (mobile, throttled)          | Perf ≥ 90, A11y ≥ 95   |
| Uncaught client errors / 1k sessions    | < 3                    |

---

*Owner: Product + Architecture · Last updated at file creation.*
