import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, KeyRound, RotateCcw, Timer, Sparkles } from "lucide-react";
import {
  AegisScreen,
  BORDER,
  BrandBar,
  CHARCOAL,
  CREAM_SOFT,
  Display,
  Eyebrow,
  HeroIcon,
  IconChip,
  Lede,
  MUTED,
  Notice,
  soft,
} from "@/components/aegis/chrome";
import { AegisMenu } from "@/components/aegis/NavSheet";
import { motion } from "framer-motion";
import { lockVault } from "@/lib/vault-session";

export const Route = createFileRoute("/_authenticated/_locked/security")({
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
    <AegisScreen>
      <BrandBar right={<AegisMenu userEmail={user.email} />} />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={soft}
        className="flex flex-col items-start gap-4 pt-2 pb-6"
      >
        <HeroIcon Icon={ShieldCheck} />
        <div className="flex flex-col gap-2">
          <Eyebrow>Security</Eyebrow>
          <Display>Locks & recovery.</Display>
          <Lede>Everything protecting your codes lives here.</Lede>
        </div>
      </motion.div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-6">
        <InfoRow
          icon={<KeyRound className="h-4 w-4" strokeWidth={1.8} />}
          title="Passphrase hint"
          body={hint ?? "No hint set. Add one next time you reset."}
        />
        <InfoRow
          icon={<Timer className="h-4 w-4" strokeWidth={1.8} />}
          title="Auto-lock"
          body="Your vault locks itself after 5 minutes of inactivity."
        />
        <ActionRow
          icon={<Sparkles className="h-4 w-4" strokeWidth={1.8} />}
          title="Change passphrase"
          body="Rotate your master key without re-adding accounts."
          badge="Coming soon"
          disabled
        />
        <ActionRow
          icon={<RotateCcw className="h-4 w-4" strokeWidth={1.8} />}
          title="Reset vault"
          body="Erase your passphrase and all stored codes. Cannot be undone."
          danger
          onClick={resetVault}
          disabled={busy}
        />
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      </div>
    </AegisScreen>
  );
}

function InfoRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-[14px] px-3.5 py-3"
      style={{ background: CREAM_SOFT, border: `1px solid ${BORDER}` }}
    >
      <IconChip size={36}>{icon}</IconChip>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[13.5px]" style={{ color: CHARCOAL, fontWeight: 500 }}>
          {title}
        </div>
        <div className="mt-0.5 text-[12.5px] leading-[1.45]" style={{ color: MUTED }}>
          {body}
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  body,
  onClick,
  disabled,
  danger,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  badge?: string;
}) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.99 }}
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-3 rounded-[14px] px-3.5 py-3 text-left disabled:opacity-60"
      style={{
        background: CREAM_SOFT,
        border: `1px solid ${danger ? "rgba(180,40,40,0.25)" : BORDER}`,
      }}
    >
      <IconChip size={36}>
        <span style={{ color: danger ? "#8a2020" : CHARCOAL }}>{icon}</span>
      </IconChip>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2">
          <span
            className="text-[13.5px]"
            style={{ color: danger ? "#8a2020" : CHARCOAL, fontWeight: 500 }}
          >
            {title}
          </span>
          {badge && (
            <span
              className="rounded-full px-1.5 py-[1px] text-[9px] uppercase tracking-[0.14em]"
              style={{
                background: "rgba(28,28,28,0.06)",
                color: MUTED,
                border: `1px solid ${BORDER}`,
                fontWeight: 500,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12.5px] leading-[1.45]" style={{ color: MUTED }}>
          {body}
        </div>
      </div>
    </motion.button>
  );
}
