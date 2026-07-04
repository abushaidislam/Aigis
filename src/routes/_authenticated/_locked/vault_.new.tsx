import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { getVaultKey } from "@/lib/vault-session";
import {
  addAccount,
  isValidBase32Secret,
  parseOtpauthUri,
  type Algorithm,
} from "@/lib/vault-accounts";
import {
  ArrowLeft,
  ScanLine,
  PenLine,
  Loader2,
  Camera,
  ChevronDown,
  KeyRound,
} from "lucide-react";
import {
  AegisScreen,
  BORDER,
  CHARCOAL,
  CREAM_SOFT,
  MUTED,
  Notice,
  PrimaryButton,
  soft,
} from "@/components/aegis/chrome";
import {
  AppBar,
  AppBarButton,
  SectionLabel,
  SettingsGroup,
} from "@/components/aegis/settings";
import { BottomTabs } from "@/components/aegis/BottomTabs";

export const Route = createFileRoute("/_authenticated/_locked/vault_/new")({
  component: NewAccountPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found</div>,
});

type Tab = "scan" | "manual";

function NewAccountPage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState<Tab>("scan");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const save = async (input: {
    issuer: string;
    label: string;
    secret: string;
    algorithm?: Algorithm;
    digits?: number;
    period?: number;
  }) => {
    const key = getVaultKey();
    if (!key) {
      navigate({ to: "/lock", search: { redirect: "/vault/new" } });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await addAccount(key, user.id, input);
      navigate({ to: "/vault", replace: true });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AegisScreen>
      <div
        className="aegis-scroll -mx-6 -mt-[max(28px,env(safe-area-inset-top))] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-[calc(112px+env(safe-area-inset-bottom))]"
        style={{ WebkitOverflowScrolling: "touch" as never }}
      >
        <AppBar
          title="Add account"
          trailing={
            <AppBarButton label="Back" onClick={() => navigate({ to: "/vault" })}>
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
            </AppBarButton>
          }
        />

        {/* Compact hero */}
        <div className="flex flex-col gap-1.5 pt-2 pb-4">
          <h1
            className="text-[26px] leading-[1.1]"
            style={{
              color: CHARCOAL,
              fontFamily: "'Sora', sans-serif",
              fontWeight: 600,
              letterSpacing: "-0.025em",
            }}
          >
            {tab === "scan" ? "Scan a code" : "Enter by hand"}
          </h1>
          <p className="text-[13.5px] leading-[1.4]" style={{ color: MUTED }}>
            {tab === "scan"
              ? "Point at the QR shown by any service. We'll do the rest."
              : "Type the secret shown as text on the service's setup screen."}
          </p>
        </div>

        <SegmentedTabs tab={tab} setTab={setTab} />

        {notice && (
          <div className="pt-3">
            <Notice kind={notice.kind}>{notice.text}</Notice>
          </div>
        )}

        <div className="pt-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={soft}
            >
              {tab === "scan" ? (
                <ScanTab
                  onDetected={(uri) => {
                    try {
                      const parsed = parseOtpauthUri(uri);
                      save(parsed);
                    } catch (err) {
                      setNotice({
                        kind: "error",
                        text: err instanceof Error ? err.message : "That QR isn't a valid otpauth code.",
                      });
                    }
                  }}
                  onError={(msg) => setNotice({ kind: "error", text: msg })}
                  saving={saving}
                  switchToManual={() => setTab("manual")}
                />
              ) : (
                <ManualTab onSubmit={save} saving={saving} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <BottomTabs />
    </AegisScreen>
  );
}

function SegmentedTabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div
      className="relative flex h-11 rounded-full p-1"
      style={{
        background: CREAM_SOFT,
        border: `1px solid ${BORDER}`,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(28,28,28,0.04)",
      }}
    >
      <SegButton
        active={tab === "scan"}
        onClick={() => setTab("scan")}
        icon={<ScanLine className="h-3.5 w-3.5" strokeWidth={1.8} />}
      >
        Scan QR
      </SegButton>
      <SegButton
        active={tab === "manual"}
        onClick={() => setTab("manual")}
        icon={<PenLine className="h-3.5 w-3.5" strokeWidth={1.8} />}
      >
        Enter manually
      </SegButton>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px]"
      style={{
        color: active ? CHARCOAL : MUTED,
        fontWeight: active ? 600 : 500,
        letterSpacing: "-0.005em",
      }}
    >
      {active && (
        <motion.span
          layoutId="add-tab-pill"
          className="absolute inset-0 rounded-full"
          style={{
            background: "#ffffff",
            border: `1px solid ${BORDER}`,
            boxShadow:
              "0 1px 2px rgba(28,28,28,0.06), 0 4px 12px -6px rgba(28,28,28,0.12)",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 34 }}
        />
      )}
      <span className="relative flex items-center gap-1.5">
        {icon}
        {children}
      </span>
    </button>
  );
}

