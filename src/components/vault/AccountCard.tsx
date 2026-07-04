import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { generateCode, type DecryptedAccount } from "@/lib/vault-accounts";

const CHARCOAL = "#1c1c1a";
const MUTED = "#8a8a86";
const BORDER = "rgba(28,28,26,0.10)";

interface Props {
  account: DecryptedAccount;
  now: number;
}

function formatCode(code: string): string {
  // 6 → "123 456", 8 → "1234 5678"
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

export function AccountCard({ account, now }: Props) {
  const [copied, setCopied] = useState(false);

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

  return (
    <button
      onClick={copy}
      className="group flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors active:scale-[0.997]"
      style={{ borderColor: BORDER, background: "rgba(255,255,255,0.55)" }}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-medium tracking-wide"
        style={{ background: "rgba(28,28,26,0.06)", color: CHARCOAL }}
      >
        {initials(account.issuer || account.label)}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium" style={{ color: CHARCOAL }}>
              {account.issuer || "Untitled"}
            </div>
            {account.label && (
              <div className="truncate text-[11.5px]" style={{ color: MUTED }}>
                {account.label}
              </div>
            )}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.div
                key="ok"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1 text-[11px]"
                style={{ color: CHARCOAL }}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Copied
              </motion.div>
            ) : (
              <motion.div
                key="copy"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="opacity-60"
                style={{ color: MUTED }}
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={1.6} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-1 flex items-baseline justify-between gap-3">
          <div
            className="font-mono text-[22px] leading-none tracking-[0.14em] tabular-nums"
            style={{
              color: warn ? "#b23a2a" : CHARCOAL,
              fontFeatureSettings: "'tnum'",
            }}
          >
            {formatCode(code)}
          </div>
          <RingTimer progress={progress} remaining={remaining} warn={warn} />
        </div>
      </div>
    </button>
  );
}

function RingTimer({ progress, remaining, warn }: { progress: number; remaining: number; warn: boolean }) {
  const size = 22;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - progress);
  const color = warn ? "#b23a2a" : CHARCOAL;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
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
          style={{ transition: "stroke-dashoffset 0.2s linear, stroke 0.2s ease" }}
        />
      </svg>
      <span
        className="absolute text-[9.5px] font-medium tabular-nums"
        style={{ color, fontFeatureSettings: "'tnum'" }}
      >
        {remaining}
      </span>
    </div>
  );
}
