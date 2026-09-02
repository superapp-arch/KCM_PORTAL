// Shared Driver Salary export logic (Driver Details & Attendance: Format-
// Consistent PDF/Excel Downloads Everywhere) - Download All, per-location,
// per-driver (DriverSalarySheet.tsx) and the Salary Breakup tab
// (DriverFormModal.tsx) all build their export data through this one module,
// so Excel and PDF are guaranteed to show the same figures everywhere
// instead of each download button keeping its own copy in sync by hand.
import { DriverEmployee, DriverAttendance } from '../types';
import { exportReportToExcel, exportReportToPdf, ReportTableSection } from './reportExport';
import { DriverSalaryAdvanceVoucherSlim, computeDriverPettyCashAdvance } from './driverPettyCashAdvance';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface DriverEarningsInput {
  grossSalary: number;
  otherAdditions: number;
  pettyCashAdvance: number;
  loanDeduction: number;
  recoveryAmount: number;
  driverWelfare: number;
  bata: number;
  totalDays: number; // No. of Days - calendar days in the salary month
  workingDays: number; // days actually present (+ Paid Leave - see summarizeMonthRows)
  lopDays: number;
}

export interface DriverEarningsBreakdown {
  perDaySalary: number; // Gross Salary / No. of Days
  grossEarned: number; // Per Day Salary x Working Days
  lopDeduction: number; // Per Day Salary x LOP days
  totalDeductions: number; // Petty Cash/Advance + Loan Deduction + Recovery Amount + Driver Welfare + BATA + LOP Deduction
  payableAmount: number; // Gross Earned + Other Additions - Total Deductions
}

// THE single Payable Amount formula - every place that shows a driver's
// Payable Amount (Salary Breakup tab, Driver Salary/Attendance downloads,
// the Salary Slip) computes it through this one function so none of them can
// ever drift out of sync with each other:
//   Per Day Salary   = Gross Salary / No. of Days
//   LOP Deduction    = Per Day Salary x LOP days
//   Gross Earned     = Per Day Salary x Working Days
//   Total Deductions = Petty Cash/Advance + Loan Deduction + Recovery Amount
//                       + Driver Welfare + BATA + LOP Deduction
//   Payable Amount   = Gross Earned + Other Additions - Total Deductions
// All figures rounded to 2 decimals.
export function computeDriverEarnings(input: DriverEarningsInput): DriverEarningsBreakdown {
  const perDaySalary = input.totalDays > 0 ? input.grossSalary / input.totalDays : 0;
  const lopDeduction = perDaySalary * input.lopDays;
  const grossEarned = perDaySalary * input.workingDays;
  const totalDeductions = input.pettyCashAdvance + input.loanDeduction + input.recoveryAmount + input.driverWelfare + input.bata + lopDeduction;
  const payableAmount = grossEarned + input.otherAdditions - totalDeductions;
  return {
    perDaySalary: round2(perDaySalary),
    grossEarned: round2(grossEarned),
    lopDeduction: round2(lopDeduction),
    totalDeductions: round2(totalDeductions),
    payableAmount: round2(payableAmount)
  };
}

