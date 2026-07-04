import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { BORDER, CHARCOAL, CREAM_SOFT, DANGER, MUTED, soft } from "./chrome";

/**
 * Material-3-inspired settings primitives for authenticator screens.
 * Compact top app bar, large title header, grouped rows with hairline
 * dividers — the standard native Android surface language.
 */

export function AppBar({ title, trailing }: { title?: string; trailing?: ReactNode }) {
  return (
    <div
      className="sticky top-0 z-10 -mx-6 flex h-12 shrink-0 items-center justify-between px-6"
      style={{
        color: CHARCOAL,
        background: "color-mix(in oklab, #f7f4ed 88%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: `1px solid transparent`,
      }}
    >
      <span
        className="text-[15px]"
        style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, letterSpacing: "-0.01em" }}
      >
        {title ?? ""}
      </span>
      <div className="flex items-center gap-1">{trailing}</div>
    </div>
  );
}

export function AppBarButton({
  onClick,
  label,
  children,
}: {
  onClick?: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full"
      style={{ color: CHARCOAL }}
    >
      {children}
    </motion.button>
  );
}

export function LargeTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="sticky top-0 z-10 -mx-6 flex flex-col gap-1 px-6 pt-3 pb-4">
      <h1
        className="text-[28px] leading-[1.08]"
        style={{
          color: CHARCOAL,
          fontFamily: "'Sora', sans-serif",
          fontWeight: 600,
          letterSpacing: "-0.025em",
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-[13.5px] leading-[1.4]" style={{ color: MUTED }}>
          {subtitle}
        </p>
      )}
      {/* Fade + blur veil so content scrolling behind the sticky title dissolves */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[calc(100%+28px)]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(247,244,237,0.96) 0%, rgba(247,244,237,0.92) 55%, rgba(247,244,237,0.55) 82%, rgba(247,244,237,0) 100%)",
          backdropFilter: "blur(10px)",
          maskImage:
            "linear-gradient(to bottom, #000 0%, #000 70%, rgba(0,0,0,0.6) 88%, transparent 100%)",
        }}
      />
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="scroll-fade-in px-1 pt-4 pb-1.5 text-[11px] uppercase"
      style={{ color: MUTED, letterSpacing: "0.14em", fontWeight: 600 }}
    >
      {children}
    </div>
  );
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <div
      className="scroll-fade-in shrink-0 overflow-hidden rounded-[16px]"
      style={{
        background: CREAM_SOFT,
        border: `1px solid ${BORDER}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
      }}
    >
      <div className="divide-y" style={{ borderColor: BORDER }}>
        {children}
      </div>
    </div>
  );
}

interface RowProps {
  icon?: ReactNode;
  title: string;
  value?: ReactNode;
  description?: ReactNode;
  onClick?: () => void;
  trailing?: ReactNode;
  chevron?: boolean;
  disabled?: boolean;
  danger?: boolean;
  badge?: string;
}

export function SettingsRow({
  icon,
  title,
  value,
  description,
  onClick,
  trailing,
  chevron,
  disabled,
  danger,
  badge,
}: RowProps) {
  const Tag = onClick ? motion.button : motion.div;
  const clickable = !!onClick && !disabled;
  const color = danger ? DANGER : CHARCOAL;

  return (
    <Tag
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      whileTap={clickable ? { backgroundColor: "rgba(28,28,28,0.04)" } : undefined}
      className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-55"
      style={{ borderColor: BORDER }}
    >
      {icon && (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "rgba(28,28,28,0.05)",
            color,
            border: `1px solid ${BORDER}`,
          }}
        >
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span
            className="truncate text-[14.5px]"
            style={{ color, fontWeight: 500, letterSpacing: "-0.005em" }}
          >
            {title}
          </span>
          {badge && (
            <span
              className="rounded-full px-1.5 py-[1px] text-[9px] uppercase"
              style={{
                background: "rgba(28,28,28,0.06)",
                color: MUTED,
                border: `1px solid ${BORDER}`,
                letterSpacing: "0.14em",
                fontWeight: 600,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {(description || value) && (
          <div
            className="mt-0.5 truncate text-[12.5px] leading-[1.4]"
            style={{ color: MUTED }}
          >
            {value ?? description}
          </div>
        )}
      </div>
      {trailing}
      {chevron && !trailing && (
        <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.8} style={{ color: MUTED }} />
      )}
    </Tag>
  );
}
