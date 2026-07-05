// RFC 6238 TOTP golden vectors — cross-verified two ways:
//
//   1) Recompute HOTP from scratch using node:crypto (WebCrypto-equivalent
//      HMAC-SHA1/256/512), so we prove the *algorithm* matches the spec.
//   2) Re-run the same vectors through the `otpauth` npm library that our
//      production code uses via `src/lib/vault-accounts.ts::generateCode`,
//      so we prove our runtime dep does not drift from the spec either.
//
// Vectors are the canonical set from RFC 6238, Appendix B, using the
// documented seeds:
//   SHA1   seed = "12345678901234567890"
//   SHA256 seed = "12345678901234567890123456789012"
//   SHA512 seed = "1234567890123456789012345678901234567890123456789012345678901234"
//
// Run:   node tests/crypto/rfc6238.spec.mjs
// Exit:  0 on success, 1 on any mismatch.

import { createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";

const SHA1_SEED_ASCII   = "12345678901234567890";
const SHA256_SEED_ASCII = "12345678901234567890123456789012";
const SHA512_SEED_ASCII = "1234567890123456789012345678901234567890123456789012345678901234";

// Base32 (RFC 4648, no padding) — the encoding otpauth expects.
function toBase32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 0x1f];
  return out;
}

// HOTP from scratch (RFC 4226 §5.3).
function hotp(seedBytes, counter, digits, algo) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac(algo.replace("SHA", "sha"), seedBytes).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return (truncated % mod).toString().padStart(digits, "0");
}

function totp(seedBytes, atSeconds, period, digits, algo) {
  return hotp(seedBytes, Math.floor(atSeconds / period), digits, algo);
}

const VECTORS = [
  { time:          59, sha1: "94287082", sha256: "46119246", sha512: "90693936" },
  { time:  1111111109, sha1: "07081804", sha256: "68084774", sha512: "25091201" },
  { time:  1111111111, sha1: "14050471", sha256: "67062674", sha512: "99943326" },
  { time:  1234567890, sha1: "89005924", sha256: "91819424", sha512: "93441116" },
  { time:  2000000000, sha1: "69279037", sha256: "90698825", sha512: "38618901" },
  // The RFC's 32-bit time_t overflow vector — must still work on 64-bit systems.
  { time: 20000000000, sha1: "65353130", sha256: "77737706", sha512: "47863826" },
];

async function main() {
  const sha1Seed   = Buffer.from(SHA1_SEED_ASCII,   "ascii");
  const sha256Seed = Buffer.from(SHA256_SEED_ASCII, "ascii");
  const sha512Seed = Buffer.from(SHA512_SEED_ASCII, "ascii");

  // ---- Layer 1: from-scratch HMAC-based TOTP matches every RFC vector.
  let passed = 0;
  for (const v of VECTORS) {
    const g1 = totp(sha1Seed,   v.time, 30, 8, "SHA1");
    const g256 = totp(sha256Seed, v.time, 30, 8, "SHA256");
    const g512 = totp(sha512Seed, v.time, 30, 8, "SHA512");
    assert.equal(g1,   v.sha1,   `SHA1 mismatch at t=${v.time}: got ${g1}, want ${v.sha1}`);
    assert.equal(g256, v.sha256, `SHA256 mismatch at t=${v.time}: got ${g256}, want ${v.sha256}`);
    assert.equal(g512, v.sha512, `SHA512 mismatch at t=${v.time}: got ${g512}, want ${v.sha512}`);
    passed += 3;
  }
  console.log(`[rfc6238] node:crypto layer: ${passed} vectors passed.`);

  // ---- Layer 2: the runtime `otpauth` library agrees on every vector.
  let otpauth;
  try {
    otpauth = await import("otpauth");
  } catch {
    console.warn("[rfc6238] `otpauth` not installed — skipping runtime cross-check.");
    return;
  }

  const secrets = {
    SHA1:   otpauth.Secret.fromBase32(toBase32(sha1Seed)),
    SHA256: otpauth.Secret.fromBase32(toBase32(sha256Seed)),
    SHA512: otpauth.Secret.fromBase32(toBase32(sha512Seed)),
  };

  let libPassed = 0;
  for (const v of VECTORS) {
    for (const algo of ["SHA1", "SHA256", "SHA512"]) {
      const t = new otpauth.TOTP({
        issuer: "test",
        label: "rfc6238",
        algorithm: algo,
        digits: 8,
        period: 30,
        secret: secrets[algo],
      });
      const got = t.generate({ timestamp: v.time * 1000 });
      const want = algo === "SHA1" ? v.sha1 : algo === "SHA256" ? v.sha256 : v.sha512;
      assert.equal(
        got,
        want,
        `otpauth ${algo} mismatch at t=${v.time}: got ${got}, want ${want}`,
      );
      libPassed++;
    }
  }
  console.log(`[rfc6238] otpauth runtime layer: ${libPassed} vectors passed.`);
  console.log("[rfc6238] OK — RFC 6238 conformance held across both layers.");
}

main().catch((err) => {
  console.error("[rfc6238] FAIL:", err);
  process.exit(1);
});
