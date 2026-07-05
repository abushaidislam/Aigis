// Vault crypto: PBKDF2 (SHA-256, 600k iterations — OWASP baseline) key
// derivation, AES-GCM wrap/unwrap for the Data Encryption Key (DEK), and
// AES-GCM secret encryption. All primitives are WebCrypto — no extra deps.
//
// -----------------------------------------------------------------------
//   VERSIONING RULE — READ BEFORE EDITING
// -----------------------------------------------------------------------
// This module is **version-locked**. Any change to a stored-form primitive
// (KDF algorithm, iteration count, salt length, wrap algorithm, IV length,
// AAD binding) MUST bump `VAULT_CRYPTO_VERSION` and MUST ship with a
// migrator that can decrypt old ciphertext and re-encrypt under the new
// version. Callers should treat `VAULT_CRYPTO_VERSION` as the ground-truth
// identifier of "which shape of crypto produced this row".
//
// v1 (current):
//   KDF        = PBKDF2-HMAC-SHA-256, 600 000 iterations
//   salt       = 16 random bytes / user (`vault_meta.kdf_salt`)
//   KEK / DEK  = AES-256-GCM
//   IV         = 96 random bits per encryption / wrap
//   Encoding   = UTF-8 after NFKC normalisation of the passphrase
//
// v2 (planned, `plan.md` Phase 2):
//   KDF        = Argon2id (m=64MiB, t=3, p=1, hashLen=32)  ← storage shape
//                unchanged; only `kdf_algorithm` metadata + this constant
//                need to move.
//
// See also: SECURITY.md, tests/crypto/ (RFC 6238 + AES-GCM golden vectors).
// -----------------------------------------------------------------------

export const VAULT_CRYPTO_VERSION = 1;

const PBKDF2_ITERATIONS = 600_000;
const KDF_ALGO = "PBKDF2-SHA256-600k";

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ALGORITHM = KDF_ALGO;

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

async function deriveKekFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"],
  );
}

export async function createNewVaultKey(passphrase: string): Promise<{
  salt: Uint8Array;
  wrappedKey: Uint8Array;
  wrappedKeyIv: Uint8Array;
  dek: CryptoKey;
  kdfAlgorithm: string;
}> {
  const salt = randomBytes(16);
  const kek = await deriveKekFromPassphrase(passphrase, salt);

  const dek = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can wrap it
    ["encrypt", "decrypt"],
  );

  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: "AES-GCM",
    iv: iv as unknown as BufferSource,
  });

  // Re-import DEK as non-extractable for runtime use.
  const rawDek = await crypto.subtle.exportKey("raw", dek);
  const runtimeDek = await crypto.subtle.importKey(
    "raw",
    rawDek,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return {
    salt,
    wrappedKey: new Uint8Array(wrapped),
    wrappedKeyIv: iv,
    dek: runtimeDek,
    kdfAlgorithm: KDF_ALGO,
  };
}

export async function unwrapVaultKey(
  passphrase: string,
  salt: Uint8Array,
  wrappedKey: Uint8Array,
  wrappedKeyIv: Uint8Array,
): Promise<CryptoKey> {
  const kek = await deriveKekFromPassphrase(passphrase, salt);
  return crypto.subtle.unwrapKey(
    "raw",
    wrappedKey as unknown as BufferSource,
    kek,
    { name: "AES-GCM", iv: wrappedKeyIv as unknown as BufferSource },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Rotate the master passphrase without changing the DEK itself. The DEK
// stays the same, so every existing ciphertext in `vault_accounts` remains
// valid — we only re-wrap it with a fresh KEK derived from the new
// passphrase and a fresh salt.
export async function rewrapVaultKey(
  currentPassphrase: string,
  newPassphrase: string,
  currentSalt: Uint8Array,
  currentWrappedKey: Uint8Array,
  currentWrappedKeyIv: Uint8Array,
): Promise<{
  salt: Uint8Array;
  wrappedKey: Uint8Array;
  wrappedKeyIv: Uint8Array;
  kdfAlgorithm: string;
}> {
  const oldKek = await deriveKekFromPassphrase(currentPassphrase, currentSalt);
  // Unwrap DEK as extractable so we can re-wrap it under the new KEK.
  const dek = await crypto.subtle.unwrapKey(
    "raw",
    currentWrappedKey as unknown as BufferSource,
    oldKek,
    { name: "AES-GCM", iv: currentWrappedKeyIv as unknown as BufferSource },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const newSalt = randomBytes(16);
  const newKek = await deriveKekFromPassphrase(newPassphrase, newSalt);
  const newIv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, newKek, {
    name: "AES-GCM",
    iv: newIv as unknown as BufferSource,
  });
  return {
    salt: newSalt,
    wrappedKey: new Uint8Array(wrapped),
    wrappedKeyIv: newIv,
    kdfAlgorithm: KDF_ALGO,
  };
}

export async function encryptSecret(
  dek: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    dek,
    enc.encode(plaintext),
  );
  return { ciphertext: new Uint8Array(ct), iv };
}

export async function decryptSecret(
  dek: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    dek,
    ciphertext as unknown as BufferSource,
  );
  return dec.decode(pt);
}

// Supabase `bytea` round-trips as either a Uint8Array (already binary) or a
// hex-prefixed string like "\\x0102..", or a base64 string. Normalize all.
export function toBytes(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === "string") {
    if (input.startsWith("\\x") || /^[0-9a-fA-F]+$/.test(input)) {
      const hex = input.startsWith("\\x") ? input.slice(2) : input;
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    }
    // Fallback: base64
    const bin = atob(input);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (input && typeof input === "object" && "type" in (input as object) && (input as { type?: string }).type === "Buffer") {
    return new Uint8Array((input as { data: number[] }).data);
  }
  throw new Error("Unsupported bytea payload");
}

// Encode Uint8Array as Postgres bytea hex literal ("\x0102..") — the format
// PostgREST accepts on insert. Passing a Uint8Array directly to supabase-js
// gets JSON-stringified into {"0":1,...} which silently corrupts the row.
export function toByteaHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return "\\x" + hex;
}

