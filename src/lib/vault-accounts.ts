// Vault accounts: TOTP parsing, encryption, and CRUD helpers layered over
// the client-side DEK. Nothing here talks to the server without going
// through Supabase RLS as the authenticated user.

import * as OTPAuth from "otpauth";
import { supabase } from "@/integrations/supabase/client";
import { decryptSecret, encryptSecret, toBytes } from "@/lib/vault-crypto";

export type Algorithm = "SHA1" | "SHA256" | "SHA512";

export interface VaultAccountRecord {
  id: string;
  issuer: string;
  label: string;
  icon_slug: string | null;
  algorithm: Algorithm;
  digits: number;
  period: number;
  sort_order: number;
  secret_ciphertext: unknown;
  secret_iv: unknown;
}

export interface DecryptedAccount {
  id: string;
  issuer: string;
  label: string;
  algorithm: Algorithm;
  digits: number;
  period: number;
  sort_order: number;
  secret: string; // base32
}

export interface ParsedOtpauth {
  issuer: string;
  label: string;
  secret: string;
  algorithm: Algorithm;
  digits: number;
  period: number;
}

const BASE32_RE = /^[A-Z2-7]+=*$/i;

function normalizeBase32(s: string): string {
  return s.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidBase32Secret(s: string): boolean {
  const clean = normalizeBase32(s);
  return clean.length >= 16 && BASE32_RE.test(clean);
}

export function parseOtpauthUri(uri: string): ParsedOtpauth {
  const totp = OTPAuth.URI.parse(uri);
  if (!(totp instanceof OTPAuth.TOTP)) {
    throw new Error("Only TOTP codes are supported.");
  }
  const algorithm = (totp.algorithm.toUpperCase() as Algorithm) ?? "SHA1";
  return {
    issuer: (totp.issuer || "").trim(),
    label: (totp.label || "").trim(),
    secret: totp.secret.base32,
    algorithm: (["SHA1", "SHA256", "SHA512"].includes(algorithm) ? algorithm : "SHA1") as Algorithm,
    digits: totp.digits ?? 6,
    period: totp.period ?? 30,
  };
}

export function generateCode(account: DecryptedAccount, at: number = Date.now()): string {
  const totp = new OTPAuth.TOTP({
    issuer: account.issuer,
    label: account.label,
    algorithm: account.algorithm,
    digits: account.digits,
    period: account.period,
    secret: OTPAuth.Secret.fromBase32(normalizeBase32(account.secret)),
  });
  return totp.generate({ timestamp: at });
}

export async function addAccount(
  dek: CryptoKey,
  userId: string,
  input: {
    issuer: string;
    label: string;
    secret: string;
    algorithm?: Algorithm;
    digits?: number;
    period?: number;
    icon_slug?: string | null;
  },
): Promise<void> {
  const clean = normalizeBase32(input.secret);
  if (!isValidBase32Secret(clean)) throw new Error("Invalid secret. Must be base32.");

  const { ciphertext, iv } = await encryptSecret(dek, clean);

  const { error } = await supabase.from("vault_accounts").insert({
    user_id: userId,
    issuer: input.issuer.trim(),
    label: input.label.trim(),
    icon_slug: input.icon_slug ?? null,
    algorithm: input.algorithm ?? "SHA1",
    digits: input.digits ?? 6,
    period: input.period ?? 30,
    secret_ciphertext: ciphertext as unknown as string,
    secret_iv: iv as unknown as string,
  });
  if (error) throw error;
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from("vault_accounts").delete().eq("id", id);
  if (error) throw error;
}

export async function listAccounts(dek: CryptoKey): Promise<DecryptedAccount[]> {
  const { data, error } = await supabase
    .from("vault_accounts")
    .select("id, issuer, label, icon_slug, algorithm, digits, period, sort_order, secret_ciphertext, secret_iv")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as VaultAccountRecord[];
  const decrypted = await Promise.all(
    rows.map(async (r) => {
      const secret = await decryptSecret(dek, toBytes(r.secret_ciphertext), toBytes(r.secret_iv));
      return {
        id: r.id,
        issuer: r.issuer,
        label: r.label,
        algorithm: r.algorithm,
        digits: r.digits,
        period: r.period,
        sort_order: r.sort_order,
        secret,
      } satisfies DecryptedAccount;
    }),
  );
  return decrypted;
}
