import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Star, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { generateCode, type DecryptedAccount } from "@/lib/vault-accounts";
import { BORDER, CHARCOAL, CREAM_SOFT, MUTED, soft } from "@/components/aegis/chrome";
import { logoUrlFor, domainFromIssuer } from "@/lib/issuer-domain";

const DANGER = "#b23a2a";
const FAV = "#c99a2b";

// Dedupe toast per issuer so the same failing logo doesn't spam notifications.
const notifiedIssuers = new Set<string>();
function notifyLogoIssue(issuer: string, reason: "unmapped" | "error") {
  const key = `${reason}:${issuer.toLowerCase()}`;
  if (notifiedIssuers.has(key)) return;
  notifiedIssuers.add(key);
  const label = issuer || "this account";
  if (reason === "unmapped") {
    toast.message(`No logo found for "${label}"`, {
      description: "Showing initials instead — we couldn't match a website domain.",
    });
  } else {
    toast.error(`Couldn't load logo for "${label}"`, {
      description: "The image failed to load. Showing initials instead.",
    });
  }
}

// Singleton clipboard-clear timer: last copied code wins. After 30s we
// overwrite the clipboard so a forgotten copy doesn't linger.
const CLIPBOARD_CLEAR_MS = 30_000;
let clipboardClearTimer: number | null = null;
let lastCopiedPlain: string | null = null;

function scheduleClipboardClear(plain: string) {
  if (typeof window === "undefined") return;
  lastCopiedPlain = plain;
  if (clipboardClearTimer !== null) window.clearTimeout(clipboardClearTimer);
  clipboardClearTimer = window.setTimeout(async () => {
    clipboardClearTimer = null;
    try {
      // Only clear if we can confirm the clipboard still holds our code —
      // otherwise we'd wipe whatever the user copied afterwards.
      const current = await navigator.clipboard.readText().catch(() => null);
      if (current !== null && current === lastCopiedPlain) {
        await navigator.clipboard.writeText("");
      } else if (current === null) {
        // Permission denied for read: overwrite defensively.
        await navigator.clipboard.writeText("");
      }
    } catch {
      /* ignore */
    } finally {
      lastCopiedPlain = null;
    }
  }, CLIPBOARD_CLEAR_MS);
}

interface Props {
  account: DecryptedAccount;
  now: number;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => Promise<void> | void;
}

function formatCode(code: string): string {
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
}

function initials(source: string): string {
  const s = source.trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : s.slice(0, 2);
  return chars.toUpperCase();
}

