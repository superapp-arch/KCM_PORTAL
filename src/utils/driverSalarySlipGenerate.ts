// Shared "resolve or generate a Driver Salary Slip" logic - same shape as
// HR & Payroll's salarySlipGenerate.ts. Month-based, and nothing is entered
// manually here: Gross Salary/Other Additions/deductions are read straight
// off the driver's already-saved Salary Breakup (DriverFormModal's own
// Salary tab), and the attendance figures (days present, LOP) come from the
// same live monthly summary Salary Breakup itself already displays - so the
// slip can never show something different from what's actually on record.
import { authFetch } from '../authFetch';
import { DriverEmployee, DriverSalarySlipRecord, DriverSalarySlipAuditRecord } from '../types';
import { buildDriverSalarySlipFile } from './driverSalarySlipPdf';
import { computeDriverEarnings } from './driverSalaryExport';

export interface DriverMonthlyAttendanceSummary {
  totalDays: number;
  salaryWorkingDays: number; // Present + Paid Leave - what Salary Breakup calls "Working Days"
  lopDays: number;
  exemptionLeaveDays: number;
}

export interface DriverSlipGenerationResult {
  slip: DriverSalarySlipRecord;
  isNew: boolean; // false = an existing slip for this driverId+month was found and reused, nothing was written
}

// Same masking convention as HR's Salary Slip / the Bank Details tab - last
// 4 digits only.
const maskAccount = (accountNumber?: string): string | undefined => {
  if (!accountNumber) return undefined;
  return accountNumber.length > 4 ? `${'•'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}` : accountNumber;
};

export async function fetchDriverMonthlyAttendance(driverId: string, month: string): Promise<DriverMonthlyAttendanceSummary> {
  const res = await authFetch(`/api/drivers/attendance/monthly/${encodeURIComponent(driverId)}/${month}`);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error || 'Failed to load attendance for this month.');
  return body.data;
}