function daysInSalaryMonth(month: string | undefined): number {
  if (!month) return 30; // no month on record at all - generic fallback, only hit by very old/incomplete data
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Persisted-snapshot version of the formula above - used wherever only the
// driver's own saved record is available (no live attendance fetch), e.g.
// Driver Salary's Download All/per-location exports. Reads driver.lopAmount
// directly as the LOP Deduction (it was already computed this exact way at
// save time) rather than re-deriving it from a raw day-count.
// driver.workingDays defaults to the full month for any record saved before
// that field existed, which reproduces that record's pre-fix Payable Amount
// exactly (no scaling) rather than silently changing historical exports.
export const payableAmount = (driver: DriverEmployee): number => {
  const totalDays = daysInSalaryMonth(driver.month);
  const workingDays = driver.workingDays ?? totalDays;
  const grossSalary = driver.grossSalary || 0;
  const perDaySalary = totalDays > 0 ? grossSalary / totalDays : 0;
  const grossEarned = perDaySalary * workingDays;
  const totalDeductions = (driver.pettyCashAdvance || 0) + (driver.loanDeduction || 0) + (driver.recoveryAmount || 0) + (driver.driverWelfare || 0) + (driver.bata || 0) + (driver.lopAmount || 0);
  return round2(grossEarned + (driver.otherAdditions || 0) - totalDeductions);
};

// Present + Paid Leave = Working Days, AbsentLOP = LOP days - the exact same
// rule the server's own computeDriverMonthlyAttendanceSummary and Driver
// Attendance's own summarizeMonthRows use, so this always agrees with what
// Driver Attendance itself shows for that month.
function liveMonthAttendance(driverId: string, month: string, attendance: DriverAttendance[]): { totalDays: number; workingDays: number; lopDays: number } {
  const rows = attendance.filter(a => a.driverId === driverId && a.date.startsWith(month));
  return {
    totalDays: daysInSalaryMonth(month),
    workingDays: rows.filter(r => r.status === 'Present' || r.status === 'PaidLeave').length,
    lopDays: rows.filter(r => r.status === 'AbsentLOP').length
  };
}

// Live version of payableAmount() above - computes Working Days/LOP fresh
// from actual attendance records for driver.month, the same way the Salary
// Breakup tab's own live preview does, instead of trusting whatever
// workingDays/lopAmount snapshot happened to be persisted on the driver
// record at its last save.
//
// This matters because payableAmount()'s snapshot fields only exist on a
// driver once their Salary Breakup has been saved AFTER they were added -
// until then (or for any driver saved before workingDays existed at all),
// it silently falls back to "treat the whole month as worked", which can
// disagree with what the Salary Breakup tab is showing live for the exact
// same driver/month. Call this instead wherever the caller already has (or
// can cheaply fetch) the full attendance list - the Driver Salary list/
// exports - so what's displayed there can never lag behind a fresh Save.
export function payableAmountLive(driver: DriverEmployee, attendance: DriverAttendance[]): number {
  if (!driver.month) return payableAmount(driver); // nothing to compute live against - fall back to the snapshot version
  const { totalDays, workingDays, lopDays } = liveMonthAttendance(driver.id, driver.month, attendance);
  const { payableAmount: amount } = computeDriverEarnings({
    grossSalary: driver.grossSalary || 0, otherAdditions: driver.otherAdditions || 0,
    pettyCashAdvance: driver.pettyCashAdvance || 0, loanDeduction: driver.loanDeduction || 0,
    recoveryAmount: driver.recoveryAmount || 0, driverWelfare: driver.driverWelfare || 0, bata: driver.bata || 0,
    totalDays, workingDays, lopDays
  });
  return amount;
}

// Real-current-calendar-month version of the above (2026-09-02) - the
// Driver Salary list column was still computing Payable Amount off
// driver.month, which only ever advances when someone opens that driver's
// Salary Breakup tab and hits Save. Left untouched, every driver's column
// figure stayed pinned to whatever month they were last saved in (often the
// month they were first added), silently wrong for the entire rest of the
// list every time the calendar rolled over, unless the office opened and
// re-saved each driver by hand every month - exactly the manual-per-driver
// workaround this was meant to remove.
//
// Petty Cash/Advance is also re-derived live for the current month here
// (computeDriverPettyCashAdvance), not read from driver.pettyCashAdvance -
// that field is the same kind of last-saved-month snapshot as driver.month
// itself, so trusting it here would just trade one stale figure for
// another. Every other input (Gross Salary, Loan Deduction, Recovery
// Amount, Driver Welfare, BATA, Other Additions) still comes straight off
// the driver record, same as everywhere else - those are maintained by hand
// and aren't tied to a specific month the way attendance/Petty Cash are.
export function payableAmountLiveCurrentMonth(
  driver: DriverEmployee, attendance: DriverAttendance[], pettyCashVouchers: DriverSalaryAdvanceVoucherSlim[], currentMonth: string
): number {
  const { totalDays, workingDays, lopDays } = liveMonthAttendance(driver.id, currentMonth, attendance);
  const pettyCashAdvance = computeDriverPettyCashAdvance(pettyCashVouchers, driver.id, currentMonth).total;
  const { payableAmount: amount } = computeDriverEarnings({
    grossSalary: driver.grossSalary || 0, otherAdditions: driver.otherAdditions || 0,
    pettyCashAdvance, loanDeduction: driver.loanDeduction || 0,
    recoveryAmount: driver.recoveryAmount || 0, driverWelfare: driver.driverWelfare || 0, bata: driver.bata || 0,
    totalDays, workingDays, lopDays
  });
  return amount;
}

// A driver can cover more than one vehicle (DriverEmployee.vehicleNos) -
// falls back to the legacy single vehicleNo for a driver saved before that
// field existed.
export const vehiclesLabel = (driver: DriverEmployee): string =>
  (driver.vehicleNos && driver.vehicleNos.length > 0 ? driver.vehicleNos : (driver.vehicleNo ? [driver.vehicleNo] : [])).join(' / ');

// `attendance`, when passed, makes Payable Amount here match the Salary
// Breakup tab's live figure exactly (see payableAmountLive above) instead
// of whatever workingDays/lopAmount snapshot was last persisted.
export const toDriverSalaryRow = (driver: DriverEmployee, i: number, attendance?: DriverAttendance[]) => ({
  'Sl.No': i + 1,
  'Driver Name': driver.name,
  'Driver ID': driver.id,
  'Driver No': driver.driverNo,
  'Vehicle No': vehiclesLabel(driver),
  'A/C No': driver.accountNumber || '',
  'IFSC Code': driver.ifscCode || '',
  'Reporting': driver.reporting || '',
  'Remark': driver.remark || '',
  'LOP Amount': driver.lopAmount || '',
  'Petty Cash/Advance': driver.pettyCashAdvance || '',
  'Month': driver.month || '',
  'Loan Deduction': driver.loanDeduction || '',
  'Recovery Amount': driver.recoveryAmount || '',
  'Driver Welfare': driver.driverWelfare || '',
  'BATA': driver.bata || '',
  'Other Additions': driver.otherAdditions || '',
  'Gross Salary': driver.grossSalary || '',
  'Payable Amount': attendance ? payableAmountLive(driver, attendance) : payableAmount(driver),
  'Location': driver.location
});

// Same column order as toDriverSalaryRow above - kept as an explicit array
// (rather than derived from it) since ReportTableSection needs
// columns/rows as parallel arrays, not row objects.
export const SALARY_COLUMNS = [
  'Sl.No', 'Driver Name', 'Driver ID', 'Driver No', 'Vehicle No', 'A/C No', 'IFSC Code', 'Reporting',
  'Remark', 'LOP Amount', 'Petty Cash/Advance', 'Month', 'Loan Deduction', 'Recovery Amount',
  'Driver Welfare', 'BATA', 'Other Additions', 'Gross Salary', 'Payable Amount', 'Location'
];

export const driverSalaryRows = (list: DriverEmployee[], attendance?: DriverAttendance[]): (string | number)[][] =>
  list.map((driver, i) => Object.values(toDriverSalaryRow(driver, i, attendance)));

// One section per location group - Excel gets one sheet per section, PDF
// gets one table per section, so "Download All", the per-location download
// and the per-driver/Salary Breakup download (a single-driver, single-group
// section) all share this exact same section builder.
export const salarySections = (groups: { location: string; drivers: DriverEmployee[] }[], attendance?: DriverAttendance[]): ReportTableSection[] =>
  groups.map(g => ({ heading: g.location, columns: SALARY_COLUMNS, rows: driverSalaryRows(g.drivers, attendance) }));

// The one shared export function every Driver Salary download entry point
// calls - Excel and PDF both render from the exact same `sections` data, so
// content parity between formats is structural rather than something to
// keep in sync by hand (see the "Format-Consistent PDF/Excel Downloads
// Everywhere" requirement).
export function exportDriverSalary(filenameBase: string, sections: ReportTableSection[], format: 'excel' | 'pdf', subtitle: string): void {
  if (format === 'excel') exportReportToExcel(filenameBase, sections);
  else exportReportToPdf(filenameBase, 'Driver Salary', subtitle, sections);
}
