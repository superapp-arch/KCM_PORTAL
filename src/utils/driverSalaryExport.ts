// Shared Driver Salary export logic (Driver Details & Attendance: Format-
// Consistent PDF/Excel Downloads Everywhere) - Download All, per-location,
// per-driver (DriverSalarySheet.tsx) and the Salary Breakup tab
// (DriverFormModal.tsx) all build their export data through this one module,
// so Excel and PDF are guaranteed to show the same figures everywhere
// instead of each download button keeping its own copy in sync by hand.
import { DriverEmployee } from '../types';
import { exportReportToExcel, exportReportToPdf, ReportTableSection } from './reportExport';

// Payable Amount = Gross Salary + Other Additions - (Petty Cash/Advance +
// Loan Deduction + Recovery Amount + Driver Welfare + BATA) - LOP Amount -
// mirrors DriverFormModal's own Salary Breakup formula exactly, computed
// from the same stored snapshot fields so it's always in sync with the last
// save (or, for a live in-progress edit, with the form's current values -
// see DriverFormModal's own liveDriverSnapshot).
export const payableAmount = (driver: DriverEmployee): number =>
  (driver.grossSalary || 0) + (driver.otherAdditions || 0)
  - (driver.pettyCashAdvance || 0) - (driver.loanDeduction || 0) - (driver.recoveryAmount || 0) - (driver.driverWelfare || 0) - (driver.bata || 0)
  - (driver.lopAmount || 0);

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
