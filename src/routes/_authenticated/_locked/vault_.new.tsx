import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { getVaultKey } from "@/lib/vault-session";
import {
  addAccount,
  isValidBase32Secret,
  parseOtpauthUri,
  type Algorithm,
} from "@/lib/vault-accounts";
import { ArrowLeft, ScanLine, PenLine, Loader2, Camera } from "lucide-react";

const CREAM = "#f7f4ed";
const CHARCOAL = "#1c1c1a";
const MUTED = "#8a8a86";
const BORDER = "rgba(28,28,26,0.12)";

export const Route = createFileRoute("/_authenticated/_locked/vault_/new")({
  component: NewAccountPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm">
      {error.message}
    </div>
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
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: CREAM, color: CHARCOAL }}>
      <div className="mx-auto flex h-full w-full max-w-[440px] flex-col px-6 pt-[max(20px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between pb-5">
          <button
            onClick={() => navigate({ to: "/vault" })}
            className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px]"
            style={{ color: CHARCOAL }}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
            Back
          </button>
          <span className="text-[12px]" style={{ color: MUTED }}>
            New account
          </span>
        </header>

        <h1
          className="pb-4 text-[28px] leading-none tracking-tight"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Add a code.
        </h1>

        <div
          className="mb-5 flex rounded-full p-1"
          style={{ background: "rgba(28,28,26,0.06)" }}
        >
          <TabButton active={tab === "scan"} onClick={() => setTab("scan")} icon={<ScanLine className="h-3.5 w-3.5" strokeWidth={1.8} />}>
            Scan QR
          </TabButton>
          <TabButton active={tab === "manual"} onClick={() => setTab("manual")} icon={<PenLine className="h-3.5 w-3.5" strokeWidth={1.8} />}>
            Enter manually
          </TabButton>
        </div>

        {notice && (
          <div
            className="mb-3 rounded-xl px-3 py-2 text-[12.5px] leading-snug"
            style={{
              background: notice.kind === "error" ? "rgba(180,40,40,0.08)" : "rgba(28,28,26,0.05)",
              color: notice.kind === "error" ? "#8a2020" : CHARCOAL,
            }}
          >
            {notice.text}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
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
        </div>
      </div>
    </div>
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
      className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[12.5px] font-medium transition-colors"
      style={{
        background: active ? CREAM : "transparent",
        color: active ? CHARCOAL : MUTED,
        boxShadow: active ? "0 1px 2px rgba(28,28,26,0.08)" : "none",
      }}
    >
      {icon}
      {children}
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
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (result && !cancelled) {
              const text = result.getText();
              if (text.startsWith("otpauth://")) {
                controls?.stop();
                onDetected(text);
              }
            }
          },
        );
        if (!cancelled) setStarting(false);
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        const name = (err as { name?: string })?.name ?? "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setPermissionDenied(true);
        } else {
          onError(err instanceof Error ? err.message : "Could not start camera.");
        }
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
        className="relative aspect-square w-full overflow-hidden rounded-3xl border"
        style={{ borderColor: BORDER, background: "rgba(28,28,26,0.04)" }}
      >
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {(starting || saving) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: CREAM }} />
          </div>
        )}
        {permissionDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 p-6 text-center" style={{ color: CREAM }}>
            <Camera className="h-6 w-6" strokeWidth={1.6} />
            <p className="text-[13px]">Camera access was blocked. Enable it in your browser settings, or add the code manually.</p>
          </div>
        )}
        {/* Framing guides */}
        <div className="pointer-events-none absolute inset-6 rounded-2xl border-2" style={{ borderColor: "rgba(247,244,237,0.7)" }} />
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
      <TextField label="Issuer" value={issuer} onChange={setIssuer} placeholder="GitHub" autoFocus />
      <TextField label="Account (optional)" value={label} onChange={setLabel} placeholder="you@example.com" />
      <TextField
        label="Secret key"
        value={secret}
        onChange={(v) => setSecret(v.toUpperCase())}
        placeholder="JBSWY3DPEHPK3PXP"
        mono
      />
      <div className="grid grid-cols-3 gap-2">
        <SelectField
          label="Algorithm"
          value={algorithm}
          onChange={(v) => setAlgorithm(v as Algorithm)}
          options={["SHA1", "SHA256", "SHA512"]}
        />
        <SelectField
          label="Digits"
          value={String(digits)}
          onChange={(v) => setDigits(Number(v))}
          options={["6", "7", "8"]}
        />
        <SelectField
          label="Period"
          value={String(period)}
          onChange={(v) => setPeriod(Number(v))}
          options={["30", "60"]}
        />
      </div>

      {localErr && (
        <div className="rounded-xl px-3 py-2 text-[12.5px]" style={{ background: "rgba(180,40,40,0.08)", color: "#8a2020" }}>
          {localErr}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="mt-1 flex h-[46px] items-center justify-center gap-2 rounded-full text-[14px] font-medium disabled:opacity-60"
        style={{ background: CHARCOAL, color: CREAM }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save account"}
      </button>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
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
        className="h-[44px] rounded-2xl border bg-[rgba(255,255,255,0.55)] px-3.5 text-[15px] outline-none"
        style={{
          borderColor: BORDER,
          color: CHARCOAL,
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          letterSpacing: mono ? "0.08em" : undefined,
        }}
      />
    </label>
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
        className="h-[44px] rounded-2xl border bg-[rgba(255,255,255,0.55)] px-3 text-[14px] outline-none"
        style={{ borderColor: BORDER, color: CHARCOAL }}
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
