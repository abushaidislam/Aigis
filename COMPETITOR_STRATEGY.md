# Aegis — Competitor Strategy & Differentiation

> A comparative teardown of the three authenticators Aegis will realistically
> displace or steal share from, plus the concrete **technical moats** we must
> build to be a legitimate alternative — not a "me too" clone.

---

## 1. Competitor set

We picked the three products a security-conscious user actually chooses between
in 2026 when they've outgrown Google Authenticator:

| # | Competitor        | Category                        | Why it matters                                         |
| - | ----------------- | ------------------------------- | ------------------------------------------------------ |
| 1 | **Authy (Twilio)**| Cloud-synced TOTP, closed source | The default incumbent. Massive install base, but shrinking trust after 2024 desktop-app sunset and 33 M phone-number leak. |
| 2 | **2FAS**          | Open-source, mobile-first, optional cloud sync | The "principled" pick. Great mobile UX, browser extension, but the sync story and web surface are weak. |
| 3 | **Bitwarden Authenticator** | Open-source, from a trusted password-manager brand | New (2024+), backed by Bitwarden's crypto reputation, still catching up on features. |

> Google Authenticator is intentionally *not* in this table. It's a floor, not a
> ceiling — anyone who cares enough to Google "Authy alternative" is already
> above that floor. But we still commit to a **one-tap Google Authenticator
> import** as a P0 acquisition wedge (see plan.md — Phase 3).

---

## 2. Feature parity matrix

Legend: ✅ ships · 🟡 partial / hidden / paid · ❌ absent · 🎯 = Aegis wedge.

| Capability                             | Authy | 2FAS | Bitwarden Auth | **Aegis (target v1.0)** |
| -------------------------------------- | ----- | ---- | -------------- | ----------------------- |
| End-to-end encrypted seeds             | 🟡 (backup password, opt-in) | ✅ | ✅ | ✅ **enforced, no opt-out** 🎯 |
| Zero-knowledge server                  | ❌    | ✅   | ✅ | ✅                        |
| Web app (browser, no install)          | ❌ (killed 2024) | 🟡 (extension) | ❌ | ✅ **first-class PWA** 🎯 |
| Cross-device sync                      | ✅    | 🟡 (Google Drive / iCloud) | ✅ | ✅ (Supabase, native)      |
| Google Authenticator import            | ✅    | ✅   | ✅ | ✅ (P0)                    |
| Encrypted export file (portable)       | ❌    | ✅   | ✅ | ✅ **`.avf` versioned**    |
| Recovery key (paper / PDF)             | ❌    | ❌   | 🟡 (via Bitwarden vault) | ✅ **built-in, printable** 🎯 |
| Biometric unlock                       | ✅    | ✅   | ✅ | ✅ (WebAuthn platform auth) |
| Configurable auto-lock                 | 🟡   | ✅   | ✅ | ✅                         |
| Hide codes by default                  | ❌    | 🟡  | ✅ | ✅                         |
| Search / filter                        | ✅    | ✅   | ✅ | ✅                         |
| Categories / tags                      | ❌    | ✅   | 🟡 | ✅ (P1)                    |
| Drag-and-drop reorder                  | ✅    | ✅   | ✅ | ✅ (P1)                    |
| Design that isn't generic SaaS blue    | ❌    | ❌   | ❌ | ✅ **editorial cream, serif+mono** 🎯 |
| Motion & haptics                       | 🟡   | 🟡  | ❌ | ✅ (framer, `navigator.vibrate`) 🎯 |
| Offline (post-first-load)              | 🟡   | ✅   | ✅ | ✅ (service worker, P0)    |
| Open, auditable crypto (WebCrypto + argon2id) | ❌ | ✅ (mobile only) | ✅ | ✅ **client TS + published docs** 🎯 |
| GDPR self-serve delete                 | 🟡   | ✅   | ✅ | ✅                         |
| Free tier for all core features        | ✅    | ✅   | ✅ | ✅ (no paywall on TOTP)    |

**Summary:** parity on the security table stakes, **plus** three wedges nobody
else combines: browser-first PWA, a printable recovery paper, and a design
language that doesn't look like every other 2FA app.

---

## 3. Where each competitor is weakest — and how we exploit it

### 3.1 Authy — trust decay + no web app

- **Weakness:** killed the desktop app in 2024, phone-number leak in 2024,
  closed-source crypto that users must take on faith, backups are gated behind
  an opt-in "backup password" that most users never set.
- **Aegis attack:**
  - Open-source client TS crypto module (`src/lib/vault-crypto.ts`) with a
    published threat model in `SECURITY.md`.
  - **PWA-first** — the very thing Authy took away. Add-to-home-screen on iOS,
    installable on desktop.
  - **No opt-out E2E.** You cannot create an Aegis account whose seeds are
    plaintext-recoverable by us. Argon2id + AES-GCM is mandatory on onboarding.
  - Migration doc + one-click Authy → Aegis parser for the community-known Authy
    export format (limited but useful for engaged users).

