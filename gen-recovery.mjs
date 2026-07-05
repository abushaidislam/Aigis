import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { writeFileSync } from 'fs';

const payload = {
  v: 1, kdf: 'argon2id',
  salt: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
  wk: 'ff'.repeat(48),
  iv: '00112233445566778899aabb',
  issued: new Date().toISOString(),
};
const accounts = [
  { issuer: 'GitHub', label: 'octocat@users.noreply.github.com' },
  { issuer: 'Google', label: 'jane.doe@gmail.com' },
  { issuer: 'AWS', label: 'root · 1234567890' },
  { issuer: 'Cloudflare', label: '' },
  { issuer: 'Notion', label: 'workspace-owner' },
  { issuer: 'Vercel', label: 'jane@acme.co' },
  { issuer: 'Discord', label: 'jane#0001' },
  { issuer: 'Twitch', label: '' },
  { issuer: 'Reddit', label: 'u/janedoe' },
  { issuer: 'Steam', label: '' },
  { issuer: 'Binance', label: 'jane@acme.co' },
  { issuer: 'Coinbase', label: '' },
];
const user = { email: 'jane.doe@example.com', id: 'x' };
const qr = await QRCode.toDataURL(JSON.stringify(payload), { errorCorrectionLevel: 'M', margin: 1, scale: 6, color: { dark: '#1c1c1c', light: '#fbf7ee' } });

const issuedLabel = new Date(payload.issued).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const marginX = 48;
let y = 64;
doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
doc.text('Aegis — Recovery sheet', marginX, y); y += 22;
doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110);
doc.text('Store this page somewhere private and physical. Anyone with this sheet and your', marginX, y); y += 14;
doc.text('passphrase can restore your vault.', marginX, y); y += 24;
doc.setTextColor(28); doc.setFontSize(11);
doc.text(`Account: ${user.email}`, marginX, y); y += 14;
doc.text(`Issued: ${issuedLabel}`, marginX, y); y += 24;
const qrSize = 200;
doc.addImage(qr, 'PNG', marginX, y, qrSize, qrSize);
const sideX = marginX + qrSize + 24; let sideY = y + 12;
doc.setFont('helvetica','bold'); doc.setFontSize(12);
doc.text('Backup key', sideX, sideY); sideY += 16;
doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(90);
const wrap = doc.splitTextToSize("Scan this code in Aegis after re-installing to restore your wrapped key. You'll still need your passphrase to decrypt.", pageWidth - sideX - marginX);
doc.text(wrap, sideX, sideY); sideY += wrap.length*12 + 12;
doc.setTextColor(28); doc.setFont('courier','normal'); doc.setFontSize(8);
const shortHex = `${payload.wk.slice(0,16)}…${payload.wk.slice(-16)}`;
doc.text(`KDF: ${payload.kdf}`, sideX, sideY); sideY += 12;
doc.text(`Key fingerprint: ${shortHex}`, sideX, sideY);
y += qrSize + 32;
doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(28);
doc.text(`Accounts (${accounts.length})`, marginX, y); y += 16;
doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(70);
const lh = 14; const bottom = doc.internal.pageSize.getHeight() - 56;
const sorted = [...accounts].sort((a,b) => (a.issuer||a.label).localeCompare(b.issuer||b.label));
for (const acc of sorted) {
  if (y > bottom) { doc.addPage(); y = 64; }
  const name = acc.issuer || 'Untitled';
  const detail = acc.label ? `  ·  ${acc.label}` : '';
  doc.text(`•  ${name}${detail}`, marginX, y); y += lh;
}
const footY = doc.internal.pageSize.getHeight() - 32;
doc.setFontSize(8); doc.setTextColor(140);
doc.text('Aegis · end-to-end encrypted · print & store offline', marginX, footY);
writeFileSync('/tmp/browser/recovery/dl/mock.pdf', Buffer.from(doc.output('arraybuffer')));
console.log('ok');
