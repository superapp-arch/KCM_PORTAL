import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DriverEmployee, DriverAttendance, AttendanceStatusCode, DriverLocationCategory, DRIVER_LOCATION_CATEGORIES } from '../../types';
import { authFetch } from '../../authFetch';
import { compareTrailingNumber } from '../../utils/sort';
import { driverAllLocations, isDriverActiveAtLocation, attendanceBelongsToLocation } from '../../utils/driverLocations';
import DriverAttendanceSummaryModal from './DriverAttendanceSummaryModal';
import { exportReportToExcel, ReportTableSection } from '../../utils/reportExport';
import { buildDriverAttendancePdf, buildDriverAttendanceSummaryPdf, DriverAttendanceSummaryRow } from '../../utils/driverAttendancePdf';
import DownloadMenu, { DownloadMenuOption } from './DownloadMenu';
import { computeDriverEarnings } from '../../utils/driverSalaryExport';

interface DriverAttendanceSheetProps {
  drivers: DriverEmployee[];
  writableLocations: DriverLocationCategory[] | 'ALL'; // locations this user may mark/edit attendance for - others show read-only
}

// One driver, at ONE of their assigned locations (2026-09-03 multi-location
// support) - a driver covering more than one location produces more than
// one of these, one per location, so the same person renders as a separate
// row under each location group. Every attendance lookup below is scoped to
// `location`, not just `driver.id`, so a multi-location driver's history
// never mixes between locations - see attendanceBelongsToLocation.
interface LocationDriverRow {
  driver: DriverEmployee;
  location: DriverLocationCategory;
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

// Adds the synthetic 'Unassigned / Deleted Drivers' bucket (see types.ts)
// to the real, fixed group order - only used for iterating groups on THIS
// screen, never for Add/Edit Driver's own location dropdown (which still
// uses the un-extended DRIVER_LOCATION_CATEGORIES).
const DISPLAY_LOCATION_ORDER: DriverLocationCategory[] = [...DRIVER_LOCATION_CATEGORIES, 'Unassigned / Deleted Drivers'];

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

// One (driver, location) row's month rows -> {lopDays, exemptionLeaveDays,
// workingDays} - shared by the on-screen summary columns and every export
// below so both can never drift apart. Paid Leave counts as a worked day
// for salary purposes, same rule as the server's own
// computeDriverMonthlyAttendanceSummary.
function summarizeMonthRows(rows: DriverAttendance[]): { lopDays: number; exemptionLeaveDays: number; workingDays: number } {
  const lopDays = rows.filter(r => r.status === 'AbsentLOP').length;
  const exemptionLeaveDays = rows.filter(r => r.status === 'LeaveWithPermission').length;
  const workingDays = rows.filter(r => r.status === 'Present' || r.status === 'PaidLeave').length;
  return { lopDays, exemptionLeaveDays, workingDays };
}

// Attendance actually belonging to this row's (driver, location) pair, for
// the given month - the one filter every export/summary function below
// runs through, so none of them can accidentally mix a multi-location
// driver's locations together.
function rowsForLocation(row: LocationDriverRow, attendance: DriverAttendance[], month: string): DriverAttendance[] {
  return attendance.filter(a => a.driverId === row.driver.id && a.date.startsWith(month) && attendanceBelongsToLocation(a, row.driver, row.location));
}

// Gross Salary/Payable Amount shown alongside the Attendance module's own
// exports - Gross Salary/Other Additions/deductions are read straight off
// the driver record (DriverEmployee carries one salary snapshot per driver,
// tagged with `month` - see types.ts), same figures regardless of location,
// but Working Days/LOP are this row's own location-scoped counts, so a
// multi-location driver's Payable Amount here is prorated per location
// (the two/more rows sum to their true whole-month pay) - purely an
// operational preview for this screen; Driver Salary's own Payable Amount
// column (and the Salary Slip) remain the actual payroll authority,
// unaffected, always computed off the driver's full cross-location
// attendance. Blank ('N/A') whenever the driver record's own `month`
// doesn't match the month being exported, rather than showing a stale
// figure from whatever month Driver Salary was last saved for.
function driverSalarySnapshotFor(driver: DriverEmployee, month: string, workingDays: number, lopDays: number): { grossSalary: number | string; payable: number | string } {
  if (driver.month !== month) return { grossSalary: 'N/A', payable: 'N/A' };
  const { payableAmount } = computeDriverEarnings({
    grossSalary: driver.grossSalary || 0, otherAdditions: driver.otherAdditions || 0,
    pettyCashAdvance: driver.pettyCashAdvance || 0, loanDeduction: driver.loanDeduction || 0,
    recoveryAmount: driver.recoveryAmount || 0, driverWelfare: driver.driverWelfare || 0, bata: driver.bata || 0,
    totalDays: daysInMonth(month), workingDays, lopDays
  });
  return { grossSalary: driver.grossSalary || 0, payable: payableAmount };
}

// The on-screen day-grid (Driver | Location? | day-by-day status | Working
// Days / LOP / Exemption Leave), as an export section - used for a single
// location, a set of a user's writable locations, or every location,
// depending on what `rows` is handed. `includeLocationColumn` adds a
// Location column (2026-09-03) - used when `rows` spans more than one
// location (Download All/My Locations), so every row in that single sheet
// stays identifiable; omitted for a single-location download where it'd be
// redundant (every row is already that one location).
function attendanceGridSection(month: string, rows: LocationDriverRow[], attendance: DriverAttendance[], heading: string, includeLocationColumn = false): ReportTableSection {
  const total = daysInMonth(month);
  const columns = [
    'Driver ID', 'Driver Name', ...(includeLocationColumn ? ['Location'] : []),
    ...Array.from({ length: total }, (_, i) => dayLabel(month, i + 1)),
    'No. of Days', 'Working Days', 'LOP', 'Exemption Leave', 'Gross Salary', 'Payable Amount'
  ];
  const tableRows = rows.map(row => {
    const locationRows = rowsForLocation(row, attendance, month);
    const dayCells = Array.from({ length: total }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      const record = locationRows.find(a => a.date === date);
      return record ? STATUS_ABBR[record.status] : '-';
    });
    const { lopDays, exemptionLeaveDays, workingDays } = summarizeMonthRows(locationRows);
    const { grossSalary, payable } = driverSalarySnapshotFor(row.driver, month, workingDays, lopDays);
    return [
      row.driver.id, row.driver.name, ...(includeLocationColumn ? [row.location] : []),
      ...dayCells, total, workingDays, lopDays, exemptionLeaveDays, grossSalary, payable
    ];
  });
  return { heading, columns, rows: tableRows };
}

