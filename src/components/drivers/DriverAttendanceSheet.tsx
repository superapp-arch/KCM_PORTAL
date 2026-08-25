import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DriverEmployee, DriverAttendance, AttendanceStatusCode, DriverLocationCategory, DRIVER_LOCATION_CATEGORIES } from '../../types';
import { authFetch } from '../../authFetch';
import { compareTrailingNumber } from '../../utils/sort';
import DriverAttendanceSummaryModal from './DriverAttendanceSummaryModal';
import { exportReportToExcel, ReportTableSection } from '../../utils/reportExport';
import { buildDriverAttendancePdf, buildLocationAttendancePdf, buildDriverAttendanceSummaryPdf, DriverAttendanceSummaryRow } from '../../utils/driverAttendancePdf';
import DownloadMenu, { DownloadMenuOption } from './DownloadMenu';

interface DriverAttendanceSheetProps {
  drivers: DriverEmployee[];
  writableLocations: DriverLocationCategory[] | 'ALL'; // locations this user may mark/edit attendance for - others show read-only
}

const QUICK_CODES: { status: AttendanceStatusCode; label: string }[] = [
  { status: 'Present', label: 'P' },
  { status: 'AbsentNoInfo', label: 'A' },
  { status: 'PaidLeave', label: 'PL' },
];

const ALL_STATUSES: { status: AttendanceStatusCode; label: string }[] = [
  { status: 'Present', label: 'Present' },
  { status: 'AbsentNoInfo', label: 'Absent (No Info)' },
  { status: 'AbsentLOP', label: 'Absent - LOP' },
  { status: 'PaidLeave', label: 'Paid Leave' },
  { status: 'LeaveWithPermission', label: 'Leave with Permission' },
  { status: 'HalfDay', label: 'Half Day' },
  { status: 'MedicalLeave', label: 'Medical Leave' },
  { status: 'Holiday', label: 'Holiday' },
  { status: 'WeekOff', label: 'Week Off' },
];

