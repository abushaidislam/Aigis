import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Shield,
  Zap,
  Lock,
  RefreshCw,
  QrCode,
  Upload,
  KeyRound,
  CloudUpload,
  Bell,
  Fingerprint,
  Check,
  ArrowRight,
  ChevronLeft,
  Vibrate,
  VibrateOff,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Design tokens (Lovable-inspired warm cream system)                 */
/* ------------------------------------------------------------------ */

const CREAM = "#f7f4ed";
const CREAM_SOFT = "#fcfbf8";
const CHARCOAL = "#1c1c1c";
const BORDER = "#eceae4";
const MUTED = "#5f5f5d";

const INSET_SHADOW =
  "rgba(255,255,255,0.2) 0 0.5px 0 0 inset, rgba(0,0,0,0.2) 0 0 0 0.5px inset, rgba(0,0,0,0.05) 0 1px 2px 0";
const FOCUS_SHADOW = "rgba(0,0,0,0.1) 0 4px 12px";

const spring = { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.9 };
const soft = { type: "spring" as const, stiffness: 200, damping: 32, mass: 1 };

/* ------------------------------------------------------------------ */
/*  Warm atmospheric background                                        */
/* ------------------------------------------------------------------ */

function Backdrop() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: CREAM }}>
      {/* soft warm wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 20% 0%, rgba(255,214,180,0.35), transparent 55%), radial-gradient(90% 70% at 90% 15%, rgba(255,196,206,0.28), transparent 60%), radial-gradient(100% 80% at 50% 100%, rgba(180,196,230,0.32), transparent 60%)",
        }}
      />
      <motion.div
        className="absolute -left-24 top-[6%] h-[320px] w-[320px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(230,180,140,0.35), transparent 70%)", filter: "blur(60px)" }}
        animate={reduce ? undefined : { x: [0, 16, 0], y: [0, -10, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-24 bottom-[8%] h-[380px] w-[380px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(200,170,210,0.28), transparent 70%)", filter: "blur(70px)" }}
        animate={reduce ? undefined : { x: [0, -14, 0], y: [0, 10, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* grain */}
      <div
        className="absolute inset-0 opacity-[0.5] mix-blend-multiply"
        style={{
          backgroundImage: "radial-gradient(rgba(28,28,28,0.05) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Top bar                                                            */
/* ------------------------------------------------------------------ */

function TopBar({
  step,
  total,
  onBack,
  onSkip,
  canSkip,
  hapticsOn,
  onToggleHaptics,
}: {
  step: number;
  total: number;
  onBack?: () => void;
  onSkip?: () => void;
  canSkip: boolean;
  hapticsOn: boolean;
  onToggleHaptics: () => void;
}) {
  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center justify-between px-5">
      <div className="flex w-24 items-center justify-start gap-1">
        <AnimatePresence initial={false}>
          {step > 0 && (
            <motion.button
              key="back"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={spring}
              whileTap={{ scale: 0.94 }}
              onClick={onBack}
              aria-label="Go back"
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ color: CHARCOAL, background: "rgba(28,28,28,0.03)" }}
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Segmented progress dots with morphing active pill */}
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: total }).map((_, i) => {
          const active = i === step;
          const passed = i < step;
          return (
            <span
              key={i}
              className="relative h-[6px] rounded-full"
              style={{
                width: active ? 20 : 6,
                transition: "width 320ms cubic-bezier(0.22,0.9,0.3,1)",
                background: passed ? CHARCOAL : "rgba(28,28,28,0.15)",
                willChange: "width",
              }}
            >
              {active && (
                <motion.span
                  layoutId="progress-pill"
                  className="absolute inset-0 rounded-full"
                  style={{ background: CHARCOAL, willChange: "transform" }}
                  transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.7 }}
                />
              )}
            </span>
          );
        })}
      </div>

      <div className="flex w-24 items-center justify-end gap-1">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleHaptics}
          role="switch"
          aria-checked={hapticsOn}
          aria-label={hapticsOn ? "Turn off vibration feedback" : "Turn on vibration feedback"}
          title={hapticsOn ? "Vibration on" : "Vibration off"}
          className="flex h-8 w-8 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(28,28,28,0.4)]"
          style={{
            color: hapticsOn ? CHARCOAL : MUTED,
            background: hapticsOn ? "rgba(28,28,28,0.06)" : "transparent",
            border: `1px solid ${hapticsOn ? "transparent" : BORDER}`,
          }}
        >
          {hapticsOn ? (
            <Vibrate className="h-[15px] w-[15px]" strokeWidth={1.8} />
          ) : (
            <VibrateOff className="h-[15px] w-[15px]" strokeWidth={1.8} />
          )}
        </motion.button>

        {canSkip && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onSkip}
            className="rounded-full px-3 py-1 text-[13px]"
            style={{ color: MUTED, fontWeight: 400 }}
          >
            Skip
          </motion.button>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Buttons                                                            */
