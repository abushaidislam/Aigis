# tests/

Standalone Node ESM specs. These do not require a test runner (vitest,
jest, etc.) — they use Node's built-in `assert/strict` and exit non-zero
on failure. That keeps CI simple and avoids adding a heavyweight test
harness before Phase 7.

## crypto/

Golden-vector tests that guard `VAULT_CRYPTO_VERSION`. Any change to a
stored-form primitive **must** keep these green (or bump the version and
ship a migrator).

```bash
node tests/crypto/rfc6238.spec.mjs                    # RFC 6238 TOTP conformance
node tests/crypto/vault-crypto.roundtrip.spec.mjs     # AES-GCM + PBKDF2 round-trip
```

Both scripts assume Node 20+ (WebCrypto + top-level `await`) and require
`node_modules` to be installed for the `otpauth` cross-check.

## Adding a new test

- Prefer a plain `*.spec.mjs` in the relevant subdirectory.
- Use `assert/strict`. Exit `0` on success, `1` on any failure.
- Print one line per assertion — CI logs get filtered by `[<name>]` prefix.