function nextSlipNumber(month: string, existingSlips: DriverSalarySlipRecord[]): string {
  const prefix = `DRVSLIP-${month.replace('-', '')}-`;
  const maxN = existingSlips.reduce((max, s) => {
    if (!s.slipNumber.startsWith(prefix)) return max;
    const n = parseInt(s.slipNumber.slice(prefix.length), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefix}${String(maxN + 1).padStart(3, '0')}`;
}

// Resolves (reusing an existing slip if present for the same driver+month,
// avoiding duplicate "Generated" audit entries) or generates a brand-new
// one straight from the driver's current Salary Breakup + that month's
// attendance - no separate manual-entry step.
export async function resolveOrGenerateDriverSlip(params: {
  driver: DriverEmployee;
  existingSlips: DriverSalarySlipRecord[];
  forceRegenerate: boolean;
  performedBy: string;
}): Promise<DriverSlipGenerationResult> {
  const { driver, existingSlips, forceRegenerate, performedBy } = params;
  const month = driver.month;
  if (!month) throw new Error('This driver has no Salary Breakup month set yet - fill in Salary Breakup first.');

  if (!forceRegenerate) {
    const existing = existingSlips.find(s => s.driverId === driver.id && s.month === month);
    if (existing) return { slip: existing, isNew: false };
  }

  const attendance = await fetchDriverMonthlyAttendance(driver.id, month);
  const grossSalary = driver.grossSalary || 0;
  const otherAdditions = driver.otherAdditions || 0;
  // Same shared formula Salary Breakup and Driver Salary/Attendance's
  // downloads use (see utils/driverSalaryExport.ts's computeDriverEarnings)
  // - the slip's netSalary can never disagree with Salary Breakup's Payable
  // Amount for the same driver/month.
  const earnings = computeDriverEarnings({
    grossSalary, otherAdditions,
    pettyCashAdvance: driver.pettyCashAdvance || 0, loanDeduction: driver.loanDeduction || 0,
    recoveryAmount: driver.recoveryAmount || 0, driverWelfare: driver.driverWelfare || 0, bata: driver.bata || 0,
    totalDays: attendance.totalDays, workingDays: attendance.salaryWorkingDays, lopDays: attendance.lopDays
  });
  const wagesPerDay = earnings.perDaySalary;
  const grossEarned = earnings.grossEarned;
  const lopAmount = earnings.lopDeduction;
  // totalDeductions here stays deduction-only (no LOP) to match this
  // record's own long-standing field meaning - DriverSalarySlipModal/PDF
  // already add lopAmount back in at display time for the shown "Total
  // Deductions" line (see driverSalarySlipPdf.ts).
  const totalDeductions = (driver.pettyCashAdvance || 0) + (driver.loanDeduction || 0) + (driver.recoveryAmount || 0) + (driver.driverWelfare || 0) + (driver.bata || 0);
  // Pro-rated (Gross Earned, not the full Gross Salary) + Other Additions,
  // so Total Earnings - Total Deductions(incl. LOP, shown) reconciles
  // exactly to Net Salary on the printed slip.
  const totalEarnings = grossEarned + otherAdditions;
  const netSalary = earnings.payableAmount;

  const slipNumber = nextSlipNumber(month, existingSlips);
  const slip: DriverSalarySlipRecord = {
    id: slipNumber,
    slipNumber,
    driverId: driver.id,
    driverName: driver.name,
    vehicleNo: (driver.vehicleNos && driver.vehicleNos.length > 0 ? driver.vehicleNos : (driver.vehicleNo ? [driver.vehicleNo] : [])).join(' / ') || undefined,
    location: driver.location,
    month,
    bankAccountNumberMasked: maskAccount(driver.accountNumber),
    ifscCode: driver.ifscCode,
    totalDays: attendance.totalDays,
    presentDays: attendance.salaryWorkingDays,
    lopDays: attendance.lopDays,
    exemptionLeaveDays: attendance.exemptionLeaveDays,
    grossSalary: driver.grossSalary,
    wagesPerDay: parseFloat(wagesPerDay.toFixed(2)),
    grossEarned: parseFloat(grossEarned.toFixed(2)),
    lopAmount: parseFloat(lopAmount.toFixed(2)),
    otherAdditions: driver.otherAdditions,
    pettyCashAdvance: driver.pettyCashAdvance,
    loanDeduction: driver.loanDeduction,
    recoveryAmount: driver.recoveryAmount,
    driverWelfare: driver.driverWelfare,
    bata: driver.bata,
    totalEarnings: parseFloat(totalEarnings.toFixed(2)),
    totalDeductions: parseFloat(totalDeductions.toFixed(2)),
    netSalary: parseFloat(netSalary.toFixed(2)),
    generatedDate: new Date().toISOString().slice(0, 10)
  };

  // Render + store the PDF via the same generic upload endpoint every other
  // module's documents already use, so this slip has a real, re-fetchable
  // pdfUrl rather than only ever existing as an in-memory download.
  try {
    const file = await buildDriverSalarySlipFile(slip);
    const formData = new FormData();
    formData.append('file', file);
    const uploadRes = await fetch('/api/upload/driver-salary-slips', { method: 'POST', body: formData });
    const uploadResult = await uploadRes.json();
    if (uploadResult.success) slip.pdfUrl = `/${uploadResult.path}`;
  } catch (err) {
    console.error('Failed to store generated driver salary slip PDF:', err);
    // Non-fatal - the slip record still saves below without a stored PDF;
    // Download still works by re-rendering the PDF from this same snapshot.
  }

  const saveRes = await authFetch('/api/drivers/salary-slips', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slip)
  });
  if (!saveRes.ok) {
    const body = await saveRes.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to save the generated salary slip.');
  }

  const auditEntry: DriverSalarySlipAuditRecord = {
    id: `${slipNumber}-${forceRegenerate ? 'regen' : 'gen'}-${Date.now()}`,
    slipNumber, driverId: driver.id, month,
    action: forceRegenerate ? 'Regenerated' : 'Generated',
    timestamp: new Date().toISOString(),
    performedBy
  };
  await authFetch('/api/drivers/salary-slip-audit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditEntry)
  });

  return { slip, isNew: true };
}

// Called when the Download button is actually clicked (not on generation) -
// updates isDownloaded/lastDownloadedDate and writes the 'Downloaded' audit
// row, same convention as HR's Salary Slip.
export async function markDriverSlipDownloaded(slip: DriverSalarySlipRecord, performedBy: string): Promise<void> {
  const updated: DriverSalarySlipRecord = { ...slip, isDownloaded: true, lastDownloadedDate: new Date().toISOString().slice(0, 10) };
  await authFetch(`/api/drivers/salary-slips/${slip.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
  });
  const auditEntry: DriverSalarySlipAuditRecord = {
    id: `${slip.slipNumber}-download-${Date.now()}`,
    slipNumber: slip.slipNumber, driverId: slip.driverId, month: slip.month,
    action: 'Downloaded', timestamp: new Date().toISOString(), performedBy
  };
  await authFetch('/api/drivers/salary-slip-audit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditEntry)
  });
}
