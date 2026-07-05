# Aegis — current plan

## Navigation (done, revised approach)

Original plan proposed a hamburger + full-screen slide-in sheet with four
destinations. During implementation we switched to a **persistent bottom tab
bar** — more natural for a mobile-first PWA, one tap to any section, matches
native authenticator apps (Google Authenticator, Authy, 2FAS).

Current shape:

- `src/components/aegis/BottomTabs.tsx` — fixed bottom bar, three tabs:
  **Vault**, **Security**, **Profile**. Uses the shared cream/charcoal
  chrome, `soft` spring for the active pill.
- Add account is NOT a tab — it stays as the floating "+ Add account" pill
  on the Vault screen (primary action, one screen only).
- Layout route `_authenticated/_tabs.tsx` renders `<Outlet />` above the
  bottom bar. Locked-vault gate lives at `_authenticated/_locked/route.tsx`
  and wraps only the screens that need the DEK (Vault, Add). Security and
  Profile work without unlocking.
- Routes in place:
  - `_authenticated/_tabs/vault.tsx`
  - `_authenticated/_tabs/security.tsx`
  - `_authenticated/_tabs/profile.tsx`
  - `_authenticated/_locked/vault_.new.tsx` (Add account, unlock required)

```text
┌──────────────────────────────┐
│ 🛡 Aegis                     │
│                              │
│  Your codes.                 │
│  • account rows              │
│                              │
│          [ + Add account ]   │
│                              │
├──────────────────────────────┤
│  🔑 Vault  🛡 Security  👤 Me │  ← bottom tabs
└──────────────────────────────┘
```

## Remaining work on the shipped screens

### Security tab
- **Change passphrase** — currently a "coming soon" chip. Real flow:
  ask current passphrase → derive old KEK → unwrap DEK → derive new KEK
  from new passphrase → re-wrap DEK → update `vault_meta`
  (`kdf_salt`, `recovery_wrapped_key`, `recovery_wrapped_key_iv`,
  optional new `passphrase_hint`). Never touch `vault_accounts` — the DEK
  itself does not change, so ciphertexts stay valid.
- **Auto-lock timer** is hard-coded to 5 min in `vault-session.ts`.
  Expose a picker (1 / 5 / 15 / 30 min / never) and persist to
  `localStorage` per user.
- **Biometric row** already toggles enroll/disable — verify copy is clear
  when platform doesn't support WebAuthn.

### Profile tab
- Display name is editable and persists to `profiles`. Verify RLS covers
  update on `profiles`.
- **Avatar** — currently initials chip. Add upload to Supabase Storage
  (`avatars` bucket, `user_id/` prefix, public read, owner-only write),
  crop to square, show fallback initials when empty.
- **Delete account** — soft flow: confirm → sign out → call an
  authenticated server function that deletes `vault_accounts`,
  `vault_meta`, `profiles`, and finally `auth.users` row via admin API.

## Next feature candidates (not started)

Ordered by user value on top of the current vault:

1. ~~**Search + favorites** on the Vault tab~~ — DONE. Sticky search input
   already shipped; favorites now use `src/lib/favorites.ts` (localStorage
   per user id), star toggle on each `AccountCard`, and Vault renders two
   groups: "Favorites" pinned above "All accounts".
2. **Recovery sheet** — printable PDF (issuer names + wrapped recovery
   key as QR) generated in-browser at vault creation time. Backs up the
   "if you forget this passphrase, your codes cannot be recovered" line
   already shown on `/lock`.
3. **Bulk import** — parse `otpauth-migration://` QR (Google
   Authenticator export), Aegis JSON, 2FAS JSON. New route
   `_authenticated/_locked/vault_.import.tsx`; reuse existing add flow to
   commit each parsed account.
4. **Encrypted export** — download a passphrase-wrapped `.aegis` file
   that mirrors the DB shape, so users hold their own backup.
5. **Copy code + auto-clear clipboard** after 30s, plus a next-code
   preview when the current one is about to expire.

Pick one after the remaining Security/Profile work lands.
