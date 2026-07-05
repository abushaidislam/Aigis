# Aegis — Route Map & Auth Guards

> Enumerates every route in `src/routes/`, its guard, its SSR posture, and
> the state it depends on. Closes the last Phase 0 item in `plan.md`.
> Update this file whenever a new route lands or a `beforeLoad` guard
> changes — reviewers should be able to answer *"can an anonymous /
> authenticated / locked-vault user hit this URL?"* in one lookup.

---

## 1. Guard vocabulary

Every route inherits guards from every layout above it in the tree. The
three guards that exist in the app today, ordered outer → inner:

| Guard                  | Where it lives                                 | Effect on failure                                       |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| **auth**               | `_authenticated/route.tsx` (`beforeLoad`)      | `throw redirect({ to: "/auth" })`                       |
| **vault-unlocked**     | `_authenticated/_locked/route.tsx` (pathless), also duplicated inline in `_tabs/vault.tsx` and `_tabs/security.tsx` | `throw redirect({ to: "/lock", search: { redirect: location.href } })` |
| **profile bootstrap**  | `/` (`index.tsx` `beforeLoad`)                 | `redirect` to `/auth`, `/onboarding`, or `/vault` based on `profiles.onboarded_at` |

The **auth** guard reads `supabase.auth.getUser()`. The
**vault-unlocked** guard reads `isVaultUnlocked()` from
`src/lib/vault-session.ts` — that is *module-scope memory only*, wiped on
hard refresh or auto-lock. There is no cookie or localStorage flag that
can be forged to pretend the vault is unlocked.

## 2. SSR posture

TanStack Start renders SSR by default. Every user-facing Aegis route that
touches Supabase auth or vault state opts out with `ssr: false` because
we cannot (and should not) hydrate a plaintext DEK on the server. Only
the `__root` shell and pathless layouts SSR.

## 3. The route tree

```
/                                       ssr:false   public (redirects)
├── /auth                                ssr:false   public
│   ├── /auth/callback                   ssr:false   public
│   └── /auth/reset-password             ssr:false   public
└── /_authenticated                      ssr:false   [auth]
    ├── /_authenticated/onboarding                   [auth]
    ├── /_authenticated/lock                         [auth]           ← vault create / unlock UI
    ├── /_authenticated/_tabs                        [auth] + tab shell
    │   ├── /vault                                   [auth] + [vault-unlocked]
    │   ├── /security                                [auth] + [vault-unlocked]
    │   └── /profile                                 [auth]
    └── /_authenticated/_locked                      [auth] + [vault-unlocked]
        ├── /vault/new                               [auth] + [vault-unlocked]
        ├── /vault/import                            [auth] + [vault-unlocked]
        └── /vault/recovery                          [auth] + [vault-unlocked]
```

## 4. Per-route table

