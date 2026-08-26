// Shared Driver Salary export logic (Driver Details & Attendance: Format-
// Consistent PDF/Excel Downloads Everywhere) - Download All, per-location,
// per-driver (DriverSalarySheet.tsx) and the Salary Breakup tab
// (DriverFormModal.tsx) all build their export data through this one module,
// so Excel and PDF are guaranteed to show the same figures everywhere
// instead of each download button keeping its own copy in sync by hand.
import { DriverEmployee } from '../types';
import { exportReportToExcel, exportReportToPdf, ReportTableSection } from './reportExport';

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

// A driver can cover more than one vehicle (DriverEmployee.vehicleNos) -
// falls back to the legacy single vehicleNo for a driver saved before that
// field existed.
export const vehiclesLabel = (driver: DriverEmployee): string =>
  (driver.vehicleNos && driver.vehicleNos.length > 0 ? driver.vehicleNos : (driver.vehicleNo ? [driver.vehicleNo] : [])).join(' / ');

export const toDriverSalaryRow = (driver: DriverEmployee, i: number) => ({
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
  'Payable Amount': payableAmount(driver),
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

export const driverSalaryRows = (list: DriverEmployee[]): (string | number)[][] =>
  list.map((driver, i) => Object.values(toDriverSalaryRow(driver, i)));

// One section per location group - Excel gets one sheet per section, PDF
// gets one table per section, so "Download All", the per-location download
// and the per-driver/Salary Breakup download (a single-driver, single-group
// section) all share this exact same section builder.
export const salarySections = (groups: { location: string; drivers: DriverEmployee[] }[]): ReportTableSection[] =>
  groups.map(g => ({ heading: g.location, columns: SALARY_COLUMNS, rows: driverSalaryRows(g.drivers) }));

// The one shared export function every Driver Salary download entry point
// calls - Excel and PDF both render from the exact same `sections` data, so
// content parity between formats is structural rather than something to
// keep in sync by hand (see the "Format-Consistent PDF/Excel Downloads
// Everywhere" requirement).
export function exportDriverSalary(filenameBase: string, sections: ReportTableSection[], format: 'excel' | 'pdf', subtitle: string): void {
  if (format === 'excel') exportReportToExcel(filenameBase, sections);
  else exportReportToPdf(filenameBase, 'Driver Salary', subtitle, sections);
}
