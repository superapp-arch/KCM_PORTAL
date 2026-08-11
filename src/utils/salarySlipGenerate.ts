// Shared "resolve or generate a Salary Slip" logic - used identically by all
// three entry points (the dedicated Salary Slip tab's dropdown, the Staff
// Salary table's name-click, and bulk generation) so there's exactly one
// place that builds the PDF, stores it, saves the SalarySlipRecord, and
// writes the audit trail - not three copies that could drift.
import { authFetch } from '../authFetch';
import { StaffEmployee, StaffBankDetail, SalarySlipRecord, SalarySlipAuditRecord } from '../types';
import { buildSalarySlipFile } from './salarySlipPdf';

// The shape GET /api/staff/provident-fund already returns (raw fields plus
// the server's own computed totals) - see server.ts's provident-fund route.
export interface EnrichedPfRecord {
  empId: string;
  month: string;
  basic?: number; hra?: number; conveyance?: number; medicalAllowance?: number;
  lta?: number; cca?: number; fuelAllowance?: number; otherAllowances?: number;
  extraDays?: number; extraDaysAmount?: number;
  professionalTax?: number; epf?: number; esi?: number; fullAndFinal?: number;
  otherDeductions?: number; advances?: number; incomeTax?: number;
  lopDays?: number; lopAmount?: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
  status?: 'Draft' | 'Finalized';
}

export interface SlipGenerationResult {
  slip: SalarySlipRecord;
  isNew: boolean; // false = an existing slip for this empId+month was found and reused, nothing was written
}

// Same masking convention as the Bank Details tab (StaffFormModal.tsx) -
// last 4 digits only.
const maskAccount = (accountNumber?: string): string | undefined => {
  if (!accountNumber) return undefined;
  return accountNumber.length > 4 ? `${'•'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}` : accountNumber;
};

function nextSlipNumber(month: string, existingSlips: SalarySlipRecord[]): string {
  const prefix = `SLIP-${month.replace('-', '')}-`;
  const maxN = existingSlips.reduce((max, s) => {
    if (!s.slipNumber.startsWith(prefix)) return max;
    const n = parseInt(s.slipNumber.slice(prefix.length), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefix}${String(maxN + 1).padStart(3, '0')}`;
}

// Resolves (reusing an existing slip if present, per the confirmed default -
// avoids duplicate "Generated" audit entries for the same period) or
// generates a brand-new one for a single employee/month. This function does
// NOT decide whether it's OK to proceed on a Draft/non-Finalized record -
// that warn-and-confirm (individual entry points) vs. auto-skip (bulk)
// decision belongs to the caller, since it's a UI concern that differs
// between entry points, not something this shared logic should hardcode.
export async function resolveOrGenerateSlip(params: {
  employee: StaffEmployee;
  month: string;
  pfRecord: EnrichedPfRecord | undefined;
  bankDetail: StaffBankDetail | undefined;
  existingSlips: SalarySlipRecord[];
  forceRegenerate: boolean;
  performedBy: string;
}): Promise<SlipGenerationResult> {
  const { employee, month, pfRecord, bankDetail, existingSlips, forceRegenerate, performedBy } = params;

  if (!forceRegenerate) {
    const existing = existingSlips.find(s => s.empId === employee.id && s.month === month);
    if (existing) return { slip: existing, isNew: false };
  }

  if (!pfRecord) {
    throw new Error(`No Salary Breakup record exists for ${employee.name} in ${month} - add one in the Salary Breakup tab first.`);
  }

  const slipNumber = nextSlipNumber(pfRecord.month, existingSlips);
  const slip: SalarySlipRecord = {
    id: slipNumber,
    slipNumber,
    empId: employee.id,
    month: pfRecord.month,
    employeeName: employee.name,
    // Per HR's own convention: Designation doubles as "Department" on the
    // slip - Basic Info has no separate Department field.
    department: employee.designation || '-',
    bankAccountNumberMasked: maskAccount(bankDetail?.accountNumber),
    bankName: bankDetail?.bankName,
    ifscCode: bankDetail?.ifscCode,
    basic: pfRecord.basic, hra: pfRecord.hra, conveyance: pfRecord.conveyance, medicalAllowance: pfRecord.medicalAllowance,
    lta: pfRecord.lta, cca: pfRecord.cca, fuelAllowance: pfRecord.fuelAllowance, otherAllowances: pfRecord.otherAllowances,
    extraDays: pfRecord.extraDays, extraDaysAmount: pfRecord.extraDaysAmount,
    professionalTax: pfRecord.professionalTax, epf: pfRecord.epf, esi: pfRecord.esi, fullAndFinal: pfRecord.fullAndFinal,
    otherDeductions: pfRecord.otherDeductions, advances: pfRecord.advances, incomeTax: pfRecord.incomeTax,
    lopDays: pfRecord.lopDays, lopAmount: pfRecord.lopAmount,
    totalEarnings: pfRecord.totalEarnings, totalDeductions: pfRecord.totalDeductions, netSalary: pfRecord.netSalary,
    generatedDate: new Date().toISOString().slice(0, 10)
  };

  // Render + store the PDF via the same generic upload endpoint every other
  // module's documents already use (DocumentAttachment.tsx), so this slip
  // has a real, re-fetchable PDFUrl rather than only ever existing as an
  // in-memory download.
  try {
    const file = buildSalarySlipFile(slip);
    const formData = new FormData();
    formData.append('file', file);
    const uploadRes = await fetch('/api/upload/salary-slips', { method: 'POST', body: formData });
    const uploadResult = await uploadRes.json();
    if (uploadResult.success) slip.pdfUrl = `/${uploadResult.path}`;
  } catch (err) {
    console.error('Failed to store generated salary slip PDF:', err);
    // Non-fatal - the slip record still saves below without a stored PDF;
    // Download still works by re-rendering the PDF from this same snapshot.
  }

  await authFetch('/api/staff/salary-slips', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slip)
  });

  const auditEntry: SalarySlipAuditRecord = {
    id: `${slipNumber}-${forceRegenerate ? 'regen' : 'gen'}-${Date.now()}`,
    slipNumber, empId: employee.id, month: pfRecord.month,
    action: forceRegenerate ? 'Regenerated' : 'Generated',
    timestamp: new Date().toISOString(),
    performedBy
  };
  await authFetch('/api/staff/salary-slip-audit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditEntry)
  });

  return { slip, isNew: true };
}

// Called when the Download button is actually clicked (not on generation) -
// updates IsDownloaded/LastDownloadedDate and writes the 'Downloaded' audit
// row, per the spec's step 6.
export async function markSlipDownloaded(slip: SalarySlipRecord, performedBy: string): Promise<void> {
  const updated: SalarySlipRecord = { ...slip, isDownloaded: true, lastDownloadedDate: new Date().toISOString().slice(0, 10) };
  await authFetch(`/api/staff/salary-slips/${slip.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
  });
  const auditEntry: SalarySlipAuditRecord = {
    id: `${slip.slipNumber}-download-${Date.now()}`,
    slipNumber: slip.slipNumber, empId: slip.empId, month: slip.month,
    action: 'Downloaded', timestamp: new Date().toISOString(), performedBy
  };
  await authFetch('/api/staff/salary-slip-audit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditEntry)
  });
}
