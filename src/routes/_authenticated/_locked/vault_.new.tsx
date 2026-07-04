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
import { ArrowLeft, ScanLine, PenLine, Loader2, Camera, QrCode } from "lucide-react";
import {
  AegisScreen,
  BORDER,
  BrandBar,
  CHARCOAL,
  CREAM_SOFT,
  Display,
  Eyebrow,
  HeroIcon,
  Lede,
  MUTED,
  Notice,
  PrimaryButton,
  inputClass,
  inputStyle,
  soft,
} from "@/components/aegis/chrome";
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
      <BrandBar
        right={
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => navigate({ to: "/vault" })}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px]"
            style={{ color: CHARCOAL, background: "rgba(28,28,28,0.04)", border: `1px solid ${BORDER}` }}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
            Back
          </motion.button>
        }
      />


      <div className="flex flex-col gap-4 pt-2 pb-4">
        <div className="flex items-center gap-3">
          <HeroIcon Icon={QrCode} />
          <div className="flex flex-col gap-1.5">
            <Eyebrow>New account</Eyebrow>
            <Display>Add a code.</Display>
          </div>
        </div>
        <Lede>Scan a QR from any service, or type the secret in by hand.</Lede>
      </div>

      <div
        className="relative mb-4 flex rounded-full p-1"
        style={{ background: CREAM_SOFT, border: `1px solid ${BORDER}` }}
      >
        <TabButton active={tab === "scan"} onClick={() => setTab("scan")} icon={<ScanLine className="h-3.5 w-3.5" strokeWidth={1.8} />}>
          Scan QR
        </TabButton>
        <TabButton active={tab === "manual"} onClick={() => setTab("manual")} icon={<PenLine className="h-3.5 w-3.5" strokeWidth={1.8} />}>
          Enter manually
        </TabButton>
      </div>

      {notice && (
        <div className="mb-3">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-28">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
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
              />
            ) : (
              <ManualTab onSubmit={save} saving={saving} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomTabs />
    </AegisScreen>
  );
}

function TabButton({
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
      className="relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[12.5px] font-medium"
      style={{ color: active ? CHARCOAL : MUTED }}
    >
      {active && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-full"
          style={{ background: "rgba(28,28,28,0.06)", border: `1px solid ${BORDER}` }}
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
}: {
  onDetected: (uri: string) => void;
  onError: (msg: string) => void;
  saving: boolean;
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
    <div className="flex flex-col gap-3">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-[20px]"
        style={{ border: `1px solid ${BORDER}`, background: "rgba(28,28,28,0.04)" }}
      >
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

        {/* animated framing brackets */}
        <div className="pointer-events-none absolute inset-6">
          {[
            "top-0 left-0 border-t-2 border-l-2 rounded-tl-xl",
            "top-0 right-0 border-t-2 border-r-2 rounded-tr-xl",
            "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl",
            "bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl",
          ].map((c, i) => (
            <span
              key={i}
              className={`absolute h-8 w-8 ${c}`}
              style={{ borderColor: "rgba(247,244,237,0.85)" }}
            />
          ))}
          {/* scan line */}
          <motion.div
            className="absolute inset-x-0 h-[2px] rounded-full"
            style={{ background: "linear-gradient(90deg, transparent, rgba(247,244,237,0.9), transparent)" }}
            animate={{ y: [0, 200, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {(starting || saving) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: CREAM_SOFT }} />
          </div>
        )}
        {permissionDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 p-6 text-center" style={{ color: CREAM_SOFT }}>
            <Camera className="h-6 w-6" strokeWidth={1.6} />
            <p className="text-[13px]">Camera access was blocked. Enable it in your browser settings, or add the code manually.</p>
          </div>
        )}
      </div>
      <p className="text-center text-[12px]" style={{ color: MUTED }}>
        Point your camera at the QR code shown by any service.
      </p>
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
  const [localErr, setLocalErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr(null);
    if (!issuer.trim()) return setLocalErr("Add an issuer, like 'GitHub'.");
    if (!isValidBase32Secret(secret)) return setLocalErr("Secret must be base32 (letters A–Z and digits 2–7).");
    onSubmit({ issuer, label, secret, algorithm, digits, period });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <TextField label="Issuer" value={issuer} onChange={setIssuer} placeholder="GitHub" autoFocus delay={0.02} />
      <TextField label="Account (optional)" value={label} onChange={setLabel} placeholder="you@example.com" delay={0.06} />
      <TextField
        label="Secret key"
        value={secret}
        onChange={(v) => setSecret(v.toUpperCase())}
        placeholder="JBSWY3DPEHPK3PXP"
        mono
        delay={0.1}
      />
      <div className="grid grid-cols-3 gap-2">
        <SelectField label="Algorithm" value={algorithm} onChange={(v) => setAlgorithm(v as Algorithm)} options={["SHA1", "SHA256", "SHA512"]} />
        <SelectField label="Digits" value={String(digits)} onChange={(v) => setDigits(Number(v))} options={["6", "7", "8"]} />
        <SelectField label="Period" value={String(period)} onChange={(v) => setPeriod(Number(v))} options={["30", "60"]} />
      </div>

      {localErr && <Notice kind="error">{localErr}</Notice>}

      <div className="pt-1">
        <PrimaryButton type="submit" loading={saving}>
          Save account
        </PrimaryButton>
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  autoFocus,
  delay = 0,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
  delay?: number;
}) {
  return (
    <motion.label
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...soft, delay }}
      className="flex flex-col gap-1.5"
    >
      <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>
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
        className={`h-[46px] rounded-[12px] px-3.5 text-[15px] outline-none ${inputClass}`}
        style={{
          ...inputStyle,
          background: CREAM_SOFT,
          border: `1px solid ${BORDER}`,
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          letterSpacing: mono ? "0.08em" : undefined,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      />
    </motion.label>
  );
}

function SelectField({
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[46px] rounded-[12px] px-3 text-[14px] outline-none"
        style={{ background: CREAM_SOFT, border: `1px solid ${BORDER}`, color: CHARCOAL }}
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
