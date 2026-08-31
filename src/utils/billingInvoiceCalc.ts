// Shared calculation/lookup logic for the Customer Billing "Issue New
// Freight Invoice" form and its Manage modal (see components/Billing.tsx) -
// kept here, not inline in the component, so the two places that build a
// BillingInvoice (create form + edit form) can never drift on the formulas.
import { BillingInvoice, BillingCreditNote, BillingPaymentStatus } from '../types';

const DEFAULT_CREDIT_PERIOD_DAYS = 30;
export const DEFAULT_TDS_RATE = 2;

// ---------------------------------------------------------------------------
// Invoice Reference Number: KCMI/{FY}/{seq} - Indian financial year (Apr-Mar),
// sequential per FY. e.g. an invoice issued 2026-06-15 is FY "26-27"; one
// issued 2026-02-15 is FY "25-26".
// ---------------------------------------------------------------------------
export function financialYearLabel(dateIso: string): string {
  const [y, m] = (dateIso || '').split('-').map(Number);
  if (!y || !m) return '';
  const fyStartYear = m >= 4 ? y : y - 1;
  const shortStart = String(fyStartYear).slice(-2);
  const shortEnd = String(fyStartYear + 1).slice(-2);
  return `${shortStart}-${shortEnd}`;
}

export function nextInvoiceNo(invoices: BillingInvoice[], issueDateIso: string): string {
  const fy = financialYearLabel(issueDateIso || new Date().toISOString().slice(0, 10));
  const prefix = `KCMI/${fy}/`;
  const maxSeq = invoices.reduce((max, inv) => {
    if (!inv.invoiceNo || !inv.invoiceNo.toUpperCase().startsWith(prefix)) return max;
    const n = parseInt(inv.invoiceNo.slice(prefix.length), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Smart defaults - this customer's own most recent invoice (by date, then by
// whichever was entered later on the same date), matched on a normalized
// (trimmed, case-insensitive) customer name since there's no separate
// customer directory this form draws from.
// ---------------------------------------------------------------------------
export function lastInvoiceForCustomer(invoices: BillingInvoice[], customerName: string): BillingInvoice | undefined {
  const name = (customerName || '').trim().toLowerCase();
  if (!name) return undefined;
  return invoices
    .filter(inv => (inv.customerName || '').trim().toLowerCase() === name)
    .sort((a, b) => (a.date === b.date ? (b.id > a.id ? 1 : -1) : (a.date < b.date ? 1 : -1)))[0];
}

export function defaultCreditPeriodFor(invoices: BillingInvoice[], customerName: string): number {
  return lastInvoiceForCustomer(invoices, customerName)?.creditPeriodDays ?? DEFAULT_CREDIT_PERIOD_DAYS;
}

// ---------------------------------------------------------------------------
// Auto-calculated fields - never manually typed (Total Amt, Amount
// Receivable, Due Date); TDS auto-computes but stays an editable override.
// ---------------------------------------------------------------------------
export function computeTotalAmt(listPrice: number, igst: number, cgst: number, sgst: number): number {
  return round2((listPrice || 0) + (igst || 0) + (cgst || 0) + (sgst || 0));
}

// TDS is off List Price alone (2026-09-05 correction) - not Total Amt, so
// GST never inflates the TDS base.
export function computeTdsAmount(listPrice: number, tdsRate: number): number {
  return round2((listPrice || 0) * ((tdsRate ?? DEFAULT_TDS_RATE) / 100));
}

export function sumCreditNotes(creditNotes: BillingCreditNote[] | undefined): number {
  return round2((creditNotes || []).reduce((s, c) => s + (c.amount || 0), 0));
}

export function computeAmountReceivable(totalAmt: number, discountAndDebit: number, tdsAmount: number, creditNotes: BillingCreditNote[] | undefined): number {
  return round2((totalAmt || 0) - (discountAndDebit || 0) - (tdsAmount || 0) - sumCreditNotes(creditNotes));
}

export function computeDueDate(issueDateIso: string, creditPeriodDays: number): string {
  if (!issueDateIso) return '';
  const [y, m, d] = issueDateIso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + (creditPeriodDays || 0));
  return dt.toISOString().slice(0, 10);
}

export function computeShortageExcess(amountReceivable: number, amountReceived: number): number {
  return round2((amountReceivable || 0) - (amountReceived || 0));
}

// ---------------------------------------------------------------------------
// Payment Status auto-suggestion - Pending (nothing received) -> Cleared
// (fully received) -> Short Payment (partial) -> Overdue (past Due Date,
// still unpaid/short). The dropdown itself always stays a manual override -
// this is only ever a suggestion applied when the relevant inputs change,
// same "auto-fills, still overridable" convention used elsewhere.
// ---------------------------------------------------------------------------
export function suggestPaymentStatus(amountReceived: number, amountReceivable: number, dueDateIso: string | undefined, todayIso: string = new Date().toISOString().slice(0, 10)): BillingPaymentStatus {
  const received = amountReceived || 0;
  const receivable = amountReceivable || 0;
  if (receivable > 0 && received >= receivable) return 'Cleared';
  if (received > 0 && received < receivable) return 'Short Payment';
  const isPastDue = !!dueDateIso && dueDateIso < todayIso;
  return isPastDue ? 'Overdue' : 'Pending';
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Backward-compat readers - a pre-expansion invoice only ever had `amount`/
// `status`; a post-expansion one keeps those two mirrored (see
// components/Billing.tsx's buildInvoicePayload) purely so older consumers
// (Reports.tsx, this screen's own KPI cards) don't need their own
// new-vs-legacy branching.
// ---------------------------------------------------------------------------
export function effectiveInvoiceAmount(inv: BillingInvoice): number {
  return inv.totalAmt ?? inv.amount ?? 0;
}

export function effectiveInvoiceStatus(inv: BillingInvoice): BillingPaymentStatus {
  if (inv.paymentStatus) return inv.paymentStatus;
  if (inv.status === 'Paid') return 'Cleared';
  if (inv.status === 'Overdue') return 'Overdue';
  return 'Pending';
}

// Legacy 3-state mirror of a paymentStatus, for `BillingInvoice.status` -
// Short Payment collapses to 'Pending' here (still outstanding, not yet
// flagged overdue) since the old status never had a partial-payment state.
export function legacyStatusFor(paymentStatus: BillingPaymentStatus): 'Paid' | 'Pending' | 'Overdue' {
  if (paymentStatus === 'Cleared') return 'Paid';
  if (paymentStatus === 'Overdue') return 'Overdue';
  return 'Pending';
}
