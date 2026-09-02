// Renders a ServiceInvoiceRecord (an already-frozen snapshot - see types.ts)
// into a PDF, using the same jsPDF + jspdf-autotable toolchain already
// established for Reports & Analytics (src/utils/reportExport.ts) and the
// Salary Slip (src/utils/salarySlipPdf.ts) rather than introducing a second
// PDF approach.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ServiceInvoiceRecord } from '../types';
import { numberToIndianWords } from './numberToWords';
import { getDocumentLogoDataUrl, drawDocumentPdfHeader } from './documentPdfHeader';

const rupee = (n: number | undefined) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;

export function buildServiceInvoiceDoc(invoice: ServiceInvoiceRecord, logoDataUrl?: string): jsPDF {
  const doc = new jsPDF();

  // Header - the shared KCM Logistics logo (see utils/documentPdfHeader.ts),
  // falling back to the plain text wordmark it replaces if it isn't ready.
  const headerBottomY = drawDocumentPdfHeader(doc, 'Service Invoice', logoDataUrl);

  // Invoice No / Work Order Date+Time - the header is always built from the
  // work order's own date/time, never today's system date (only the footer's
  // "Generated on" line reflects today).
  autoTable(doc, {
    startY: headerBottomY + 5,
    body: [
      ['Invoice No.', invoice.invoiceNumber, 'Work Order Date', `${invoice.workOrderDate}${invoice.workOrderTime ? ' ' + invoice.workOrderTime : ''}`],
      ['Service Station', invoice.garageName || '-', 'Vehicle No.', invoice.regNo]
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [100, 116, 139] },
      2: { fontStyle: 'bold', textColor: [100, 116, 139] }
    }
  });
  let cursorY = (doc as any).lastAutoTable.finalY + 4;

  // Bill To
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', 14, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text('KCM Logistics', 32, cursorY);
  cursorY += 6;

  // Vehicle Info - no Fuel % line (dropped per spec); Model/Ownership are
  // auto-fetched from Fleet & Vehicles at generation time.
  autoTable(doc, {
    startY: cursorY,
    head: [['Vehicle Info', '']],
    body: [
      ['Vehicle Model', invoice.vehicleModel || '-'],
      ['Ownership', invoice.vehicleOwnership || '-'],
      ['Odometer Reading', invoice.odometer != null ? `${invoice.odometer.toLocaleString('en-IN')} km` : 'No fuel/mileage entries yet']
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 60 } }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 6;

  // Spare/Labour work items
  const itemRows = invoice.workItems.map((w, i) => [
    String(i + 1), w.description || '-', w.type || '-', rupee(w.cost)
  ]);
  autoTable(doc, {
    startY: cursorY,
    head: [['#', 'Description', 'Type', 'Amount']],
    body: itemRows,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175] },
    columnStyles: { 0: { cellWidth: 10 }, 2: { cellWidth: 25 }, 3: { halign: 'right', cellWidth: 30 } }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 6;

  // Total / Paid / Balance
  const paid = invoice.paidAmount || 0;
  const balance = (invoice.totalAmount || 0) - paid;
  autoTable(doc, {
    startY: cursorY,
    body: [
      ['Total Amount', rupee(invoice.totalAmount)],
      ['Paid Amount', rupee(paid)],
      ['Balance Due', rupee(balance)]
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5, halign: 'right' },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [71, 85, 105], halign: 'left' } },
    margin: { left: 106 }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 4;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  doc.text(numberToIndianWords(invoice.totalAmount), 14, cursorY);
  doc.setFont('helvetica', 'normal');
  cursorY += 8;

  if (invoice.nextServiceDueNote) {
    doc.setFontSize(8.5);
    doc.setTextColor(180, 83, 9);
    doc.text(`Next Servicing Due: ${invoice.nextServiceDueNote}`, 14, cursorY);
    cursorY += 8;
  }

  // Terms
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Terms: Payment due within 30 days of invoice date. Please quote the Invoice No. in all correspondence.', 14, cursorY);
  cursorY += 14;

  // Signature lines
  doc.setDrawColor(148, 163, 184);
  doc.line(14, cursorY, 74, cursorY);
  doc.line(136, cursorY, 196, cursorY);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Service Station Signature', 14, cursorY + 5);
  doc.text('Authorized by (KCM Logistics)', 136, cursorY + 5);
  cursorY += 16;

  // Footer - the timestamp the PDF/slip was actually generated, distinct
  // from the work order's own date/time shown up top.
  doc.setDrawColor(203, 213, 225);
  doc.line(14, cursorY, 196, cursorY);
  cursorY += 6;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Invoice No: ${invoice.invoiceNumber}`, 14, cursorY);
  doc.text(`Generated: ${invoice.generatedDate}${invoice.generatedTime ? ' ' + invoice.generatedTime : ''}`, 196, cursorY, { align: 'right' });
  cursorY += 6;
  doc.setFont('helvetica', 'italic');
  doc.text('This is a system-generated invoice.', 105, cursorY, { align: 'center' });

  return doc;
}

export async function buildServiceInvoiceFile(invoice: ServiceInvoiceRecord): Promise<File> {
  let logoDataUrl: string | undefined;
  try {
    logoDataUrl = await getDocumentLogoDataUrl();
  } catch (err) {
    console.error('Failed to load KCM Logistics logo for the service invoice - falling back to the text-only header:', err);
  }
  const blob: Blob = buildServiceInvoiceDoc(invoice, logoDataUrl).output('blob');
  return new File([blob], `${invoice.invoiceNumber.replace(/[^A-Za-z0-9-]/g, '_')}.pdf`, { type: 'application/pdf' });
}
