# Aegis — Disaster Recovery Runbook

> How to keep Aegis usable when Supabase, Cloudflare, Lovable, or our own
> code lets us down. Every runbook has: **symptom → detection → mitigation
> → follow-up**.
>
> RTO target: **60 minutes** (time to restore service).
> RPO target: **5 minutes**  (max data loss on a hard restore).

---

## 0. Guiding principle

**Even a full Supabase restore never breaks the zero-knowledge invariant.**
Because vault seeds are AES-GCM ciphertext bound to a passphrase-derived
KEK, a leaked or restored database is still opaque without each user's
passphrase. Recovery discipline is about *availability*, not *confidentiality*.

## 1. Backups

### 1.1 Continuous — Supabase PITR
- **Enable at:** Supabase dashboard → *Database* → *Backups* → PITR
  (paid feature). RPO ≤ 5 minutes.
- **Verify quarterly** by triggering a "clone project" to a scratch
  workspace and confirming the migrations replay cleanly.

### 1.2 Weekly — encrypted off-provider snapshot
- **Schedule:** Every Sunday 02:00 UTC via a Supabase Scheduled Function.
- **Command sketch:**
  ```bash
  pg_dump "$SUPABASE_DB_URL" \
    --schema=public --schema=storage \
    --no-owner --no-privileges \
    --format=custom \
    | age -r "$AEGIS_BACKUP_AGE_PUBKEY" \
    > "aegis-$(date +%F).sql.age"
  aws s3 cp aegis-$(date +%F).sql.age s3://aegis-backups/
  ```
- **Retention:** 12 weekly + 6 monthly rolling snapshots.
- **Encryption:** [age](https://age-encryption.org/) with a public key
  whose private half lives *only* in a hardware token held by the
  operator. Even the S3 bucket is opaque.
- **Restore drill:** quarterly, into a scratch Supabase project. Log the
  clock time from "download blob" to "app boots against restore" — that
  is our real RTO.

### 1.3 Migration source of truth
- `supabase/migrations/*.sql` is the canonical schema. Any change to
  production must land as a numbered migration first — never edit a
  table via the SQL editor without a matching migration file. Even
  triggers and grants belong in migrations.

## 2. Common incident runbooks

### 2.1 Supabase project is down

- **Symptom:** `supabase.auth.getSession()` and every REST call hang or
  return 5xx.
- **Detection:** `client_errors` insert rate spikes (once wired in Phase
  1), Uptime monitor pages on-call.
- **Mitigation:**
  1. Post the incident to `announcements` table via service_role so every
     signed-in user sees a banner: *"Sync is temporarily unavailable — codes
     already on this device still work."* The local vault continues to
     generate codes; only sync, sign-in, and new-account writes fail.
  2. Confirm status at status.supabase.com. If it's a provider incident,
     stop; wait it out.
  3. If it's *our* project (RLS misconfig, exhausted quota, corrupted
     schema), open the Supabase dashboard, rotate service-role key if
     leak suspected, and either fast-forward migrations or restore from
     PITR (see §3).
- **Follow-up:** Add the failure mode to `THREAT_MODEL.md` and codify a
  detection query if we didn't catch it early enough.

### 2.2 Lovable Cloud OAuth is down

- **Symptom:** Google sign-in redirects to `/auth/callback` and never
  completes.
- **Mitigation:** The callback route already bails to `/auth` after 4 s
  (see `docs/routing.md`). Email/password sign-in is unaffected. Post
  an announcement.
- **Follow-up:** Track the frequency; if this becomes chronic, move OAuth
  in-house.

### 2.3 Cloudflare / edge is down

- **Symptom:** The Aegis domain itself is unreachable; users can't load
  the app. Any codes already generated on-device via a cached PWA
  install still work (Phase 5 service worker).
- **Mitigation:**
  1. Cloudflare status → if it's their fault, wait.
  2. If it's *our* worker (bad deploy), roll back via
     `npx wrangler rollback` — the previous version is retained.
- **Follow-up:** Verify the rollback SLO. Add the failing build to a
  regression suite.

### 2.4 Suspected key or session leak

- **Symptom:** Anomalous activity in `admin_audit`, or a report from
  security@aegis.app.
- **Mitigation (in order):**
  1. Rotate the Supabase **service_role** key from the dashboard;
     redeploy the worker with the new secret. No client uses this key.
  2. Rotate the Supabase **JWT secret** — this signs out **every user
     on every device**. Use only if session compromise is credible.
  3. If an individual account is at risk, use service_role to
     `UPDATE auth.users SET banned_until = now() + '30 days' WHERE id =
     '<uuid>'` and force `auth.admin.signOut(uid, 'global')`.
  4. Because seeds are E2E-encrypted, a leak of the DB alone does **not**
     compromise TOTP secrets. Do not send a passphrase-reset broadcast on
     that basis alone.
- **Follow-up:** Publish a post-mortem within 30 days per
  `SECURITY.md §7`.

### 2.5 Cryptographic vulnerability discovered in v1

- **Symptom:** A researcher, our own review, or a public CVE indicates
  PBKDF2-SHA256 @ 600k is insufficient, or AES-GCM implementation is
  suspect.
- **Mitigation:**
  1. Ship `VAULT_CRYPTO_VERSION = 2` per Phase 2 plan (Argon2id + AAD
     binding) with an in-place migrator that decrypts on unlock and
     re-encrypts before the next server flush.
  2. Announce via `announcements` (kind: `warning`) and email the
     `security@aegis.app` disclosure list.
- **Follow-up:** Add the mitigation to `SECURITY.md` change log.

## 3. Restore from PITR (procedure)

1. Freeze writes: temporarily revoke `INSERT, UPDATE, DELETE` from
   `authenticated` on `vault_accounts` + `vault_meta`. This is the sledge-
   hammer — announce it first.
2. In Supabase dashboard → *Database* → *Backups* → *Point-in-time* →
   select target timestamp (max 5 min before the incident).
3. Restore into a **scratch project first**, verify with a known-good
   test account, then promote by swapping the connection string in the
   worker's `SUPABASE_URL` secret and redeploying.
4. Unfreeze writes.

## 4. Auth rate limits (defense-in-depth)

The Aegis edge does not proxy auth traffic — the browser talks to Supabase
directly. Auth rate limits therefore live in the Supabase dashboard:

- **Password / OTP requests:** 30 / IP / hour.
- **Signup:** 5 / IP / hour, 3 / email / day.
- **Reset password:** 3 / email / 30 min.

These map to Supabase's built-in limits — set them explicitly in
*Authentication* → *Rate limits*. Any change is a security event and
belongs in `admin_audit`.

For our own edge (SSR + serverFn RPCs), the security headers middleware
in `src/lib/security-headers.server.ts` plus a future per-IP token
bucket handles abuse; today the surface is small enough that we rely on
Cloudflare's built-in DDoS protection.

## 5. On-call checklist (paste into every ticket)

```
INCIDENT
  when:      <UTC>
  detected via: <alert|user report|self>
  service impact: <auth|vault|sync|edge|all>
  RCA started: <yes/no>

ACTIONS
  [ ] announcement posted (kind: warning|incident)
  [ ] status page updated
  [ ] logs snapshot captured (client_errors + Cloudflare Logpush window)
  [ ] mitigation applied
  [ ] user impact quantified

FOLLOW-UP
  [ ] post-mortem drafted within 5 days
  [ ] runbook updated
  [ ] regression added to /tests
```

---

*Owner: Platform · Reviewed every incident + quarterly.*
