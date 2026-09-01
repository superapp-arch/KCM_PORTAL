// Customer Billing's Import/Export logic - kept separate from Billing.tsx
// (already large) and from billingInvoiceCalc.ts (the manual-form-facing
// calc helpers) since this file's own job is specifically translating
// spreadsheet rows in/out, not driving a live form.
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BillingInvoice, BillingCreditNote, BillingPaymentStatus } from '../types';
import {
  computeTotalAmt, computeTdsAmount, computeAmountReceivable, computeDueDate,
  computeShortageExcess, legacyStatusFor, DEFAULT_TDS_RATE, effectiveInvoiceAmount,
  effectiveInvoiceStatus, financialYearLabel
} from './billingInvoiceCalc';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Import template version (2026-09-05) - bumped whenever
// BILLING_IMPORT_TEMPLATE_HEADERS changes shape, so an old downloaded
// template can eventually be told apart from a current one if a version
// marker column is ever added. For now, validation is purely by exact
// header-name match (see parseBillingImportWorkbook) - simpler and doesn't
// depend on the office re-downloading a fresh template file every time nothing
// actually changed.
export const BILLING_IMPORT_TEMPLATE_VERSION = '1.0';

export const BILLING_IMPORT_TEMPLATE_HEADERS = [
  'Invoice Reference Number', 'Client Name', 'Entity', 'List Price', 'GST %',
  'TDS Rate (%)', 'Credit Note', 'Invoice Issue Date', 'Received Date',
  'Credit Period', 'Payment Status', 'Remarks'
] as const;

const VALID_ENTITIES = ['Regular', 'Dedicated', 'Adhoc', 'Labour Charges', 'Opex', 'Toll'];
const VALID_STATUSES = ['Pending', 'Cleared', 'Short Payment', 'Overdue'];

export function downloadBillingImportTemplate(): void {
  const sample = {
    'Invoice Reference Number': 'KCMI/25-26/001',
    'Client Name': 'Example Client Pvt Ltd',
    'Entity': 'Regular',
    'List Price': 75000,
    'GST %': 18,
    'TDS Rate (%)': 2,
    'Credit Note': 0,
    'Invoice Issue Date': '2026-09-01',
    'Received Date': '',
    'Credit Period': 30,
    'Payment Status': 'Pending',
    'Remarks': 'Sample row - delete before importing. GST % is a single rate (this template has no IGST/CGST+SGST split); Total Amt/TDS Amount/Amount Receivable are always recalculated on import, never read from the file.'
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: [...BILLING_IMPORT_TEMPLATE_HEADERS] });
  ws['!cols'] = BILLING_IMPORT_TEMPLATE_HEADERS.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import Invoices');
  XLSX.writeFile(wb, 'KCM_Billing_Import_Template.xlsx');
}

export interface ParsedBillingImportRow {
  rowNumber: number; // 1-based, matches the spreadsheet row (header is row 1)
  invoiceNo: string;
  customerName: string;
  entity: string;
  listPrice: number;
  gstPercent: number;
  tdsRate: number;
  creditNoteAmt: number;
  date: string; // YYYY-MM-DD
  receivedDate: string;
  creditPeriodDays: number;
  paymentStatus: string;
  description: string;
  errors: string[];
}

function normalizeDate(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}

