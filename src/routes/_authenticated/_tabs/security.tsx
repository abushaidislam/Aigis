import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  KeyRound,
  RotateCcw,
  Timer,
  Sparkles,
  Lock,
  ShieldCheck,
  Check,
  X,
  FileText,
  EyeOff,
  Fingerprint,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { setHideCodes, useHideCodes } from "@/lib/vault-privacy";
import {
  BORDER,
  CHARCOAL,
  CREAM_SOFT,
  MUTED,
  Notice,
  PrimaryButton,
  soft,
} from "@/components/aegis/chrome";
import {
  LargeTitle,
  SectionLabel,
  SettingsGroup,
  SettingsRow,
} from "@/components/aegis/settings";
import {
  PasswordField,
  StrengthMeter,
  scoreStrength,
} from "@/components/aegis/password-field";
import {
  AUTO_LOCK_OPTIONS,
  getAutoLockMs,
  isVaultUnlocked,
  lockVault,
  setAutoLockMs,
  setVaultKey,
  useAutoLockMs,
} from "@/lib/vault-session";
import {
  KDF_ALGORITHM,
  rewrapVaultKey,
  toBytes,
  toByteaHex,
  unwrapVaultKey,
} from "@/lib/vault-crypto";

export const Route = createFileRoute("/_authenticated/_tabs/security")({
  beforeLoad: ({ location }) => {
    if (!isVaultUnlocked()) {
      throw redirect({ to: "/lock", search: { redirect: location.href } });
    }
  },
  component: SecurityPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found</div>,
});

function autoLockLabel(ms: number | null): string {
  const opt = AUTO_LOCK_OPTIONS.find((o) => o.value === ms);
  return opt ? opt.label : "After 5 minutes of inactivity";
}