| # | URL                     | File                                                     | Guards                        | SSR    | Purpose                                                                                       |
| - | ----------------------- | -------------------------------------------------------- | ----------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| 1 | `/`                     | `routes/index.tsx`                                       | *dispatch only*               | `off`  | `beforeLoad` reads `auth.getUser()` + `profiles.onboarded_at` and redirects to `/auth`, `/onboarding`, or `/vault`. Renders only a spinner if it ever lands. |
| 2 | `/auth`                 | `routes/auth.tsx`                                        | *none*                        | `off`  | Sign-in / sign-up / reset-request. Redirects to `/` if a session already exists.              |
| 3 | `/auth/callback`        | `routes/auth.callback.tsx`                               | *none*                        | `off`  | OAuth handshake landing page. Waits for `SIGNED_IN` (or 4 s timeout) then redirects to `/`.   |
| 4 | `/auth/reset-password`  | `routes/auth.reset-password.tsx`                         | *none*                        | `off`  | Renders the "set new password" form when Supabase emits `PASSWORD_RECOVERY` / `SIGNED_IN`.     |
| 5 | `/onboarding`           | `routes/_authenticated/onboarding.tsx`                   | **auth**                      | `off`  | First-run wizard. Stamps `profiles.onboarded_at` on completion, then navigates to `/vault`.   |
| 6 | `/lock`                 | `routes/_authenticated/lock.tsx`                         | **auth**                      | `off`  | Two modes: **create** (no `vault_meta` row yet) — set the master passphrase; **unlock** — enter passphrase or biometric. Accepts `?redirect=` for the destination after unlock. |
| 7 | `/vault`                | `routes/_authenticated/_tabs/vault.tsx`                  | **auth**, **vault-unlocked**  | `off`  | The vault list — encrypted TOTP accounts, search, favorites, tap-to-copy.                      |
| 8 | `/security`             | `routes/_authenticated/_tabs/security.tsx`               | **auth**, **vault-unlocked**  | `off`  | Auto-lock, hide-codes, biometric, change passphrase, sign-out-all (planned).                   |
| 9 | `/profile`              | `routes/_authenticated/_tabs/profile.tsx`                | **auth**                      | `off`  | Display name, avatar, sign out, delete account. Intentionally usable when the vault is *locked* so a user can sign out without unlocking. |
| 10 | `/vault/new`           | `routes/_authenticated/_locked/vault_.new.tsx`           | **auth**, **vault-unlocked**  | `off`  | Add account via QR scan (camera or uploaded screenshot) or manual entry.                       |
| 11 | `/vault/import`        | `routes/_authenticated/_locked/vault_.import.tsx`        | **auth**, **vault-unlocked**  | `off`  | Bulk import surface (Google Auth. migration parser + `.avf` planned in Phase 3.2).             |
| 12 | `/vault/recovery`      | `routes/_authenticated/_locked/vault_.recovery.tsx`      | **auth**, **vault-unlocked**  | `off`  | Generate / view the printable recovery sheet.                                                  |

## 5. Guard behavior notes

- **Double guarding of `/vault` and `/security`.** These two live under
  `_tabs` (not `_locked`) because they share the bottom-tab shell — but
  they still need the vault-unlocked check. The check is duplicated in
  each route's `beforeLoad`. If a third tab ever needs the same, promote
  the check to a shared helper.
- **`/profile` is intentionally *not* vault-locked.** Users who forget
  their passphrase must still be able to reach "sign out" and "delete
  account". Any future destructive action added to Profile must re-verify
  by requiring the user to re-type their auth password (not the vault
  passphrase).
- **`/lock?redirect=` deep-links.** Only same-origin absolute paths are
  honored (`safeRedirect()` in `lock.tsx`). Anything else falls back to
  `/vault`. Do not add domain-relative redirect targets.
- **Auth callback timeout.** `/auth/callback` bails to `/auth` after
  4 s of no `SIGNED_IN` event. This is intentional so a broken OAuth
  round-trip does not strand the user on a spinner forever.

## 6. Public / private / locked map (for the CI RLS test)

Used by the Phase 1.2 test in `tests/rls/anonymous-cannot-read.spec.ts`:

- **Public (must render 200 to anonymous):** `/`, `/auth`, `/auth/callback`,
  `/auth/reset-password`.
- **Auth-required (must redirect anonymous to `/auth`):** `/onboarding`,
  `/lock`, `/vault`, `/security`, `/profile`, `/vault/new`, `/vault/import`,
  `/vault/recovery`.
- **Vault-unlocked-required (must redirect authenticated-but-locked to
  `/lock`):** `/vault`, `/security`, `/vault/new`, `/vault/import`,
  `/vault/recovery`.

## 7. Data dependencies (what each guard reads)

| Guard             | Reads                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------- |
| auth              | `supabase.auth.getUser()` → `data.user`                                                   |
| profile bootstrap | `public.profiles.onboarded_at` for `auth.uid()`                                           |
| vault-unlocked    | In-memory `dek` inside `src/lib/vault-session.ts` (no network read)                       |

## 8. Future routes (planned in `plan.md`, not yet created)

- `/admin` and children (Phase 6) — new pathless `_admin` route with a
  `beforeLoad` that calls the `public.is_admin()` DB function landed in
  migration `20260706100000_profiles_role.sql`. Redirects non-admins to
  `/vault`.
- `/privacy`, `/terms`, `/security` (public docs, Phase 7 release
  readiness).

---

*Owner: Architecture · Update alongside any route or guard change.*