// Same one-row-per-(driver, location) summary the Excel exports' own
// columns already carry (see attendanceGridSection above), minus the
// day-by-day P/A/PL grid - reused by the PDF exports so both formats show
// identical data for the same month (see buildDriverAttendanceSummaryPdf).
function driverAttendanceSummaryRows(month: string, rows: LocationDriverRow[], attendance: DriverAttendance[]): DriverAttendanceSummaryRow[] {
  const total = daysInMonth(month);
  return rows.map(row => {
    const locationRows = rowsForLocation(row, attendance, month);
    const { lopDays, exemptionLeaveDays, workingDays } = summarizeMonthRows(locationRows);
    const { grossSalary, payable } = driverSalarySnapshotFor(row.driver, month, workingDays, lopDays);
    return {
      driverId: row.driver.id, driverName: row.driver.name, location: row.location,
      noOfDays: total, workingDays, lop: lopDays, exemptionLeave: exemptionLeaveDays,
      grossSalary, payableAmount: payable
    };
  });
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
// columns but rolled up to location level instead of per-row. Groups `rows`
// by their own `.location` internally rather than requiring a separate
// groups structure.
function attendanceSummarySection(month: string, rows: LocationDriverRow[], attendance: DriverAttendance[]): ReportTableSection {
  const columns = ['Location', 'Drivers', ...ALL_STATUSES.map(s => s.label), 'Avg Working Days'];
  const byLocation = new Map<DriverLocationCategory, LocationDriverRow[]>();
  for (const row of rows) {
    if (!byLocation.has(row.location)) byLocation.set(row.location, []);
    byLocation.get(row.location)!.push(row);
  }
  const tableRows = Array.from(byLocation.entries()).map(([location, locRows]) => {
    const counts: Record<AttendanceStatusCode, number> = Object.fromEntries(ALL_STATUSES.map(s => [s.status, 0])) as Record<AttendanceStatusCode, number>;
    let workingDaysTotal = 0;
    locRows.forEach(row => {
      const locationRows = rowsForLocation(row, attendance, month);
      locationRows.forEach(r => { counts[r.status] += 1; });
      workingDaysTotal += summarizeMonthRows(locationRows).workingDays;
    });
    const avgWorkingDays = locRows.length ? Math.round((workingDaysTotal / locRows.length) * 10) / 10 : 0;
    return [location, locRows.length, ...ALL_STATUSES.map(s => counts[s.status]), avgWorkingDays];
  });
  return { heading: 'Summary', columns, rows: tableRows };
}

// Every attendance record ever logged for this (driver, location) pair,
// oldest first - the "Full History" option on the per-row download, as
// opposed to the current-month grid the other export options use. Scoped
// to the row's own location (2026-09-03) - "Full History" downloaded from
// the Hyderabad row shows only Hyderabad's history, forever; the Vizag row
// has its own separate Full History download.
function driverHistorySection(row: LocationDriverRow, attendance: DriverAttendance[]): ReportTableSection {
  const rows = attendance
    .filter(a => a.driverId === row.driver.id && attendanceBelongsToLocation(a, row.driver, row.location))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(a => [a.date, ALL_STATUSES.find(s => s.status === a.status)?.label || a.status, a.remarks || '', a.markedBy || '']);
  return { heading: `${row.driver.id} - ${row.location} Full History`, columns: ['Date', 'Status', 'Remarks', 'Marked By'], rows };
}

const safeFileToken = (s: string): string => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');

export default function DriverAttendanceSheet({ drivers, writableLocations }: DriverAttendanceSheetProps) {
  const [month, setMonth] = useState(currentMonthKey());
  const [attendance, setAttendance] = useState<DriverAttendance[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [summaryDriver, setSummaryDriver] = useState<DriverEmployee | null>(null);
  const [popover, setPopover] = useState<{ driverId: string; location: DriverLocationCategory; day: number; top: number; left: number } | null>(null);
  const [popoverStatus, setPopoverStatus] = useState<AttendanceStatusCode>('Present');
  const [popoverRemarks, setPopoverRemarks] = useState('');

  const loadAttendance = () => authFetch('/api/drivers/attendance').then(r => r.json()).then(setAttendance).catch(() => {});
  useEffect(() => { loadAttendance(); }, []);

  const totalDays = daysInMonth(month);
  const monthAttendance = useMemo(() => attendance.filter(a => a.date.startsWith(month)), [attendance, month]);

  // Placeholder rows (2026-09-02 data-integrity fix) for any driver_attendance
  // record whose driverId has no matching entry in `drivers` at all - a
  // legacy gap predating server.ts's soft-delete fix (Delete Driver used to
  // physically remove the row), or any future truly-hard-deleted record.
  // That attendance is 100% intact in the database, but every render below
  // is driven by iterating `drivers`, never `attendance` itself - without
  // this, it would stay invisible on screen and in every download even
  // though nothing was actually lost. Bucketed under the synthetic
  // 'Unassigned / Deleted Drivers' location so it groups through the exact
  // same rendering path instead of needing a parallel one.
  const driversForDisplay = useMemo(() => {
    const knownIds = new Set(drivers.map(d => d.id));
    const orphanedIds = Array.from(new Set(attendance.map(a => a.driverId))).filter(id => !knownIds.has(id)).sort();
    if (orphanedIds.length === 0) return drivers;
    const synthesized: DriverEmployee[] = orphanedIds.map(id => ({
      id, name: 'Unknown Driver - no profile on record', driverNo: '',
      location: 'Unassigned / Deleted Drivers' as DriverLocationCategory,
      status: 'inactive'
    }));
    return [...drivers, ...synthesized];
  }, [drivers, attendance]);

  // One row per (driver, location) assignment (2026-09-03 multi-location
  // support) - a driver covering more than one location appears once per
  // location here, each independently filtered to just that location's own
  // attendance everywhere below.
  const driverLocationRows: LocationDriverRow[] = useMemo(
    () => driversForDisplay.flatMap(driver => driverAllLocations(driver).map(location => ({ driver, location }))),
    [driversForDisplay]
  );

  // Grouped by location, one colored section header per group - same
  // treatment as Driver Salary. Writability (e.g. Vinod: can view every
  // location's attendance, but only mark/edit within his own
  // writableLocations) is uniform within a group since it's keyed off
  // location, so it's decided once per group rather than per row. The
  // synthetic 'Unassigned / Deleted Drivers' group is always view-only -
  // there's no real location to check write access against.
  const groupedDrivers = useMemo(() => {
    const base = !searchTerm ? driverLocationRows : driverLocationRows.filter(({ driver }) => {
      const q = searchTerm.toLowerCase();
      return driver.id.toLowerCase().includes(q) || driver.name.toLowerCase().includes(q) || (driver.vehicleNo || '').toLowerCase().includes(q);
    });
    const byLocation = new Map<DriverLocationCategory, LocationDriverRow[]>();
    for (const row of base) {
      if (!byLocation.has(row.location)) byLocation.set(row.location, []);
      byLocation.get(row.location)!.push(row);
    }
    return DISPLAY_LOCATION_ORDER
      .filter(loc => byLocation.has(loc))
      .map(loc => ({
        location: loc,
        writable: loc === 'Unassigned / Deleted Drivers' ? false : (writableLocations === 'ALL' || writableLocations.includes(loc)),
        rows: [...byLocation.get(loc)!].sort((a, b) => compareTrailingNumber(a.driver.id, b.driver.id) || a.driver.id.localeCompare(b.driver.id))
      }));
  }, [driverLocationRows, searchTerm, writableLocations]);

  // This user's own writable locations, in the same order/shape as
  // groupedDrivers - the subset "Download My Locations" bundles into one
  // file, e.g. Vinod's 3 writable locations even though he can *view* every
  // location on screen. Only rendered in the toolbar when it's actually more
  // than one location (a single writable location is already just one click
  // via that location's own group-header download).
  const myLocationGroups = useMemo(() => groupedDrivers.filter(g => g.writable), [groupedDrivers]);
  const myLocationRows = useMemo(() => myLocationGroups.flatMap(g => g.rows), [myLocationGroups]);
  const allRows = useMemo(() => groupedDrivers.flatMap(g => g.rows), [groupedDrivers]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${MONTH_ABBR[m - 1]} ${y}`;
  }, [month]);

  // Same format-consistency fix as "Download All" below, applied here too:
  // Excel keeps the on-screen day-grid shape (one column per day) plus a
  // per-location Summary sheet, and PDF shows the identical one-row-per-
  // driver dataset (Driver ID/Name/Location/No. of Days/Working Days/LOP/
  // Exemption Leave/Gross Salary/Payable Amount) via
  // buildDriverAttendanceSummaryPdf - both formats now carry the same
  // current-month figures instead of PDF's old separate multi-month
  // historical shape (buildLocationAttendancePdf, removed).
  const handleDownloadLocationExcel = (location: string, rows: LocationDriverRow[]) =>
    exportReportToExcel(`KCM_Driver_Attendance_${safeFileToken(location)}_${month}`, [attendanceGridSection(month, rows, attendance, location), attendanceSummarySection(month, rows, attendance)]);
  const handleDownloadLocationPdf = (location: string, rows: LocationDriverRow[]) =>
    buildDriverAttendanceSummaryPdf(`${location} - ${monthLabel}`, driverAttendanceSummaryRows(month, rows, attendance))
      .save(`KCM_Driver_Attendance_${safeFileToken(location)}_${month}.pdf`);

  const handleDownloadMyLocationsExcel = () =>
    exportReportToExcel(`KCM_Driver_Attendance_My_Locations_${month}`, [attendanceGridSection(month, myLocationRows, attendance, 'Driver Attendance', true), attendanceSummarySection(month, myLocationRows, attendance)]);
  const handleDownloadMyLocationsPdf = () =>
    buildDriverAttendanceSummaryPdf(`My Locations - ${monthLabel}`, driverAttendanceSummaryRows(month, myLocationRows, attendance))
      .save(`KCM_Driver_Attendance_My_Locations_${month}.pdf`);

  // "Download tab" (item 4) - every driver, every location. Excel keeps its
  // full day-by-day grid as ONE single sheet spanning every location (plus
  // a separate Summary rollup sheet) - 2026-09-03: previously one sheet per
  // location, which made filtering/sorting across the whole roster
  // impossible without stitching sheets back together by hand; a Location
  // column keeps every row identifiable now that they're all in one place.
  // PDF shows the same one-row-per-driver data (Driver ID/Name/Location/No.
  // of Days/Working Days/LOP/Exemption Leave/Gross Salary/Payable Amount)
  // as a clean table instead - identical dataset to Excel, just without the
  // day-grid columns that would be unreadable in a PDF (see
  // buildDriverAttendanceSummaryPdf) - already a single flat table,
  // unchanged. Both use the same driver_attendance_<month>_<year> file
  // naming convention.
  const handleDownloadAllExcel = () =>
    exportReportToExcel(downloadAllFileBase(month), [attendanceGridSection(month, allRows, attendance, 'Driver Attendance', true), attendanceSummarySection(month, allRows, attendance)]);
  const handleDownloadAllPdf = () =>
    buildDriverAttendanceSummaryPdf(`All Locations - ${monthLabel}`, driverAttendanceSummaryRows(month, allRows, attendance))
      .save(`${downloadAllFileBase(month)}.pdf`);

  // Per-row download (item 3) - "both" full history and the currently-
  // selected month, each in Excel or PDF, scoped to this row's own
  // (driver, location) pair throughout.
  const driverDownloadOptions = (row: LocationDriverRow): DownloadMenuOption[] => [
    { key: 'month-excel', label: `${monthLabel} - Excel`, icon: 'excel', onClick: () => exportReportToExcel(`KCM_Attendance_${row.driver.id}_${safeFileToken(row.location)}_${month}`, [attendanceGridSection(month, [row], attendance, `${row.driver.id} - ${row.location} - ${monthLabel}`)]) },
    { key: 'month-pdf', label: `${monthLabel} - PDF`, icon: 'pdf', onClick: () => buildDriverAttendancePdf(row.driver, rowsForLocation(row, attendance, month), 'month', month).save(`KCM_Attendance_${row.driver.id}_${safeFileToken(row.location)}_${month}.pdf`) },
    { key: 'history-excel', label: 'Full History - Excel', icon: 'excel', onClick: () => exportReportToExcel(`KCM_Attendance_${row.driver.id}_${safeFileToken(row.location)}_Full_History`, [driverHistorySection(row, attendance)]) },
    { key: 'history-pdf', label: 'Full History - PDF', icon: 'pdf', onClick: () => buildDriverAttendancePdf(row.driver, attendance.filter(a => attendanceBelongsToLocation(a, row.driver, row.location)), 'history').save(`KCM_Attendance_${row.driver.id}_${safeFileToken(row.location)}_Full_History.pdf`) },
  ];

  // LOP/Exemption Leave/Working Days summary columns - mirrors the server's
  // computeDriverMonthlyAttendanceSummary so this and the Salary Breakup tab
  // always agree, scoped to this row's own location. LOP <- AbsentLOP,
  // Exemption Leave <- LeaveWithPermission, Working Days (salaryWorkingDays)
  // <- Present + PaidLeave, since Paid Leave counts as a worked day for
  // salary purposes.
  const driverMonthSummary = (row: LocationDriverRow) =>
    summarizeMonthRows(monthAttendance.filter(a => a.driverId === row.driver.id && attendanceBelongsToLocation(a, row.driver, row.location)));

  const cellRecord = (row: LocationDriverRow, day: number) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return monthAttendance.find(a => a.driverId === row.driver.id && a.date === date && attendanceBelongsToLocation(a, row.driver, row.location)) || null;
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

  const markCell = async (driverId: string, location: DriverLocationCategory, day: number, status: AttendanceStatusCode, remarks?: string) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const res = await authFetch('/api/drivers/attendance/mark', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, date, status, remarks, location })
    });
    if (res.ok) {
      const { data } = await res.json();
      setAttendance(prev => [...prev.filter(a => a.id !== data.id), data]);
    }
  };

  const handleCellClick = (row: LocationDriverRow, day: number) => {
    if (isFutureDay(day)) return;
    const current = cellRecord(row, day);
    const idx = current ? QUICK_CODES.findIndex(c => c.status === current.status) : -1;
    const next = QUICK_CODES[(idx + 1) % QUICK_CODES.length];
    markCell(row.driver.id, row.location, day, next.status);
  };

  const openPopover = (e: React.MouseEvent, row: LocationDriverRow, day: number) => {
    e.stopPropagation();
    if (isFutureDay(day)) return;
    const current = cellRecord(row, day);
    setPopoverStatus(current?.status || 'Present');
    setPopoverRemarks(current?.remarks || '');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ driverId: row.driver.id, location: row.location, day, top: rect.bottom + 4, left: rect.left });
  };

  const savePopover = async () => {
    if (!popover) return;
    await markCell(popover.driverId, popover.location, popover.day, popoverStatus, popoverRemarks || undefined);
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
                <th className="px-2 py-2 text-center font-bold text-emerald-200 uppercase tracking-wider min-w-[70px]" title="Present + Paid Leave days this month, at this location only">Working Days</th>
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
                            ({group.rows.length} driver{group.rows.length === 1 ? '' : 's'})
                          </span>
                          {!group.writable && <span className="ml-2 text-[9px] font-bold uppercase bg-white/20 rounded px-1.5 py-0.5">View only</span>}
                        </span>
                        <DownloadMenu variant="ghost" label="Download" options={[
                          { key: 'excel', label: 'Excel (.xlsx)', icon: 'excel', onClick: () => handleDownloadLocationExcel(group.location, group.rows) },
                          { key: 'pdf', label: 'PDF', icon: 'pdf', onClick: () => handleDownloadLocationPdf(group.location, group.rows) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                  {group.rows.map(row => {
                    const { driver, location } = row;
                    const { lopDays, exemptionLeaveDays, workingDays } = driverMonthSummary(row);
                    // An inactive/deactivated driver (at THIS location - see
                    // isDriverActiveAtLocation) is view-only here too - their
                    // history at this location stays fully visible/
                    // downloadable, they just can't be marked for any new
                    // date at this location (2026-09-02, extended to
                    // per-location 2026-09-03).
                    const isInactive = !isDriverActiveAtLocation(driver, location);
                    const writable = group.writable && !isInactive;
                    return (
                      <tr key={`${driver.id}-${location}`} className={`hover:bg-purple-50/40 ${writable ? '' : 'opacity-70'}`}>
                        <td
                          className="px-2 py-1 cursor-pointer sticky left-0 z-10 bg-white whitespace-nowrap"
                          onClick={() => setSummaryDriver(driver)}
                          title="Click to view monthly summary"
                        >
                          <div className="font-semibold text-teal-700 hover:underline flex items-center gap-1">
                            {driver.name}
                            {isInactive && (
                              <span title={driver.inactivatedDate ? `Deactivated ${driver.inactivatedDate}` : 'Deactivated - history preserved'} className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase border bg-slate-100 text-slate-500 border-slate-300">Inactive</span>
                            )}
                          </div>
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
                          const record = cellRecord(row, day);
                          const future = isFutureDay(day);
                          const cellWritable = writable && !future;
                          return (
                            <td key={day} className="p-0.5 relative group">
                              <button onClick={() => cellWritable && handleCellClick(row, day)}
                                disabled={!cellWritable}
                                title={future ? 'Future date - attendance cannot be marked ahead of today' : (isInactive ? 'View only - this driver is deactivated at this location' : !writable ? 'View only - outside your assigned locations' : cellTitle(record))}
                                className={`w-9 h-6 rounded text-[9px] font-bold border ${cellWritable ? 'cursor-pointer' : 'cursor-not-allowed'} ${future ? 'bg-slate-100 border-slate-100 text-slate-300' : record ? STATUS_STYLES[record.status] : 'bg-white border-slate-200 text-slate-300 hover:bg-slate-50'}`}>
                                {record ? STATUS_ABBR[record.status] : '-'}
                              </button>
                              {cellWritable && <button
                                onClick={e => openPopover(e, row, day)}
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
                          <DownloadMenu label="" options={driverDownloadOptions(row)} />
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
