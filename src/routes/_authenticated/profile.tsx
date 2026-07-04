import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { lockVault } from "@/lib/vault-session";
import { User, Mail, Loader2, LogOut } from "lucide-react";
import {
  AegisScreen,
  BORDER,
  BrandBar,
  CHARCOAL,
  CREAM_SOFT,
  Display,
  Eyebrow,
  Field,
  GhostButton,
  HeroIcon,
  IconChip,
  Lede,
  MUTED,
  Notice,
  PrimaryButton,
  inputClass,
  inputStyle,
  soft,
} from "@/components/aegis/chrome";
import { AegisMenu } from "@/components/aegis/NavSheet";

export const Route = createFileRoute("/_authenticated/profile")({
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

  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      else setDisplayName(data?.display_name ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          display_name: displayName.trim() || null,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      setNotice({ kind: "info", text: "Profile saved." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    lockVault();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const seed = displayName || user.email || "?";

  return (
    <AegisScreen>
      <BrandBar right={<AegisMenu userEmail={user.email} />} />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={soft}
        className="flex flex-col items-start gap-4 pt-2 pb-6"
      >
        <HeroIcon Icon={User} />
        <div className="flex flex-col gap-2">
          <Eyebrow>Profile</Eyebrow>
          <Display>You.</Display>
          <Lede>How you show up inside Aegis. Nothing here is shared.</Lede>
        </div>
      </motion.div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...soft, delay: 0.05 }}
          className="flex items-center gap-3 rounded-[14px] px-3.5 py-3"
          style={{ background: CREAM_SOFT, border: `1px solid ${BORDER}` }}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-[16px] font-semibold"
            style={{ background: CHARCOAL, color: CREAM_SOFT }}
          >
            {initials(seed)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px]" style={{ color: CHARCOAL, fontWeight: 500 }}>
              {displayName || "Unnamed"}
            </div>
            <div className="truncate text-[12.5px]" style={{ color: MUTED }}>
              {user.email}
            </div>
          </div>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-8" style={{ color: MUTED }}>
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                Display name
              </span>
              <Field icon={<User className="h-4 w-4" strokeWidth={1.6} />} delay={0.05}>
                <input
                  type="text"
                  placeholder="What should we call you?"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={64}
                  className={inputClass}
                  style={inputStyle}
                />
              </Field>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                Email
              </span>
              <Field icon={<Mail className="h-4 w-4" strokeWidth={1.6} />} delay={0.1}>
                <input
                  type="email"
                  value={user.email ?? ""}
                  disabled
                  className={inputClass}
                  style={{ ...inputStyle, opacity: 0.7 }}
                />
              </Field>
            </label>

            {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

            <div className="pt-1">
              <PrimaryButton type="submit" loading={saving}>
                Save changes
              </PrimaryButton>
            </div>
          </form>
        )}

        <div className="mt-2 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: BORDER }} />
          <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>
            Session
          </span>
          <div className="h-px flex-1" style={{ background: BORDER }} />
        </div>

        <GhostButton onClick={signOut} icon={<LogOut className="h-4 w-4" strokeWidth={1.8} />}>
          Sign out
        </GhostButton>
      </div>
    </AegisScreen>
  );
}

// eslint keeps IconChip usage in scope for future avatar upload iteration
void IconChip;