// Reads an uploaded .xlsx/.csv File and validates it against the current
// template - `headerValid: false` means the file doesn't match (missing or
// renamed columns), which the caller should reject with a clear message
// rather than silently importing misaligned columns.
export async function parseBillingImportFile(file: File, existingInvoices: BillingInvoice[]): Promise<{ headerValid: boolean; missingHeaders: string[]; rows: ParsedBillingImportRow[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const headerRow: string[] = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[]) || [];
  const missingHeaders = BILLING_IMPORT_TEMPLATE_HEADERS.filter(h => !headerRow.includes(h));
  if (missingHeaders.length > 0) {
    return { headerValid: false, missingHeaders, rows: [] };
  }

  const existingInvoiceNos = new Set(existingInvoices.map(i => (i.invoiceNo || '').trim().toUpperCase()));
  const seenInThisFile = new Set<string>();

  const rows: ParsedBillingImportRow[] = json.map((raw, idx) => {
    const errors: string[] = [];
    const invoiceNo = String(raw['Invoice Reference Number'] || '').trim().toUpperCase();
    const customerName = String(raw['Client Name'] || '').trim();
    const entity = String(raw['Entity'] || '').trim();
    const listPrice = Number(raw['List Price']) || 0;
    const gstPercent = raw['GST %'] !== '' ? Number(raw['GST %']) : 0;
    const tdsRate = raw['TDS Rate (%)'] !== '' ? Number(raw['TDS Rate (%)']) : DEFAULT_TDS_RATE;
    const creditNoteAmt = raw['Credit Note'] !== '' ? Number(raw['Credit Note']) : 0;
    const date = normalizeDate(raw['Invoice Issue Date']);
    const receivedDate = normalizeDate(raw['Received Date']);
    const creditPeriodDays = raw['Credit Period'] !== '' ? Number(raw['Credit Period']) : 30;
    const paymentStatusRaw = String(raw['Payment Status'] || '').trim();
    const paymentStatus = paymentStatusRaw || 'Pending';
    const description = String(raw['Remarks'] || '').trim();

    if (!invoiceNo) errors.push('Invoice Reference Number is required.');
    if (!customerName) errors.push('Client Name is required.');
    if (!(listPrice > 0)) errors.push('List Price must be greater than 0.');
    if (!date) errors.push('Invoice Issue Date is missing or not a recognized date (use YYYY-MM-DD or DD/MM/YYYY).');
    if (entity && !VALID_ENTITIES.includes(entity)) errors.push(`Entity must be one of: ${VALID_ENTITIES.join(', ')}.`);
    if (isNaN(gstPercent) || gstPercent < 0) errors.push('GST % must be a number 0 or greater.');
    if (isNaN(tdsRate) || tdsRate < 0) errors.push('TDS Rate (%) must be a number 0 or greater.');
    if (isNaN(creditPeriodDays) || creditPeriodDays < 0) errors.push('Credit Period must be a number 0 or greater.');
    if (paymentStatusRaw && !VALID_STATUSES.includes(paymentStatusRaw)) errors.push(`Payment Status must be one of: ${VALID_STATUSES.join(', ')}.`);
    if (invoiceNo) {
      if (existingInvoiceNos.has(invoiceNo)) errors.push('Invoice Reference Number already exists in the ledger.');
      else if (seenInThisFile.has(invoiceNo)) errors.push('Invoice Reference Number is duplicated elsewhere in this file.');
      seenInThisFile.add(invoiceNo);
    }
    const creditNoteFits = creditNoteAmt <= 0 || listPrice <= 0 || creditNoteAmt <= computeTotalAmt(listPrice, round2(listPrice * gstPercent / 100), 0, 0);
    if (!creditNoteFits) errors.push('Credit Note cannot exceed Total Amt.');

    return {
      rowNumber: idx + 2, invoiceNo, customerName, entity, listPrice, gstPercent, tdsRate, creditNoteAmt,
      date, receivedDate, creditPeriodDays, paymentStatus, description, errors
    };
  });

  return { headerValid: true, missingHeaders: [], rows };
}

// Builds the real BillingInvoice payload for one valid import row - Total
// Amt/TDS Amount/Amount Receivable are always recomputed here from List
// Price/GST %/TDS Rate/Credit Note, exactly like the manual form does,
// never read as raw values even if the file happened to have columns for
// them (the template deliberately doesn't offer those columns at all).
// GST % maps to a single IGST amount - the template has no IGST/CGST+SGST
// split column, so importing always produces an IGST-type invoice; switch
// it in the Manage modal afterward if a given row was actually intra-state.
export function buildInvoiceFromImportRow(row: ParsedBillingImportRow): Omit<BillingInvoice, 'id'> {
  const igst = round2(row.listPrice * row.gstPercent / 100);
  const totalAmt = computeTotalAmt(row.listPrice, igst, 0, 0);
  const tdsAmount = computeTdsAmount(row.listPrice, row.tdsRate);
  const creditNotes: BillingCreditNote[] = row.creditNoteAmt > 0
    ? [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: row.date, amount: row.creditNoteAmt, reason: 'Imported' }]
    : [];
  const amountReceivable = computeAmountReceivable(totalAmt, 0, tdsAmount, creditNotes);
  const dueDate = computeDueDate(row.date, row.creditPeriodDays);
  const paymentStatus = (row.paymentStatus || 'Pending') as BillingPaymentStatus;
  return {
    invoiceNo: row.invoiceNo,
    date: row.date,
    customerName: row.customerName,
    description: row.description,
    amount: totalAmt,
    status: legacyStatusFor(paymentStatus),
    entity: (row.entity || undefined) as BillingInvoice['entity'],
    listPrice: row.listPrice,
    gstType: row.gstPercent > 0 ? 'IGST' : undefined,
    igst: igst || undefined,
    totalAmt,
    tdsRate: row.tdsRate,
    tdsAmount,
    creditNotes,
    amountReceivable,
    creditPeriodDays: row.creditPeriodDays,
    dueDate,
    paymentStatus,
    receivedDate: row.receivedDate || undefined,
    shortageExcess: computeShortageExcess(amountReceivable, 0)
  };
}