const STATUS_STYLES: Record<AttendanceStatusCode, string> = {
  Present: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  AbsentNoInfo: 'bg-rose-100 text-rose-800 border-rose-300',
  AbsentLOP: 'bg-orange-200 text-orange-900 border-orange-400',
  PaidLeave: 'bg-sky-100 text-sky-800 border-sky-300',
  LeaveWithPermission: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  HalfDay: 'bg-amber-100 text-amber-800 border-amber-300',
  MedicalLeave: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
  Holiday: 'bg-purple-100 text-purple-800 border-purple-300',
  WeekOff: 'bg-slate-200 text-slate-600 border-slate-300'
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
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function dayLabel(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return `${MONTH_ABBR[d.getMonth()]}${d.getDate()}`;
}
// Same yyyy-mm-dd convention every other "today" default in this codebase
// already uses (see e.g. FuelManagement/MileageReport's date state).
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// One driver's month rows -> {lopDays, exemptionLeaveDays, workingDays} -
// shared by the on-screen summary columns and every export below so both can
// never drift apart. Paid Leave counts as a worked day for salary purposes,
// same rule as the server's own computeDriverMonthlyAttendanceSummary.
function summarizeMonthRows(rows: DriverAttendance[]): { lopDays: number; exemptionLeaveDays: number; workingDays: number } {
  const lopDays = rows.filter(r => r.status === 'AbsentLOP').length;
  const exemptionLeaveDays = rows.filter(r => r.status === 'LeaveWithPermission').length;
  const workingDays = rows.filter(r => r.status === 'Present' || r.status === 'PaidLeave').length;
  return { lopDays, exemptionLeaveDays, workingDays };
}

// Payable Amount = Gross Salary + Other Additions - (Petty Cash/Advance +
// Loan Deduction + Recovery Amount + Driver Welfare + BATA) - LOP Amount -
// duplicated from DriverSalarySheet.tsx's own `payableAmount` (keep both in
// sync if that formula ever changes) rather than importing across the
// drivers/ subtree, same "small pure formula, synced by comment" precedent
// utils/driverSalarySlipGenerate.ts already follows for this exact formula.
const payableAmount = (driver: DriverEmployee): number =>
  (driver.grossSalary || 0) + (driver.otherAdditions || 0)
  - (driver.pettyCashAdvance || 0) - (driver.loanDeduction || 0) - (driver.recoveryAmount || 0) - (driver.driverWelfare || 0) - (driver.bata || 0)
  - (driver.lopAmount || 0);

// Gross Salary/Payable Amount for the "Download All" export (and every other
// Excel export below, for consistency) - read straight off the driver record
// already passed into this sheet (DriverEmployee carries one salary
// snapshot per driver, tagged with `month` - see types.ts), so no separate
// fetch/join is needed to line it up by driver ID: same object, same list
// Driver Salary edits. Blank ('N/A') whenever that snapshot isn't actually
// for the month being exported, rather than showing a stale figure from
// whatever month Driver Salary was last saved for.
function driverSalarySnapshotFor(driver: DriverEmployee, month: string): { grossSalary: number | string; payable: number | string } {
  if (driver.month !== month) return { grossSalary: 'N/A', payable: 'N/A' };
  return { grossSalary: driver.grossSalary || 0, payable: payableAmount(driver) };
}

// The on-screen day-grid (Driver | day-by-day status | Working Days / LOP /
// Exemption Leave), as an export section - used for a single location, a set
// of a user's writable locations, or every location, depending on what
// `list` is handed.
function attendanceGridSection(month: string, list: DriverEmployee[], attendance: DriverAttendance[], heading: string): ReportTableSection {
  const total = daysInMonth(month);
  const columns = [
    'Driver ID', 'Driver Name', ...Array.from({ length: total }, (_, i) => dayLabel(month, i + 1)),
    'No. of Days', 'Working Days', 'LOP', 'Exemption Leave', 'Gross Salary', 'Payable Amount'
  ];
  const rows = list.map(driver => {
    const driverRows = attendance.filter(a => a.driverId === driver.id && a.date.startsWith(month));
    const dayCells = Array.from({ length: total }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      const record = driverRows.find(a => a.date === date);
      return record ? STATUS_ABBR[record.status] : '-';
    });
    const { lopDays, exemptionLeaveDays, workingDays } = summarizeMonthRows(driverRows);
    const { grossSalary, payable } = driverSalarySnapshotFor(driver, month);
    return [driver.id, driver.name, ...dayCells, total, workingDays, lopDays, exemptionLeaveDays, grossSalary, payable];
  });
  return { heading, columns, rows };
}

// Same one-row-per-driver summary the Excel "Download All" export's own
// columns already carry (see attendanceGridSection above), minus the
// day-by-day P/A/PL grid - reused by the PDF "Download All" export so both
// formats show identical data for the same month (see
// buildDriverAttendanceSummaryPdf).
function driverAttendanceSummaryRows(month: string, groups: { location: string; drivers: DriverEmployee[] }[], attendance: DriverAttendance[]): DriverAttendanceSummaryRow[] {
  const total = daysInMonth(month);
  return groups.flatMap(g => g.drivers.map(driver => {
    const driverRows = attendance.filter(a => a.driverId === driver.id && a.date.startsWith(month));
    const { lopDays, exemptionLeaveDays, workingDays } = summarizeMonthRows(driverRows);
    const { grossSalary, payable } = driverSalarySnapshotFor(driver, month);
    return {
      driverId: driver.id, driverName: driver.name, location: g.location,
      noOfDays: total, workingDays, lop: lopDays, exemptionLeave: exemptionLeaveDays,
      grossSalary, payableAmount: payable
    };
  }));
}

// "driver_attendance_<full month name>_<year>" - the file naming convention
// for the "Download All" trigger specifically (Excel + PDF); other download
// buttons elsewhere in this file keep their own existing convention.
const FULL_MONTH_NAMES_LOWER = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function downloadAllFileBase(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `driver_attendance_${FULL_MONTH_NAMES_LOWER[m - 1]}_${y}`;
}