### 3.2 2FAS — great mobile app, weak web / sync story

- **Weakness:** sync is bring-your-own-cloud (Google Drive / iCloud). The
  browser extension is a viewer, not a full vault. No first-class web app.
- **Aegis attack:**
  - **Supabase-backed sync** with RLS as the single authz surface. No BYO cloud
    plumbing to configure.
  - **Web is the primary surface**, mobile is the PWA install. Everything works
    from any browser on day one.
  - Cross-tab sync via Supabase Realtime (`postgres_changes` on
    `vault_accounts`) so a new code added on the phone appears live on the
    desktop tab.

### 3.3 Bitwarden Authenticator — young, sparse UX

- **Weakness:** feature-thin, no printable recovery, design borrowed from the
  password manager (dense, utilitarian). No web-only surface (mobile only for
  the free tier, otherwise gated behind Bitwarden vault).
- **Aegis attack:**
  - **Design differentiation** — Playfair Display + JetBrains Mono on cream
    paper. Every screenshot on the marketing page must be *instantly*
    identifiable as Aegis, not any other 2FA app.
  - **Standalone product** — no requirement to also adopt an Aegis password
    manager (we don't have one and don't want one).
  - **Recovery-paper flow** printed with `jspdf` (already a dep) — a physical
    artifact users can put in a safe.

---

## 4. Aegis's *technical* moats (must-build)

These are the concrete engineering commitments that turn the strategy above
into shipped code. Each maps to a task in `plan.md`.

1. **Client-side crypto module (`src/lib/vault-crypto.ts`)**
   - Argon2id KDF (params: `m=64MiB, t=3, p=1`) → 256-bit master key.
   - AES-GCM per-secret with a 12-byte random IV, associated data =
     `user_id || account_id` to bind ciphertext to owner.
   - Master key **never** leaves the tab; only recovery-wrapped copy is stored.
   - Public, documented, unit-tested. Threat model in `/SECURITY.md`.

2. **Zero-trust database policies**
   - Every table has an RLS policy that filters by `auth.uid()`. Verified by a
     nightly CI job that runs signed-out `curl`s against the REST API and
     asserts `[]`.
   - No service-role key ever leaves the server. No client library holds it.

3. **Portable Aegis Vault File (`.avf`)**
   - Versioned JSON envelope: `{ version, kdf, salt, iv, ciphertext, mac,
     created_at }`. Documented byte-for-byte in `/docs/avf.md`.
   - This is the *interop moat*: users can leave Aegis at any time and re-import
     into any tool that speaks the format. Freedom to leave is what earns
     freedom to stay.

4. **Google Authenticator `otpauth-migration://` parser**
   - Native protobuf parser (no npm dep) shipped in `src/lib/otpauth-migration.ts`.
   - Handles multi-QR (chunked) exports out of the box.
   - This is the **single highest-ROI acquisition feature** — nearly every
     switcher starts here.

5. **Cross-tab realtime sync**
   - Supabase Realtime channel per `user_id`, invalidates React Query cache on
     `INSERT / UPDATE / DELETE`. Feels magical, differentiates from Authy
     immediately.

6. **Offline PWA**
   - Service worker with app-shell precache + `stale-while-revalidate` for the
     encrypted account list. Codes generate offline (WebCrypto works offline).
   - The vault must be usable on a plane.

7. **The design system itself is a moat**
   - No competitor looks like Aegis. Every new screen goes through
     `design_instruction.md`. Screenshots go on the landing page and in
     app-store-style social posts. Distinctive UI drives word-of-mouth
     the way Superhuman did for email.

8. **Auditability**
   - Public `SECURITY.md` + `THREAT_MODEL.md`.
   - Every crypto function has a doc-comment with the exact primitive and
     rationale.
   - A dedicated `crypto-tests/` directory with WebCrypto-based golden vectors
     (RFC 6238 test vectors + our own AES-GCM roundtrip tests).

---

## 5. Positioning statement (for the marketing site)

> **For** people who take their online safety personally
> **Who** have outgrown Google Authenticator but don't trust Authy anymore,
> **Aegis** is a browser-first, end-to-end encrypted authenticator
> **That** syncs your codes across every device without ever letting us — or
>   anyone else — read them.
> **Unlike** Authy (closed, phone-number-linked, no web app),
> 2FAS (great app, awkward sync), and Bitwarden Authenticator (young, generic UI),
> **Aegis** is the only authenticator that pairs zero-knowledge crypto with a
> printable recovery paper and a design you'd actually be proud to open in a
> meeting.

---

## 6. Watchlist — signals that would change the strategy

- Authy re-launches a web app → shrinks our biggest wedge; double down on
  design + `.avf` interop.
- Bitwarden ships a printable recovery paper → we ship first, or ship
  richer (per-account recovery + sealed-envelope UX).
- Apple / Google add native cross-platform TOTP sync at OS level (already
  starting) → position Aegis explicitly as *cross-vendor*: works when you have
  an iPhone at home and a ChromeBook at work.

---

*Owner: Product + Growth · Last updated at file creation.*
