import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  getVaultKey,
  isVaultUnlocked,
  useActivityKeepAlive,
  useVaultUnlocked,
} from "@/lib/vault-session";
import { listAccounts, type DecryptedAccount } from "@/lib/vault-accounts";
import { AccountCard } from "@/components/vault/AccountCard";
import { Shield, Plus, Loader2, Search, X } from "lucide-react";
import {
  BORDER,
  CHARCOAL,
  CREAM_SOFT,
  IconChip,
  MUTED,
  Notice,
  PrimaryButton,
  soft,
} from "@/components/aegis/chrome";
import { AppBar, LargeTitle } from "@/components/aegis/settings";

export const Route = createFileRoute("/_authenticated/_tabs/vault")({
  beforeLoad: ({ location }) => {
    if (!isVaultUnlocked()) {
      throw redirect({ to: "/lock", search: { redirect: location.href } });
    }
  },
  component: VaultPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found</div>,
});

function VaultPage() {
  const navigate = useNavigate();
  const unlocked = useVaultUnlocked();

  useActivityKeepAlive();

  const [accounts, setAccounts] = useState<DecryptedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    if (!accounts) return null;
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.issuer.toLowerCase().includes(q) ||
        a.label.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  return (
    <>
      <AppBar title="Vault" />

      <LargeTitle
        title="Your codes"
        subtitle={
          accounts && accounts.length > 0
            ? `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"} · tap to copy`
            : "One-time codes, encrypted end-to-end."
        }
      />

      {accounts && accounts.length > 0 && (
        <SearchField value={query} onChange={setQuery} />
      )}

      <div className="flex-1 overflow-y-auto pt-2 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {error && <Notice kind="error">{error}</Notice>}

        {accounts === null && !error && (
          <div className="flex items-center justify-center py-16" style={{ color: MUTED }}>
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}

        {accounts && accounts.length === 0 && (
          <EmptyState onAdd={() => navigate({ to: "/vault/new" })} />
        )}

        {filtered && filtered.length > 0 && (
          <div
            className="overflow-hidden rounded-[16px]"
            style={{
              background: CREAM_SOFT,
              border: `1px solid ${BORDER}`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            <AnimatePresence initial={false}>
              <div className="divide-y" style={{ borderColor: BORDER }}>
                {filtered.map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ ...soft, delay: Math.min(i * 0.03, 0.18) }}
                  >
                    <AccountCard account={a} now={now} />
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          </div>
        )}

        {accounts && accounts.length > 0 && filtered && filtered.length === 0 && (
          <div
            className="mt-4 rounded-[14px] px-4 py-6 text-center text-[13px]"
            style={{ background: CREAM_SOFT, border: `1px solid ${BORDER}`, color: MUTED }}
          >
            No account matches "{query}".
          </div>
        )}
      </div>
    </>
  );
}

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5"
      style={{
        background: CREAM_SOFT,
        border: `1px solid ${BORDER}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
      }}
    >
      <Search className="h-4 w-4" strokeWidth={1.8} style={{ color: MUTED }} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search accounts"
        className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[color:rgba(95,95,93,0.7)]"
        style={{ color: CHARCOAL }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{ color: MUTED, background: "rgba(28,28,28,0.06)" }}
          aria-label="Clear search"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={soft}
      className="flex flex-col items-center gap-5 py-16 text-center"
    >
      <IconChip size={56}>
        <Shield className="h-6 w-6" strokeWidth={1.6} />
      </IconChip>
      <div className="flex flex-col items-center gap-1.5">
        <h2
          className="text-[20px]"
          style={{
            color: CHARCOAL,
            fontFamily: "'Sora', sans-serif",
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          No codes yet
        </h2>
        <p className="max-w-[260px] text-[13px]" style={{ color: MUTED }}>
          Scan a QR from any service or paste a secret to add your first account.
        </p>
      </div>
      <div className="w-full max-w-[240px] pt-1">
        <PrimaryButton onClick={onAdd} icon={<Plus className="h-4 w-4" strokeWidth={2} />}>
          Add your first account
        </PrimaryButton>
      </div>
    </motion.div>
  );
}
