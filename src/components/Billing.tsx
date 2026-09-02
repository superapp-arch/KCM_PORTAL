import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BillingInvoice, BillingCreditNote, VehicleDocument, BillingCompany } from '../types';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Edit2,
  Trash2,
  Paperclip,
  X,
  Receipt,
  Upload,
  Download,
  ChevronDown
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';
import DateInput from './DateInput';
import BillingImportModal from './billing/BillingImportModal';
import {
  nextInvoiceNo, lastInvoiceForCustomer, defaultCreditPeriodFor,
  computeTotalAmt, computeTdsAmount, computeAmountReceivable, computeDueDate,
  computeShortageExcess, suggestPaymentStatus, sumCreditNotes,
  effectiveInvoiceAmount, effectiveInvoiceStatus, legacyStatusFor, DEFAULT_TDS_RATE, ENTITY_OPTIONS,
  supplyEntityOptions
} from '../utils/billingInvoiceCalc';
import { filterToCurrentFinancialYear, exportBillingInvoicesToExcel, exportBillingInvoicesToPdf } from '../utils/billingImportExport';

interface BillingProps {
  invoices: BillingInvoice[];
  onAddInvoice: (inv: Omit<BillingInvoice, 'id'>) => Promise<void>;
  onUpdateInvoice: (id: string, inv: Partial<BillingInvoice>) => Promise<void>;
  onDeleteInvoice: (id: string) => Promise<void>;
}

const PAYMENT_STATUS_OPTIONS = ['Pending', 'Cleared', 'Short Payment', 'Overdue'] as const;

const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;
const todayIso = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => todayIso().slice(0, 7);

// The full rich field set - one shape shared by both the "Issue New Freight
// Invoice" create form and the Manage modal's edit form, so the two can
// never drift on which fields exist or how they're laid out. All numeric
// fields are kept as strings (like every other form in this app) so an
// empty input is just '' rather than a stray 0.
interface InvoiceFormState {
  invoiceNo: string;
  company: BillingCompany;
  customerName: string;
  entity: string;
  location: string;
  billMonth: string;
  date: string;
  listPrice: string;
  gstType: string; // 'IGST' | 'CGST_SGST' | ''
  igst: string;
  cgst: string;
  sgst: string;
  tollCharges: string;
  discountAndDebit: string;
  creditPeriodDays: string;
  tdsRate: string;
  tdsAmount: string;
  // Only used while this invoice has no dated Credit Notes yet (see
  // resolveEffectiveCreditNotes below) - once one exists (raised via the
  // Manage modal's own list), the Credit Note field switches to a read-only
  // auto-summed display instead and this stops being read.
  creditNoteManual: string;
  paymentStatus: string;
  amountReceived: string;
  receivedDate: string;
  description: string;
}

function emptyInvoiceForm(invoices: BillingInvoice[], company: BillingCompany = 'KCM Insta'): InvoiceFormState {
  const date = todayIso();
  return {
    invoiceNo: nextInvoiceNo(invoices, date, company),
    company,
    customerName: '', entity: '', location: '', billMonth: thisMonth(), date,
    listPrice: '', gstType: '', igst: '', cgst: '', sgst: '', tollCharges: '',
    discountAndDebit: '', creditPeriodDays: String(30), tdsRate: String(DEFAULT_TDS_RATE), tdsAmount: '',
    creditNoteManual: '',
    paymentStatus: 'Pending', amountReceived: '', receivedDate: '', description: ''
  };
}

function invoiceToForm(inv: BillingInvoice): InvoiceFormState {
  return {
    invoiceNo: inv.invoiceNo, company: inv.company || 'KCM Insta', customerName: inv.customerName,
    entity: inv.entity || '', location: inv.location || '',
    billMonth: inv.billMonth || (inv.date || '').slice(0, 7), date: inv.date,
    listPrice: inv.listPrice != null ? String(inv.listPrice) : (inv.amount != null ? String(inv.amount) : ''),
    gstType: inv.gstType || '', igst: inv.igst != null ? String(inv.igst) : '',
    cgst: inv.cgst != null ? String(inv.cgst) : '', sgst: inv.sgst != null ? String(inv.sgst) : '',
    tollCharges: inv.tollCharges != null ? String(inv.tollCharges) : '',
    discountAndDebit: inv.discountAndDebit != null ? String(inv.discountAndDebit) : '',
    creditPeriodDays: inv.creditPeriodDays != null ? String(inv.creditPeriodDays) : String(30),
    tdsRate: inv.tdsRate != null ? String(inv.tdsRate) : String(DEFAULT_TDS_RATE),
    tdsAmount: inv.tdsAmount != null ? String(inv.tdsAmount) : '',
    // Blank even if creditNotes already has entries - that case reads the
    // list directly (see resolveEffectiveCreditNotes), never this field.
    creditNoteManual: '',
    paymentStatus: effectiveInvoiceStatus(inv), amountReceived: inv.amountReceived != null ? String(inv.amountReceived) : '',
    receivedDate: inv.receivedDate || '', description: inv.description || ''
  };
}

