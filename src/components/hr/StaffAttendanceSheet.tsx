import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { StaffEmployee, StaffAttendance, StaffHoliday, AttendanceStatusCode } from '../../types';
import { authFetch } from '../../authFetch';
import StaffAttendanceSummaryModal from './StaffAttendanceSummaryModal';
import AttendanceReportDownload from './AttendanceReportDownload';

interface StaffAttendanceSheetProps {
  employees: StaffEmployee[];
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
// already uses.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// StaffEmployee.dateOfLeaving is free-text "DD/MM/YYYY" (no date picker, see
// StaffFormModal) - tolerate "-" as a separator and single-digit day/month
// too, since nothing enforces the exact format on entry. Returns a "YYYY-MM"
// month key, or null if the field is empty/unparsable (treated as "never
// left" below, so an odd manual entry can never wrongly hide someone).
function parseDateOfLeavingMonthKey(raw?: string): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}`;
}

// An employee who has left stays visible for the month they actually left in
// (and every month before it) - e.g. leaving Aug 25 still shows their August
// attendance in full - but drops out of every month from the following one
// onward, regardless of the Active/Inactive tab selected. An employee with
// no Date of Leaving (or an unparsable one) is always visible.
function isEmployeeVisibleForMonth(emp: StaffEmployee, month: string): boolean {
  const leavingMonth = parseDateOfLeavingMonthKey(emp.dateOfLeaving);
  return !leavingMonth || month <= leavingMonth;
}

export default function StaffAttendanceSheet({ employees }: StaffAttendanceSheetProps) {
  const [month, setMonth] = useState(currentMonthKey());
  // Active/Inactive/All tab - same convention/default as Staff Salary's own
  // status tab. Narrows within whatever the month cutoff below already
  // allows through, so switching to Inactive still only shows someone who
  // left up through the selected month, never a future one.
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Inactive' | 'All'>('Active');
  const [attendance, setAttendance] = useState<StaffAttendance[]>([]);
  const [holidays, setHolidays] = useState<StaffHoliday[]>([]);
  const [summaryEmp, setSummaryEmp] = useState<StaffEmployee | null>(null);
  const [popover, setPopover] = useState<{ empId: string; day: number; top: number; left: number } | null>(null);
  const [popoverStatus, setPopoverStatus] = useState<AttendanceStatusCode>('Present');
  const [popoverRemarks, setPopoverRemarks] = useState('');

  const loadAttendance = () => authFetch('/api/staff/attendance').then(r => r.json()).then(setAttendance).catch(() => {});
  const loadHolidays = () => authFetch('/api/staff/holidays').then(r => r.json()).then(setHolidays).catch(() => {});
  useEffect(() => { loadAttendance(); loadHolidays(); }, []);

  const totalDays = daysInMonth(month);
  const monthAttendance = useMemo(() => attendance.filter(a => a.date.startsWith(month)), [attendance, month]);

  // The list this whole sheet (grid + auto-fill) actually operates on for
  // the selected month - see isEmployeeVisibleForMonth above for the "still
  // shows through the month they left, hidden after" rule.
  const visibleEmployees = useMemo(
    () => employees.filter(e => isEmployeeVisibleForMonth(e, month) && (statusFilter === 'All' || e.status === statusFilter)),
    [employees, month, statusFilter]
  );

  // "Days Worked / Working Days" summary column - working days excludes this
  // employee's own Holiday/WeekOff-marked days, mirroring the server's
  // computeMonthlyAttendanceSummary calculation.
  const employeeMonthSummary = (empId: string) => {
    const rows = monthAttendance.filter(a => a.empId === empId);
    const counts: Partial<Record<AttendanceStatusCode, number>> = {};
    rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const workingDays = totalDays - (counts.Holiday || 0) - (counts.WeekOff || 0);
    const daysWorked = counts.Present || 0;
    return { daysWorked, workingDays };
  };

  const cellRecord = (empId: string, day: number) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return monthAttendance.find(a => a.empId === empId && a.date === date) || null;
  };

  // Attendance can only ever be marked for today or earlier - a day cell
  // past today is greyed out and unclickable, same rule the server also
  // enforces (see /api/staff/attendance/mark) as a safety net.
  const isFutureDay = (day: number): boolean => `${month}-${String(day).padStart(2, '0')}` > todayIso();

  // Who entered this attendance cell - same "Entered By" hover convention
  // Driver Attendance already uses (see DriverAttendanceSheet.tsx's own
  // cellTitle). markedBy is stripped entirely for anyone who isn't a Super
  // Admin (server-side), so this naturally shows nothing extra otherwise.
  const cellTitle = (record: StaffAttendance | null): string | undefined => {
    if (!record) return undefined;
    const parts = [record.remarks, record.markedBy ? `Marked by: ${record.markedBy}` : undefined].filter(Boolean);
    return parts.length > 0 ? parts.join(' • ') : undefined;
  };

  const markCell = async (empId: string, day: number, status: AttendanceStatusCode, remarks?: string) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const res = await authFetch('/api/staff/attendance/mark', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId, date, status, remarks })
    });
    if (res.ok) {
      const { data } = await res.json();
      setAttendance(prev => [...prev.filter(a => a.id !== data.id), data]);
    }
  };

  const handleQuickClick = (empId: string, day: number) => {
    if (isFutureDay(day)) return;
    const current = cellRecord(empId, day);
    const idx = current ? QUICK_CODES.findIndex(c => c.status === current.status) : -1;
    const next = QUICK_CODES[(idx + 1) % QUICK_CODES.length];
    markCell(empId, day, next.status);
  };

  const openPopover = (e: React.MouseEvent, empId: string, day: number) => {
    e.stopPropagation();
    if (isFutureDay(day)) return;
    const current = cellRecord(empId, day);
    setPopoverStatus(current?.status || 'Present');
    setPopoverRemarks(current?.remarks || '');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ empId, day, top: rect.bottom + 4, left: rect.left });
  };

  const savePopover = async () => {
    if (!popover) return;
    await markCell(popover.empId, popover.day, popoverStatus, popoverRemarks || undefined);
    setPopover(null);
  };

  const autoFillSundaysAndHolidays = async () => {
    const entries: Array<{ empId: string; date: string; status: string }> = [];
    for (let day = 1; day <= totalDays; day++) {
      if (isFutureDay(day)) continue; // never auto-fill ahead of today, same rule as manual marking
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const dow = new Date(date).getDay();
      const holiday = holidays.find(h => h.date === date);
      visibleEmployees.forEach(emp => {
        if (cellRecord(emp.id, day)) return;
        if (holiday) entries.push({ empId: emp.id, date, status: 'Holiday' });
        else if (dow === 0) entries.push({ empId: emp.id, date, status: 'WeekOff' });
      });
    }
    if (entries.length === 0) return;
    const res = await authFetch('/api/staff/attendance/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entries)
    });
    if (res.ok) await loadAttendance();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <CalendarDays className="text-blue-600 w-5 h-5" />
            Staff Attendance
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Click a day to mark P/A/PL, or use the ⋯ menu for the full status set</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <input type="month" value={month} max={currentMonthKey()} onChange={e => setMonth(e.target.value)} autoComplete="off" className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
          <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonthKey()} className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
          {/* Active/Inactive/All - same tab convention as Staff Salary's own
              status filter. A leaver still shows here for any month through
              the one they left in (see isEmployeeVisibleForMonth) - this tab
              only narrows within that, e.g. Inactive to browse just past
              leavers for a given month. */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 font-semibold">
            {(['Active', 'Inactive', 'All'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md cursor-pointer ${statusFilter === s ? 'bg-gradient-to-r from-pink-600 to-purple-700 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>
                {s}
              </button>
            ))}
          </div>
          <button onClick={autoFillSundaysAndHolidays} className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-semibold cursor-pointer">
            Auto-fill Sundays (Week Off) &amp; Holidays
          </button>
          <div className="ml-auto">
            {/* Full employee list, not visibleEmployees - its per-employee
                dropdown and Last 6 Months range are independent of the grid's
                single selected month, so a recent leaver should still be
                pickable here even when the grid itself has moved past them. */}
            <AttendanceReportDownload employees={employees} />
          </div>
        </div>

        {/* Bounded height (not just overflow-x-auto) is what makes this div
            itself the scrolling ancestor, so the sticky thead below actually
            has something to stick to - same convention as Petty Cash's own
            scrollable ledger tables. Without it, the date header row scrolls
            away with everything else once the employee list runs long enough
            to need page-level scrolling, leaving no way to tell which date
            column you're clicking on. */}
        <div className="overflow-auto border border-slate-100 rounded-lg max-h-[65vh]">
          <table className="text-[10px] border-collapse w-full">
            <thead className="sticky top-0 z-20">
              <tr className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900">
                <th className="px-2 py-2 text-left font-bold text-purple-100 uppercase tracking-wider sticky left-0 bg-indigo-950 min-w-[140px]">Employee</th>
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
                  <th key={day} className="px-1 py-2 text-center font-bold text-purple-200 w-9">{dayLabel(month, day)}</th>
                ))}
                <th className="px-2 py-2 text-center font-bold text-purple-100 uppercase tracking-wider min-w-[70px]">Days Worked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleEmployees.length === 0 ? (
                <tr>
                  <td colSpan={totalDays + 2} className="text-center py-10 text-slate-400 font-mono text-xs">
                    NO {statusFilter.toUpperCase()} EMPLOYEES FOR THIS MONTH.
                  </td>
                </tr>
              ) : visibleEmployees.map(emp => {
                const { daysWorked, workingDays } = employeeMonthSummary(emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-purple-50/40">
                    <td
                      className="px-2 py-1 font-semibold text-teal-700 hover:underline cursor-pointer sticky left-0 z-10 bg-white whitespace-nowrap"
                      onClick={() => setSummaryEmp(emp)}
                      title="Click to view monthly summary"
                    >
                      {emp.name}
                    </td>
                    {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
                      const record = cellRecord(emp.id, day);
                      const future = isFutureDay(day);
                      return (
                        <td key={day} className="p-0.5 relative group">
                          <button onClick={() => !future && handleQuickClick(emp.id, day)}
                            disabled={future}
                            title={future ? 'Future date - attendance cannot be marked ahead of today' : cellTitle(record)}
                            className={`w-9 h-6 rounded text-[9px] font-bold border ${future ? 'bg-slate-100 border-slate-100 text-slate-300 cursor-not-allowed' : `cursor-pointer ${record ? STATUS_STYLES[record.status] : 'bg-white border-slate-200 text-slate-300 hover:bg-slate-50'}`}`}>
                            {record ? STATUS_ABBR[record.status] : '-'}
                          </button>
                          {!future && <button
                            onClick={e => openPopover(e, emp.id, day)}
                            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-slate-700 text-white text-[8px] opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer"
                            title="More statuses & remarks"
                          >
                            &#8230;
                          </button>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center">
                      <span className="inline-block bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 font-bold whitespace-nowrap">
                        {daysWorked}/{workingDays}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {popover && createPortal(
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setPopover(null)} />
          <div style={{ position: 'fixed', top: popover.top, left: popover.left }} className="z-[100] bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-56 text-xs space-y-2">
            <select value={popoverStatus} onChange={e => setPopoverStatus(e.target.value as AttendanceStatusCode)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5">
              {ALL_STATUSES.map(s => <option key={s.status} value={s.status}>{s.label}</option>)}
            </select>
            <input value={popoverRemarks} onChange={e => setPopoverRemarks(e.target.value)} placeholder="Remarks (optional)" autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2 py-1.5" />
            <button onClick={savePopover} className="w-full bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold py-1.5 rounded-lg uppercase text-[10px] cursor-pointer">Save</button>
          </div>
        </>,
        document.body
      )}

      {summaryEmp && (
        <StaffAttendanceSummaryModal employee={summaryEmp} month={month} onClose={() => setSummaryEmp(null)} />
      )}
    </div>
  );
}
