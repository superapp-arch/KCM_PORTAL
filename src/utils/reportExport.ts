// Shared Excel + PDF export for the Reports module - every connected
// module's report goes through these two functions so there's one export
// format/behavior across all 12, rather than each reinventing its own.
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportTableSection {
  heading: string;
  columns: string[];
  rows: (string | number)[][];
}

// One sheet per section, named after the section heading (Excel sheet names
// are capped at 31 chars). An empty section still gets a sheet with a
// placeholder row rather than being silently dropped, so "no data in this
// range" is visible in the export itself, not just on-screen.
export function exportReportToExcel(filename: string, sections: ReportTableSection[]) {
  const workbook = XLSX.utils.book_new();
  sections.forEach((section, idx) => {
    const aoa = [section.columns, ...(section.rows.length ? section.rows : [section.columns.map(() => 'No records in this range')])];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const sheetName = (section.heading || `Sheet ${idx + 1}`).replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || `Sheet ${idx + 1}`;
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// One PDF with a title/subtitle header, then one table per section,
// paginating automatically when a page fills up.
export function exportReportToPdf(filename: string, title: string, subtitle: string, sections: ReportTableSection[]) {
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

  doc.save(`${filename}.pdf`);
}