export function exportErrorRowsToExcel(rows: ParsedBillingImportRow[]): void {
  const errorRows = rows.filter(r => r.errors.length > 0);
  const data = errorRows.map(r => ({
    'Row': r.rowNumber, 'Invoice Reference Number': r.invoiceNo, 'Client Name': r.customerName,
    'Entity': r.entity, 'List Price': r.listPrice, 'GST %': r.gstPercent, 'TDS Rate (%)': r.tdsRate,
    'Credit Note': r.creditNoteAmt, 'Invoice Issue Date': r.date, 'Received Date': r.receivedDate,
    'Credit Period': r.creditPeriodDays, 'Payment Status': r.paymentStatus, 'Remarks': r.description,
    'Errors': r.errors.join('; ')
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errors');
  XLSX.writeFile(wb, `KCM_Billing_Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// --- Export (Excel + PDF) ---

// Current financial year's invoices only, unless the caller explicitly asks
// for everything - keeps a default export fast on a long-lived ledger.
export function filterToCurrentFinancialYear(invoices: BillingInvoice[]): BillingInvoice[] {
  const currentFy = financialYearLabel(new Date().toISOString().slice(0, 10));
  return invoices.filter(inv => financialYearLabel(inv.date) === currentFy);
}

export function exportBillingInvoicesToExcel(invoices: BillingInvoice[]): void {
  const rows = invoices.map(inv => ({
    'Date': inv.date, 'Invoice No': inv.invoiceNo, 'Customer Name': inv.customerName,
    'Entity': inv.entity || '', 'List Price': inv.listPrice ?? '', 'GST Type': inv.gstType || '',
    'IGST': inv.igst ?? '', 'CGST': inv.cgst ?? '', 'SGST': inv.sgst ?? '', 'Toll Charges': inv.tollCharges ?? '',
    'Total Amt': effectiveInvoiceAmount(inv), 'TDS Rate (%)': inv.tdsRate ?? '', 'TDS Amount': inv.tdsAmount ?? '',
    'Discount & Debit': inv.discountAndDebit ?? '',
    'Credit Note': (inv.creditNotes || []).reduce((s, c) => s + (c.amount || 0), 0),
    'Amount Receivable': inv.amountReceivable ?? '', 'Credit Period (days)': inv.creditPeriodDays ?? '',
    'Due Date': inv.dueDate || '', 'Payment Status': effectiveInvoiceStatus(inv),
    'Amount Received': inv.amountReceived ?? '', 'Received Date': inv.receivedDate || '',
    'Shortage/Excess': inv.shortageExcess ?? '', 'Remarks': inv.description || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
  XLSX.writeFile(wb, `KCM_Billing_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportBillingInvoicesToPdf(invoices: BillingInvoice[]): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('KCM Logistics - Customer Billing Summary', 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toISOString().slice(0, 10)} - ${invoices.length} invoice(s)`, 14, 20);
  autoTable(doc, {
    startY: 25,
    head: [['Date', 'Invoice No', 'Customer', 'Entity', 'Total Amt', 'Amt Receivable', 'Due Date', 'Status']],
    body: invoices.map(inv => [
      inv.date, inv.invoiceNo, inv.customerName, inv.entity || '-',
      `Rs. ${effectiveInvoiceAmount(inv).toLocaleString('en-IN')}`,
      inv.amountReceivable != null ? `Rs. ${inv.amountReceivable.toLocaleString('en-IN')}` : '-',
      inv.dueDate || '-', effectiveInvoiceStatus(inv)
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } }
  });
  doc.save(`KCM_Billing_Export_${new Date().toISOString().slice(0, 10)}.pdf`);
}
