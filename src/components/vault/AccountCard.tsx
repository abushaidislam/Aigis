import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Star } from "lucide-react";
import { toast } from "sonner";
import { generateCode, type DecryptedAccount } from "@/lib/vault-accounts";
import { BORDER, CHARCOAL, CREAM_SOFT, MUTED } from "@/components/aegis/chrome";
import { logoUrlFor, domainFromIssuer } from "@/lib/issuer-domain";

const DANGER = "#b23a2a";
const FAV = "#c99a2b";

interface Props {
  account: DecryptedAccount;
  now: number;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
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

export function AccountCard({ account, now, isFavorite, onToggleFavorite }: Props) {
  const [copied, setCopied] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

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

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.replace(/\s/g, ""));
      setCopied(true);
      if (typeof navigator.vibrate === "function") navigator.vibrate(6);
    } catch {
      /* ignore */
    }
  };

  const warn = remaining <= 5;
  const seed = account.issuer || account.label || "?";
  const hue = hueFor(seed);
  const chipBg = `hsl(${hue}, 42%, 92%)`;
  const chipFg = `hsl(${hue}, 40%, 28%)`;
  const logoUrl = useMemo(() => logoUrlFor(account.issuer, 80), [account.issuer]);
  const showLogo = !!logoUrl && !logoFailed;

  return (
    <motion.button
      onClick={copy}
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
              onError={() => setLogoFailed(true)}
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