// Per-location headcount/status-count rollup for the "download everything"
// tab's Summary sheet/table - deliberately separate from the raw day-grid
// sections so the export carries both the full detail and an at-a-glance
// total, same as the on-screen grid's own Working Days/LOP/Exemption Leave
// columns but rolled up to location level instead of per-driver.
function attendanceSummarySection(month: string, groups: { location: string; drivers: DriverEmployee[] }[], attendance: DriverAttendance[]): ReportTableSection {
  const columns = ['Location', 'Drivers', ...ALL_STATUSES.map(s => s.label), 'Avg Working Days'];
  const rows = groups.map(g => {
    const counts: Record<AttendanceStatusCode, number> = Object.fromEntries(ALL_STATUSES.map(s => [s.status, 0])) as Record<AttendanceStatusCode, number>;
    let workingDaysTotal = 0;
    g.drivers.forEach(driver => {
      const driverRows = attendance.filter(a => a.driverId === driver.id && a.date.startsWith(month));
      driverRows.forEach(r => { counts[r.status] += 1; });
      workingDaysTotal += summarizeMonthRows(driverRows).workingDays;
    });
    const avgWorkingDays = g.drivers.length ? Math.round((workingDaysTotal / g.drivers.length) * 10) / 10 : 0;
    return [g.location, g.drivers.length, ...ALL_STATUSES.map(s => counts[s.status]), avgWorkingDays];
  });
  return { heading: 'Summary', columns, rows };
}

