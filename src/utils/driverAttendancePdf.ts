// Driver Attendance PDF exports - a proper readable report (driver identity
// block, a Monthly Summary table covering every month on record - not just
// whatever's currently selected on screen - and a plain Date/Status/Remarks
// Daily Log), replacing the old approach of just dumping the on-screen
// day-by-day grid (Driver | Jan1 | Jan2 | ... one cramped column per day)
// straight into a PDF table, which became unreadable past a couple of weeks
// of columns and used bare P/A/LOP-style abbreviations with no legend.
// Excel exports keep the day-grid (see DriverAttendanceSheet.tsx) - a
// spreadsheet handles many columns fine and some offices want that exact
// shape for re-import/formulas; this file is PDF-only.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DriverEmployee, DriverAttendance, AttendanceStatusCode } from '../types';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STATUS_LABELS: Record<AttendanceStatusCode, string> = {
  Present: 'Present', AbsentNoInfo: 'Absent (No Info)', AbsentLOP: 'Absent - LOP', PaidLeave: 'Paid Leave',
  LeaveWithPermission: 'Leave with Permission', HalfDay: 'Half Day', MedicalLeave: 'Medical Leave',
  Holiday: 'Holiday', WeekOff: 'Week Off'
};

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : yyyyMm;
}
function dateLabel(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  return isNaN(d.getTime()) ? yyyyMmDd : `${String(d.getDate()).padStart(2, '0')} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}
function weekdayLabel(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  return isNaN(d.getTime()) ? '' : WEEKDAY_NAMES[d.getDay()];
}
function daysInMonthOf(yyyyMm: string): number {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

interface MonthlySummaryRow {
  month: string;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lopDays: number;
  paidLeaveDays: number;
  halfDays: number;
  exemptionLeaveDays: number;
  attendancePct: number;
}

// Every month this driver has at least one attendance record for, oldest
// first - not just the month currently selected on screen, so "previous
// months" are never left out of the export.
function monthlySummaryForDriver(driverId: string, attendance: DriverAttendance[]): MonthlySummaryRow[] {
  const months = Array.from(new Set(attendance.filter(a => a.driverId === driverId).map(a => a.date.slice(0, 7)))).sort();
  return months.map(month => {
    const rows = attendance.filter(a => a.driverId === driverId && a.date.startsWith(month));
    const count = (s: AttendanceStatusCode) => rows.filter(r => r.status === s).length;
    const presentDays = count('Present');
    const paidLeaveDays = count('PaidLeave');
    const workingDays = presentDays + paidLeaveDays;
    const totalInMonth = daysInMonthOf(month);
    return {
      month, workingDays, presentDays,
      absentDays: count('AbsentNoInfo'), lopDays: count('AbsentLOP'), paidLeaveDays,
      halfDays: count('HalfDay'), exemptionLeaveDays: count('LeaveWithPermission'),
      attendancePct: totalInMonth > 0 ? Math.round((workingDays / totalInMonth) * 1000) / 10 : 0
    };
  });
}

function drawReportHeader(doc: jsPDF, title: string, subtitle: string): number {
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('KCM LOGISTICS', 105, 16, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(title, 105, 23, { align: 'center' });
  if (subtitle) {
    doc.setFontSize(9);
    doc.text(subtitle, 105, 29, { align: 'center' });
  }
  doc.setDrawColor(203, 213, 225);
  doc.line(14, 33, 196, 33);
  return 39;
}

function drawFooter(doc: jsPDF, cursorY: number, note?: string): void {
  if (cursorY > 275) { doc.addPage(); cursorY = 20; }
  if (note) {
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(note, 14, cursorY);
    cursorY += 6;
  }
  doc.setDrawColor(203, 213, 225);
  doc.line(14, cursorY, 196, cursorY);
  cursorY += 5;
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, cursorY, { align: 'right' });
}

const MONTHLY_SUMMARY_HEAD = ['Month', 'Working Days', 'Present', 'Absent', 'LOP', 'Paid Leave', 'Half Day', 'Exemption Leave', 'Attendance %'];
const monthlySummaryBodyRow = (r: MonthlySummaryRow): (string | number)[] =>
  [monthLabel(r.month), r.workingDays, r.presentDays, r.absentDays, r.lopDays, r.paidLeaveDays, r.halfDays, r.exemptionLeaveDays, `${r.attendancePct}%`];

// One driver's report - identity block, then a Monthly Summary table (every
// month on record when scope is 'history'; just the selected month when
// scope is 'month'), then a plain chronological Daily Log. Only days with an
// actual entry are listed in the Daily Log (unmarked days carry no
// information to lose), which is what keeps this readable instead of a wide
// grid full of "-" placeholders.
export function buildDriverAttendancePdf(driver: DriverEmployee, attendance: DriverAttendance[], scope: 'month' | 'history', month?: string): jsPDF {
  const doc = new jsPDF();
  const vehicles = driver.vehicleNos && driver.vehicleNos.length > 0 ? driver.vehicleNos : (driver.vehicleNo ? [driver.vehicleNo] : []);
  const periodLabel = scope === 'month' && month ? monthLabel(month) : 'Full History';

  let cursorY = drawReportHeader(doc, 'Driver Attendance Report', `${driver.name} (${driver.id}) - ${periodLabel}`);

  autoTable(doc, {
    startY: cursorY,
    body: [
      ['Driver Name', driver.name, 'Driver ID', driver.id],
      ['Vehicle No', vehicles.join(' / ') || '-', 'Location', driver.location],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [100, 116, 139] }, 2: { fontStyle: 'bold', textColor: [100, 116, 139] } }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 6;

  const allMonths = monthlySummaryForDriver(driver.id, attendance);
  const summaryRows = scope === 'month' ? allMonths.filter(r => r.month === month) : allMonths;

  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('Monthly Summary', 14, cursorY);
  autoTable(doc, {
    startY: cursorY + 3,
    head: [MONTHLY_SUMMARY_HEAD],
    body: summaryRows.length ? summaryRows.map(monthlySummaryBodyRow) : [['No attendance recorded for this period', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: [30, 64, 175] },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 8;

  const dayRows = attendance
    .filter(a => a.driverId === driver.id && (scope === 'history' || (month ? a.date.startsWith(month) : false)))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (cursorY > 250) { doc.addPage(); cursorY = 20; }
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('Daily Attendance Log', 14, cursorY);
  autoTable(doc, {
    startY: cursorY + 3,
    head: [['Date', 'Day', 'Status', 'Remarks']],
    body: dayRows.length ? dayRows.map(a => [dateLabel(a.date), weekdayLabel(a.date), STATUS_LABELS[a.status] || a.status, a.remarks || '-']) : [['No marked attendance days in this period', '', '', '']],
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [88, 28, 135] }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 6;

  drawFooter(doc, cursorY, 'Only marked attendance days are listed in the Daily Log above; days with no entry are omitted.');
  return doc;
}

// Multi-driver, multi-location report - one Monthly Summary table per
// location (every driver, every month on record, not just the month
// selected on screen), followed by a Location Totals table scoped to
// `currentMonth` as an at-a-glance current-status close-out.
export function buildLocationAttendancePdf(
  title: string, subtitle: string,
  groups: { location: string; drivers: DriverEmployee[] }[],
  attendance: DriverAttendance[], currentMonth: string
): jsPDF {
  const doc = new jsPDF();
  let cursorY = drawReportHeader(doc, title, subtitle);

  groups.forEach(group => {
    if (cursorY > 250) { doc.addPage(); cursorY = 20; }
    doc.setFillColor(5, 150, 105);
    doc.rect(14, cursorY - 4.5, 182, 7, 'F');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${group.location}  (${group.drivers.length} driver${group.drivers.length === 1 ? '' : 's'})`, 17, cursorY);
    cursorY += 5;

    const rows: (string | number)[][] = [];
    group.drivers.forEach(driver => {
      const summary = monthlySummaryForDriver(driver.id, attendance);
      if (summary.length === 0) {
        rows.push([driver.id, driver.name, 'No attendance recorded', '', '', '', '', '', '']);
      } else {
        summary.forEach((r, idx) => {
          rows.push([idx === 0 ? driver.id : '', idx === 0 ? driver.name : '', monthLabel(r.month), r.workingDays, r.presentDays, r.absentDays, r.lopDays, r.paidLeaveDays, `${r.attendancePct}%`]);
        });
      }
    });

    autoTable(doc, {
      startY: cursorY,
      head: [['Driver ID', 'Name', 'Month', 'Working Days', 'Present', 'Absent', 'LOP', 'Paid Leave', 'Attendance %']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 64, 175] },
      margin: { left: 14, right: 14 }
    });
    cursorY = (doc as any).lastAutoTable.finalY + 8;
  });

  if (cursorY > 250) { doc.addPage(); cursorY = 20; }
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`Location Totals - ${monthLabel(currentMonth)}`, 14, cursorY);
  const totalsRows = groups.map(g => {
    let present = 0, absent = 0, lop = 0, paidLeave = 0, workingDaysTotal = 0;
    g.drivers.forEach(driver => {
      const rows = attendance.filter(a => a.driverId === driver.id && a.date.startsWith(currentMonth));
      present += rows.filter(r => r.status === 'Present').length;
      absent += rows.filter(r => r.status === 'AbsentNoInfo').length;
      lop += rows.filter(r => r.status === 'AbsentLOP').length;
      paidLeave += rows.filter(r => r.status === 'PaidLeave').length;
      workingDaysTotal += rows.filter(r => r.status === 'Present' || r.status === 'PaidLeave').length;
    });
    const avgWorkingDays = g.drivers.length ? Math.round((workingDaysTotal / g.drivers.length) * 10) / 10 : 0;
    return [g.location, g.drivers.length, present, absent, lop, paidLeave, avgWorkingDays];
  });
  autoTable(doc, {
    startY: cursorY + 3,
    head: [['Location', 'Drivers', 'Present', 'Absent', 'LOP', 'Paid Leave', 'Avg Working Days']],
    body: totalsRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: [88, 28, 135] },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 6;

  drawFooter(doc, cursorY, 'Each location\'s Monthly Summary above covers every month on record for its drivers; Location Totals reflects the month named above only.');
  return doc;
}
