// Shared Excel + PDF export/share for Reports & Analytics - every connected
// module's report goes through these functions so there's one export
// format/behavior and one share mechanism across all 12, rather than each
// reinventing its own.
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportTableSection {
  heading: string;
  columns: string[];
  rows: (string | number)[][];
}

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// One sheet per section, named after the section heading (Excel sheet names
// are capped at 31 chars). An empty section still gets a sheet with a
// placeholder row rather than being silently dropped, so "no data in this
// range" is visible in the export itself, not just on-screen.
function buildExcelWorkbook(sections: ReportTableSection[]) {
  const workbook = XLSX.utils.book_new();
  sections.forEach((section, idx) => {
    const aoa = [section.columns, ...(section.rows.length ? section.rows : [section.columns.map(() => 'No records in this range')])];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const sheetName = (section.heading || `Sheet ${idx + 1}`).replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || `Sheet ${idx + 1}`;
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });
  return workbook;
}

// One PDF with a title/subtitle header, then one table per section,
// paginating automatically when a page fills up. Returns the jsPDF instance
// itself (not yet saved/output) so callers can either .save() it directly or
// pull a Blob out of it for sharing.
function buildPdfDoc(title: string, subtitle: string, sections: ReportTableSection[]): jsPDF {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 14, 22);

  let cursorY = 28;
  sections.forEach(section => {
    if (cursorY > 260) { doc.addPage(); cursorY = 20; }
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(section.heading, 14, cursorY);
    autoTable(doc, {
      startY: cursorY + 3,
      head: [section.columns],
      body: section.rows.length ? section.rows : [section.columns.map((_, i) => i === 0 ? 'No records in this range' : '')],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: 14, right: 14 }
    });
    cursorY = (doc as any).lastAutoTable.finalY + 10;
  });

  return doc;
}

export function exportReportToExcel(filename: string, sections: ReportTableSection[]) {
  XLSX.writeFile(buildExcelWorkbook(sections), `${filename}.xlsx`);
}

export function exportReportToPdf(filename: string, title: string, subtitle: string, sections: ReportTableSection[]) {
  buildPdfDoc(title, subtitle, sections).save(`${filename}.pdf`);
}

// Builds the same Excel/PDF file as a real File object (not triggering a
// download) - used by the Share action so the actual file can be handed to
// navigator.share() / the native OS share sheet (WhatsApp, Email, Drive,
// etc. - whatever's installed), the same mechanism Fleet & Vehicles' own
// document Share button already uses.
export function buildExcelFile(filename: string, sections: ReportTableSection[]): File {
  const wbout: ArrayBuffer = XLSX.write(buildExcelWorkbook(sections), { bookType: 'xlsx', type: 'array' });
  return new File([wbout], `${filename}.xlsx`, { type: EXCEL_MIME });
}

export function buildPdfFile(filename: string, title: string, subtitle: string, sections: ReportTableSection[]): File {
  const blob: Blob = buildPdfDoc(title, subtitle, sections).output('blob');
  return new File([blob], `${filename}.pdf`, { type: 'application/pdf' });
}

// Shares a File via the native OS share sheet (WhatsApp, Email, Drive,
// AirDrop, etc. - whatever the device has installed) when available, falling
// back to a forced download (with a notice) when it isn't - exact same
// fetch/File/navigator.share/fallback pattern as FleetSheet.tsx's document
// Share button, just building the File from freshly-generated content
// instead of fetching an existing upload.
export async function shareOrDownloadFile(file: File, shareTitle: string, shareText: string, onFallback: (message: string) => void): Promise<void> {
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  if (canNativeShare) {
    try {
      const shareData: ShareData = { title: shareTitle, text: shareText };
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        shareData.files = [file];
      }
      await navigator.share(shareData);
      return;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // user cancelled the share sheet - not an error
      // Fall through to the download fallback below.
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  onFallback("Share isn't supported on this device/browser - file downloaded instead so it can be shared manually.");
}
