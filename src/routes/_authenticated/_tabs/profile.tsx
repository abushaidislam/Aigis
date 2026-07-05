import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { lockVault } from "@/lib/vault-session";
import { deleteMyAccount } from "@/lib/account.functions";
import { avatarPathFor, fileToSquareJpeg } from "@/lib/avatar";
import {
  User,
  Mail,
  Loader2,
  LogOut,
  Check,
  Pencil,
  Trash2,
  Camera,
  X,
} from "lucide-react";
import {
  BORDER,
  CHARCOAL,
  CREAM_SOFT,
  DANGER,
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
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) setNotice({ kind: "error", text: error.message });
      else {
        const v = data?.display_name ?? "";
        setDisplayName(v);
        setInitialName(v);
        setAvatarPath(data?.avatar_url ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Refresh the signed URL whenever the stored path changes. Signed URLs
  // are the read path because the avatars bucket is private.
  useEffect(() => {
    let cancelled = false;
    if (!avatarPath) {
      setAvatarUrl(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(avatarPath, 60 * 60);
      if (cancelled) return;
      if (error) setAvatarUrl(null);
      else setAvatarUrl(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

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

  const openAvatarSheet = () => {
    if (avatarBusy) return;
    setAvatarSheet(true);
  };

  const pickAvatarFile = () => {
    setAvatarSheet(false);
    // Give the sheet a beat to close before the OS picker steals focus.
    setTimeout(() => fileRef.current?.click(), 60);
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    setNotice(null);
    try {
      const blob = await fileToSquareJpeg(file);
      const path = avatarPathFor(user.id);
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error: profErr } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_url: path }, { onConflict: "id" });
      if (profErr) throw profErr;
      // Force signed-URL refresh by re-setting the path (cache-bust via query).
      setAvatarPath(`${path}?v=${Date.now()}`);
      // Then normalize back to the real path so future updates work.
      setTimeout(() => setAvatarPath(path), 50);
      setNotice({ kind: "info", text: "Photo updated." });
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not upload photo.",
      });
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarSheet(false);
    if (!avatarPath || avatarBusy) return;
    setAvatarBusy(true);
    setNotice(null);
    try {
      const cleanPath = avatarPath.split("?")[0];
      await supabase.storage.from("avatars").remove([cleanPath]);
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_url: null }, { onConflict: "id" });
      if (error) throw error;
      setAvatarPath(null);
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not remove photo.",
      });
    } finally {
      setAvatarBusy(false);
    }
  };

  const seed = displayName || user.email || "?";
  const displayShown = initialName || "Unnamed";
  const hasAvatar = !!avatarPath;

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
          <motion.button
            type="button"
            onClick={openAvatarSheet}
            whileTap={{ scale: 0.96 }}
            disabled={avatarBusy}
            aria-label={hasAvatar ? "Change profile photo" : "Add profile photo"}
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[16px]"
            style={{
              background: CHARCOAL,
              color: CREAM_SOFT,
              fontFamily: "'Sora', sans-serif",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
              {hasAvatar && avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                initials(seed)
              )}
            </span>
            {/* Tactile "editable" badge — always visible on mobile so the
                affordance is obvious without hover. */}
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full"
              style={{
                background: CREAM_SOFT,
                border: `1px solid ${BORDER}`,
                color: CHARCOAL,
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              }}
            >
              {avatarBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Pencil className="h-3 w-3" strokeWidth={2} />
              )}
            </span>
          </motion.button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFile}
          />
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
            chevron
          />
        </SettingsGroup>

        <SectionLabel>Danger zone</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<Trash2 className="h-4 w-4" strokeWidth={1.8} />}
            title={deleting ? "Deleting account…" : "Delete account"}
            description="Erase your account, codes, and passphrase forever."
            onClick={handleDelete}
            disabled={deleting}
            danger
            chevron
          />
        </SettingsGroup>
      </div>

      <AnimatePresence>
        {avatarSheet && (
          <AvatarActionSheet
            hasAvatar={hasAvatar}
            avatarUrl={avatarUrl}
            seed={seed}
            onChoose={pickAvatarFile}
            onRemove={handleAvatarRemove}
            onClose={() => setAvatarSheet(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function AvatarActionSheet({
  hasAvatar,
  avatarUrl,
  seed,
  onChoose,
  onRemove,
  onClose,
}: {
  hasAvatar: boolean;
  avatarUrl: string | null;
  seed: string;
  onChoose: () => void;
  onRemove: () => void;
  onClose: () => void;
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
        {/* grabber */}
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "rgba(28,28,28,0.15)" }}
        />

        <div className="flex flex-col items-center gap-3 pb-4">
          <div
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-[17px]"
            style={{
              background: CHARCOAL,
              color: CREAM_SOFT,
              fontFamily: "'Sora', sans-serif",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {hasAvatar && avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (() => {
                const parts = seed.trim().split(/[\s._@-]+/).filter(Boolean);
                const chars =
                  parts.length >= 2 ? parts[0][0] + parts[1][0] : seed.slice(0, 2);
                return chars.toUpperCase() || "?";
              })()
            )}
          </div>
          <div
            className="text-[15px]"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 600,
              color: CHARCOAL,
              letterSpacing: "-0.01em",
            }}
          >
            Profile photo
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={onChoose}
            className="flex items-center gap-3 rounded-[14px] px-4 py-3.5 text-left"
            style={{
              background: CHARCOAL,
              color: CREAM_SOFT,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <Camera className="h-4 w-4" strokeWidth={1.8} />
            <span className="text-[14px]" style={{ fontWeight: 500 }}>
              {hasAvatar ? "Choose a new photo" : "Choose a photo"}
            </span>
          </motion.button>

          {hasAvatar && (
            <motion.button
              whileTap={{ scale: 0.985 }}
              onClick={onRemove}
              className="flex items-center gap-3 rounded-[14px] px-4 py-3.5 text-left"
              style={{
                background: "transparent",
                color: DANGER,
                border: `1px solid ${BORDER}`,
              }}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.8} />
              <span className="text-[14px]" style={{ fontWeight: 500 }}>
                Remove current photo
              </span>
            </motion.button>
          )}

          <button
            onClick={onClose}
            className="mt-1 rounded-[14px] px-4 py-3 text-[13.5px]"
            style={{ color: MUTED, fontWeight: 500 }}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