function ScanTab({
  onDetected,
  onError,
  saving,
  switchToManual,
}: {
  onDetected: (uri: string) => void;
  onError: (msg: string) => void;
  saving: boolean;
  switchToManual: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [starting, setStarting] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;

    (async () => {
      const reader = new BrowserQRCodeReader();
      try {
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (result && !cancelled) {
            const text = result.getText();
            if (text.startsWith("otpauth://")) {
              controls?.stop();
              onDetected(text);
            }
          }
        });
        if (!cancelled) setStarting(false);
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        const name = (err as { name?: string })?.name ?? "";
        if (name === "NotAllowedError" || name === "SecurityError") setPermissionDenied(true);
        else onError(err instanceof Error ? err.message : "Could not start camera.");
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onDetected, onError]);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-[22px]"
        style={{
          border: `1px solid ${BORDER}`,
          background: "#0a0a0a",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 32px -18px rgba(28,28,28,0.35)",
        }}
      >
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

        {/* Cinematic vignette */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(closest-side, transparent 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />

        {/* Reticle */}
        <div className="pointer-events-none absolute inset-8">
          {[
            "top-0 left-0 border-t-2 border-l-2 rounded-tl-[14px]",
            "top-0 right-0 border-t-2 border-r-2 rounded-tr-[14px]",
            "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-[14px]",
            "bottom-0 right-0 border-b-2 border-r-2 rounded-br-[14px]",
          ].map((c, i) => (
            <span
              key={i}
              className={`absolute h-9 w-9 ${c}`}
              style={{
                borderColor: "rgba(247,244,237,0.92)",
                boxShadow: "0 0 12px rgba(247,244,237,0.35)",
              }}
            />
          ))}
          <motion.div
            className="absolute inset-x-2 h-[2px] rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(247,244,237,0.95), transparent)",
              boxShadow: "0 0 14px rgba(247,244,237,0.55)",
            }}
            animate={{ y: [4, "calc(100% - 4px)", 4] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {(starting || saving) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[2px]">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: CREAM_SOFT }} />
          </div>
        )}
        {permissionDenied && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
            style={{ background: "rgba(10,10,10,0.72)", color: CREAM_SOFT }}
          >
            <Camera className="h-6 w-6" strokeWidth={1.6} />
            <p className="max-w-[220px] text-[13px] leading-[1.4]">
              Camera access is blocked. Enable it, or add the code by hand.
            </p>
            <button
              onClick={switchToManual}
              className="mt-2 rounded-full px-3 py-1.5 text-[12px]"
              style={{
                background: "rgba(247,244,237,0.14)",
                border: "1px solid rgba(247,244,237,0.25)",
                color: CREAM_SOFT,
                fontWeight: 500,
              }}
            >
              Enter manually
            </button>
          </div>
        )}
      </div>

      <div
        className="flex items-center justify-center gap-2 text-[12.5px]"
        style={{ color: MUTED }}
      >
        <span
          className="inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: starting ? "#c9a24a" : "#4a8f5a" }}
        />
        <span>
          {starting
            ? "Starting camera…"
            : permissionDenied
              ? "Camera unavailable"
              : "Ready — hold steady on the QR"}
        </span>
      </div>

      <button
        type="button"
        onClick={switchToManual}
        className="mx-auto text-[13px] underline decoration-[rgba(28,28,28,0.35)] underline-offset-[3px] transition-colors hover:decoration-[rgba(28,28,28,0.7)]"
        style={{ color: CHARCOAL, fontWeight: 500 }}
      >
        Can't scan? Enter the key manually
      </button>
    </div>
  );
}

