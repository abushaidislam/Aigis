import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, RotateCcw, Timer, Sparkles, Lock } from "lucide-react";
import { MUTED, Notice } from "@/components/aegis/chrome";
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
