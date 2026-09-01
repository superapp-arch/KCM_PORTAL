// Customer Billing's Import/Export logic - kept separate from Billing.tsx
// (already large) and from billingInvoiceCalc.ts (the manual-form-facing
// calc helpers) since this file's own job is specifically translating
// spreadsheet rows in/out, not driving a live form.
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BillingInvoice, BillingCreditNote, BillingPaymentStatus, BillingGstType } from '../types';
import {
  computeTotalAmt, computeTdsAmount, computeAmountReceivable, computeDueDate,
  computeShortageExcess, legacyStatusFor, DEFAULT_TDS_RATE, effectiveInvoiceAmount,
  effectiveInvoiceStatus, financialYearLabel
} from './billingInvoiceCalc';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// --- Column matching (2026-09-08 rework) -----------------------------------
// A real working ledger (exported from whatever sheet the office already
// keeps) almost never matches an invented template's exact header text -
// different spacing/casing/abbreviations, a column that's an amount here
// where the template guessed a rate, even a plain typo ("Creddit note").
// Rejecting on the first mismatch (the original 2026-09-05 version of this
// file) made a real, already-correctly-shaped file unimportable. Header
// matching is now a synonym lookup, case/whitespace-insensitive, and only 4
// fields are ever actually required (Invoice No, Client Name, List Price,
// Invoice Issue Date) - everything else is optional and defaults sensibly
// when its column is missing or blank. Extra columns the file has that
// aren't needed (Total Amt, Amount Receivable, Shortage/Excess, Due Date,
// SL No...) are simply ignored, never rejected - this importer always
// recomputes those itself rather than trusting a file's own copies.
type FieldKey =
  | 'invoiceNo' | 'customerName' | 'entity' | 'location' | 'billMonth'
  | 'date' | 'receivedDate' | 'tollCharges' | 'listPrice'
  | 'igst' | 'cgst' | 'sgst' | 'gstPercent'
  | 'discountAndDebit' | 'tdsAmount' | 'tdsRate' | 'creditNote' | 'amountReceived'
  | 'creditPeriod' | 'paymentStatus' | 'remarks';

const HEADER_SYNONYMS: Record<FieldKey, string[]> = {
  invoiceNo: ['invoice reference number', 'invoice reference no', 'invoice ref no', 'invoice ref', 'invoice no', 'invoice number'],
  customerName: ['client name', 'customer name', 'client'],
  entity: ['entity'],
  location: ['location / state', 'location/state', 'location', 'state'],
  billMonth: ['bill month', 'billing month'],
  date: ['invoice issue date', 'invoice date', 'issue date'],
  receivedDate: ['received date', 'date received'],
  tollCharges: ['toll charges', 'toll charge', 'toll'],
  listPrice: ['list price'],
  igst: ['igst'],
  cgst: ['cgst'],
  sgst: ['sgst'],
  gstPercent: ['gst %', 'gst percent', 'gst rate'],
  discountAndDebit: ['discount & debit', 'discount and debit'],
  tdsAmount: ['2% tds', 'tds amount', 'tds amt'],
  tdsRate: ['tds rate (%)', 'tds rate', 'tds %', 'tds percent'],
  creditNote: ['credit note', 'creddit note', 'credit notes'],
  amountReceived: ['amount received', 'amount rec'],
  creditPeriod: ['credit period', 'credit period (days)'],
  paymentStatus: ['payment status', 'status'],
  remarks: ['remarks', 'remark', 'note', 'notes']
};

const REQUIRED_FIELDS: FieldKey[] = ['invoiceNo', 'customerName', 'listPrice', 'date'];
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  invoiceNo: 'Invoice Reference No', customerName: 'Client Name', listPrice: 'List Price', date: 'Invoice Issue Date'
};

