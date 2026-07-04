/**
 * Biometric unlock for Aegis vault.
 *
 * On the web there is no OS-level secure enclave the way native iOS/Android
 * offers. So this module uses a two-part pragmatic scheme:
 *
 * 1. WebAuthn platform authenticator (Face ID / Touch ID / Windows Hello) is
 *    registered per (user, device). Calling `navigator.credentials.get()`
 *    with `userVerification: "required"` will force the OS biometric prompt
 *    before returning an assertion.
 * 2. A random 256-bit AES wrap key + the DEK wrapped by it are stored in
 *    localStorage. They are only READ after a successful WebAuthn assertion.
 *
 * Losing WebAuthn (device wipe, cleared site data) still leaves the
 * passphrase as the source of truth — nothing is uploaded.
 */

import { randomBytes } from "@/lib/vault-crypto";

const BIO_STORAGE_PREFIX = "aegis.bio.v1.";
const BIO_PENDING_KEY = "aegis.bio.pending";

interface StoredCredential {
  credentialId: string; // base64url
  wrapKey: string; // base64
  wrappedDek: string; // base64
  wrappedDekIv: string; // base64
  createdAt: number;
}

/* ---------------- base64 helpers ---------------- */

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64Url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  return b64ToBytes(b64url.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

/* ---------------- support detection ---------------- */

export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  try {
    const available =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return !!available;
  } catch {
    return false;
  }
}

export function isBiometricEnabled(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(BIO_STORAGE_PREFIX + userId);
}

/* ---------------- pending flag (set in onboarding) ---------------- */

export function markBiometricPending() {
  try {
    window.localStorage.setItem(BIO_PENDING_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearBiometricPending() {
  try {
    window.localStorage.removeItem(BIO_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function isBiometricPending(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BIO_PENDING_KEY) === "1";
}

/* ---------------- crypto helpers ---------------- */

async function wrapDekWithRandomKey(dek: CryptoKey): Promise<{
  wrapKey: Uint8Array;
  wrappedDek: Uint8Array;
  iv: Uint8Array;
}> {
  const wrapKeyBytes = randomBytes(32);
  const wrapKey = await crypto.subtle.importKey(
    "raw",
    wrapKeyBytes as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, wrapKey, {
    name: "AES-GCM",
    iv: iv as unknown as BufferSource,
  });
  return { wrapKey: wrapKeyBytes, wrappedDek: new Uint8Array(wrapped), iv };
}

async function unwrapDekFromStored(stored: StoredCredential): Promise<CryptoKey> {
  const wrapKey = await crypto.subtle.importKey(
    "raw",
    b64ToBytes(stored.wrapKey) as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
  const iv = b64ToBytes(stored.wrappedDekIv);
  return crypto.subtle.unwrapKey(
    "raw",
    b64ToBytes(stored.wrappedDek) as unknown as BufferSource,
    wrapKey,
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ---------------- enroll ---------------- */

export async function enrollBiometric(params: {
  userId: string;
  userEmail: string;
  dek: CryptoKey;
}): Promise<void> {
  if (!(await isBiometricSupported())) {
    throw new Error("Biometric authentication isn't available on this device.");
  }

  const challenge = randomBytes(32);
  const userIdBytes = new TextEncoder().encode(params.userId);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge as unknown as BufferSource,
      rp: {
        name: "Aegis",
        id: window.location.hostname,
      },
      user: {
        id: userIdBytes as unknown as BufferSource,
        name: params.userEmail,
        displayName: params.userEmail,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Enrollment was cancelled.");

  const { wrapKey, wrappedDek, iv } = await wrapDekWithRandomKey(params.dek);

  const stored: StoredCredential = {
    credentialId: bytesToB64Url(new Uint8Array(credential.rawId)),
    wrapKey: bytesToB64(wrapKey),
    wrappedDek: bytesToB64(wrappedDek),
    wrappedDekIv: bytesToB64(iv),
    createdAt: Date.now(),
  };

  window.localStorage.setItem(BIO_STORAGE_PREFIX + params.userId, JSON.stringify(stored));
  clearBiometricPending();
}

/* ---------------- unlock ---------------- */

export async function unlockWithBiometric(userId: string): Promise<CryptoKey> {
  const raw = window.localStorage.getItem(BIO_STORAGE_PREFIX + userId);
  if (!raw) throw new Error("Biometrics isn't set up on this device.");
  const stored: StoredCredential = JSON.parse(raw);

  const challenge = randomBytes(32);
  const credentialId = b64UrlToBytes(stored.credentialId);

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as unknown as BufferSource,
      allowCredentials: [
        {
          id: credentialId as unknown as BufferSource,
          type: "public-key",
          transports: ["internal"],
        },
      ],
      userVerification: "required",
      timeout: 60_000,
      rpId: window.location.hostname,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Biometric check was cancelled.");

  // The assertion succeeded and the browser confirmed userVerification.
  // Safe to unwrap the DEK.
  return unwrapDekFromStored(stored);
}

/* ---------------- disable / reset ---------------- */

export function disableBiometric(userId: string): void {
  try {
    window.localStorage.removeItem(BIO_STORAGE_PREFIX + userId);
  } catch {
    /* ignore */
  }
}