// The Credit Note field is manual entry until this invoice has a real,
// dated Credit Note raised against it (via the Manage modal's own list) -
// once one exists, that list is authoritative and this typed value is
// folded into it as a single synthetic entry instead of living separately,
// so there's still only ever one underlying source of truth
// (BillingInvoice.creditNotes) for "how much has been credited back."
function resolveEffectiveCreditNotes(existing: BillingCreditNote[] | undefined, form: InvoiceFormState): BillingCreditNote[] {
  if (existing && existing.length > 0) return existing;
  const amt = Number(form.creditNoteManual) || 0;
  if (amt <= 0) return [];
  return [{ id: String(Date.now()), date: form.date, amount: amt, reason: 'Entered directly on the invoice' }];
}

// Every computed figure a form's current values imply - Total Amt, Amount
// Receivable and Due Date are NEVER manually typed, only ever shown from
// here.
function deriveComputed(form: InvoiceFormState, creditNotes: BillingCreditNote[] | undefined) {
  const listPrice = Number(form.listPrice) || 0;
  const igst = form.gstType === 'IGST' ? Number(form.igst) || 0 : 0;
  const cgst = form.gstType === 'CGST_SGST' ? Number(form.cgst) || 0 : 0;
  const sgst = form.gstType === 'CGST_SGST' ? Number(form.sgst) || 0 : 0;
  const totalAmt = computeTotalAmt(listPrice, igst, cgst, sgst);
  const discountAndDebit = Number(form.discountAndDebit) || 0;
  const tdsAmount = Number(form.tdsAmount) || 0;
  const amountReceivable = computeAmountReceivable(totalAmt, discountAndDebit, tdsAmount, creditNotes);
  const dueDate = computeDueDate(form.date, Number(form.creditPeriodDays) || 0);
  const amountReceived = Number(form.amountReceived) || 0;
  const shortageExcess = computeShortageExcess(amountReceivable, amountReceived);
  const suggestedStatus = suggestPaymentStatus(amountReceived, amountReceivable, dueDate);
  return { listPrice, igst, cgst, sgst, totalAmt, discountAndDebit, tdsAmount, amountReceivable, dueDate, amountReceived, shortageExcess, suggestedStatus };
}

function buildInvoicePayload(form: InvoiceFormState, computed: ReturnType<typeof deriveComputed>, creditNotes: BillingCreditNote[] | undefined): Omit<BillingInvoice, 'id'> {
  const paymentStatus = (form.paymentStatus || 'Pending') as BillingInvoice['paymentStatus'];
  return {
    invoiceNo: form.invoiceNo.toUpperCase().trim(),
    date: form.date,
    customerName: form.customerName,
    description: form.description,
    // Legacy mirrors so Reports.tsx and this screen's own older KPI math
    // (both of which sum `amount` / group by `status`) keep working.
    amount: computed.totalAmt,
    status: legacyStatusFor(paymentStatus!),
    company: form.company || 'KCM Insta',
    entity: (form.entity || undefined) as BillingInvoice['entity'],
    location: form.location || undefined,
    billMonth: form.billMonth || undefined,
    listPrice: computed.listPrice,
    gstType: (form.gstType || undefined) as BillingInvoice['gstType'],
    igst: computed.igst || undefined,
    cgst: computed.cgst || undefined,
    sgst: computed.sgst || undefined,
    tollCharges: Number(form.tollCharges) || undefined,
    totalAmt: computed.totalAmt,
    tdsRate: Number(form.tdsRate) || DEFAULT_TDS_RATE,
    tdsAmount: computed.tdsAmount,
    discountAndDebit: computed.discountAndDebit || undefined,
    creditNotes,
    amountReceivable: computed.amountReceivable,
    creditPeriodDays: Number(form.creditPeriodDays) || 0,
    dueDate: computed.dueDate,
    paymentStatus,
    amountReceived: computed.amountReceived || undefined,
    receivedDate: form.receivedDate || undefined,
    shortageExcess: computed.shortageExcess
  };
}

