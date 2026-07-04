import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getVaultKey, lockVault, useActivityKeepAlive, useVaultUnlocked } from "@/lib/vault-session";
import { listAccounts, type DecryptedAccount } from "@/lib/vault-accounts";
import { AccountCard } from "@/components/vault/AccountCard";
import { Shield, LogOut, Lock, Plus, Loader2 } from "lucide-react";

const CREAM = "#f7f4ed";
const CHARCOAL = "#1c1c1a";
const MUTED = "#8a8a86";

export const Route = createFileRoute("/_authenticated/_locked/vault")({
  component: VaultPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found</div>,
});

function VaultPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const unlocked = useVaultUnlocked();

  useActivityKeepAlive();

  const [accounts, setAccounts] = useState<DecryptedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick every 250ms for smooth ring animation.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const key = getVaultKey();
    if (!key) return;
    setError(null);
    listAccounts(key)
      .then((list) => {
        if (!cancelled) setAccounts(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load vault.");
      });
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    lockVault();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const lockNow = () => {
    lockVault();
    navigate({ to: "/lock" });
  };

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: CREAM, color: CHARCOAL }}
    >
      <div className="mx-auto flex h-full w-full max-w-[440px] flex-col px-6 pt-[max(20px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between pb-5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" strokeWidth={1.8} />
            <span className="text-[13px] font-medium tracking-tight">Aegis</span>
          </div>
          <div className="flex items-center gap-1">
            <IconAction onClick={lockNow} icon={<Lock className="h-3.5 w-3.5" strokeWidth={1.8} />} label="Lock" />
            <IconAction onClick={signOut} icon={<LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />} label="Sign out" />
          </div>
        </header>

        <div className="flex items-baseline justify-between pb-4">
          <h1
            className="text-[28px] leading-none tracking-tight"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Your codes.
          </h1>
          {accounts && accounts.length > 0 && (
            <span className="text-[12px]" style={{ color: MUTED }}>
              {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-24">
          {error && (
            <div
              className="rounded-xl px-3 py-2 text-[12.5px]"
              style={{ background: "rgba(180,40,40,0.08)", color: "#8a2020" }}
            >
              {error}
            </div>
          )}

          {accounts === null && !error && (
            <div className="flex items-center justify-center py-12" style={{ color: MUTED }}>
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}

          {accounts && accounts.length === 0 && (
            <EmptyState onAdd={() => navigate({ to: "/vault/new" })} />
          )}

          {accounts && accounts.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {accounts.map((a) => (
                <AccountCard key={a.id} account={a} now={now} />
              ))}
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(20px,env(safe-area-inset-bottom))]">
          <button
            onClick={() => navigate({ to: "/vault/new" })}
            className="pointer-events-auto flex h-12 items-center gap-2 rounded-full px-5 text-[13.5px] font-medium shadow-[0_10px_30px_-8px_rgba(28,28,26,0.35)]"
            style={{ background: CHARCOAL, color: CREAM }}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add account
          </button>
        </div>

        <span className="sr-only" aria-hidden>
          {user.email}
        </span>
      </div>
    </div>
  );
}

function IconAction({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]"
      style={{ color: MUTED }}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "rgba(28,28,26,0.06)" }}
      >
        <Shield className="h-6 w-6" strokeWidth={1.6} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[20px]" style={{ fontFamily: "'Instrument Serif', serif" }}>
          No codes yet.
        </h2>
        <p className="max-w-[260px] text-[13px] leading-relaxed" style={{ color: MUTED }}>
          Add your first account — scan a QR from any service or paste a secret manually.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="mt-2 flex h-11 items-center gap-2 rounded-full px-5 text-[13px] font-medium"
        style={{ background: CHARCOAL, color: CREAM }}
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        Add your first account
      </button>
    </div>
  );
}
