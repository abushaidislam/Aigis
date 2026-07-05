import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { lockVault } from "@/lib/vault-session";
import { deleteMyAccount } from "@/lib/account.functions";
import { User, Mail, Loader2, LogOut, Check, Pencil, Trash2 } from "lucide-react";
import {
  BORDER,
  CHARCOAL,
  CREAM_SOFT,
  MUTED,
  Notice,
  soft,
} from "@/components/aegis/chrome";
import {

  LargeTitle,
  SectionLabel,
  SettingsGroup,
  SettingsRow,
} from "@/components/aegis/settings";

export const Route = createFileRoute("/_authenticated/_tabs/profile")({
  component: ProfilePage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found</div>,
});

function initials(source: string): string {
  const s = source.trim();
  if (!s) return "?";
  const parts = s.split(/[\s._@-]+/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : s.slice(0, 2);
  return chars.toUpperCase();
}

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const deleteAccount = useServerFn(deleteMyAccount);

  const [displayName, setDisplayName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) setNotice({ kind: "error", text: error.message });
      else {
        const v = data?.display_name ?? "";
        setDisplayName(v);
        setInitialName(v);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("profiles").upsert(
        { id: user.id, display_name: displayName.trim() || null },
        { onConflict: "id" },
      );
      if (error) throw error;
      setInitialName(displayName);
      setEditing(false);
      setNotice({ kind: "info", text: "Profile saved." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setDisplayName(initialName);
    setEditing(false);
    setNotice(null);
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    lockVault();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleDelete = async () => {
    const email = user.email ?? "your account";
    const ok = window.confirm(
      `Permanently delete ${email}?\n\nThis erases every stored code, your passphrase, and your account itself. It cannot be undone.`,
    );
    if (!ok) return;
    const confirmText = window.prompt('Type "delete" to confirm.');
    if (confirmText?.trim().toLowerCase() !== "delete") return;
    setDeleting(true);
    setNotice(null);
    try {
      await deleteAccount();
      await queryClient.cancelQueries();
      queryClient.clear();
      lockVault();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not delete account.",
      });
      setDeleting(false);
    }
  };

  const seed = displayName || user.email || "?";
  const displayShown = initialName || "Unnamed";

  return (
    <>

      <LargeTitle title="Account" subtitle="How you show up inside Aegis." />

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
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[16px]"
            style={{
              background: CHARCOAL,
              color: CREAM_SOFT,
              fontFamily: "'Sora', sans-serif",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {initials(seed)}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-[15px]"
              style={{ color: CHARCOAL, fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              {displayShown}
            </div>
            <div className="truncate text-[12.5px]" style={{ color: MUTED }}>
              {user.email}
            </div>
          </div>
        </motion.div>

        <SectionLabel>Personal</SectionLabel>
        <SettingsGroup>
          {loading ? (
            <div className="flex items-center justify-center py-6" style={{ color: MUTED }}>
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : editing ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "rgba(28,28,28,0.05)",
                  color: CHARCOAL,
                  border: `1px solid ${BORDER}`,
                }}
              >
                <User className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <input
                autoFocus
                type="text"
                value={displayName}
                maxLength={64}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none"
                style={{ color: CHARCOAL, fontWeight: 500 }}
              />
              <button
                onClick={cancelEdit}
                className="text-[12px]"
                style={{ color: MUTED }}
              >
                Cancel
              </button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={save}
                disabled={saving}
                className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-60"
                style={{ background: CHARCOAL, color: CREAM_SOFT }}
                aria-label="Save"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                )}
              </motion.button>
            </div>
          ) : (
            <SettingsRow
              icon={<User className="h-4 w-4" strokeWidth={1.8} />}
              title="Display name"
              value={initialName || "Not set"}
              onClick={() => setEditing(true)}
              trailing={<Pencil className="h-3.5 w-3.5" strokeWidth={1.8} style={{ color: MUTED }} />}
            />
          )}
          <SettingsRow
            icon={<Mail className="h-4 w-4" strokeWidth={1.8} />}
            title="Email"
            value={user.email ?? ""}
          />
        </SettingsGroup>

        {notice && (
          <div className="pt-3">
            <Notice kind={notice.kind}>{notice.text}</Notice>
          </div>
        )}

        <SectionLabel>Session</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<LogOut className="h-4 w-4" strokeWidth={1.8} />}
            title="Sign out"
            description="You'll need to sign in and unlock again"
            onClick={signOut}
            danger
            chevron
          />
        </SettingsGroup>
      </div>
    </>
  );
}
