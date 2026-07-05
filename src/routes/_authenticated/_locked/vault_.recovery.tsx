import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { ArrowLeft, Download, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getVaultKey } from "@/lib/vault-session";
import { listAccounts, type DecryptedAccount } from "@/lib/vault-accounts";
import {
  BORDER,
  CHARCOAL,
  CREAM,
  CREAM_SOFT,
  MUTED,
  Notice,
  PrimaryButton,
  soft,
} from "@/components/aegis/chrome";

export const Route = createFileRoute("/_authenticated/_locked/vault_/recovery")({
  component: RecoverySheetPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found</div>,
});

interface BackupPayload {
  v: 1;
  kdf: string;
  salt: string; // hex
  wk: string; // wrapped key hex
  iv: string; // wrap iv hex
  issued: string; // ISO
}

function toHex(input: unknown): string {
  if (typeof input === "string") {
    // bytea from Supabase comes back as `\x...`
    return input.startsWith("\\x") ? input.slice(2) : input;
  }
  return "";
}

function RecoverySheetPage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<DecryptedAccount[]>([]);
  const [payload, setPayload] = useState<BackupPayload | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dek = getVaultKey();
        if (!dek) throw new Error("Vault is locked.");
        const [{ data: meta, error: metaErr }, list] = await Promise.all([
          supabase
            .from("vault_meta")
            .select("kdf_algorithm, kdf_salt, recovery_wrapped_key, recovery_wrapped_key_iv")
            .eq("user_id", user.id)
            .single(),
          listAccounts(dek),
        ]);
        if (metaErr) throw metaErr;
        if (cancelled) return;

        const p: BackupPayload = {
          v: 1,
          kdf: meta.kdf_algorithm,
          salt: toHex(meta.kdf_salt),
          wk: toHex(meta.recovery_wrapped_key),
          iv: toHex(meta.recovery_wrapped_key_iv),
          issued: new Date().toISOString(),
        };
        setPayload(p);
        setAccounts(list);
        const dataUrl = await QRCode.toDataURL(JSON.stringify(p), {
          errorCorrectionLevel: "M",
          margin: 1,
          scale: 6,
          color: { dark: "#1c1c1c", light: "#fbf7ee" },
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not build recovery sheet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const issuedLabel = useMemo(
    () =>
      payload
        ? new Date(payload.issued).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "",
    [payload],
  );

  const downloadPdf = async () => {
    if (!payload || !qrDataUrl) return;
    setDownloading(true);
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 48;
      let y = 64;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("Aegis — Recovery sheet", marginX, y);
      y += 22;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text(
        "Store this page somewhere private and physical. Anyone with this sheet and your",
        marginX,
        y,
      );
      y += 14;
      doc.text("passphrase can restore your vault.", marginX, y);
      y += 24;

      doc.setTextColor(28);
      doc.setFontSize(11);
      doc.text(`Account: ${user.email ?? user.id}`, marginX, y);
      y += 14;
      doc.text(`Issued: ${issuedLabel}`, marginX, y);
      y += 24;

      // QR
      const qrSize = 200;
      doc.addImage(qrDataUrl, "PNG", marginX, y, qrSize, qrSize);
      // Side text next to QR
      const sideX = marginX + qrSize + 24;
      let sideY = y + 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Backup key", sideX, sideY);
      sideY += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90);
      const wrap = doc.splitTextToSize(
        "Scan this code in Aegis after re-installing to restore your wrapped key. You'll still need your passphrase to decrypt.",
        pageWidth - sideX - marginX,
      );
      doc.text(wrap, sideX, sideY);
      sideY += wrap.length * 12 + 12;
      doc.setTextColor(28);
      doc.setFont("courier", "normal");
      doc.setFontSize(8);
      const shortHex = `${payload.wk.slice(0, 16)}…${payload.wk.slice(-16)}`;
      doc.text(`KDF: ${payload.kdf}`, sideX, sideY);
      sideY += 12;
      doc.text(`Key fingerprint: ${shortHex}`, sideX, sideY);

      y += qrSize + 32;

      // Accounts
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(28);
      doc.text(`Accounts (${accounts.length})`, marginX, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(70);

      const lineHeight = 14;
      const bottom = doc.internal.pageSize.getHeight() - 56;
      const sorted = [...accounts].sort((a, b) =>
        (a.issuer || a.label).localeCompare(b.issuer || b.label),
      );
      for (const acc of sorted) {
        if (y > bottom) {
          doc.addPage();
          y = 64;
        }
        const name = acc.issuer || "Untitled";
        const detail = acc.label ? `  ·  ${acc.label}` : "";
        doc.text(`•  ${name}${detail}`, marginX, y);
        y += lineHeight;
      }

      // Footer
      const footY = doc.internal.pageSize.getHeight() - 32;
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(
        "Aegis · end-to-end encrypted · print & store offline",
        marginX,
        footY,
      );

      doc.save(`aegis-recovery-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("Recovery sheet downloaded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not generate PDF.";
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-5 pb-10 pt-4"
      style={{ background: CREAM, color: CHARCOAL }}
    >
      <div className="flex items-center gap-2 pb-2">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => navigate({ to: "/security" })}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: "rgba(28,28,28,0.06)", color: CHARCOAL }}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.9} />
        </motion.button>
        <div
          className="text-[13px]"
          style={{ color: MUTED, letterSpacing: "0.04em", textTransform: "uppercase" }}
        >
          Recovery
        </div>
      </div>

      <div className="pt-3">
        <div
          className="text-[26px] leading-tight"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          Print this. Store it somewhere real.
        </div>
        <div className="mt-2 text-[13.5px]" style={{ color: MUTED }}>
          A one-page backup of the accounts you have and the wrapped key needed
          to restore them. Paired with your passphrase, this sheet rebuilds
          your vault after a lost device.
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 pt-8" style={{ color: MUTED }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing your sheet…
        </div>
      )}

      {error && (
        <div className="pt-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {!loading && !error && payload && qrDataUrl && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={soft}
            className="mt-6 flex flex-col items-center gap-4 rounded-[20px] px-5 py-6"
            style={{
              background: CREAM_SOFT,
              border: `1px solid ${BORDER}`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            <div
              className="rounded-[16px] p-3"
              style={{ background: "#fbf7ee", border: `1px solid ${BORDER}` }}
            >
              <img
                src={qrDataUrl}
                alt="Recovery QR"
                width={196}
                height={196}
                className="block"
              />
            </div>
            <div className="text-center">
              <div className="text-[13px]" style={{ color: CHARCOAL, fontWeight: 600 }}>
                {accounts.length} account{accounts.length === 1 ? "" : "s"}
              </div>
              <div className="mt-1 text-[11.5px]" style={{ color: MUTED }}>
                Issued {issuedLabel}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...soft, delay: 0.06 }}
            className="mt-4 flex items-start gap-2.5 rounded-[14px] px-4 py-3"
            style={{
              background: "rgba(28,28,28,0.03)",
              border: `1px solid ${BORDER}`,
            }}
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            <div className="text-[12px]" style={{ color: MUTED, lineHeight: 1.55 }}>
              The QR contains your wrapped key — it is useless without your
              passphrase. We still recommend keeping the printed sheet
              somewhere private (safe, drawer, sealed envelope).
            </div>
          </motion.div>

          <div className="pt-5">
            <PrimaryButton onClick={downloadPdf} loading={downloading}>
              <span className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" strokeWidth={2} />
                Download PDF
              </span>
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}