function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function AccountCard({ account, now, isFavorite, onToggleFavorite, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const period = account.period;
  const elapsed = Math.floor(now / 1000) % period;
  const remaining = period - elapsed;
  const progress = elapsed / period;

  const code = useMemo(() => {
    try {
      return generateCode(account, now);
    } catch {
      return "------";
    }
  }, [account, now]);

  // Peek at the next code in the last few seconds so the user can wait
  // for a fresh one instead of copying a code about to expire.
  const showNext = remaining <= 5;
  const nextCode = useMemo(() => {
    if (!showNext) return "";
    try {
      return generateCode(account, now + period * 1000);
    } catch {
      return "";
    }
  }, [account, now, period, showNext]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    try {
      const plain = code.replace(/\s/g, "");
      await navigator.clipboard.writeText(plain);
      scheduleClipboardClear(plain);
      setCopied(true);
      if (typeof navigator.vibrate === "function") navigator.vibrate(6);
    } catch {
      /* ignore */
    }
  };

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const startPress = () => {
    if (!onDelete) return;
    clearPress();
    longPressedRef.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressedRef.current = true;
      if (typeof navigator.vibrate === "function") navigator.vibrate(14);
      setConfirmOpen(true);
    }, 500);
  };

  const confirmDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(account.id);
      toast.success(`Removed ${account.issuer || "account"}`);
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete account.");
    } finally {
      setDeleting(false);
    }
  };

  const warn = remaining <= 5;
  const seed = account.issuer || account.label || "?";
  const hue = hueFor(seed);
  const chipBg = `hsl(${hue}, 42%, 92%)`;
  const chipFg = `hsl(${hue}, 40%, 28%)`;
  const logoUrl = useMemo(() => logoUrlFor(account.issuer, 80), [account.issuer]);
  const showLogo = !!logoUrl && !logoFailed;

  useEffect(() => {
    if (!account.issuer) return;
    if (logoUrl) return;
    if (!domainFromIssuer(account.issuer)) {
      notifyLogoIssue(account.issuer, "unmapped");
    }
  }, [account.issuer, logoUrl]);

  return (
    <>
    <motion.button
      onClick={copy}
      onPointerDown={startPress}
      onPointerUp={clearPress}
      onPointerLeave={clearPress}
      onPointerCancel={clearPress}
      onContextMenu={(e) => {
        if (!onDelete) return;
        e.preventDefault();
        longPressedRef.current = true;
        setConfirmOpen(true);
      }}
      whileTap={{ scale: 0.99, backgroundColor: "rgba(28,28,28,0.03)" }}
      className="group relative flex w-full flex-col gap-2 px-4 py-3 text-left"
      style={{ background: "transparent" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] text-[12.5px]"
          style={{
            background: showLogo ? "#fff" : chipBg,
            color: chipFg,
            border: `1px solid ${BORDER}`,
            fontFamily: "'Sora', sans-serif",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {showLogo ? (
            <img
              src={logoUrl!}
              alt=""
              className="h-full w-full object-contain"
              loading="lazy"
              onError={() => {
                setLogoFailed(true);
                notifyLogoIssue(account.issuer || seed, "error");
              }}
            />
          ) : (
            initials(seed)
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="truncate text-[14px]"
            style={{ color: CHARCOAL, fontWeight: 600, letterSpacing: "-0.005em" }}
          >
            {account.issuer || "Untitled"}
          </div>
          {account.label && (
            <div className="truncate text-[11.5px]" style={{ color: MUTED }}>
              {account.label}
            </div>
          )}
        </div>

        {onToggleFavorite && (
          <motion.span
            role="button"
            tabIndex={0}
            aria-label={isFavorite ? "Unpin favorite" : "Pin as favorite"}
            aria-pressed={isFavorite}
            whileTap={{ scale: 0.85 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(account.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(account.id);
              }
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full cursor-pointer"
            style={{
              color: isFavorite ? FAV : MUTED,
              background: isFavorite ? "rgba(201,154,43,0.12)" : "transparent",
            }}
          >
            <Star
              className="h-3.5 w-3.5"
              strokeWidth={1.9}
              fill={isFavorite ? FAV : "none"}
            />
          </motion.span>
        )}

        <RingTimer progress={progress} remaining={remaining} warn={warn} />
      </div>

      <div className="flex items-baseline justify-between gap-3 pl-[52px]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={code}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="text-[26px] leading-none tabular-nums"
            style={{
              color: warn ? DANGER : CHARCOAL,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontFeatureSettings: "'tnum'",
              fontWeight: 600,
              letterSpacing: "0.06em",
            }}
          >
            {formatCode(code)}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.div
              key="ok"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px]"
              style={{
                color: CREAM_SOFT,
                background: CHARCOAL,
                fontWeight: 500,
              }}
            >
              <Check className="h-3 w-3" strokeWidth={2.4} />
              Copied
            </motion.div>
          ) : showNext && nextCode ? (
            <motion.div
              key="next"
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-baseline gap-1.5 tabular-nums"
              style={{
                color: MUTED,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontFeatureSettings: "'tnum'",
                fontSize: 11,
                letterSpacing: "0.05em",
              }}
              aria-label={`Next code ${nextCode}`}
            >
              <span style={{ opacity: 0.7 }}>next</span>
              <span style={{ color: CHARCOAL, fontWeight: 600 }}>{formatCode(nextCode)}</span>
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ color: MUTED }}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.7} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
    <AnimatePresence>
      {confirmOpen && (
        <motion.div
          key="delete-sheet"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            aria-label="Close"
            onClick={() => !deleting && setConfirmOpen(false)}
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
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[13px]"
                  style={{
                    background: showLogo ? "#fff" : chipBg,
                    color: chipFg,
                    border: `1px solid ${BORDER}`,
                    fontFamily: "'Sora', sans-serif",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  {showLogo ? (
                    <img src={logoUrl!} alt="" className="h-full w-full object-contain" />
                  ) : (
                    initials(seed)
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    className="truncate text-[16px]"
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontWeight: 600,
                      letterSpacing: "-0.01em",
                      color: CHARCOAL,
                    }}
                  >
                    Remove {account.issuer || "this account"}?
                  </div>
                  {account.label && (
                    <div className="mt-0.5 truncate text-[12px]" style={{ color: MUTED }}>
                      {account.label}
                    </div>
                  )}
                </div>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => !deleting && setConfirmOpen(false)}
                disabled={deleting}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "rgba(28,28,28,0.06)", color: CHARCOAL }}
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </motion.button>
            </div>

            <p
              className="mb-4 text-[13px]"
              style={{ color: MUTED, lineHeight: 1.55 }}
            >
              The encrypted secret will be deleted from your vault. You'll
              need the original QR or setup key to add it back. This can't
              be undone.
            </p>

            <div className="flex flex-col gap-2 pb-1">
              <motion.button
                whileTap={{ scale: 0.99 }}
                onClick={confirmDelete}
                disabled={deleting}
                className="flex items-center justify-center gap-2 rounded-[14px] px-4 py-3.5 text-[14px]"
                style={{
                  background: DANGER,
                  color: "#fff",
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                  opacity: deleting ? 0.75 : 1,
                }}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Removing…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" strokeWidth={1.9} />
                    Remove account
                  </>
                )}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.99 }}
                onClick={() => !deleting && setConfirmOpen(false)}
                disabled={deleting}
                className="rounded-[14px] px-4 py-3.5 text-[14px]"
                style={{
                  background: "rgba(28,28,28,0.03)",
                  color: CHARCOAL,
                  border: `1px solid ${BORDER}`,
                  fontWeight: 500,
                }}
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

function RingTimer({ progress, remaining, warn }: { progress: number; remaining: number; warn: boolean }) {
  const size = 28;
  const stroke = 2.2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - progress);
  const color = warn ? DANGER : CHARCOAL;

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={BORDER} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={dash}
          style={{ transition: "stroke-dashoffset 0.24s linear, stroke 0.2s ease" }}
        />
      </svg>
      <span
        className="absolute text-[10px] tabular-nums"
        style={{
          color,
          fontFeatureSettings: "'tnum'",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontWeight: 600,
        }}
      >
        {remaining}
      </span>
    </div>
  );
}
