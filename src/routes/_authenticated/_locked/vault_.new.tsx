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
import { ArrowLeft, ScanLine, PenLine, Loader2, Camera } from "lucide-react";
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
  LargeTitle,
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
      <AppBar
        title="Add account"
        trailing={
          <AppBarButton label="Back" onClick={() => navigate({ to: "/vault" })}>
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          </AppBarButton>
        }
      />

      <LargeTitle
        title="New code"
        subtitle="Scan a QR from any service, or type in the secret by hand."
      />

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto pt-1 pb-[calc(96px+env(safe-area-inset-bottom))]">
        <SegmentedTabs tab={tab} setTab={setTab} />

        {notice && (
          <div className="pt-3">
            <Notice kind={notice.kind}>{notice.text}</Notice>
          </div>
        )}

        <div className="pt-3">
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
      className="relative mt-1 flex rounded-full p-1"
      style={{
        background: CREAM_SOFT,
        border: `1px solid ${BORDER}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
      }}
    >
      <SegButton active={tab === "scan"} onClick={() => setTab("scan")} icon={<ScanLine className="h-3.5 w-3.5" strokeWidth={1.8} />}>
        Scan QR
      </SegButton>
      <SegButton active={tab === "manual"} onClick={() => setTab("manual")} icon={<PenLine className="h-3.5 w-3.5" strokeWidth={1.8} />}>
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
      className="relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[12.5px]"
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
        style={{
          border: `1px solid ${BORDER}`,
          background: "rgba(28,28,28,0.04)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

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
    <form onSubmit={submit} className="flex flex-col gap-1">
      <SectionLabel>Account</SectionLabel>
      <SettingsGroup>
        <FieldRow
          label="Issuer"
          value={issuer}
          onChange={setIssuer}
          placeholder="GitHub"
          autoFocus
        />
        <FieldRow
          label="Account"
          value={label}
          onChange={setLabel}
          placeholder="you@example.com"
        />
      </SettingsGroup>

      <SectionLabel>Secret</SectionLabel>
      <SettingsGroup>
        <FieldRow
          label="Secret key"
          value={secret}
          onChange={(v) => setSecret(v.toUpperCase())}
          placeholder="JBSWY3DPEHPK3PXP"
          mono
        />
      </SettingsGroup>

      <SectionLabel>Advanced</SectionLabel>
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

      {localErr && (
        <div className="pt-3">
          <Notice kind="error">{localErr}</Notice>
        </div>
      )}

      <div className="pt-5">
        <PrimaryButton type="submit" loading={saving}>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 px-4 py-2.5">
      <span
        className="w-[76px] shrink-0 text-[12px]"
        style={{ color: MUTED, fontWeight: 500 }}
      >
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
          fontFamily: mono ? "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          letterSpacing: mono ? "0.06em" : "-0.005em",
          fontWeight: 500,
        }}
      />
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
    <label className="flex items-center gap-3 px-4 py-2.5">
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
