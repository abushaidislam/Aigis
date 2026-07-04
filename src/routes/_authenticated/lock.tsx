import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  createNewVaultKey,
  unwrapVaultKey,
  toBytes,
  toByteaHex,
  KDF_ALGORITHM,
} from "@/lib/vault-crypto";
import { setVaultKey } from "@/lib/vault-session";
import {
  disableBiometric,
  enrollBiometric,
  isBiometricEnabled,
  isBiometricPending,
  isBiometricSupported,
  unlockWithBiometric,
} from "@/lib/biometric";
import { Lock, KeyRound, Sparkles, Fingerprint } from "lucide-react";
import {
  AegisScreen,
  BrandBar,
  CHARCOAL,
  CREAM_SOFT,
  Display,
  Eyebrow,
  Field,
  HeroIcon,
  Lede,
  MUTED,
  Notice,
  PrimaryButton,
  TextLink,
  inputClass,
  inputStyle,
  soft,
} from "@/components/aegis/chrome";
import { Loader2 } from "lucide-react";


const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/_authenticated/lock")({
  validateSearch: searchSchema,
  component: LockPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found</div>,
});

type Mode = "loading" | "create" | "unlock";

function safeRedirect(target: string | undefined): string {
  if (!target) return "/vault";
  if (target.startsWith("/") && !target.startsWith("//")) return target;
  return "/vault";
}

function LockPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { user } = Route.useRouteContext();

  const [mode, setMode] = useState<Mode>("loading");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [hint, setHint] = useState("");
  const [passphraseHint, setPassphraseHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = await isBiometricSupported();
      if (cancelled) return;
      setBioAvailable(supported);
      setBioEnrolled(isBiometricEnabled(user.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("vault_meta")
        .select("passphrase_hint")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setNotice({ kind: "error", text: error.message });
        setMode("unlock");
        return;
      }
      if (data) {
        setPassphraseHint(data.passphrase_hint ?? null);
        setMode("unlock");
      } else {
        setMode("create");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const maybeEnrollBiometric = async (dek: CryptoKey) => {
    if (!isBiometricPending()) return;
    if (!(await isBiometricSupported())) return;
    try {
      await enrollBiometric({ userId: user.id, userEmail: user.email ?? user.id, dek });
      setBioEnrolled(true);
    } catch {
      // Silent: they can enable it later from Security settings.
    }
  };

  const consumeImportIntent = () => {
    try {
      const intent = window.localStorage.getItem("aegis.onboarding.intent");
      if (!intent) return null;
      window.localStorage.removeItem("aegis.onboarding.intent");
      return intent;
    } catch {
      return null;
    }
  };

  const routeAfterUnlock = () => {
    const intent = consumeImportIntent();
    if (intent === "scan" || intent === "manual") {
      navigate({ to: "/vault/new", replace: true });
    } else {
      navigate({ to: safeRedirect(search.redirect), replace: true });
    }
  };


  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (passphrase.length < 10) {
      setNotice({ kind: "error", text: "Use at least 10 characters." });
      return;
    }
    if (passphrase !== confirmPass) {
      setNotice({ kind: "error", text: "The two passphrases don't match." });
      return;
    }
    setLoading(true);
    try {
      const { salt, wrappedKey, wrappedKeyIv, dek, kdfAlgorithm } = await createNewVaultKey(passphrase);
      const { error } = await supabase.from("vault_meta").insert({
        user_id: user.id,
        kdf_salt: toByteaHex(salt),
        kdf_algorithm: kdfAlgorithm,
        recovery_wrapped_key: toByteaHex(wrappedKey),
        recovery_wrapped_key_iv: toByteaHex(wrappedKeyIv),
        passphrase_hint: hint.trim() ? hint.trim() : null,
      });
      if (error) throw error;
      setVaultKey(dek);
      await maybeEnrollBiometric(dek);
      routeAfterUnlock();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not create vault." });
    } finally {
      setLoading(false);
    }
  };


  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vault_meta")
        .select("kdf_salt, recovery_wrapped_key, recovery_wrapped_key_iv, kdf_algorithm")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      if (data.kdf_algorithm !== KDF_ALGORITHM) {
        throw new Error("Vault was created with a different key algorithm.");
      }
      const dek = await unwrapVaultKey(
        passphrase,
        toBytes(data.kdf_salt),
        toBytes(data.recovery_wrapped_key),
        toBytes(data.recovery_wrapped_key_iv),
      );
      setVaultKey(dek);
      await maybeEnrollBiometric(dek);
      routeAfterUnlock();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not unlock.";
      setNotice({
        kind: "error",
        text: /operation-specific reason|OperationError|decrypt/i.test(msg)
          ? "That passphrase didn't match."
          : msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    setNotice(null);
    setBioBusy(true);
    try {
      const dek = await unlockWithBiometric(user.id);
      setVaultKey(dek);
      routeAfterUnlock();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Biometric unlock failed.";
      // If the stored blob is broken (e.g. cleared), drop it so user isn't stuck.
      if (/isn't set up|NotAllowed|InvalidState/i.test(msg)) {
        disableBiometric(user.id);
        setBioEnrolled(false);
      }
      setNotice({
        kind: "error",
        text: /NotAllowed/i.test(msg)
          ? "Biometric check was cancelled."
          : msg,
      });
    } finally {
      setBioBusy(false);
    }
  };


  if (mode === "loading") {
    return (
      <AegisScreen>
        <BrandBar />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin opacity-60" />
        </div>
      </AegisScreen>
    );
  }

  const isCreate = mode === "create";

  return (
    <AegisScreen>
      <BrandBar />
      <div className="flex flex-1 flex-col justify-center gap-6 pt-2">
        <div className="flex flex-col items-start gap-4">
          <HeroIcon Icon={isCreate ? Sparkles : Lock} />
          <div className="flex flex-col gap-2.5">
            <Eyebrow>{isCreate ? "One-time setup" : "Locked vault"}</Eyebrow>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={soft}
                className="flex flex-col gap-2"
              >
                <Display>{isCreate ? "Set your master passphrase." : "Welcome back."}</Display>
                <Lede>
                  {isCreate
                    ? "This key never leaves your device. Aegis can't recover it — remember it well."
                    : "Enter your master passphrase to unlock your codes."}
                </Lede>
              </motion.div>
            </AnimatePresence>
            {!isCreate && passphraseHint && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="text-[12.5px]"
                style={{ color: MUTED }}
              >
                Hint: <span style={{ color: CHARCOAL }}>{passphraseHint}</span>
              </motion.p>
            )}
          </div>
        </div>

        <form onSubmit={isCreate ? handleCreate : handleUnlock} className="flex flex-col gap-2.5">
          <Field icon={<Lock className="h-4 w-4" strokeWidth={1.6} />} delay={0.05}>
            <input
              type="password"
              autoComplete={isCreate ? "new-password" : "current-password"}
              autoFocus
              required
              minLength={isCreate ? 10 : 1}
              placeholder={isCreate ? "Create a memorable passphrase" : "Master passphrase"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          {isCreate && (
            <>
              <Field icon={<Lock className="h-4 w-4" strokeWidth={1.6} />} delay={0.1}>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  placeholder="Confirm passphrase"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
              <Field icon={<KeyRound className="h-4 w-4" strokeWidth={1.6} />} delay={0.15}>
                <input
                  type="text"
                  placeholder="Optional hint (never the passphrase)"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  maxLength={80}
                />
              </Field>
            </>
          )}

          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

          <div className="pt-1">
            <PrimaryButton type="submit" loading={loading}>
              {isCreate ? "Create vault" : "Unlock"}
            </PrimaryButton>
          </div>

          {!isCreate && bioEnrolled && bioAvailable && (
            <motion.button
              type="button"
              onClick={handleBiometricUnlock}
              disabled={bioBusy || loading}
              whileTap={{ scale: 0.985, opacity: 0.9 }}
              transition={soft}
              className="mt-1 flex h-[44px] w-full items-center justify-center gap-2 rounded-[10px] text-[14px] disabled:opacity-60"
              style={{
                background: CREAM_SOFT,
                color: CHARCOAL,
                border: `1px solid rgba(28,28,28,0.12)`,
                fontWeight: 500,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
              }}
            >
              {bioBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Fingerprint className="h-4 w-4" strokeWidth={1.8} />
                  <span>Unlock with biometrics</span>
                </>
              )}
            </motion.button>
          )}

          {isCreate && bioAvailable && isBiometricPending() && (
            <p
              className="pt-1 text-center text-[11.5px]"
              style={{ color: MUTED }}
            >
              We'll set up Face ID / fingerprint right after your vault is created.
            </p>
          )}
        </form>


        {isCreate ? (
          <p className="text-center text-[11.5px] leading-snug" style={{ color: MUTED }}>
            If you forget this passphrase, your codes cannot be recovered.
            <br />
            A printable recovery sheet is coming in a later step.
          </p>
        ) : (
          <div className="text-center">
            <TextLink
              onClick={async () => {
                const ok = window.confirm(
                  "Reset your vault?\n\nThis erases your saved passphrase and every stored code. Only do this if you've lost access.",
                );
                if (!ok) return;
                setLoading(true);
                setNotice(null);
                try {
                  await supabase.from("vault_accounts").delete().eq("user_id", user.id);
                  await supabase.from("vault_meta").delete().eq("user_id", user.id);
                  disableBiometric(user.id);
                  setBioEnrolled(false);
                  setPassphrase("");
                  setPassphraseHint(null);
                  setMode("create");

                } catch (err) {
                  setNotice({ kind: "error", text: err instanceof Error ? err.message : "Reset failed." });
                } finally {
                  setLoading(false);
                }
              }}
            >
              Forgot passphrase? Reset vault
            </TextLink>
          </div>
        )}
      </div>
    </AegisScreen>
  );
}