/* ------------------------------------------------------------------ */

function PrimaryButton({
  children,
  onClick,
  icon,
  loading,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <motion.button
      onClick={onClick}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.985, opacity: 0.85 }}
      transition={spring}
      className="group relative flex h-[46px] w-full items-center justify-center gap-2 rounded-[10px] text-[15px] disabled:opacity-60"
      style={{
        background: CHARCOAL,
        color: CREAM_SOFT,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        boxShadow: INSET_SHADOW,
      }}
      onFocus={(e) => (e.currentTarget.style.boxShadow = `${INSET_SHADOW}, ${FOCUS_SHADOW}`)}
      onBlur={(e) => (e.currentTarget.style.boxShadow = INSET_SHADOW)}
    >
      {loading ? (
        <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={1.8} />
      ) : (
        <span className="flex items-center gap-2">
          {children}
          {icon ?? (
            <ArrowRight
              className="h-[15px] w-[15px] transition-transform duration-300 group-hover:translate-x-0.5"
              strokeWidth={1.8}
            />
          )}
        </span>
      )}
    </motion.button>
  );
}


function GhostButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.985, opacity: 0.85 }}
      transition={spring}
      className="flex h-[42px] w-full items-center justify-center rounded-[10px] text-[14.5px]"
      style={{
        background: "transparent",
        color: CHARCOAL,
        border: `1px solid rgba(28,28,28,0.4)`,
        fontWeight: 500,
      }}
    >
      {children}
    </motion.button>
  );
}

function TextLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[13.5px] underline decoration-[rgba(28,28,28,0.35)] underline-offset-[3px] transition-colors hover:decoration-[rgba(28,28,28,0.7)]"
      style={{ color: CHARCOAL }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Typography helpers                                                 */
/* ------------------------------------------------------------------ */

function Display({ children }: { children: ReactNode }) {
  return (
    <h1
      className="font-display text-[34px] leading-[1.02]"
      style={{ color: CHARCOAL, fontWeight: 600, letterSpacing: "-0.03em" }}
    >
      {children}
    </h1>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="text-[15px] leading-[1.5]" style={{ color: MUTED, maxWidth: "34ch" }}>
      {children}
    </p>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex">
      <span
        className="inline-flex w-fit items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] uppercase"
        style={{
          color: CHARCOAL,
          background: CREAM_SOFT,
          border: `1px solid ${BORDER}`,
          letterSpacing: "0.12em",
          fontWeight: 500,
        }}
      >
        {children}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared surface primitives                                          */
/* ------------------------------------------------------------------ */

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[12px] ${className}`}
      style={{ background: CREAM_SOFT, border: `1px solid ${BORDER}` }}
    >
      {children}
    </div>
  );
}

function IconChip({ children, size = 40 }: { children: ReactNode; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: CREAM_SOFT,
        border: `1px solid ${BORDER}`,
        color: CHARCOAL,
      }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen shell                                                       */
/* ------------------------------------------------------------------ */

function Screen({ children }: { children: ReactNode }) {
  return <section className="flex h-full w-full flex-col px-6">{children}</section>;
}

/* ------------------------------------------------------------------ */
/*  Illustrations                                                      */
/* ------------------------------------------------------------------ */

function HeroMark() {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
      {/* concentric rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 120 + i * 34,
            height: 120 + i * 34,
            border: `1px solid ${BORDER}`,
          }}
          animate={reduce ? undefined : { scale: [1, 1.03, 1], opacity: [0.9, 0.5, 0.9] }}
          transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
        />
      ))}
      {/* center medallion */}
      <motion.div
        className="relative flex h-[100px] w-[100px] items-center justify-center rounded-full"
        style={{
          background: CHARCOAL,
          boxShadow: INSET_SHADOW,
        }}
        animate={reduce ? undefined : { y: [0, -4, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <Shield className="h-[42px] w-[42px]" style={{ color: CREAM_SOFT }} strokeWidth={1.6} />
      </motion.div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  body,
  delay = 0,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...soft, delay }}
      className="flex items-start gap-3 rounded-[12px] p-3"
      style={{ background: CREAM_SOFT, border: `1px solid ${BORDER}` }}
    >
      <IconChip size={36}>{icon}</IconChip>
      <div className="min-w-0 pt-0.5">
        <div className="text-[14.5px]" style={{ color: CHARCOAL, fontWeight: 500 }}>
          {title}
        </div>
        <div className="mt-0.5 text-[12.5px] leading-[1.45]" style={{ color: MUTED }}>
          {body}
        </div>
      </div>
    </motion.div>
  );
}

function ImportOption({
  icon,
  title,
  body,
  onClick,
  delay = 0,
  active = false,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  onClick?: () => void;
  delay?: number;
  active?: boolean;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...soft, delay }}
      whileTap={{ scale: 0.99, opacity: 0.9 }}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[12px] p-3 text-left transition-colors"
      style={{
        background: active ? "rgba(28,28,28,0.05)" : CREAM_SOFT,
        border: `1px solid ${active ? "rgba(28,28,28,0.25)" : BORDER}`,
      }}
    >
      <IconChip size={38}>{icon}</IconChip>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px]" style={{ color: CHARCOAL, fontWeight: 500 }}>
          {title}
        </div>
        <div className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
          {body}
        </div>
      </div>
      {active ? (
        <Check className="h-4 w-4" style={{ color: CHARCOAL }} strokeWidth={2} />
      ) : (
        <ArrowRight className="h-4 w-4" style={{ color: "rgba(28,28,28,0.35)" }} strokeWidth={1.8} />
      )}
    </motion.button>
  );
}


function NativeSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="relative flex h-[26px] w-[44px] items-center rounded-full transition-colors"
      style={{
        background: on ? CHARCOAL : "rgba(28,28,28,0.15)",
        boxShadow: on ? INSET_SHADOW : "inset 0 0 0 1px rgba(28,28,28,0.1)",
      }}
    >
      <motion.span
        layout
        transition={spring}
        className="absolute h-[20px] w-[20px] rounded-full"
        style={{
          left: on ? 21 : 3,
          background: CREAM_SOFT,
          boxShadow: "0 1px 2px rgba(0,0,0,0.2), 0 0 0 0.5px rgba(0,0,0,0.1)",
        }}
      />
    </button>
  );
}

function VaultIllustration() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto flex h-[160px] w-[220px] items-center justify-center">
      <div
        className="absolute inset-0 rounded-[16px]"
        style={{ background: CREAM_SOFT, border: `1px solid ${BORDER}` }}
      />
      <motion.div
        className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full"
        style={{ background: CHARCOAL, boxShadow: INSET_SHADOW }}
        animate={reduce ? undefined : { y: [0, -3, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <CloudUpload className="h-8 w-8" style={{ color: CREAM_SOFT }} strokeWidth={1.6} />
      </motion.div>
      {/* satellite chips */}
      {[
        { top: 14, left: 18, icon: <KeyRound className="h-3.5 w-3.5" strokeWidth={1.8} /> },
        { top: 22, right: 18, icon: <Lock className="h-3.5 w-3.5" strokeWidth={1.8} /> },
        { bottom: 16, left: 30, icon: <Shield className="h-3.5 w-3.5" strokeWidth={1.8} /> },
        { bottom: 22, right: 26, icon: <Check className="h-3.5 w-3.5" strokeWidth={1.8} /> },
      ].map((c, i) => (
        <motion.span
          key={i}
          className="absolute inline-flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            top: c.top,
            left: c.left,
            right: c.right,
            bottom: c.bottom,
            background: CREAM,
            border: `1px solid ${BORDER}`,
            color: CHARCOAL,
          }}
          animate={reduce ? undefined : { y: [0, -4, 0] }}
          transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
        >
          {c.icon}
        </motion.span>
      ))}
    </div>
  );
}

function PulseIcon({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: 80, height: 80, border: `1px solid ${BORDER}` }}
          animate={reduce ? undefined : { scale: [1, 1.7], opacity: [0.6, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut", delay: i * 1.3 }}
        />
      ))}
      <div
        className="relative flex h-[80px] w-[80px] items-center justify-center rounded-full"
        style={{ background: CHARCOAL, boxShadow: INSET_SHADOW, color: CREAM_SOFT }}
      >
        {children}
      </div>
    </div>
  );
}

function SuccessMark() {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
      <motion.div
        className="absolute rounded-full"
        style={{ width: 140, height: 140, border: `1px solid ${BORDER}` }}
        animate={reduce ? undefined : { scale: [1, 1.05, 1], opacity: [0.9, 0.5, 0.9] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...spring, delay: 0.1 }}
        className="relative flex h-[92px] w-[92px] items-center justify-center rounded-full"
        style={{ background: CHARCOAL, boxShadow: INSET_SHADOW }}
      >
        <motion.div
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.5, 0, 0.2, 1] }}
        >
          <Check className="h-10 w-10" style={{ color: CREAM_SOFT }} strokeWidth={2} />
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Steps                                                              */
/* ------------------------------------------------------------------ */

function StepWelcome({ next }: { next: () => void }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <HeroMark />
        <div className="flex flex-col items-center gap-3">
          <Eyebrow>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: CHARCOAL }} />
            Aegis
          </Eyebrow>
          <Display>Security, quietly done.</Display>
          <Lede>A calm authenticator for your one-time codes — end-to-end encrypted and effortless.</Lede>
        </div>
      </div>
      <div className="shrink-0 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        <PrimaryButton onClick={next}>Get started</PrimaryButton>
        <p className="mt-3 text-center text-[12px]" style={{ color: MUTED }}>
          By continuing you agree to our{" "}
          <span className="underline underline-offset-[3px]" style={{ color: CHARCOAL }}>Terms</span>{" "}
          &{" "}
          <span className="underline underline-offset-[3px]" style={{ color: CHARCOAL }}>Privacy</span>.
        </p>
      </div>
    </Screen>
  );
}

function StepFeatures({ next }: { next: () => void }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <div className="flex flex-col gap-2">
          <Eyebrow>Why Aegis</Eyebrow>
          <Display>Built for trust.</Display>
          <Lede>Three principles guide every decision — nothing more, nothing less.</Lede>
        </div>
        <div className="flex flex-col gap-2.5">
          <FeatureRow
            icon={<Zap className="h-4 w-4" strokeWidth={1.8} />}
            title="Fast"
            body="Codes appear instantly, always accurate to the second."
            delay={0.05}
          />
          <FeatureRow
            icon={<Lock className="h-4 w-4" strokeWidth={1.8} />}
            title="Private"
            body="End-to-end encrypted. Nothing ever leaves your device unencrypted."
            delay={0.12}
          />
          <FeatureRow
            icon={<RefreshCw className="h-4 w-4" strokeWidth={1.8} />}
            title="Reliable"
            body="Works offline. Syncs quietly when you're back online."
            delay={0.19}
          />
        </div>
      </div>
      <div className="shrink-0 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        <PrimaryButton onClick={next}>Continue</PrimaryButton>
      </div>
    </Screen>
  );
}

const IMPORT_INTENT_KEY = "aegis.onboarding.intent";

function setImportIntent(v: "scan" | "manual" | "backup" | null) {
  try {
    if (v === null) window.localStorage.removeItem(IMPORT_INTENT_KEY);
    else window.localStorage.setItem(IMPORT_INTENT_KEY, v);
  } catch {
    /* ignore */
  }
}

function StepImport({ next }: { next: () => void }) {
  const [selected, setSelected] = useState<"scan" | "manual" | "backup" | null>(null);

  const pick = (v: "scan" | "manual" | "backup") => {
    setSelected(v);
    setImportIntent(v);
    setTimeout(next, 280);
  };

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <div className="flex flex-col gap-2">
          <Eyebrow>Import</Eyebrow>
          <Display>Bring your accounts.</Display>
          <Lede>Pick a method — Aegis will guide you through the rest.</Lede>
        </div>
        <div className="flex flex-col gap-2.5">
          <ImportOption
            icon={<QrCode className="h-4 w-4" strokeWidth={1.8} />}
            title="Scan a QR code"
            body="From Google, Authy, 1Password and more."
            onClick={() => pick("scan")}
            delay={0.05}
            active={selected === "scan"}
          />
          <ImportOption
            icon={<Upload className="h-4 w-4" strokeWidth={1.8} />}
            title="Import a backup file"
            body="Coming soon — we'll notify you."
            onClick={() => pick("backup")}
            delay={0.12}
            active={selected === "backup"}
          />
          <ImportOption
            icon={<KeyRound className="h-4 w-4" strokeWidth={1.8} />}
            title="Enter a setup key"
            body="Add manually with a Base32 secret."
            onClick={() => pick("manual")}
            delay={0.19}
            active={selected === "manual"}
          />
        </div>
      </div>
      <div className="shrink-0 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 text-center">
        <TextLink
          onClick={() => {
            setImportIntent(null);
            next();
          }}
        >
          I'll do this later
        </TextLink>
      </div>
    </Screen>
  );
}


function StepBackup({ next }: { next: () => void }) {
  const [on, setOn] = useState(true);
  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <div className="flex flex-col gap-2">
          <Eyebrow>Backup</Eyebrow>
          <Display>Your vault, protected.</Display>
          <Lede>Encrypted backups keep you safe — even if your device isn't.</Lede>
        </div>
        <VaultIllustration />
        <Card className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[14.5px]" style={{ color: CHARCOAL, fontWeight: 500 }}>
                Automatic backups
              </div>
              <div className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
                Encrypted with a key only you hold.
              </div>
            </div>
            <NativeSwitch on={on} onToggle={() => setOn((v) => !v)} />
          </div>
        </Card>
      </div>
      <div className="shrink-0 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        <PrimaryButton onClick={next}>Continue</PrimaryButton>
      </div>
    </Screen>
  );
}

function StepNotifications({ next }: { next: () => void }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const request = async () => {
    if (permission === "unsupported") {
      next();
      return;
    }
    if (permission === "granted") {
      next();
      return;
    }
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      // Quick success ping so the user knows it took.
      if (result === "granted") {
        try {
          new Notification("Aegis is watching", {
            body: "You'll only hear from us for sign-in requests and alerts.",
            silent: true,
          });
        } catch {
          /* ignore */
        }
      }
      setTimeout(next, 380);
    } finally {
      setBusy(false);
    }
  };

  const label =
    permission === "granted"
      ? "Notifications enabled"
      : permission === "denied"
        ? "Blocked in browser"
        : permission === "unsupported"
          ? "Not available here"
          : "Allow notifications";

  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <PulseIcon>
          <Bell className="h-7 w-7" strokeWidth={1.6} />
        </PulseIcon>
        <div className="flex flex-col items-center gap-2">
          <Eyebrow>Notifications</Eyebrow>
          <Display>Only when it matters.</Display>
          <Lede>Get a quiet nudge for sign-in requests and security alerts. Nothing else.</Lede>
          {permission === "denied" && (
            <p className="pt-1 text-[12px]" style={{ color: MUTED, maxWidth: "32ch" }}>
              Enable notifications from your browser's site settings if you change your mind.
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 space-y-3 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        <PrimaryButton
          onClick={request}
          loading={busy}
          disabled={permission === "denied"}
        >
          {label}
        </PrimaryButton>
        <div className="text-center">
          <TextLink onClick={next}>{permission === "granted" ? "Continue" : "Not now"}</TextLink>
        </div>
      </div>
    </Screen>
  );
}


function StepBiometrics({ next }: { next: () => void }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "queued" | "unavailable">("idle");

  useEffect(() => {
    let cancelled = false;
    import("@/lib/biometric").then(async ({ isBiometricSupported }) => {
      const ok = await isBiometricSupported();
      if (!cancelled) setSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const { isBiometricSupported, markBiometricPending } = await import("@/lib/biometric");
      const ok = await isBiometricSupported();
      if (!ok) {
        setStatus("unavailable");
        setBusy(false);
        return;
      }
      // Vault DEK doesn't exist yet — flag it, actual WebAuthn enrollment
      // happens right after the user creates/unlocks their vault.
      markBiometricPending();
      setStatus("queued");
      setBusy(false);
      // Small delay so the confirmation ticks in.
      setTimeout(next, 480);
    } catch {
      setStatus("unavailable");
      setBusy(false);
    }
  };

  const primaryLabel =
    status === "queued"
      ? "Ready — armed for first unlock"
      : status === "unavailable"
        ? "Not available on this device"
        : supported === false
          ? "Not available on this device"
          : "Enable biometrics";

  const disabled = busy || status === "queued" || supported === false || status === "unavailable";

  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <PulseIcon>
          <Fingerprint className="h-8 w-8" strokeWidth={1.6} />
        </PulseIcon>
        <div className="flex flex-col items-center gap-2">
          <Eyebrow>Unlock</Eyebrow>
          <Display>Just a glance.</Display>
          <Lede>Use Face ID or your fingerprint so only you can open Aegis.</Lede>
          {supported === false && (
            <p className="pt-1 text-[12px]" style={{ color: MUTED, maxWidth: "32ch" }}>
              This browser doesn't expose a platform biometric. You'll use your master
              passphrase instead — that's fine, it's the source of truth anyway.
            </p>
          )}
          {status === "queued" && (
            <p className="pt-1 text-[12px]" style={{ color: MUTED, maxWidth: "32ch" }}>
              We'll ask for Face ID / fingerprint right after you set your master passphrase.
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 space-y-3 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        <PrimaryButton onClick={disabled ? next : enable} loading={busy}>
          {primaryLabel}
        </PrimaryButton>
        <div className="text-center">
          <TextLink onClick={next}>
            {status === "queued" ? "Continue" : "Use passcode instead"}
          </TextLink>
        </div>
      </div>
    </Screen>
  );
}


function StepDone({ next }: { next: () => void }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <SuccessMark />
        <div className="flex flex-col items-center gap-2">
          <Eyebrow>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: CHARCOAL }} />
            Ready
          </Eyebrow>
          <Display>You're all set.</Display>
          <Lede>Aegis is guarding your accounts. Add your first code whenever you're ready.</Lede>
        </div>
      </div>
      <div className="shrink-0 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        <PrimaryButton onClick={next} icon={<ArrowRight className="h-[15px] w-[15px]" strokeWidth={1.8} />}>
          Open Aegis
        </PrimaryButton>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/*  Main flow                                                          */
/* ------------------------------------------------------------------ */

const TOTAL = 7;

/* Subtle haptics — silent no-op where unsupported (desktop, iOS Safari). */
type HapticKind = "tick" | "soft" | "success";
const HAPTICS_STORAGE_KEY = "aegis.haptics";

function vibratePattern(kind: HapticKind) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const pattern = kind === "success" ? [8, 40, 14] : kind === "soft" ? 6 : 10;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

function getInitialHapticsPref(reduceMotion: boolean | null): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(HAPTICS_STORAGE_KEY);
    if (stored === "on") return true;
    if (stored === "off") return false;
  } catch {
    /* ignore */
  }
  // No stored preference: default off if the user prefers reduced motion.
  return !reduceMotion;
}

export default function Onboarding({ onComplete }: { onComplete?: () => void } = {}) {
  const [[step, dir], setState] = useState<[number, number]>([0, 1]);
  const thresholdArmedRef = useRef<null | "next" | "back">(null);
  const reduceMotion = useReducedMotion();

  const [hapticsOn, setHapticsOn] = useState<boolean>(() => getInitialHapticsPref(reduceMotion));

  // Persist changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(HAPTICS_STORAGE_KEY, hapticsOn ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [hapticsOn]);

  const haptic = useCallback(
    (kind: HapticKind = "tick") => {
      if (!hapticsOn) return;
      vibratePattern(kind);
    },
    [hapticsOn],
  );

  const toggleHaptics = () => {
    setHapticsOn((v) => {
      const nextOn = !v;
      // Confirm the toggle turning on with a tiny pulse.
      if (nextOn) vibratePattern("soft");
      return nextOn;
    });
  };

  const goNext = () => {
    haptic("tick");
    setState(([s]) => [Math.min(s + 1, TOTAL - 1), 1]);
  };
  const goBack = () => {
    haptic("soft");
    setState(([s]) => [Math.max(s - 1, 0), -1]);
  };
  const goSkip = () => {
    haptic("soft");
    setState(([s]) => [TOTAL - 1, s < TOTAL - 1 ? 1 : -1]);
  };
  const restart = () => {
    haptic("success");
    setState([0, -1]);
  };

  const canSkip = step > 0 && step < TOTAL - 1;

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 32 : -32, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -32 : 32, opacity: 0 }),
  };

  const pageSpring = { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.7 };

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: CREAM, color: CHARCOAL }}
    >
      <Backdrop />

      <div
        className="relative z-10 mx-auto flex h-full w-full max-w-[440px] flex-col"
        style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}
      >
        <TopBar
          step={step}
          total={TOTAL}
          onBack={goBack}
          onSkip={goSkip}
          canSkip={canSkip}
          hapticsOn={hapticsOn}
          onToggleHaptics={toggleHaptics}
        />


        <div className="relative flex-1 overflow-hidden" style={{ touchAction: "pan-y" }}>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={pageSpring}
              drag="x"
              dragElastic={0.14}
              dragMomentum={false}
              dragConstraints={{ left: 0, right: 0 }}
              onDragStart={() => {
                thresholdArmedRef.current = null;
              }}
              onDrag={(_, info) => {
                // Fire a light tick the first time the user crosses the commit threshold
                const x = info.offset.x;
                if (x < -70 && step < TOTAL - 1 && thresholdArmedRef.current !== "next") {
                  thresholdArmedRef.current = "next";
                  haptic("soft");
                } else if (x > 70 && step > 0 && thresholdArmedRef.current !== "back") {
                  thresholdArmedRef.current = "back";
                  haptic("soft");
                } else if (x > -50 && x < 50 && thresholdArmedRef.current) {
                  // re-arm when the user pulls back below threshold
                  thresholdArmedRef.current = null;
                }
              }}
              onDragEnd={(_, info) => {
                const power = info.offset.x + info.velocity.x * 0.2;
                if (power < -80 && step < TOTAL - 1) goNext();
                else if (power > 80 && step > 0) goBack();
                thresholdArmedRef.current = null;
              }}
              className="absolute inset-0"
              style={{ willChange: "transform, opacity", backfaceVisibility: "hidden" }}
            >
              {step === 0 && <StepWelcome next={goNext} />}
              {step === 1 && <StepFeatures next={goNext} />}
              {step === 2 && <StepImport next={goNext} />}
              {step === 3 && <StepBackup next={goNext} />}
              {step === 4 && <StepNotifications next={goNext} />}
              {step === 5 && <StepBiometrics next={goNext} />}
              {step === 6 && <StepDone next={onComplete ?? restart} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}



/* Silence unused warnings for helpers reserved for later expansion */
void GhostButton;
