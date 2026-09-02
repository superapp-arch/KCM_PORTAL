// Shared "KCM Logistics logo at the top" header for every generated PDF
// (HR & Payroll's Salary Slip, Driver Details' own Salary Slip, Fleet
// Maintenance's Service Invoice) - one place so a future branding/logo
// change only ever needs to happen here, not in three separately-hand-
// copied PDF builders.
import { jsPDF } from 'jspdf';
import logoUrl from '../assets/images/logo.png';

// The logo is a 598x175 PNG (~3.42:1) - bundled by Vite as a plain asset URL,
// which jsPDF's addImage can't draw from directly (it needs the actual image
// bytes, as a data URL). Fetched and converted to a data URL once, then
// cached for every document generated afterwards in the same session - a
// document generated before this resolves (or if the fetch ever fails) just
// falls back to the old plain-text "KCM LOGISTICS" heading it replaces,
// rather than blocking/erroring the whole PDF.
const LOGO_ASPECT = 175 / 598;
let logoDataUrlPromise: Promise<string> | null = null;
export function getDocumentLogoDataUrl(): Promise<string> {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(logoUrl)
      .then(res => res.blob())
      .then(blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }));
  }
  return logoDataUrlPromise;
}

// Draws the shared header (logo + subtitle + divider line) at the top of a
// fresh jsPDF document and returns the Y coordinate the caller's own content
// should start from. `logoDataUrl` is optional - pass undefined (e.g. the
// fetch above failed) to fall back to the plain text wordmark instead.
export function drawDocumentPdfHeader(doc: jsPDF, subtitle: string, logoDataUrl?: string): number {
  let headerBottomY: number;
  if (logoDataUrl) {
    const logoWidth = 56;
    const logoHeight = logoWidth * LOGO_ASPECT;
    doc.addImage(logoDataUrl, 'PNG', (210 - logoWidth) / 2, 10, logoWidth, logoHeight);
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 105, 10 + logoHeight + 6, { align: 'center' });
    headerBottomY = 10 + logoHeight + 10;
  } else {
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text('KCM LOGISTICS', 105, 16, { align: 'center' });
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 105, 23, { align: 'center' });
    headerBottomY = 28;
  }
  doc.setDrawColor(203, 213, 225);
  doc.line(14, headerBottomY, 196, headerBottomY);
  return headerBottomY;
}