// Shared field block - every Billing detail / auto-calculated / payment
// status field, used identically by the create form and the Manage modal's
// edit form. Documents and Credit Notes are handled outside this component
// (documents already had their own layout slot; credit notes only make
// sense once an invoice actually exists).
function InvoiceFormFields({ form, setForm, invoices, creditNotes }: {
  form: InvoiceFormState;
  setForm: React.Dispatch<React.SetStateAction<InvoiceFormState>>;
  invoices: BillingInvoice[];
  creditNotes: BillingCreditNote[] | undefined;
}) {
  // Live preview reflects the manual Credit Note field too, once resolved -
  // see resolveEffectiveCreditNotes.
  const effectiveCreditNotes = resolveEffectiveCreditNotes(creditNotes, form);
  const computed = deriveComputed(form, effectiveCreditNotes);

  // Re-suggests TDS Amount whenever what it's computed from changes - TDS is
  // off List Price alone, not Total Amt (GST never inflates the TDS base) -
  // still a normal editable input afterwards (same "auto-fills, still
  // overridable" pattern as Warehouse's Add Hour), so a client with
  // different TDS terms can just retype it.
  useEffect(() => {
    setForm(f => ({ ...f, tdsAmount: String(computeTdsAmount(computed.listPrice, Number(f.tdsRate) || DEFAULT_TDS_RATE)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed.listPrice, form.tdsRate]);

  // Re-suggests Payment Status whenever Amount Received/Amount
  // Receivable/Due Date change - the dropdown itself is still a plain
  // select the office can override at any time; this only ever pre-fills
  // it, matching the spec's "auto-suggested ... shown as a dropdown for
  // manual override."
  useEffect(() => {
    setForm(f => ({ ...f, paymentStatus: computed.suggestedStatus }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed.amountReceived, computed.amountReceivable, computed.dueDate]);

  const set = (patch: Partial<InvoiceFormState>) => setForm(f => ({ ...f, ...patch }));

  // Entity / GST-type / Credit Period smart-default from this exact
  // customer's own most recent invoice, applied once the name field loses
  // focus - still fully editable afterwards, this only saves re-typing for
  // a repeat customer.
  const applySmartDefaults = () => {
    const last = lastInvoiceForCustomer(invoices, form.customerName);
    setForm(f => ({
      ...f,
      entity: f.entity || last?.entity || f.entity,
      gstType: f.gstType || last?.gstType || f.gstType,
      creditPeriodDays: f.creditPeriodDays && f.creditPeriodDays !== '30' ? f.creditPeriodDays : String(defaultCreditPeriodFor(invoices, form.customerName))
    }));
  };

  const selectGst = (type: 'IGST' | 'CGST_SGST') => {
    set(type === 'IGST' ? { gstType: type, cgst: '', sgst: '' } : { gstType: type, igst: '' });
  };

  // Re-suggests the Invoice No. when Company changes - KCM Insta and KCM
  // Supply keep entirely separate sequences/formats (KCMI/FY/NNN vs
  // KCM/FY/NNN - see nextInvoiceNo). Only replaces the field when it still
  // holds the auto-suggestion for whichever company was previously
  // selected (i.e. nobody's hand-edited it since) - an already-typed/
  // already-saved number is never silently overwritten.
  const prevCompanyRef = React.useRef(form.company);
  useEffect(() => {
    if (prevCompanyRef.current === form.company) return;
    const suggestionForPrevCompany = nextInvoiceNo(invoices, form.date, prevCompanyRef.current);
    if (form.invoiceNo === suggestionForPrevCompany) {
      set({ invoiceNo: nextInvoiceNo(invoices, form.date, form.company) });
    }
    prevCompanyRef.current = form.company;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.company]);

  const supplyEntitySuggestions = form.company === 'KCM Supply' ? supplyEntityOptions(invoices) : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Invoice Reference Number *</label>
          <input
            type="text" required value={form.invoiceNo}
            onChange={(e) => set({ invoiceNo: e.target.value })}
            placeholder="e.g. KCMI/25-26/001"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider text-slate-800 uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-suggested, sequential per financial year - still editable if it needs adjusting.</p>
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Company *</label>
          <select value={form.company} onChange={(e) => set({ company: e.target.value as BillingCompany })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-bold">
            <option value="KCM Insta">KCM Insta</option>
            <option value="KCM Supply">KCM Supply</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block font-semibold text-slate-600 mb-1">Client Name *</label>
        <input
          type="text" required value={form.customerName}
          onChange={(e) => set({ customerName: e.target.value })}
          onBlur={applySmartDefaults}
          placeholder="e.g. DHL Group Supply Chain"
          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Entity</label>
          {form.company === 'KCM Supply' ? (
            <>
              <input
                type="text" list="billing-supply-entity-datalist" value={form.entity}
                onChange={(e) => set({ entity: e.target.value })}
                placeholder="Search entity"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
              />
              <datalist id="billing-supply-entity-datalist">
                {supplyEntitySuggestions.map((o, i) => <option key={i} value={o} />)}
              </datalist>
            </>
          ) : (
            <select value={form.entity} onChange={(e) => set({ entity: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-medium">
              <option value="">Select...</option>
              {ENTITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Location / State</label>
          <input type="text" value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Hyderabad" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Bill Month</label>
          <input type="month" value={form.billMonth} onChange={(e) => set({ billMonth: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono" />
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Invoice Issue Date *</label>
          <DateInput required value={form.date} onChange={(e) => set({ date: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold text-slate-600 mb-1">List Price (₹) *</label>
          <input type="number" required value={form.listPrice} onChange={(e) => set({ listPrice: e.target.value })} placeholder="e.g. 75000" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono font-semibold" />
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Toll Charges (₹)</label>
          <input type="number" value={form.tollCharges} onChange={(e) => set({ tollCharges: e.target.value })} placeholder="If applicable" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
        </div>
      </div>

      <div>
        <label className="block font-semibold text-slate-600 mb-1">GST Type</label>
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => selectGst('IGST')}
            className={`flex-1 py-1.5 rounded-lg border font-bold text-[11px] uppercase cursor-pointer transition-colors ${form.gstType === 'IGST' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
            IGST
          </button>
          <button type="button" onClick={() => selectGst('CGST_SGST')}
            className={`flex-1 py-1.5 rounded-lg border font-bold text-[11px] uppercase cursor-pointer transition-colors ${form.gstType === 'CGST_SGST' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
            CGST + SGST
          </button>
        </div>
        {form.gstType === 'IGST' && (
          <input type="number" value={form.igst} onChange={(e) => set({ igst: e.target.value })} placeholder="IGST Amount (₹)" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
        )}
        {form.gstType === 'CGST_SGST' && (
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={form.cgst} onChange={(e) => set({ cgst: e.target.value })} placeholder="CGST Amount (₹)" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
            <input type="number" value={form.sgst} onChange={(e) => set({ sgst: e.target.value })} placeholder="SGST Amount (₹)" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
          </div>
        )}
        {!form.gstType && <p className="text-[9px] text-amber-600 font-mono">Pick one - IGST and CGST+SGST can't both apply to the same invoice.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Discount & Debit (₹)</label>
          <input type="number" value={form.discountAndDebit} onChange={(e) => set({ discountAndDebit: e.target.value })} placeholder="If applicable" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Credit Period (days)</label>
          <input type="number" min="0" value={form.creditPeriodDays} onChange={(e) => set({ creditPeriodDays: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
          <p className="text-[9px] text-slate-400 font-mono mt-0.5">Defaults from this customer's last invoice.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold text-slate-600 mb-1">TDS Rate (%)</label>
          <input type="number" step="0.01" value={form.tdsRate} onChange={(e) => set({ tdsRate: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">TDS Amount (₹)</label>
          <input type="number" value={form.tdsAmount} onChange={(e) => set({ tdsAmount: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
          <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-computed off List Price - editable if this client's TDS terms differ.</p>
        </div>
      </div>

      <div>
        <label className="block font-semibold text-slate-600 mb-1">Credit Note (₹)</label>
        {creditNotes && creditNotes.length > 0 ? (
          <>
            <input type="text" readOnly value={rupee(sumCreditNotes(creditNotes))} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 font-mono text-slate-600 cursor-not-allowed" />
            <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-pulled from the Credit Note(s) raised against this invoice (right panel) - add/remove there, not here.</p>
          </>
        ) : (
          <>
            <input type="number" value={form.creditNoteManual} onChange={(e) => set({ creditNoteManual: e.target.value })} placeholder="If applicable" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
            <p className="text-[9px] text-slate-400 font-mono mt-0.5">Optional - defaults to ₹0. Reduces Amount Receivable alongside TDS.</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
        <div>
          <p className="text-[9px] text-slate-400 uppercase font-bold">Total Amt</p>
          <p className="font-mono font-black text-slate-800">{rupee(computed.totalAmt)}</p>
        </div>
        <div>
          <p className="text-[9px] text-slate-400 uppercase font-bold">Amount Receivable</p>
          <p className="font-mono font-black text-emerald-700">{rupee(computed.amountReceivable)}</p>
        </div>
        <div>
          <p className="text-[9px] text-slate-400 uppercase font-bold">Due Date</p>
          <p className="font-mono font-black text-slate-800">{computed.dueDate || '-'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border border-emerald-200 bg-emerald-50/30 rounded-lg p-2.5">
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Amount Received (₹)</label>
          <input type="number" value={form.amountReceived} onChange={(e) => set({ amountReceived: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Received Date</label>
          <DateInput value={form.receivedDate} onChange={(e) => set({ receivedDate: e.target.value })} max={todayIso()} className="w-full bg-white border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono" />
          <p className="text-[9px] text-slate-400 font-mono mt-0.5">Populated once payment actually comes in - feeds Shortage/Excess and Payment Status below.</p>
        </div>
        <div className="col-span-2 flex items-center justify-between pt-1 border-t border-emerald-100">
          <span className="text-[10px] font-bold text-slate-500 uppercase">{computed.shortageExcess > 0 ? 'Shortage' : computed.shortageExcess < 0 ? 'Excess' : 'Shortage/Excess'}</span>
          <span className={`font-mono font-black ${computed.shortageExcess > 0 ? 'text-rose-600' : computed.shortageExcess < 0 ? 'text-blue-600' : 'text-slate-500'}`}>{rupee(Math.abs(computed.shortageExcess))}</span>
        </div>
      </div>

      <div>
        <label className="block font-semibold text-slate-600 mb-1">Payment Status</label>
        <select value={form.paymentStatus} onChange={(e) => set({ paymentStatus: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
          {PAYMENT_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-suggested from Amount Received vs Amount Receivable - still a manual override.</p>
      </div>

      <div>
        <label className="block font-semibold text-slate-600 mb-1">Remarks</label>
        <textarea
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Consignment weight, routes, and billing breakdown..."
          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 focus:outline-none text-slate-800"
        />
      </div>
    </>
  );
}

const PAYMENT_STATUS_BADGE_CLASS: Record<string, string> = {
  Cleared: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  'Short Payment': 'bg-orange-50 text-orange-700 border-orange-200',
  Overdue: 'bg-rose-50 text-rose-700 border-rose-200'
};
const PAYMENT_STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Cleared: CheckCircle2, Pending: Clock, 'Short Payment': AlertCircle, Overdue: AlertCircle
};

export default function Billing({ invoices, onAddInvoice, onUpdateInvoice, onDeleteInvoice }: BillingProps) {
  // KCM Insta / KCM Supply split (2026-09-02) - two separate sub-companies
  // billed through this one module. Selecting a tab scopes everything below
  // (KPIs, table, Import/Export) to that company's own invoices only -
  // company.invoice = 'KCM Insta' on every invoice created before this
  // split, so those all correctly land under the KCM Insta tab.
  const [activeCompany, setActiveCompany] = useState<BillingCompany>('KCM Insta');
  const companyInvoices = invoices.filter(inv => (inv.company || 'KCM Insta') === activeCompany);

  const [searchTerm, setSearchTerm] = useState('');
  // Filters the Import/Export buttons respect too (see filteredInvoices
  // below) - client/invoice-no search, Payment Status, and an Issue Date
  // range. All optional/empty by default (no filtering).
  const [statusFilter, setStatusFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  // "Issue New Freight Invoice" is now a right-side slide-out (matching
  // every other module's own "+ Add Entry" pattern - see Petty Cash's own
  // Add Petty Cash Entry sidebar) instead of a permanently-visible panel.
  const [showCreateSidebar, setShowCreateSidebar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => { setNotif({ message, type }); setTimeout(() => setNotif(null), 4000); };

  // --- New Invoice form ---
  const [form, setForm] = useState<InvoiceFormState>(() => emptyInvoiceForm(invoices, activeCompany));
  const [newEntryDocs, setNewEntryDocs] = useState<VehicleDocument[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.invoiceNo || !form.customerName || !form.listPrice) {
      triggerNotif('Please fill in Invoice Reference Number, Customer Name, and List Price.', 'error');
      return;
    }
    if (!form.gstType) {
      triggerNotif('Pick a GST Type - IGST or CGST + SGST.', 'error');
      return;
    }
    const effectiveCreditNotes = resolveEffectiveCreditNotes(undefined, form);
    const computed = deriveComputed(form, effectiveCreditNotes);
    if (sumCreditNotes(effectiveCreditNotes) > computed.totalAmt) {
      triggerNotif('Credit Note cannot exceed Total Amt.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await onAddInvoice({ ...buildInvoicePayload(form, computed, effectiveCreditNotes), documents: newEntryDocs });
      setForm(emptyInvoiceForm(invoices, activeCompany));
      setNewEntryDocs([]);
      setShowCreateSidebar(false);
      triggerNotif('🧾 Billing invoice posted successfully & dispatched to ledger!');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to post billing invoice.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Manage / Edit modal ---
  const [selectedInvoiceForManage, setSelectedInvoiceForManage] = useState<BillingInvoice | null>(null);
  const [editForm, setEditForm] = useState<InvoiceFormState | null>(null);

  const handleOpenManageModal = (inv: BillingInvoice) => {
    setSelectedInvoiceForManage(inv);
    setEditForm(invoiceToForm(inv));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForManage || !editForm) return;
    if (!editForm.gstType) {
      triggerNotif('Pick a GST Type - IGST or CGST + SGST.', 'error');
      return;
    }
    const effectiveCreditNotes = resolveEffectiveCreditNotes(selectedInvoiceForManage.creditNotes, editForm);
    const computed = deriveComputed(editForm, effectiveCreditNotes);
    if (sumCreditNotes(effectiveCreditNotes) > computed.totalAmt) {
      triggerNotif('Credit Note cannot exceed Total Amt.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const updatedData = buildInvoicePayload(editForm, computed, effectiveCreditNotes);
      await onUpdateInvoice(selectedInvoiceForManage.id, updatedData);
      setSelectedInvoiceForManage({ ...selectedInvoiceForManage, ...updatedData });
      triggerNotif('✏️ Invoice details updated successfully!');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to update invoice.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateManageDocs = async (updatedDocs: VehicleDocument[]) => {
    if (!selectedInvoiceForManage) return;
    try {
      await onUpdateInvoice(selectedInvoiceForManage.id, { documents: updatedDocs });
      setSelectedInvoiceForManage({ ...selectedInvoiceForManage, documents: updatedDocs });
      triggerNotif('📎 Documents updated successfully.');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to update documents.', 'error');
    }
  };

  // --- Credit Notes (kept inline on the invoice - see types.ts) - persisted
  // immediately, same as documents above, independent of the "Save Invoice
  // Changes" button, since raising one is its own action against an
  // already-existing invoice.
  const [cnAmount, setCnAmount] = useState('');
  const [cnDate, setCnDate] = useState(todayIso());
  const [cnReason, setCnReason] = useState('');
  const [cnSubmitting, setCnSubmitting] = useState(false);

  const handleAddCreditNote = async () => {
    if (!selectedInvoiceForManage || !editForm) return;
    const amt = parseFloat(cnAmount);
    if (!amt || amt <= 0) { triggerNotif('Enter a valid Credit Note amount greater than 0.', 'error'); return; }
    const updatedNotes = [...(selectedInvoiceForManage.creditNotes || []), { id: String(Date.now()), date: cnDate, amount: amt, reason: cnReason.trim() || undefined }];
    const computed = deriveComputed(editForm, updatedNotes);
    if (sumCreditNotes(updatedNotes) > computed.totalAmt) {
      triggerNotif('Credit Note cannot exceed Total Amt.', 'error');
      return;
    }
    setCnSubmitting(true);
    try {
      const updatedData = buildInvoicePayload(editForm, computed, updatedNotes);
      await onUpdateInvoice(selectedInvoiceForManage.id, updatedData);
      setSelectedInvoiceForManage({ ...selectedInvoiceForManage, ...updatedData });
      setEditForm(f => f && ({ ...f, paymentStatus: updatedData.paymentStatus || f.paymentStatus }));
      setCnAmount(''); setCnReason('');
      triggerNotif('🧾 Credit note added - Amount Receivable updated.');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to add credit note.', 'error');
    } finally {
      setCnSubmitting(false);
    }
  };

  const handleRemoveCreditNote = async (noteId: string) => {
    if (!selectedInvoiceForManage || !editForm) return;
    if (!confirm('Remove this credit note? Amount Receivable will go back up.')) return;
    try {
      const updatedNotes = (selectedInvoiceForManage.creditNotes || []).filter(c => c.id !== noteId);
      const computed = deriveComputed(editForm, updatedNotes);
      const updatedData = buildInvoicePayload(editForm, computed, updatedNotes);
      await onUpdateInvoice(selectedInvoiceForManage.id, updatedData);
      setSelectedInvoiceForManage({ ...selectedInvoiceForManage, ...updatedData });
      triggerNotif('Credit note removed.');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to remove credit note.', 'error');
    }
  };

  const handleDeleteInvoice = async (id: string, invNo: string) => {
    if (!confirm(`Are you sure you want to delete invoice ${invNo}? This action is irreversible.`)) return;
    try {
      await onDeleteInvoice(id);
      triggerNotif('🗑️ Invoice successfully deleted.');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete invoice.', 'error');
    }
  };

  const hasActiveFilters = !!searchTerm.trim() || statusFilter !== 'All' || !!fromDate || !!toDate;
  // Scoped to the active company tab first (companyInvoices), then the
  // search/status/date filters on top - so switching tabs, KPIs, the table,
  // and Import/Export all stay in lockstep about which company's ledger is
  // currently being looked at.
  const filteredInvoices = companyInvoices.filter(inv => {
    const matchesSearch = (inv?.invoiceNo || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
      (inv?.customerName || '').toLowerCase().includes((searchTerm || '').toLowerCase());
    const matchesStatus = statusFilter === 'All' || effectiveInvoiceStatus(inv) === statusFilter;
    const matchesFrom = !fromDate || (inv.date || '') >= fromDate;
    const matchesTo = !toDate || (inv.date || '') <= toDate;
    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  });

  // Export always respects the same 3 filters as the list above; with none
  // active it defaults to the current financial year (see
  // filterToCurrentFinancialYear) rather than the entire historical ledger,
  // to keep a routine export fast - "Export All" explicitly opts out of
  // that default.
  const exportScope = (all: boolean): BillingInvoice[] =>
    hasActiveFilters || all ? filteredInvoices : filterToCurrentFinancialYear(filteredInvoices);

  const totalBilled = companyInvoices.reduce((sum, inv) => sum + effectiveInvoiceAmount(inv), 0);
  const totalPaid = companyInvoices.filter(inv => effectiveInvoiceStatus(inv) === 'Cleared').reduce((sum, inv) => sum + effectiveInvoiceAmount(inv), 0);
  const totalPending = companyInvoices.filter(inv => { const s = effectiveInvoiceStatus(inv); return s === 'Pending' || s === 'Short Payment'; }).reduce((sum, inv) => sum + effectiveInvoiceAmount(inv), 0);
  const totalOverdue = companyInvoices.filter(inv => effectiveInvoiceStatus(inv) === 'Overdue').reduce((sum, inv) => sum + effectiveInvoiceAmount(inv), 0);

  return (
    <div className="space-y-6" id="billing-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <FileText className="text-blue-600 w-5 h-5" />
            KCM Customer Invoicing & Billing
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Departmental view: B2B Loading Invoices, AR Trackers, and Freight Billing
          </p>
        </div>
      </div>

      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {notif.message}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider">Total Gross Billing</p>
          <h3 className="text-lg font-bold text-slate-800 mt-1">₹{totalBilled.toLocaleString('en-IN')}</h3>
          <p className="text-slate-400 mt-0.5">{companyInvoices.length} invoices logged</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider text-emerald-600">Collected Revenue</p>
          <h3 className="text-lg font-bold text-emerald-700 mt-1">₹{totalPaid.toLocaleString('en-IN')}</h3>
          <p className="text-emerald-500 font-medium mt-0.5">Cleared at bank</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider text-amber-600">Pending Receivables</p>
          <h3 className="text-lg font-bold text-amber-700 mt-1">₹{totalPending.toLocaleString('en-IN')}</h3>
          <p className="text-slate-400 mt-0.5">Under invoice terms (incl. Short Payment)</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider text-rose-600">Overdue Outstanding</p>
          <h3 className="text-lg font-bold text-rose-700 mt-1">₹{totalOverdue.toLocaleString('en-IN')}</h3>
          <p className="text-rose-500 font-semibold mt-0.5">Immediate notice draft ready</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col gap-3 mb-4 pb-3 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Customer Billings & Invoice Journal
              </h2>
              <div className="flex items-center gap-2">
                {/* Issue New Freight Invoice - opens the slide-out sidebar,
                    mirrors Petty Cash's own "+ Add Entry" pattern, rather
                    than sitting permanently open on the page. */}
                <button type="button" onClick={() => {
                    // Pre-selects whichever company tab is currently open -
                    // still just a default, the dropdown inside the form
                    // stays fully editable. Only applied when the invoiceNo
                    // still matches the auto-suggestion (no in-progress
                    // manual edit gets clobbered by reopening).
                    setForm(f => f.company === activeCompany || f.invoiceNo !== nextInvoiceNo(invoices, f.date, f.company)
                      ? f
                      : { ...f, company: activeCompany, invoiceNo: nextInvoiceNo(invoices, f.date, activeCompany) });
                    setShowCreateSidebar(true);
                  }}
                  className="bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs whitespace-nowrap">
                  <Plus className="w-3.5 h-3.5" /> Issue New Freight Invoice
                </button>
                <button type="button" onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" /> Import Invoices
                </button>
                <div className="relative">
                  <button type="button" onClick={() => setShowExportMenu(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold cursor-pointer whitespace-nowrap">
                    <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3" />
                  </button>
                  {showExportMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                      <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-1.5 text-[11px]">
                        <p className="px-2 py-1 text-slate-400 font-mono">{hasActiveFilters ? 'Respects active filters' : 'This financial year'}</p>
                        <button type="button" onClick={() => { exportBillingInvoicesToExcel(exportScope(false)); setShowExportMenu(false); }} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer">Export Excel</button>
                        <button type="button" onClick={() => { exportBillingInvoicesToPdf(exportScope(false)); setShowExportMenu(false); }} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer">Export PDF</button>
                        {!hasActiveFilters && (
                          <>
                            <div className="my-1 border-t border-slate-100" />
                            <p className="px-2 py-1 text-slate-400 font-mono">Full history</p>
                            <button type="button" onClick={() => { exportBillingInvoicesToExcel(exportScope(true)); setShowExportMenu(false); }} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer">Export All (Excel)</button>
                            <button type="button" onClick={() => { exportBillingInvoicesToPdf(exportScope(true)); setShowExportMenu(false); }} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer">Export All (PDF)</button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative flex-1 min-w-[160px]">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Search Client or Invoice No"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium"
                />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700">
                <option value="All">All Statuses</option>
                {PAYMENT_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <span className="text-slate-400 font-semibold">From</span>
              <DateInput value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-slate-700 w-32" />
              <span className="text-slate-400 font-semibold">To</span>
              <DateInput value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-slate-700 w-32" />
              {hasActiveFilters && (
                <button type="button" onClick={() => { setSearchTerm(''); setStatusFilter('All'); setFromDate(''); setToDate(''); }} className="text-slate-400 hover:text-slate-700 font-bold underline cursor-pointer">Clear</button>
              )}
            </div>

            {/* KCM Insta / KCM Supply company tabs (2026-09-02) - filters
                everything below (KPIs above, table, Import/Export) to this
                company's own invoices only, never mixed with the other. */}
            <div className="flex items-center gap-1.5 border-b border-slate-100 pt-1">
              {(['KCM Insta', 'KCM Supply'] as BillingCompany[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCompany(c)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-t-lg border-b-2 -mb-px cursor-pointer transition-colors ${
                    activeCompany === c ? 'border-blue-600 text-blue-700 bg-blue-50/60' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                <tr>
                  <th className="px-3 py-2.5">Sl. No.</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Invoice No</th>
                  <th className="px-3 py-2.5">Customer Name</th>
                  <th className="px-3 py-2.5">Entity</th>
                  <th className="px-3 py-2.5 text-right">Total Amt</th>
                  <th className="px-3 py-2.5 text-right">Amt Receivable</th>
                  <th className="px-3 py-2.5">Due Date</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-center">Docs</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-10 text-slate-400 font-mono">
                      NO CUSTOMER BILLINGS FOUND IN DIRECTORY JOURNAL.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv, idx) => {
                    const status = effectiveInvoiceStatus(inv);
                    const StatusIcon = PAYMENT_STATUS_ICON[status];
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{inv.date}</td>
                        <td className="px-3 py-2.5 font-bold font-mono text-slate-900 tracking-wider whitespace-nowrap">{inv.invoiceNo}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{inv.customerName}</td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{inv.entity || '-'}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {rupee(effectiveInvoiceAmount(inv))}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                          {inv.amountReceivable != null ? rupee(inv.amountReceivable) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{inv.dueDate || <span className="text-slate-300">-</span>}</td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit mx-auto border ${PAYMENT_STATUS_BADGE_CLASS[status]}`}>
                            <StatusIcon className="w-2.5 h-2.5" />
                            {status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {inv.documents && inv.documents.length > 0 ? (
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
                              <Paperclip className="w-2.5 h-2.5 mr-0.5" />
                              {inv.documents.length}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => handleOpenManageModal(inv)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                              title="Edit invoice details & manage files"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNo)}
                              className="p-1 text-slate-400 hover:text-pink-600 hover:bg-slate-100 rounded cursor-pointer"
                              title="Delete invoice record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
      </div>

      {/* Issue New Freight Invoice - right-side slide-out, opened by the
          "+" button above. Closing without submitting keeps the draft
          in-progress (same "no surprise data loss" convention as Petty
          Cash's own sidebar) - only a successful Publish or an explicit
          Cancel resets the form. */}
      <AnimatePresence>
        {showCreateSidebar && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end z-50">
            <div className="absolute inset-0" onClick={() => setShowCreateSidebar(false)} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-blue-100"
            >
              <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-400" /> Issue New Freight Invoice
                </h3>
                <button onClick={() => setShowCreateSidebar(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 text-xs">
                <form id="billing-create-invoice-form" onSubmit={handleSubmit} className="space-y-3.5">
                  <InvoiceFormFields form={form} setForm={setForm} invoices={invoices} creditNotes={undefined} />

                  <DocumentAttachment
                    documents={newEntryDocs}
                    onChange={setNewEntryDocs}
                    label="Attach Signed POD / Invoice Copy"
                  />
                </form>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateSidebar(false); setForm(emptyInvoiceForm(invoices, activeCompany)); setNewEntryDocs([]); }}
                  className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="billing-create-invoice-form"
                  disabled={isSubmitting}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 font-extrabold tracking-wide uppercase text-[10px] transition-colors shadow-xs cursor-pointer"
                >
                  {isSubmitting ? 'Posting Ledger...' : 'Publish Customer Invoice'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unified Manage & Documents Modal */}
      {selectedInvoiceForManage && editForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-sm">Manage Invoice Details</h3>
                  <p className="text-[10px] font-mono text-slate-500">Invoice: {selectedInvoiceForManage.invoiceNo} | ID: {selectedInvoiceForManage.id}</p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedInvoiceForManage(null); setEditForm(null); }}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Left Column: Edit Form */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  Edit Invoice Fields
                </h4>
                <form onSubmit={handleSaveEdit} className="space-y-3">
                  <InvoiceFormFields form={editForm} setForm={setEditForm as React.Dispatch<React.SetStateAction<InvoiceFormState>>} invoices={invoices} creditNotes={selectedInvoiceForManage.creditNotes} />

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs cursor-pointer"
                  >
                    {isSubmitting ? 'Saving changes...' : 'Save Invoice Changes'}
                  </button>
                </form>
              </div>

              {/* Right Column: Credit Notes + Document Upload */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                <div>
                  <h4 className="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1 mb-2 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-blue-600" />
                    Credit Notes
                  </h4>
                  <p className="text-[9px] text-slate-400 font-mono mb-2">
                    Raising one here reduces Amount Receivable and Shortage/Excess immediately - no need to re-enter the invoice.
                  </p>
                  <div className="space-y-1.5 mb-2">
                    {(selectedInvoiceForManage.creditNotes || []).length === 0 ? (
                      <p className="text-slate-400 text-center py-2">No credit notes raised against this invoice.</p>
                    ) : (
                      (selectedInvoiceForManage.creditNotes || []).map(cn => (
                        <div key={cn.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-slate-800">{rupee(cn.amount)}</span>
                            <span className="text-slate-400 font-mono ml-1.5">{cn.date}</span>
                            {cn.reason && <p className="text-slate-500 truncate">{cn.reason}</p>}
                          </div>
                          <button onClick={() => handleRemoveCreditNote(cn.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer shrink-0" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <input type="number" placeholder="Amount" value={cnAmount} onChange={(e) => setCnAmount(e.target.value)} className="w-24 bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-mono text-slate-800" />
                    <DateInput value={cnDate} onChange={(e) => setCnDate(e.target.value)} max={todayIso()} className="w-32 bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-mono text-slate-800" />
                    <input type="text" placeholder="Reason (optional)" value={cnReason} onChange={(e) => setCnReason(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-800" />
                    <button type="button" onClick={handleAddCreditNote} disabled={cnSubmitting} className="bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white px-3 rounded-lg cursor-pointer flex items-center gap-1 disabled:opacity-50"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <DocumentAttachment
                  documents={selectedInvoiceForManage.documents}
                  onChange={handleUpdateManageDocs}
                  label="Verified Invoice Documents"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <BillingImportModal
          invoices={invoices}
          initialCompany={activeCompany}
          onAddInvoice={onAddInvoice}
          onClose={() => setShowImportModal(false)}
          onImported={() => triggerNotif('📥 Import complete - see the summary for details.')}
        />
      )}
    </div>
  );
}