const normalizeHeader = (h: unknown): string => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Maps every column the uploaded file actually has to the logical field it
// represents, if any.
function matchHeaders(headerRow: unknown[]): { fieldToColumn: Partial<Record<FieldKey, string>>; missingRequired: string[] } {
  const byNormalized = new Map<string, string>();
  headerRow.forEach(h => { const n = normalizeHeader(h); if (n && !byNormalized.has(n)) byNormalized.set(n, String(h)); });

  const fieldToColumn: Partial<Record<FieldKey, string>> = {};
  (Object.keys(HEADER_SYNONYMS) as FieldKey[]).forEach(field => {
    for (const syn of HEADER_SYNONYMS[field]) {
      const original = byNormalized.get(syn);
      if (original != null) { fieldToColumn[field] = original; break; }
    }
  });

  const missingRequired = REQUIRED_FIELDS.filter(f => !fieldToColumn[f]).map(f => REQUIRED_FIELD_LABELS[f]);
  return { fieldToColumn, missingRequired };
}

const VALID_ENTITIES = ['Regular', 'Dedicated', 'Adhoc', 'Labour Charges', 'Opex', 'Toll'];
const VALID_STATUSES = ['Pending', 'Cleared', 'Short Payment', 'Overdue'];

export function downloadBillingImportTemplate(): void {
  const headers = [
    'Invoice Reference No', 'Client Name', 'Entity', 'Location / State', 'Bill Month',
    'Invoice Issue Date', 'Received Date', 'Toll Charges', 'List Price', 'IGST', 'CGST', 'SGST',
    'Discount & Debit', 'TDS Amount', 'Credit Note', 'Amount Received', 'Credit Period', 'Payment Status', 'Remarks'
  ];
  const sample = {
    'Invoice Reference No': 'KCMI/25-26/001', 'Client Name': 'Example Client Pvt Ltd', 'Entity': 'Regular',
    'Location / State': 'Karnataka', 'Bill Month': 'Sep 2026', 'Invoice Issue Date': '2026-09-01', 'Received Date': '',
    'Toll Charges': 0, 'List Price': 75000, 'IGST': 13500, 'CGST': 0, 'SGST': 0, 'Discount & Debit': 0,
    'TDS Amount': 1500, 'Credit Note': 0, 'Amount Received': 0, 'Credit Period': 30, 'Payment Status': 'Pending',
    'Remarks': 'Sample row - delete before importing. Only Invoice Reference No/Client Name/List Price/Invoice Issue Date are required - everything else is optional. Total Amt/Amount Receivable/Due Date are always recalculated on import, never read from the file, so this template has no columns for them.'
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  ws['!cols'] = headers.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import Invoices');
  XLSX.writeFile(wb, 'KCM_Billing_Import_Template.xlsx');
}

export interface ParsedBillingImportRow {
  rowNumber: number; // 1-based, matches the spreadsheet row (header is row 1)
  invoiceNo: string;
  customerName: string;
  entity: string;
  location: string;
  billMonth: string;
  listPrice: number;
  igst: number;
  cgst: number;
  sgst: number;
  tollCharges: number;
  discountAndDebit: number;
  tdsAmount: number; // resolved figure - direct column if given, else computed from a rate column, else DEFAULT_TDS_RATE off List Price
  creditNoteAmt: number;
  amountReceivedAmt: number;
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

// Reads an uploaded .xlsx/.csv File - `headerValid: false` only when one of
// the 4 truly required columns (see REQUIRED_FIELDS) can't be found under
// any recognized name, which the caller should reject with a clear message
// rather than silently misaligning columns.
export async function parseBillingImportFile(file: File, existingInvoices: BillingInvoice[]): Promise<{ headerValid: boolean; missingHeaders: string[]; rows: ParsedBillingImportRow[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const headerRow: unknown[] = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as unknown[]) || [];
  const { fieldToColumn, missingRequired } = matchHeaders(headerRow);
  if (missingRequired.length > 0) {
    return { headerValid: false, missingHeaders: missingRequired, rows: [] };
  }

  const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const get = (raw: Record<string, unknown>, field: FieldKey): unknown => {
    const col = fieldToColumn[field];
    return col != null ? raw[col] : '';
  };
  const numOrUndef = (v: unknown): number | undefined => (v === '' || v == null) ? undefined : Number(v);

  const existingInvoiceNos = new Set(existingInvoices.map(i => (i.invoiceNo || '').trim().toUpperCase()));
  const seenInThisFile = new Set<string>();

  const rows: ParsedBillingImportRow[] = json.map((raw, idx) => {
    const errors: string[] = [];
    const invoiceNo = String(get(raw, 'invoiceNo') || '').trim().toUpperCase();
    const customerName = String(get(raw, 'customerName') || '').trim();
    const entity = String(get(raw, 'entity') || '').trim();
    const location = String(get(raw, 'location') || '').trim();
    const billMonth = String(get(raw, 'billMonth') || '').trim();
    const listPrice = Number(get(raw, 'listPrice')) || 0;
    const tollCharges = Number(get(raw, 'tollCharges')) || 0;
    const discountAndDebit = Number(get(raw, 'discountAndDebit')) || 0;
    const date = normalizeDate(get(raw, 'date'));
    const receivedDate = normalizeDate(get(raw, 'receivedDate'));
    const creditPeriodRaw = get(raw, 'creditPeriod');
    const creditPeriodDays = creditPeriodRaw !== '' && creditPeriodRaw != null ? Number(creditPeriodRaw) : 30;
    const paymentStatusRaw = String(get(raw, 'paymentStatus') || '').trim();
    const paymentStatus = paymentStatusRaw || 'Pending';
    const description = String(get(raw, 'remarks') || '').trim();
    const creditNoteAmt = Number(get(raw, 'creditNote')) || 0;
    const amountReceivedAmt = Number(get(raw, 'amountReceived')) || 0;

    // GST: prefer direct IGST/CGST/SGST amount columns (a real ledger's own
    // shape) - only falls back to a flat GST % (single IGST) when none of
    // the three amount columns are present at all.
    const igstDirect = numOrUndef(get(raw, 'igst'));
    const cgstDirect = numOrUndef(get(raw, 'cgst'));
    const sgstDirect = numOrUndef(get(raw, 'sgst'));
    const hasDirectGst = igstDirect != null || cgstDirect != null || sgstDirect != null;
    const gstPercent = Number(get(raw, 'gstPercent')) || 0;
    const igst = hasDirectGst ? (igstDirect || 0) : round2(listPrice * gstPercent / 100);
    const cgst = hasDirectGst ? (cgstDirect || 0) : 0;
    const sgst = hasDirectGst ? (sgstDirect || 0) : 0;
    const totalAmt = computeTotalAmt(listPrice, igst, cgst, sgst);

    // TDS: prefer a direct TDS amount column (e.g. "2% TDS", a real ledger's
    // own already-computed figure - treated as an editable override, same
    // as the manual form's own TDS Amount field) - only computed from a
    // rate when no amount column is present.
    const tdsAmountDirect = numOrUndef(get(raw, 'tdsAmount'));
    const tdsRateRaw = get(raw, 'tdsRate');
    const tdsRate = tdsRateRaw !== '' && tdsRateRaw != null ? Number(tdsRateRaw) : DEFAULT_TDS_RATE;
    const tdsAmount = tdsAmountDirect != null ? tdsAmountDirect : computeTdsAmount(listPrice, tdsRate);

    if (!invoiceNo) errors.push('Invoice Reference No is required.');
    if (!customerName) errors.push('Client Name is required.');
    if (!(listPrice > 0)) errors.push('List Price must be greater than 0.');
    if (!date) errors.push('Invoice Issue Date is missing or not a recognized date (use YYYY-MM-DD or DD/MM/YYYY).');
    if (entity && !VALID_ENTITIES.includes(entity)) errors.push(`Entity must be one of: ${VALID_ENTITIES.join(', ')}.`);
    if (isNaN(creditPeriodDays) || creditPeriodDays < 0) errors.push('Credit Period must be a number 0 or greater.');
    if (paymentStatusRaw && !VALID_STATUSES.includes(paymentStatusRaw)) errors.push(`Payment Status must be one of: ${VALID_STATUSES.join(', ')}.`);
    if (invoiceNo) {
      if (existingInvoiceNos.has(invoiceNo)) errors.push('Invoice Reference No already exists in the ledger.');
      else if (seenInThisFile.has(invoiceNo)) errors.push('Invoice Reference No is duplicated elsewhere in this file.');
      seenInThisFile.add(invoiceNo);
    }
    if (creditNoteAmt > totalAmt) errors.push('Credit Note cannot exceed Total Amt.');

    return {
      rowNumber: idx + 2, invoiceNo, customerName, entity, location, billMonth,
      listPrice, igst, cgst, sgst, tollCharges, discountAndDebit, tdsAmount,
      creditNoteAmt, amountReceivedAmt, date, receivedDate, creditPeriodDays,
      paymentStatus, description, errors
    };
  });

  return { headerValid: true, missingHeaders: [], rows };
}

// Builds the real BillingInvoice payload for one valid import row - Total
// Amt and Amount Receivable are always recomputed here from List
// Price/IGST/CGST/SGST/TDS/Credit Note/Discount, exactly like the manual
// form does, never read as raw values even when the file has its own
// columns for them.
export function buildInvoiceFromImportRow(row: ParsedBillingImportRow): Omit<BillingInvoice, 'id'> {
  const totalAmt = computeTotalAmt(row.listPrice, row.igst, row.cgst, row.sgst);
  const gstType: BillingGstType | undefined = row.igst > 0 ? 'IGST' : (row.cgst > 0 || row.sgst > 0) ? 'CGST_SGST' : undefined;
  const creditNotes: BillingCreditNote[] = row.creditNoteAmt > 0
    ? [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: row.date, amount: row.creditNoteAmt, reason: 'Imported' }]
    : [];
  const amountReceivable = computeAmountReceivable(totalAmt, row.discountAndDebit, row.tdsAmount, creditNotes);
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
    location: row.location || undefined,
    billMonth: row.billMonth || undefined,
    listPrice: row.listPrice,
    gstType,
    igst: row.igst || undefined,
    cgst: row.cgst || undefined,
    sgst: row.sgst || undefined,
    tollCharges: row.tollCharges || undefined,
    totalAmt,
    tdsRate: row.listPrice > 0 ? round2((row.tdsAmount / row.listPrice) * 100) : DEFAULT_TDS_RATE,
    tdsAmount: row.tdsAmount,
    discountAndDebit: row.discountAndDebit || undefined,
    creditNotes,
    amountReceivable,
    creditPeriodDays: row.creditPeriodDays,
    dueDate,
    paymentStatus,
    amountReceived: row.amountReceivedAmt || undefined,
    receivedDate: row.receivedDate || undefined,
    shortageExcess: computeShortageExcess(amountReceivable, row.amountReceivedAmt)
  };
}

export function exportErrorRowsToExcel(rows: ParsedBillingImportRow[]): void {
  const errorRows = rows.filter(r => r.errors.length > 0);
  const data = errorRows.map(r => ({
    'Row': r.rowNumber, 'Invoice Reference No': r.invoiceNo, 'Client Name': r.customerName,
    'Entity': r.entity, 'Location / State': r.location, 'Bill Month': r.billMonth,
    'List Price': r.listPrice, 'IGST': r.igst, 'CGST': r.cgst, 'SGST': r.sgst, 'Toll Charges': r.tollCharges,
    'Discount & Debit': r.discountAndDebit, 'TDS Amount': r.tdsAmount, 'Credit Note': r.creditNoteAmt,
    'Amount Received': r.amountReceivedAmt, 'Invoice Issue Date': r.date, 'Received Date': r.receivedDate,
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
