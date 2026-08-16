// Shared "resolve or generate a Driver Salary Slip" logic - same shape as
// HR & Payroll's salarySlipGenerate.ts, but scoped to an arbitrary Date
// From/To period (so a driver who only worked part of a month still gets a
// slip) instead of a fixed calendar month. Earned pay is pro-rated: Wages
// Per Day (driver's monthly Gross Salary / days in that month) x days
// actually Present/Paid-Leave within the period - confirmed with the user.
import { authFetch } from '../authFetch';
import { DriverEmployee, DriverSalarySlipRecord, DriverSalarySlipAuditRecord } from '../types';
import { buildDriverSalarySlipFile } from './driverSalarySlipPdf';

export interface DriverAttendanceRangeSummary {
  driverId: string;
  from: string;
  to: string;
  totalDaysInRange: number;
  presentDays: number; // Present + Paid Leave within the range
  lopDays: number;
  exemptionLeaveDays: number;
  daysInFromMonth: number;
}

export interface DriverSlipManualEntries {
  otherAdditions: number;
  pettyCashAdvance: number;
  loanDeduction: number;
  recoveryAmount: number;
  driverWelfare: number;
  bata: number;
}

export interface DriverSlipGenerationResult {
  slip: DriverSalarySlipRecord;
  isNew: boolean; // false = an existing slip for this driverId+dateFrom+dateTo was found and reused, nothing was written
}

// Same masking convention as HR's Salary Slip / the Bank Details tab - last
// 4 digits only.
const maskAccount = (accountNumber?: string): string | undefined => {
  if (!accountNumber) return undefined;
  return accountNumber.length > 4 ? `${'•'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}` : accountNumber;
};

export async function fetchDriverAttendanceRange(driverId: string, dateFrom: string, dateTo: string): Promise<DriverAttendanceRangeSummary> {
  const res = await authFetch(`/api/drivers/attendance/range/${encodeURIComponent(driverId)}/${dateFrom}/${dateTo}`);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error || 'Failed to load attendance for this period.');
  return body.data;
}

function nextSlipNumber(dateTo: string, existingSlips: DriverSalarySlipRecord[]): string {
  const monthKey = dateTo.slice(0, 7).replace('-', '');
  const prefix = `DRVSLIP-${monthKey}-`;
  const maxN = existingSlips.reduce((max, s) => {
    if (!s.slipNumber.startsWith(prefix)) return max;
    const n = parseInt(s.slipNumber.slice(prefix.length), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefix}${String(maxN + 1).padStart(3, '0')}`;
}

// Resolves (reusing an existing slip if present for the same driver+period,
// avoiding duplicate "Generated" audit entries) or generates a brand-new
// one. Manual entries (Other Additions/deductions) are always whatever the
// caller passes in for THIS specific period - they're never auto-copied
// from the driver's monthly snapshot fields, since those apply to a whole
// month, not necessarily the exact period being sliped.
export async function resolveOrGenerateDriverSlip(params: {
  driver: DriverEmployee;
  dateFrom: string;
  dateTo: string;
  manual: DriverSlipManualEntries;
  existingSlips: DriverSalarySlipRecord[];
  forceRegenerate: boolean;
  performedBy: string;
}): Promise<DriverSlipGenerationResult> {
  const { driver, dateFrom, dateTo, manual, existingSlips, forceRegenerate, performedBy } = params;

  if (!forceRegenerate) {
    const existing = existingSlips.find(s => s.driverId === driver.id && s.dateFrom === dateFrom && s.dateTo === dateTo);
    if (existing) return { slip: existing, isNew: false };
  }

  const attendance = await fetchDriverAttendanceRange(driver.id, dateFrom, dateTo);
  const wagesPerDay = attendance.daysInFromMonth > 0 ? (driver.grossSalary || 0) / attendance.daysInFromMonth : 0;
  const earnedAmount = wagesPerDay * attendance.presentDays;
  const lopAmount = wagesPerDay * attendance.lopDays;
  const totalEarnings = earnedAmount + manual.otherAdditions;
  const totalDeductions = manual.pettyCashAdvance + manual.loanDeduction + manual.recoveryAmount + manual.driverWelfare + manual.bata;
  const netSalary = totalEarnings - totalDeductions;

  const slipNumber = nextSlipNumber(dateTo, existingSlips);
  const slip: DriverSalarySlipRecord = {
    id: slipNumber,
    slipNumber,
    driverId: driver.id,
    driverName: driver.name,
    // A driver covering more than one vehicle shows all of them on the slip.
    vehicleNo: (driver.vehicleNos && driver.vehicleNos.length > 0 ? driver.vehicleNos : (driver.vehicleNo ? [driver.vehicleNo] : [])).join(' / ') || undefined,
    location: driver.location,
    dateFrom, dateTo,
    bankAccountNumberMasked: maskAccount(driver.accountNumber),
    ifscCode: driver.ifscCode,
    totalDaysInRange: attendance.totalDaysInRange,
    presentDays: attendance.presentDays,
    lopDays: attendance.lopDays,
    exemptionLeaveDays: attendance.exemptionLeaveDays,
    grossSalaryMonthly: driver.grossSalary,
    wagesPerDay: parseFloat(wagesPerDay.toFixed(2)),
    earnedAmount: parseFloat(earnedAmount.toFixed(2)),
    lopAmount: parseFloat(lopAmount.toFixed(2)),
    otherAdditions: manual.otherAdditions || undefined,
    pettyCashAdvance: manual.pettyCashAdvance || undefined,
    loanDeduction: manual.loanDeduction || undefined,
    recoveryAmount: manual.recoveryAmount || undefined,
    driverWelfare: manual.driverWelfare || undefined,
    bata: manual.bata || undefined,
    totalEarnings: parseFloat(totalEarnings.toFixed(2)),
    totalDeductions: parseFloat(totalDeductions.toFixed(2)),
    netSalary: parseFloat(netSalary.toFixed(2)),
    generatedDate: new Date().toISOString().slice(0, 10)
  };

  // Render + store the PDF via the same generic upload endpoint every other
  // module's documents already use, so this slip has a real, re-fetchable
  // pdfUrl rather than only ever existing as an in-memory download.
  try {
    const file = buildDriverSalarySlipFile(slip);
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
    slipNumber, driverId: driver.id, dateFrom, dateTo,
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
    slipNumber: slip.slipNumber, driverId: slip.driverId, dateFrom: slip.dateFrom, dateTo: slip.dateTo,
    action: 'Downloaded', timestamp: new Date().toISOString(), performedBy
  };
  await authFetch('/api/drivers/salary-slip-audit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditEntry)
  });
}