// Every attendance record ever logged for one driver, oldest first - the
// "Full History" option on the per-driver download, as opposed to the
// current-month grid the other export options use.
function driverHistorySection(driver: DriverEmployee, attendance: DriverAttendance[]): ReportTableSection {
  const rows = attendance
    .filter(a => a.driverId === driver.id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(a => [a.date, ALL_STATUSES.find(s => s.status === a.status)?.label || a.status, a.remarks || '', a.markedBy || '']);
  return { heading: `${driver.id} Full History`, columns: ['Date', 'Status', 'Remarks', 'Marked By'], rows };
}

const safeFileToken = (s: string): string => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');

export default function DriverAttendanceSheet({ drivers, writableLocations }: DriverAttendanceSheetProps) {
  const [month, setMonth] = useState(currentMonthKey());
  const [attendance, setAttendance] = useState<DriverAttendance[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [summaryDriver, setSummaryDriver] = useState<DriverEmployee | null>(null);
  const [popover, setPopover] = useState<{ driverId: string; day: number; top: number; left: number } | null>(null);
  const [popoverStatus, setPopoverStatus] = useState<AttendanceStatusCode>('Present');
  const [popoverRemarks, setPopoverRemarks] = useState('');

  const loadAttendance = () => authFetch('/api/drivers/attendance').then(r => r.json()).then(setAttendance).catch(() => {});
  useEffect(() => { loadAttendance(); }, []);

  const totalDays = daysInMonth(month);
  const monthAttendance = useMemo(() => attendance.filter(a => a.date.startsWith(month)), [attendance, month]);

  // Grouped by location, one colored section header per group - same
  // treatment as Driver Salary. Writability (e.g. Vinod: can view every
  // location's attendance, but only mark/edit within his own
  // writableLocations) is uniform within a group since it's keyed off
  // location, so it's decided once per group rather than per row.
  const groupedDrivers = useMemo(() => {
    const base = !searchTerm ? drivers : drivers.filter(d => {
      const q = searchTerm.toLowerCase();
      return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || (d.vehicleNo || '').toLowerCase().includes(q);
    });
    const byLocation = new Map<DriverLocationCategory, DriverEmployee[]>();
    for (const d of base) {
      if (!byLocation.has(d.location)) byLocation.set(d.location, []);
      byLocation.get(d.location)!.push(d);
    }
    return DRIVER_LOCATION_CATEGORIES
      .filter(loc => byLocation.has(loc))
      .map(loc => ({
        location: loc,
        writable: writableLocations === 'ALL' || writableLocations.includes(loc),
        drivers: [...byLocation.get(loc)!].sort((a, b) => compareTrailingNumber(a.id, b.id) || a.id.localeCompare(b.id))
      }));
  }, [drivers, searchTerm, writableLocations]);

  // This user's own writable locations, in the same order/shape as
  // groupedDrivers - the subset "Download My Locations" bundles into one
  // file, e.g. Vinod's 3 writable locations even though he can *view* every
  // location on screen. Only rendered in the toolbar when it's actually more
  // than one location (a single writable location is already just one click
  // via that location's own group-header download).
  const myLocationGroups = useMemo(() => groupedDrivers.filter(g => g.writable), [groupedDrivers]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${MONTH_ABBR[m - 1]} ${y}`;
  }, [month]);

  // Excel keeps the on-screen day-grid shape (one column per day) - a
  // spreadsheet handles many columns fine and some offices re-import this
  // exact layout. PDF uses a proper report layout instead (Monthly Summary +
  // Daily Log, covering every month on record, not just what's on screen
  // right now) - see utils/driverAttendancePdf.ts for why.
  const handleDownloadLocationExcel = (location: string, list: DriverEmployee[]) =>
    exportReportToExcel(`KCM_Driver_Attendance_${safeFileToken(location)}_${month}`, [attendanceGridSection(month, list, attendance, location)]);
  const handleDownloadLocationPdf = (location: string, list: DriverEmployee[]) =>
    buildLocationAttendancePdf('Driver Attendance', location, [{ location, drivers: list }], attendance, month)
      .save(`KCM_Driver_Attendance_${safeFileToken(location)}_${month}.pdf`);

  const handleDownloadMyLocationsExcel = () =>
    exportReportToExcel(`KCM_Driver_Attendance_My_Locations_${month}`, myLocationGroups.map(g => attendanceGridSection(month, g.drivers, attendance, g.location)));
  const handleDownloadMyLocationsPdf = () =>
    buildLocationAttendancePdf('Driver Attendance', 'My Locations', myLocationGroups, attendance, month)
      .save(`KCM_Driver_Attendance_My_Locations_${month}.pdf`);

  // "Download tab" (item 4) - every driver, every location. Excel keeps its
  // full day-by-day grid (plus a per-location Summary sheet) - a spreadsheet
  // handles that many columns fine. PDF shows the same one-row-per-driver
  // data (Driver ID/Name/Location/No. of Days/Working Days/LOP/Exemption
  // Leave/Gross Salary/Payable Amount) as a clean table instead - identical
  // dataset to Excel, just without the day-grid columns that would be
  // unreadable in a PDF (see buildDriverAttendanceSummaryPdf). Both use the
  // same driver_attendance_<month>_<year> file naming convention.
  const handleDownloadAllExcel = () =>
    exportReportToExcel(downloadAllFileBase(month), [...groupedDrivers.map(g => attendanceGridSection(month, g.drivers, attendance, g.location)), attendanceSummarySection(month, groupedDrivers, attendance)]);
  const handleDownloadAllPdf = () =>
    buildDriverAttendanceSummaryPdf(`All Locations - ${monthLabel}`, driverAttendanceSummaryRows(month, groupedDrivers, attendance))
      .save(`${downloadAllFileBase(month)}.pdf`);

  // Per-driver row download (item 3) - "both" full history and the
  // currently-selected month, each in Excel or PDF, so this one dropdown
  // carries 4 options rather than picking one scope for the user.
  const driverDownloadOptions = (driver: DriverEmployee): DownloadMenuOption[] => [
    { key: 'month-excel', label: `${monthLabel} - Excel`, icon: 'excel', onClick: () => exportReportToExcel(`KCM_Attendance_${driver.id}_${month}`, [attendanceGridSection(month, [driver], attendance, `${driver.id} - ${monthLabel}`)]) },
    { key: 'month-pdf', label: `${monthLabel} - PDF`, icon: 'pdf', onClick: () => buildDriverAttendancePdf(driver, attendance, 'month', month).save(`KCM_Attendance_${driver.id}_${month}.pdf`) },
    { key: 'history-excel', label: 'Full History - Excel', icon: 'excel', onClick: () => exportReportToExcel(`KCM_Attendance_${driver.id}_Full_History`, [driverHistorySection(driver, attendance)]) },
    { key: 'history-pdf', label: 'Full History - PDF', icon: 'pdf', onClick: () => buildDriverAttendancePdf(driver, attendance, 'history').save(`KCM_Attendance_${driver.id}_Full_History.pdf`) },
  ];

  // LOP/Exemption Leave/Working Days summary columns - mirrors the server's
  // computeDriverMonthlyAttendanceSummary so this and the Salary Breakup tab
  // always agree. LOP <- AbsentLOP, Exemption Leave <- LeaveWithPermission,
  // Working Days (salaryWorkingDays) <- Present + PaidLeave, since Paid Leave
  // counts as a worked day for salary purposes.
  const driverMonthSummary = (driverId: string) => summarizeMonthRows(monthAttendance.filter(a => a.driverId === driverId));

  const cellRecord = (driverId: string, day: number) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return monthAttendance.find(a => a.driverId === driverId && a.date === date) || null;
  };

  // Attendance can only ever be marked for today or earlier - a day cell
  // past today is greyed out and unclickable, same rule the server also
  // enforces (see /api/drivers/attendance/mark) as a safety net.
  const isFutureDay = (day: number): boolean => `${month}-${String(day).padStart(2, '0')}` > todayIso();

  // Each driver+day cell is its own record, so "who marked it" can only ever
  // be shown per-cell (not as a single flat column) - a hover tooltip, same
  // affordance as the existing remarks tooltip, scales to any number of
  // drivers/days without new layout. markedBy is absent entirely for anyone
  // who isn't a Super Admin (stripped server-side), so this naturally shows
  // nothing extra for regular users.
  const cellTitle = (record: DriverAttendance | null): string | undefined => {
    if (!record) return undefined;
    const parts = [record.remarks, record.markedBy ? `Marked by: ${record.markedBy}` : undefined].filter(Boolean);
    return parts.length > 0 ? parts.join(' • ') : undefined;
  };

  const markCell = async (driverId: string, day: number, status: AttendanceStatusCode, remarks?: string) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const res = await authFetch('/api/drivers/attendance/mark', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, date, status, remarks })
    });
    if (res.ok) {
      const { data } = await res.json();
      setAttendance(prev => [...prev.filter(a => a.id !== data.id), data]);
    }
  };

  const handleCellClick = (driverId: string, day: number) => {
    if (isFutureDay(day)) return;
    const current = cellRecord(driverId, day);
    const idx = current ? QUICK_CODES.findIndex(c => c.status === current.status) : -1;
    const next = QUICK_CODES[(idx + 1) % QUICK_CODES.length];
    markCell(driverId, day, next.status);
  };

  const openPopover = (e: React.MouseEvent, driverId: string, day: number) => {
    e.stopPropagation();
    if (isFutureDay(day)) return;
    const current = cellRecord(driverId, day);
    setPopoverStatus(current?.status || 'Present');
    setPopoverRemarks(current?.remarks || '');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ driverId, day, top: rect.bottom + 4, left: rect.left });
  };

  const savePopover = async () => {
    if (!popover) return;
    await markCell(popover.driverId, popover.day, popoverStatus, popoverRemarks || undefined);
    setPopover(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <CalendarDays className="text-blue-600 w-5 h-5" />
            Driver Attendance
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Click a day to mark P/A/PL, or use the ⋯ menu for the full status set</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <input type="month" value={month} max={currentMonthKey()} onChange={e => setMonth(e.target.value)} autoComplete="off" className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
          <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonthKey()} className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
          <div className="ml-auto flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 min-w-[220px]">
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by Driver Name, ID, or Vehicle No..." autoComplete="off" className="flex-1 outline-none" />
          </div>
          {/* Only shown when it's actually a shortcut - a user restricted to
              one writable location already has that one covered by the
              location group's own download, and 'ALL' users have "Download
              All" (the tab below) for the same result. */}
          {myLocationGroups.length > 1 && (
            <DownloadMenu label="My Locations" options={[
              { key: 'excel', label: 'Excel (.xlsx)', icon: 'excel', onClick: handleDownloadMyLocationsExcel },
              { key: 'pdf', label: 'PDF', icon: 'pdf', onClick: handleDownloadMyLocationsPdf },
            ]} />
          )}
          {/* "Download tab" (item 4) - deliberately placed beside Search,
              styled like DriverDetails' own module tabs, not a plain icon
              button - exports every driver, every location, plus a Summary
              rollup, all in one file. */}
          <DownloadMenu variant="tab" label="Download All" options={[
            { key: 'excel', label: 'Excel (.xlsx)', icon: 'excel', onClick: handleDownloadAllExcel },
            { key: 'pdf', label: 'PDF', icon: 'pdf', onClick: handleDownloadAllPdf },
          ]} />
        </div>

        {/* Bounded height (not just overflow-x-auto) is what makes this div
            itself the scrolling ancestor, so the sticky thead below actually
            has something to stick to - same convention as Petty Cash's own
            scrollable ledger tables. Without it, the date header row scrolls
            away with everything else once the driver list runs long enough
            to need page-level scrolling, leaving no way to tell which date
            column you're clicking on. */}
        <div className="overflow-auto border border-slate-100 rounded-lg max-h-[65vh]">
          <table className="text-[10px] border-collapse w-full">
            <thead className="sticky top-0 z-20">
              <tr className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900">
                <th className="px-2 py-2 text-left font-bold text-purple-100 uppercase tracking-wider sticky left-0 bg-indigo-950 min-w-[140px]">Driver</th>
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
                  <th key={day} className="px-1 py-2 text-center font-bold text-purple-200 w-9">{dayLabel(month, day)}</th>
                ))}
                <th className="px-2 py-2 text-center font-bold text-teal-200 uppercase tracking-wider min-w-[70px]" title="Total calendar days in the selected month">No. of Days</th>
                <th className="px-2 py-2 text-center font-bold text-emerald-200 uppercase tracking-wider min-w-[70px]" title="Present + Paid Leave days this month">Working Days</th>
                <th className="px-2 py-2 text-center font-bold text-orange-200 uppercase tracking-wider min-w-[50px]">LOP</th>
                <th className="px-2 py-2 text-center font-bold text-sky-200 uppercase tracking-wider min-w-[70px]">Exemption Leave</th>
                <th className="px-2 py-2 text-center font-bold text-purple-200 uppercase tracking-wider min-w-[40px]">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupedDrivers.length === 0 ? (
                <tr><td colSpan={totalDays + 6} className="text-center py-10 text-slate-400">No driver records found.</td></tr>
              ) : groupedDrivers.map(group => (
                <React.Fragment key={group.location}>
                  <tr className="bg-gradient-to-r from-emerald-600 to-emerald-700">
                    <td colSpan={totalDays + 6} className="px-2 py-2 text-white font-extrabold uppercase tracking-wide text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {group.location}
                          <span className="ml-2 font-semibold normal-case text-emerald-100 text-[10px]">
                            ({group.drivers.length} driver{group.drivers.length === 1 ? '' : 's'})
                          </span>
                          {!group.writable && <span className="ml-2 text-[9px] font-bold uppercase bg-white/20 rounded px-1.5 py-0.5">View only</span>}
                        </span>
                        <DownloadMenu variant="ghost" label="Download" options={[
                          { key: 'excel', label: 'Excel (.xlsx)', icon: 'excel', onClick: () => handleDownloadLocationExcel(group.location, group.drivers) },
                          { key: 'pdf', label: 'PDF', icon: 'pdf', onClick: () => handleDownloadLocationPdf(group.location, group.drivers) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                  {group.drivers.map(driver => {
                    const { lopDays, exemptionLeaveDays, workingDays } = driverMonthSummary(driver.id);
                    const writable = group.writable;
                    return (
                      <tr key={driver.id} className={`hover:bg-purple-50/40 ${writable ? '' : 'opacity-70'}`}>
                        <td
                          className="px-2 py-1 cursor-pointer sticky left-0 z-10 bg-white whitespace-nowrap"
                          onClick={() => setSummaryDriver(driver)}
                          title="Click to view monthly summary"
                        >
                          <div className="font-semibold text-teal-700 hover:underline">{driver.name}</div>
                          {/* Vehicle No(s) are read straight off the driver record (same field
                              Driver Salary edits, see DriverFormModal) - not a separate copy, so a
                              change made in Driver Salary shows here immediately with no extra sync
                              step. A driver covering more than one vehicle shows all of them. */}
                          {(() => {
                            const vehicles = driver.vehicleNos && driver.vehicleNos.length > 0 ? driver.vehicleNos : (driver.vehicleNo ? [driver.vehicleNo] : []);
                            return vehicles.length > 0 && <div className="text-[9px] font-mono font-normal text-slate-400">{vehicles.join(' / ')}</div>;
                          })()}
                        </td>
                        {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
                          const record = cellRecord(driver.id, day);
                          const future = isFutureDay(day);
                          const cellWritable = writable && !future;
                          return (
                            <td key={day} className="p-0.5 relative group">
                              <button onClick={() => cellWritable && handleCellClick(driver.id, day)}
                                disabled={!cellWritable}
                                title={future ? 'Future date - attendance cannot be marked ahead of today' : (!writable ? 'View only - outside your assigned locations' : cellTitle(record))}
                                className={`w-9 h-6 rounded text-[9px] font-bold border ${cellWritable ? 'cursor-pointer' : 'cursor-not-allowed'} ${future ? 'bg-slate-100 border-slate-100 text-slate-300' : record ? STATUS_STYLES[record.status] : 'bg-white border-slate-200 text-slate-300 hover:bg-slate-50'}`}>
                                {record ? STATUS_ABBR[record.status] : '-'}
                              </button>
                              {cellWritable && <button
                                onClick={e => openPopover(e, driver.id, day)}
                                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-slate-700 text-white text-[8px] opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer"
                                title="More statuses & remarks"
                              >
                                &#8230;
                              </button>}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-center">
                          <span className="inline-block bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5 font-bold">{totalDays}</span>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">{workingDays}</span>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <span className="inline-block bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-bold">{lopDays}</span>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <span className="inline-block bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5 font-bold">{exemptionLeaveDays}</span>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <DownloadMenu label="" options={driverDownloadOptions(driver)} />
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {popover && createPortal(
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setPopover(null)} />
          <div style={{ position: 'fixed', top: popover.top, left: popover.left }} className="z-[100] bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-56 text-xs space-y-2">
            <select value={popoverStatus} onChange={e => setPopoverStatus(e.target.value as DriverAttendance['status'])} className="w-full border border-slate-300 rounded-lg px-2 py-1.5">
              {ALL_STATUSES.map(s => <option key={s.status} value={s.status}>{s.label}</option>)}
            </select>
            <input value={popoverRemarks} onChange={e => setPopoverRemarks(e.target.value)} placeholder="Remarks (optional)" autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2 py-1.5" />
            <button onClick={savePopover} className="w-full bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold py-1.5 rounded-lg uppercase text-[10px] cursor-pointer">Save</button>
          </div>
        </>,
        document.body
      )}

      {summaryDriver && (
        <DriverAttendanceSummaryModal driver={summaryDriver} month={month} onClose={() => setSummaryDriver(null)} />
      )}
    </div>
  );
}
