import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import { Download } from 'lucide-react';
import { StaffEmployee, StaffAttendance, AttendanceStatusCode } from '../../types';

interface AttendanceReportDownloadProps {
  employees: StaffEmployee[];
}

type Range = 'last-month' | 'last-6-months';

// ARGB fills roughly matching the on-screen status colors, for a styled
// drop-in replacement of the original color-coded attendance sheet.
const STATUS_FILL: Record<AttendanceStatusCode, string> = {
  Present: 'FFD1FAE5', AbsentNoInfo: 'FFFFE4E6', AbsentLOP: 'FFFED7AA', PaidLeave: 'FFE0F2FE',
  LeaveWithPermission: 'FFE0E7FF', HalfDay: 'FFFEF3C7', MedicalLeave: 'FFFAE8FF',
  Holiday: 'FFF3E8FF', WeekOff: 'FFE2E8F0'
};
const STATUS_ABBR: Record<AttendanceStatusCode, string> = {
  Present: 'P', AbsentNoInfo: 'A', AbsentLOP: 'LOP', PaidLeave: 'PL', LeaveWithPermission: 'LWP',
  HalfDay: 'HD', MedicalLeave: 'ML', Holiday: 'H', WeekOff: 'WO'
};
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function dayLabel(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return `${MONTH_ABBR[d.getMonth()]}${d.getDate()}`;
}

type SalaryInfo = { ctc25?: number; annualCtc25?: number; effectiveSalary?: number; advanceBalance?: number } | null;

// Writes a small "Salary Details" block a couple of rows below the
// attendance data, so the exported report also carries CTC/advance info
// without disturbing the attendance grid/summary rows above it.
function appendSalarySection(sheet: ExcelJS.Worksheet, salary: SalaryInfo, startRow: number) {
  sheet.getCell(startRow, 1).value = 'Salary Details';
  sheet.getCell(startRow, 1).font = { bold: true };
  const fmt = (n: number | undefined) => (n != null ? `Rs. ${n.toLocaleString('en-IN')}` : '-');
  sheet.getCell(startRow + 1, 1).value = 'CTC';
  sheet.getCell(startRow + 1, 2).value = fmt(salary?.ctc25);
  sheet.getCell(startRow + 2, 1).value = 'Annual CTC';
  sheet.getCell(startRow + 2, 2).value = fmt(salary?.annualCtc25);
  sheet.getCell(startRow + 3, 1).value = 'Effective Salary';
  sheet.getCell(startRow + 3, 2).value = fmt(salary?.effectiveSalary);
  sheet.getCell(startRow + 4, 1).value = 'Advance Balance';
  sheet.getCell(startRow + 4, 2).value = fmt(salary?.advanceBalance);
}

export default function AttendanceReportDownload({ employees }: AttendanceReportDownloadProps) {
  const [open, setOpen] = useState(false);
  const [empId, setEmpId] = useState(employees[0]?.id || '');
  const [range, setRange] = useState<Range>('last-month');
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadStaffReport = async () => {
    if (!empId) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/staff/attendance/${encodeURIComponent(empId)}/report?range=${range}`);
      const { data } = await res.json();
      const employee: StaffEmployee = data.employee;
      const rows: StaffAttendance[] = data.rows;
      const salary = data.salary;

      const wb = new ExcelJS.Workbook();

      if (range === 'last-month') {
        const month = data.monthKeys[0];
        const sheet = wb.addWorksheet(month);
        const total = daysInMonth(month);
        sheet.getCell(1, 1).value = 'Employee';
        for (let day = 1; day <= total; day++) sheet.getCell(1, day + 1).value = dayLabel(month, day);
        sheet.getCell(2, 1).value = `${employee?.name || empId} (${empId})`;
        for (let day = 1; day <= total; day++) {
          const date = `${month}-${String(day).padStart(2, '0')}`;
          const record = rows.find(r => r.date === date);
          const cell = sheet.getCell(2, day + 1);
          if (record) {
            cell.value = STATUS_ABBR[record.status];
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[record.status] } };
          }
        }
        sheet.getRow(1).font = { bold: true };
        sheet.columns.forEach(c => { c.width = 8; });
        sheet.getColumn(1).width = 24;
        appendSalarySection(sheet, salary, 4);
      } else {
        const sheet = wb.addWorksheet('6-Month Summary');
        sheet.addRow(['Month', 'Working Days', 'Present', 'Absent', 'Half Day', 'Paid Leave', 'LOP', 'Attendance %']);
        sheet.getRow(1).font = { bold: true };
        data.summaries.forEach((s: any) => {
          sheet.addRow([s.month, s.workingDays, s.presentDays, s.totalAbsent, s.halfDays, s.paidLeaveDays, s.lopDays, `${s.attendancePercentage}%`]);
        });
        sheet.columns.forEach(c => { c.width = 16; });
        appendSalarySection(sheet, salary, data.summaries.length + 3);
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `attendance-${empId}-${range}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadAllStaffReport = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/staff/attendance/report/all?range=${range}`);
      const { data } = await res.json();

      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('All Staff');
      const header = ['Emp ID', 'Name', 'CTC', 'Annual CTC', 'Effective Salary', 'Advance Balance'];
      data.monthKeys.forEach((m: string) => header.push(`${m} Working`, `${m} Present`, `${m} Absent`, `${m} PL`, `${m} LOP`, `${m} %`));
      sheet.addRow(header);
      sheet.getRow(1).font = { bold: true };

      const fmt = (n: number | undefined) => (n != null ? `Rs. ${n.toLocaleString('en-IN')}` : '-');
      data.perEmployee.forEach((e: any) => {
        const row = [e.empId, e.name, fmt(e.salary?.ctc25), fmt(e.salary?.annualCtc25), fmt(e.salary?.effectiveSalary), fmt(e.salary?.advanceBalance)];
        e.summaries.forEach((s: any) => row.push(s.workingDays, s.presentDays, s.totalAbsent, s.paidLeaveDays, s.lopDays, `${s.attendancePercentage}%`));
        sheet.addRow(row);
      });
      sheet.columns.forEach(c => { c.width = 12; });
      sheet.getColumn(2).width = 22;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `attendance-all-staff-${range}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-semibold cursor-pointer flex items-center gap-1.5 text-xs">
        <Download className="w-3.5 h-3.5" /> Reports
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-[100] bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-64 text-xs space-y-2">
            <select value={range} onChange={e => setRange(e.target.value as Range)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="last-month">Last Month</option>
              <option value="last-6-months">Last 6 Months</option>
            </select>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5">
              {employees.map(e => <option key={e.id} value={e.id}>{e.id} - {e.name}</option>)}
            </select>
            <button onClick={downloadStaffReport} disabled={isDownloading} className="w-full bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold py-1.5 rounded-lg uppercase text-[10px] cursor-pointer disabled:opacity-50">
              Download This Staff's Report
            </button>
            <button onClick={downloadAllStaffReport} disabled={isDownloading} className="w-full bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold py-1.5 rounded-lg uppercase text-[10px] cursor-pointer disabled:opacity-50">
              Download All-Staff Report
            </button>
          </div>
        </>
      )}
    </div>
  );
}
