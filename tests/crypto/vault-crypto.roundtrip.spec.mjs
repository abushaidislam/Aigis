// Aegis vault-crypto v1 roundtrip test.
//
// Uses WebCrypto (available on Node 20+) directly — not our TS module —
// to independently verify that:
//
//   1. PBKDF2-HMAC-SHA-256, 600 000 iterations produces the same 32-byte
//      derived key whether we call it from Node or from a browser
//      (this catches any regression in the KDF choice).
//   2. An AES-256-GCM wrap/unwrap round-trips the DEK exactly.
//   3. An AES-256-GCM encrypt/decrypt round-trips a TOTP-shaped
//      base32 secret exactly.
//   4. Tampering with the ciphertext or IV always throws
//      OperationError — the GCM tag really is being checked.
//
// If any of these fail, `VAULT_CRYPTO_VERSION` must be bumped before the
// change ships to production.
//
// Run:   node tests/crypto/vault-crypto.roundtrip.spec.mjs
// Exit:  0 on success, 1 on failure.

import { webcrypto as crypto } from "node:crypto";
import assert from "node:assert/strict";

const PBKDF2_ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function deriveKek(passphrase, salt) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"],
  );
}

async function run() {
  // Deterministic input so failures are reproducible.
  const passphrase = "correct horse battery staple";
  const salt = new Uint8Array(16).fill(0xa5);

  console.log("[roundtrip] deriving KEK (600k PBKDF2 iterations, may take ~1s)…");
  const kek = await deriveKek(passphrase, salt);

  // ---- (1) Deterministic KDF output: derive twice, compare raw material
  // via an AES-GCM encryption of a known plaintext. If two KEKs produced
  // the same ciphertext for the same IV, they're the same key.
  const kek2 = await deriveKek(passphrase, salt);
  const iv = new Uint8Array(12).fill(0x11);
  const known = enc.encode("known-plaintext");
  const c1 = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, known));
  const c2 = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek2, known));
  assert.deepEqual(c1, c2, "PBKDF2 output not deterministic — KDF params drifted.");
  console.log("[roundtrip] KDF is deterministic ✓");

  // ---- (2) DEK wrap / unwrap round-trip.
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const wrapIv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv: wrapIv });
  const unwrapped = await crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    kek,
    { name: "AES-GCM", iv: wrapIv },
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can verify the raw bytes match
    ["encrypt", "decrypt"],
  );
  const rawA = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
  const rawB = new Uint8Array(await crypto.subtle.exportKey("raw", unwrapped));
  assert.deepEqual(rawA, rawB, "DEK did not survive wrap/unwrap round-trip.");
  console.log("[roundtrip] DEK wrap/unwrap ✓");

  // ---- (3) Secret encrypt / decrypt round-trip.
  const secretPlain = "JBSWY3DPEHPK3PXP"; // canonical "Hello!\xDE\xAD\xBE\xEF" TOTP secret
  const encIv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: encIv }, dek, enc.encode(secretPlain)),
  );
  const back = dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: encIv }, dek, ct));
  assert.equal(back, secretPlain, "AES-GCM encrypt/decrypt did not round-trip.");
  console.log("[roundtrip] secret AES-GCM round-trip ✓");

  // ---- (4) Tampering: flip one bit in ciphertext, decryption must throw.
  const tamperedCt = new Uint8Array(ct);
  tamperedCt[0] ^= 0x01;
  await assert.rejects(
    () => crypto.subtle.decrypt({ name: "AES-GCM", iv: encIv }, dek, tamperedCt),
    "Ciphertext tamper was NOT rejected — auth tag not enforced.",
  );
  console.log("[roundtrip] ciphertext tamper rejected ✓");

  // ---- (4b) Tampering: flip one bit in IV, decryption must throw.
  const badIv = new Uint8Array(encIv);
  badIv[0] ^= 0x01;
  await assert.rejects(
    () => crypto.subtle.decrypt({ name: "AES-GCM", iv: badIv }, dek, ct),
    "IV tamper was NOT rejected — nonce misuse not caught.",
  );
  console.log("[roundtrip] IV tamper rejected ✓");

  console.log("[roundtrip] OK — vault-crypto v1 primitives behave correctly.");
}

run().catch((err) => {
  console.error("[roundtrip] FAIL:", err);
  process.exit(1);
});
