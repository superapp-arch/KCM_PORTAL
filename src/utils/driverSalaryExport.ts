// Shared Driver Salary export logic (Driver Details & Attendance: Format-
// Consistent PDF/Excel Downloads Everywhere) - Driver Salary's Download All
// and per-location downloads (DriverSalarySheet.tsx) build their export
// data through this one module (see exportDriverSalary at the bottom), so
// Excel and PDF are guaranteed to show the same figures instead of each
// download button keeping its own copy in sync by hand.
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DriverEmployee, DriverAttendance } from '../types';
import { DriverSalaryAdvanceVoucherSlim, computeDriverPettyCashAdvance } from './driverPettyCashAdvance';
import { driverAllLocations } from './driverLocations';
import { DriverTripMileage, driverVehicleMileage, formatDriverVehicleMileage } from './driverMileage';

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
// Driver Attendance itself shows for that month. absentDays = Absent (No
// Info) + Absent - LOP, the server's own totalAbsent (the "Absent" figure on
// Driver Attendance's monthly summary).
function liveMonthAttendance(driverId: string, month: string, attendance: DriverAttendance[]): { totalDays: number; workingDays: number; lopDays: number; absentDays: number } {
  const rows = attendance.filter(a => a.driverId === driverId && a.date.startsWith(month));
  const lopDays = rows.filter(r => r.status === 'AbsentLOP').length;
  return {
    totalDays: daysInSalaryMonth(month),
    workingDays: rows.filter(r => r.status === 'Present' || r.status === 'PaidLeave').length,
    lopDays,
    absentDays: rows.filter(r => r.status === 'AbsentNoInfo').length + lopDays
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
  return liveDriverMonthSalary(driver, attendance, pettyCashVouchers, currentMonth).earnings.payableAmount;
}

// Everything the Driver Salary list/export needs for one driver + month,
// all live: attendance counts, Petty Cash/Advance, and the single
// computeDriverEarnings breakdown built from them - so the exported Payable
// Amount always equals the on-screen Payable Amount for the same month.
export function liveDriverMonthSalary(
  driver: DriverEmployee, attendance: DriverAttendance[], pettyCashVouchers: DriverSalaryAdvanceVoucherSlim[], month: string
) {
  const days = liveMonthAttendance(driver.id, month, attendance);
  const pettyCashAdvance = computeDriverPettyCashAdvance(pettyCashVouchers, driver.id, month).total;
  const earnings = computeDriverEarnings({
    grossSalary: driver.grossSalary || 0, otherAdditions: driver.otherAdditions || 0,
    pettyCashAdvance, loanDeduction: driver.loanDeduction || 0,
    recoveryAmount: driver.recoveryAmount || 0, driverWelfare: driver.driverWelfare || 0, bata: driver.bata || 0,
    totalDays: days.totalDays, workingDays: days.workingDays, lopDays: days.lopDays
  });
  return { ...days, pettyCashAdvance, earnings };
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

// ---------------------------------------------------------------------------
// Driver Salary downloads (Download All / one location) - 2026-09-24 rework.
// ONE consolidated sheet (Excel) / ONE table (PDF) per download, never split
// by location, for one salary month. Every figure is live for that month:
// attendance from Driver Attendance's own records, Petty Cash/Advance from
// the Driver Salary Adv vouchers, Payable Amount/LOP Amount from
// computeDriverEarnings, Actual Mileage from Trip Details. Salary is a
// whole-driver figure here (as on the Driver Salary screen), so a driver
// assigned to several locations appears once, with every location listed.
// (toDriverSalaryRow/SALARY_COLUMNS above stay as they were - Reports &
// Analytics still uses them.)
// ---------------------------------------------------------------------------
export const DRIVER_SALARY_EXPORT_COLUMNS = [
  'Sl.No', 'Month', 'Driver Name', 'Driver ID', 'Driver No', 'Vehicle No', 'A/C No', 'IFSC Code', 'Reporting',
  'No. of Days', 'No. of Working Days', 'No. of Days Absent', 'Gross Salary', 'Payable Amount', 'Location',
  'LOP Amount', 'Petty Cash/Advance', 'Loan Deduction', 'Recovery Amount', 'Driver Welfare', 'BATA', 'Other Additions',
  'Actual Mileage', 'Remarks'
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function salaryMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : month;
}

export interface DriverSalaryExportContext {
  month: string; // YYYY-MM - the salary month being exported
  attendance: DriverAttendance[];
  pettyCashVouchers: DriverSalaryAdvanceVoucherSlim[];
  trips: DriverTripMileage[];
}

// A driver listed more than once (one entry per location on screen) is
// exported once, at their first position.
export function driverSalaryExportRows(drivers: DriverEmployee[], ctx: DriverSalaryExportContext): (string | number)[][] {
  const seen = new Set<string>();
  const unique = drivers.filter(d => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
  const month = salaryMonthLabel(ctx.month);
  return unique.map((driver, i) => {
    const live = liveDriverMonthSalary(driver, ctx.attendance, ctx.pettyCashVouchers, ctx.month);
    const mileage = formatDriverVehicleMileage(driverVehicleMileage(driver.id, ctx.month, ctx.trips));
    return [
      i + 1, month, driver.name, driver.id, driver.driverNo || '', vehiclesLabel(driver),
      driver.accountNumber || '', driver.ifscCode || '', driver.reporting || '',
      live.totalDays, live.workingDays, live.absentDays,
      driver.grossSalary || '', live.earnings.payableAmount, driverAllLocations(driver).join(', '),
      live.earnings.lopDeduction || '', live.pettyCashAdvance || '', driver.loanDeduction || '', driver.recoveryAmount || '',
      driver.driverWelfare || '', driver.bata || '', driver.otherAdditions || '',
      mileage, driver.remark || ''
    ];
  });
}

const HEADER_FILL = 'FF312E81'; // same indigo header as Driver Attendance's Excel export
const MILEAGE_COL = DRIVER_SALARY_EXPORT_COLUMNS.indexOf('Actual Mileage');
const REMARKS_COL = DRIVER_SALARY_EXPORT_COLUMNS.indexOf('Remarks');

// One worksheet: header row + one row per driver (ExcelJS, the same library
// and header styling as Driver Attendance's export). Actual Mileage/Remarks
// wrap so a multi-vehicle driver's lines stay readable inside one cell.
export async function buildDriverSalaryWorkbook(rows: (string | number)[][]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Driver Salary');
  sheet.addRow(DRIVER_SALARY_EXPORT_COLUMNS);
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (rows.length === 0) sheet.addRow(['No driver records']);
  rows.forEach(r => {
    const row = sheet.addRow(r);
    row.alignment = { vertical: 'top' };
    row.getCell(MILEAGE_COL + 1).alignment = { vertical: 'top', wrapText: true };
    row.getCell(REMARKS_COL + 1).alignment = { vertical: 'top', wrapText: true };
  });
  DRIVER_SALARY_EXPORT_COLUMNS.forEach((label, i) => {
    sheet.getColumn(i + 1).width = label === 'Sl.No' ? 7 : label === 'Driver Name' ? 22 : label === 'Actual Mileage' ? 26 : label === 'Remarks' ? 30 : 14;
  });
  return wb;
}

// One landscape table - same columns/rows as the Excel sheet.
export function buildDriverSalaryPdf(subtitle: string, rows: (string | number)[][]): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Driver Salary', 8, 12);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 8, 18);
  autoTable(doc, {
    startY: 22,
    head: [DRIVER_SALARY_EXPORT_COLUMNS],
    body: rows.length
      ? rows.map(r => r.map(v => typeof v === 'number' ? v.toLocaleString('en-IN') : v))
      : [DRIVER_SALARY_EXPORT_COLUMNS.map((_, i) => i === 0 ? 'No driver records' : '')],
    styles: { fontSize: 5.5, cellPadding: 1, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [49, 46, 129], fontSize: 5.5 },
    columnStyles: { [MILEAGE_COL]: { cellWidth: 24 }, [REMARKS_COL]: { cellWidth: 22 } },
    showHead: 'everyPage',
    margin: { left: 6, right: 6 }
  });
  return doc;
}

// The one export function both Driver Salary download entry points (Download
// All and a location's own Download) call - Excel and PDF render the exact
// same rows, so content parity between formats is structural.
export async function exportDriverSalary(
  filenameBase: string, drivers: DriverEmployee[], ctx: DriverSalaryExportContext, format: 'excel' | 'pdf', scopeLabel: string
): Promise<void> {
  const rows = driverSalaryExportRows(drivers, ctx);
  if (format === 'pdf') {
    buildDriverSalaryPdf(`${scopeLabel} - ${salaryMonthLabel(ctx.month)}`, rows).save(`${filenameBase}.pdf`);
    return;
  }
  const buffer = await (await buildDriverSalaryWorkbook(rows)).xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${filenameBase}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