function SecurityPage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const autoLockMs = useAutoLockMs();
  const hideCodes = useHideCodes();
  const [hint, setHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoLockOpen, setAutoLockOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("vault_meta")
      .select("passphrase_hint")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setHint(data?.passphrase_hint ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const lockNow = () => {
    lockVault();
    navigate({ to: "/lock", replace: true });
  };

  const resetVault = async () => {
    const ok = window.confirm(
      "Reset your vault?\n\nThis erases your saved passphrase and every stored code. Only do this if you've lost access.",
    );
    if (!ok) return;
    setBusy(true);
    setNotice(null);
    try {
      await supabase.from("vault_accounts").delete().eq("user_id", user.id);
      await supabase.from("vault_meta").delete().eq("user_id", user.id);
      lockVault();
      navigate({ to: "/lock", replace: true });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Reset failed." });
    } finally {
      setBusy(false);
    }
  };

  const currentAutoLockLabel = useMemo(() => autoLockLabel(autoLockMs), [autoLockMs]);

  return (
    <>
      <LargeTitle
        title="Locks & recovery"
        subtitle="Everything protecting your codes lives here."
      />

      <div className="flex flex-col gap-1 pt-1">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={soft}
          className="scroll-fade-out flex shrink-0 items-center gap-3.5 rounded-[16px] px-4 py-4"
          style={{
            background: CREAM_SOFT,
            border: `1px solid ${BORDER}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
            style={{ background: CHARCOAL, color: CREAM_SOFT }}
          >
            <ShieldCheck className="h-6 w-6" strokeWidth={1.7} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-[15px]"
              style={{ color: CHARCOAL, fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              Vault unlocked
            </div>
            <div className="truncate text-[12.5px]" style={{ color: MUTED }}>
              End-to-end encrypted on this device
            </div>
          </div>
        </motion.div>

        <SectionLabel>Vault</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<KeyRound className="h-4 w-4" strokeWidth={1.8} />}
            title="Passphrase hint"
            value={hint ?? "No hint set"}
          />
          <SettingsRow
            icon={<Timer className="h-4 w-4" strokeWidth={1.8} />}
            title="Auto-lock"
            value={currentAutoLockLabel}
            onClick={() => setAutoLockOpen(true)}
            chevron
          />

          <SettingsRow
            icon={<Sparkles className="h-4 w-4" strokeWidth={1.8} />}
            title="Change passphrase"
            description="Rotate your master key without re-adding accounts"
            onClick={() => setChangeOpen(true)}
            chevron
          />
          <SettingsRow
            icon={<FileText className="h-4 w-4" strokeWidth={1.8} />}
            title="Recovery sheet"
            description="Printable backup — accounts list + wrapped key QR"
            onClick={() => navigate({ to: "/vault/recovery" })}
            chevron
          />
        </SettingsGroup>

        <SectionLabel>Privacy</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<EyeOff className="h-4 w-4" strokeWidth={1.8} />}
            title="Hide codes"
            description={
              hideCodes
                ? "Codes stay masked. Tap an account to reveal or copy."
                : "Codes are visible in the vault at a glance."
            }
            onClick={() => {
              const next = !hideCodes;
              setHideCodes(next);
              setNotice({
                kind: "info",
                text: next ? "Codes are now hidden by default." : "Codes are now visible.",
              });
            }}
            trailing={
              <Switch
                checked={hideCodes}
                onCheckedChange={(v) => {
                  setHideCodes(v);
                  setNotice({
                    kind: "info",
                    text: v ? "Codes are now hidden by default." : "Codes are now visible.",
                  });
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label="Hide codes by default"
              />
            }
          />
        </SettingsGroup>

        <SectionLabel>Session</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<Lock className="h-4 w-4" strokeWidth={1.8} />}
            title="Lock vault now"
            description="Require your passphrase to open again"
            onClick={lockNow}
            chevron
          />
        </SettingsGroup>

        <SectionLabel>Danger zone</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<RotateCcw className="h-4 w-4" strokeWidth={1.8} />}
            title="Reset vault"
            description="Erase everything. This cannot be undone."
            onClick={resetVault}
            disabled={busy}
            danger
            chevron
          />
        </SettingsGroup>

        {notice && (
          <div className="pt-3">
            <Notice kind={notice.kind}>{notice.text}</Notice>
          </div>
        )}

        <p
          className="pt-6 text-center text-[11px]"
          style={{ color: MUTED, letterSpacing: "0.02em" }}
        >
          Codes are encrypted on your device. We can't read them.
        </p>
      </div>

      <AnimatePresence>
        {autoLockOpen && (
          <AutoLockSheet
            current={autoLockMs}
            onClose={() => setAutoLockOpen(false)}
            onPick={(opt) => {
              setAutoLockMs(opt.value);
              setAutoLockOpen(false);
              setNotice({ kind: "info", text: `Auto-lock set to “${opt.label.toLowerCase()}”.` });
            }}
          />
        )}
        {changeOpen && (
          <ChangePassphraseSheet
            userId={user.id}
            initialHint={hint}
            onClose={() => setChangeOpen(false)}
            onSaved={(nextHint) => {
              setHint(nextHint);
              setChangeOpen(false);
              setNotice({ kind: "info", text: "Passphrase updated." });
            }}
          />
        )}
      </AnimatePresence>

    </>
  );
}

function ChangePassphraseSheet({
  userId,
  initialHint,
  onClose,
  onSaved,
}: {
  userId: string;
  initialHint: string | null;
  onClose: () => void;
  onSaved: (hint: string | null) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hint, setHint] = useState(initialHint ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit =
    current.length > 0 &&
    next.length >= 10 &&
    scoreStrength(next) >= 2 &&
    next === confirm &&
    next !== current;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!canSubmit) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("vault_meta")
        .select("kdf_salt, recovery_wrapped_key, recovery_wrapped_key_iv, kdf_algorithm")
        .eq("user_id", userId)
        .single();
      if (error) throw error;
      if (data.kdf_algorithm !== KDF_ALGORITHM) {
        throw new Error("Vault was created with a different key algorithm.");
      }
      // Verify current passphrase actually unwraps the DEK.
      try {
        await unwrapVaultKey(
          current,
          toBytes(data.kdf_salt),
          toBytes(data.recovery_wrapped_key),
          toBytes(data.recovery_wrapped_key_iv),
        );
      } catch {
        throw new Error("Current passphrase is incorrect.");
      }
      // Rotate: same DEK, new KEK + salt + iv.
      const { salt, wrappedKey, wrappedKeyIv, kdfAlgorithm } = await rewrapVaultKey(
        current,
        next,
        toBytes(data.kdf_salt),
        toBytes(data.recovery_wrapped_key),
        toBytes(data.recovery_wrapped_key_iv),
      );
      const trimmedHint = hint.trim() ? hint.trim() : null;
      const { error: upErr } = await supabase
        .from("vault_meta")
        .update({
          kdf_salt: toByteaHex(salt),
          kdf_algorithm: kdfAlgorithm,
          recovery_wrapped_key: toByteaHex(wrappedKey),
          recovery_wrapped_key_iv: toByteaHex(wrappedKeyIv),
          passphrase_hint: trimmedHint,
        })
        .eq("user_id", userId);
      if (upErr) throw upErr;
      // Re-unlock with the new passphrase so the in-memory DEK stays valid.
      const freshDek = await unwrapVaultKey(next, salt, wrappedKey, wrappedKeyIv);
      setVaultKey(freshDek);
      onSaved(trimmedHint);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not change passphrase.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.button
        aria-label="Close"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ background: "rgba(28,28,28,0.35)", backdropFilter: "blur(4px)" }}
      />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={soft}
        className="relative z-10 mx-auto w-full max-w-[440px] rounded-t-[22px] px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-5 sm:rounded-[22px]"
        style={{
          background: CREAM_SOFT,
          border: `1px solid ${BORDER}`,
          boxShadow: "0 -12px 40px -12px rgba(0,0,0,0.25)",
        }}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div
              className="text-[18px]"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: CHARCOAL,
              }}
            >
              Change passphrase
            </div>
            <div className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
              Your codes stay put. Only the key that unlocks them changes.
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "rgba(28,28,28,0.06)", color: CHARCOAL }}
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </motion.button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2.5">
          <PasswordField
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            placeholder="Current passphrase"
            autoFocus
          />
          <PasswordField
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            minLength={10}
            placeholder="New passphrase"
            delay={0.05}
          />
          <StrengthMeter value={next} />
          <PasswordField
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            minLength={10}
            placeholder="Confirm new passphrase"
            delay={0.1}
          />
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            maxLength={80}
            placeholder="Optional hint (never the passphrase)"
            className="rounded-[10px] border bg-transparent px-3 py-2.5 text-[13.5px] outline-none"
            style={{ borderColor: BORDER, color: CHARCOAL }}
          />

          {err && <Notice kind="error">{err}</Notice>}
          {next && next === current && (
            <Notice kind="error">The new passphrase must be different.</Notice>
          )}

          <div className="pt-1">
            <PrimaryButton type="submit" loading={saving} disabled={!canSubmit}>
              Update passphrase
            </PrimaryButton>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

type AutoLockOption = (typeof AUTO_LOCK_OPTIONS)[number];

function AutoLockSheet({
  current,
  onClose,
  onPick,
}: {
  current: number | null;
  onClose: () => void;
  onPick: (opt: AutoLockOption) => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.button
        aria-label="Close"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ background: "rgba(28,28,28,0.35)", backdropFilter: "blur(4px)" }}
      />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={soft}
        className="relative z-10 mx-auto w-full max-w-[440px] rounded-t-[22px] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 sm:rounded-[22px]"
        style={{
          background: CREAM_SOFT,
          border: `1px solid ${BORDER}`,
          boxShadow: "0 -12px 40px -12px rgba(0,0,0,0.25)",
        }}
      >
        <div
          aria-hidden
          className="mx-auto mb-3 h-[4px] w-10 rounded-full"
          style={{ background: "rgba(28,28,28,0.15)" }}
        />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className="text-[18px]"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: CHARCOAL,
              }}
            >
              Auto-lock
            </div>
            <div className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
              Lock the vault after a period of inactivity.
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(28,28,28,0.06)", color: CHARCOAL }}
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </motion.button>
        </div>

        <div className="flex flex-col gap-1 pb-1">
          {AUTO_LOCK_OPTIONS.map((opt, i) => {
            const active = opt.value === current;
            return (
              <motion.button
                key={opt.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...soft, delay: 0.02 * i }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onPick(opt)}
                className="flex items-center justify-between rounded-[14px] px-4 py-3.5 text-left"
                style={{
                  background: active ? CHARCOAL : "rgba(28,28,28,0.03)",
                  color: active ? CREAM_SOFT : CHARCOAL,
                  border: `1px solid ${active ? "transparent" : BORDER}`,
                }}
              >
                <span
                  className="text-[14px]"
                  style={{ fontWeight: active ? 600 : 500, letterSpacing: "-0.005em" }}
                >
                  {opt.label}
                </span>
                {active && (
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ background: "rgba(255,255,255,0.14)" }}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