function ManualTab({
  onSubmit,
  saving,
}: {
  onSubmit: (v: { issuer: string; label: string; secret: string; algorithm: Algorithm; digits: number; period: number }) => void;
  saving: boolean;
}) {
  const [issuer, setIssuer] = useState("");
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [algorithm, setAlgorithm] = useState<Algorithm>("SHA1");
  const [digits, setDigits] = useState(6);
  const [period, setPeriod] = useState(30);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const secretValid = secret.length > 0 && isValidBase32Secret(secret);
  const canSubmit = issuer.trim().length > 0 && secretValid && !saving;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr(null);
    if (!issuer.trim()) return setLocalErr("Add an issuer, like 'GitHub'.");
    if (!isValidBase32Secret(secret))
      return setLocalErr("Secret must be base32 (letters A–Z and digits 2–7).");
    onSubmit({ issuer, label, secret, algorithm, digits, period });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <SectionLabel>Account</SectionLabel>
      <SettingsGroup>
        <FieldRow label="Issuer" value={issuer} onChange={setIssuer} placeholder="GitHub" autoFocus />
        <FieldRow label="Account" value={label} onChange={setLabel} placeholder="you@example.com" />
      </SettingsGroup>

      <SectionLabel>Secret</SectionLabel>
      <SettingsGroup>
        <FieldRow
          label="Secret key"
          value={secret}
          onChange={(v) => setSecret(v.toUpperCase().replace(/\s+/g, ""))}
          placeholder="JBSWY3DPEHPK3PXP"
          mono
          icon={<KeyRound className="h-3.5 w-3.5" strokeWidth={1.8} />}
          valid={secretValid}
          invalid={secret.length > 0 && !secretValid}
        />
      </SettingsGroup>
      <p className="px-1 pt-1.5 text-[11.5px]" style={{ color: MUTED }}>
        Base32 only — letters A–Z and digits 2–7. Spaces are removed.
      </p>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="mt-4 flex items-center justify-between rounded-[12px] px-3.5 py-2.5"
        style={{
          background: "transparent",
          border: `1px dashed ${BORDER}`,
          color: CHARCOAL,
        }}
      >
        <span className="text-[12.5px]" style={{ fontWeight: 600, letterSpacing: "-0.005em" }}>
          Advanced options
        </span>
        <motion.span animate={{ rotate: showAdvanced ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4" strokeWidth={1.8} style={{ color: MUTED }} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-2">
              <SettingsGroup>
                <SelectRow
                  label="Algorithm"
                  value={algorithm}
                  onChange={(v) => setAlgorithm(v as Algorithm)}
                  options={["SHA1", "SHA256", "SHA512"]}
                />
                <SelectRow
                  label="Digits"
                  value={String(digits)}
                  onChange={(v) => setDigits(Number(v))}
                  options={["6", "7", "8"]}
                />
                <SelectRow
                  label="Period"
                  value={String(period)}
                  onChange={(v) => setPeriod(Number(v))}
                  options={["30", "60"]}
                />
              </SettingsGroup>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {localErr && (
        <div className="pt-3">
          <Notice kind="error">{localErr}</Notice>
        </div>
      )}

      <div className="pt-6">
        <PrimaryButton type="submit" loading={saving} disabled={!canSubmit}>
          Save account
        </PrimaryButton>
      </div>
    </form>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  placeholder,
  mono,
  autoFocus,
  icon,
  valid,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
  icon?: React.ReactNode;
  valid?: boolean;
  invalid?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 px-4 py-3">
      <span
        className="flex w-[76px] shrink-0 items-center gap-1.5 text-[12px]"
        style={{ color: MUTED, fontWeight: 500 }}
      >
        {icon}
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-[color:rgba(95,95,93,0.55)]"
        style={{
          color: CHARCOAL,
          fontFamily: mono
            ? "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
            : undefined,
          letterSpacing: mono ? "0.06em" : "-0.005em",
          fontWeight: 500,
        }}
      />
      {valid && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: "#4a8f5a", boxShadow: "0 0 6px rgba(74,143,90,0.4)" }}
        />
      )}
      {invalid && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: "#c9a24a" }}
        />
      )}
    </label>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-3 px-4 py-3">
      <span
        className="w-[76px] shrink-0 text-[12px]"
        style={{ color: MUTED, fontWeight: 500 }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none"
        style={{ color: CHARCOAL, fontWeight: 500 }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
