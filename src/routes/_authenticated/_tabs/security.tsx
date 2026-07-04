import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, RotateCcw, Timer, Sparkles, Lock, ShieldCheck } from "lucide-react";
import { BORDER, CHARCOAL, CREAM_SOFT, MUTED, Notice, soft } from "@/components/aegis/chrome";
import {
  AppBar,
  LargeTitle,
  SectionLabel,
  SettingsGroup,
  SettingsRow,
} from "@/components/aegis/settings";
import { isVaultUnlocked, lockVault } from "@/lib/vault-session";

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

function SecurityPage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [hint, setHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <AppBar title="Security" />

      <LargeTitle
        title="Locks & recovery"
        subtitle="Everything protecting your codes lives here."
      />

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto pt-1 pb-[calc(96px+env(safe-area-inset-bottom))]">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={soft}
          className="flex items-center gap-3.5 rounded-[16px] px-4 py-4"
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
            value="After 5 minutes of inactivity"
          />
          <SettingsRow
            icon={<Sparkles className="h-4 w-4" strokeWidth={1.8} />}
            title="Change passphrase"
            description="Rotate your master key without re-adding accounts"
            badge="Soon"
            disabled
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
    </>
  );
}
