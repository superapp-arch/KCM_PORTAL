import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DriverEmployee, DriverAttendance, AttendanceStatusCode, DriverLocationCategory, DRIVER_LOCATION_CATEGORIES } from '../../types';
import { authFetch } from '../../authFetch';
import { compareTrailingNumber } from '../../utils/sort';
import DriverAttendanceSummaryModal from './DriverAttendanceSummaryModal';

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

  // LOP/Exemption Leave/Working Days summary columns - mirrors the server's
  // computeDriverMonthlyAttendanceSummary so this and the Salary Breakup tab
  // always agree. LOP <- AbsentLOP, Exemption Leave <- LeaveWithPermission,
  // Working Days (salaryWorkingDays) <- Present + PaidLeave, since Paid Leave
  // counts as a worked day for salary purposes.
  const driverMonthSummary = (driverId: string) => {
    const rows = monthAttendance.filter(a => a.driverId === driverId);
    const lopDays = rows.filter(r => r.status === 'AbsentLOP').length;
    const exemptionLeaveDays = rows.filter(r => r.status === 'LeaveWithPermission').length;
    const presentDays = rows.filter(r => r.status === 'Present').length;
    const paidLeaveDays = rows.filter(r => r.status === 'PaidLeave').length;
    const workingDays = presentDays + paidLeaveDays;
    return { lopDays, exemptionLeaveDays, workingDays };
  };

  const cellRecord = (driverId: string, day: number) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return monthAttendance.find(a => a.driverId === driverId && a.date === date) || null;
  };

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
    const current = cellRecord(driverId, day);
    const idx = current ? QUICK_CODES.findIndex(c => c.status === current.status) : -1;
    const next = QUICK_CODES[(idx + 1) % QUICK_CODES.length];
    markCell(driverId, day, next.status);
  };

  const openPopover = (e: React.MouseEvent, driverId: string, day: number) => {
    e.stopPropagation();
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
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} autoComplete="off" className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
          <div className="ml-auto flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 min-w-[220px]">
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by Driver Name, ID, or Vehicle No..." autoComplete="off" className="flex-1 outline-none" />
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-lg">
          <table className="text-[10px] border-collapse w-full">
            <thead>
              <tr className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 sticky top-0">
                <th className="px-2 py-2 text-left font-bold text-purple-100 uppercase tracking-wider sticky left-0 bg-indigo-950 min-w-[140px]">Driver</th>
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
                  <th key={day} className="px-1 py-2 text-center font-bold text-purple-200 w-9">{dayLabel(month, day)}</th>
                ))}
                <th className="px-2 py-2 text-center font-bold text-emerald-200 uppercase tracking-wider min-w-[70px]">Working Days</th>
                <th className="px-2 py-2 text-center font-bold text-orange-200 uppercase tracking-wider min-w-[50px]">LOP</th>
                <th className="px-2 py-2 text-center font-bold text-sky-200 uppercase tracking-wider min-w-[70px]">Exemption Leave</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupedDrivers.length === 0 ? (
                <tr><td colSpan={totalDays + 4} className="text-center py-10 text-slate-400">No driver records found.</td></tr>
              ) : groupedDrivers.map(group => (
                <React.Fragment key={group.location}>
                  <tr className="bg-gradient-to-r from-emerald-600 to-emerald-700">
                    <td colSpan={totalDays + 4} className="px-2 py-2 text-white font-extrabold uppercase tracking-wide text-[11px]">
                      {group.location}
                      <span className="ml-2 font-semibold normal-case text-emerald-100 text-[10px]">
                        ({group.drivers.length} driver{group.drivers.length === 1 ? '' : 's'})
                      </span>
                      {!group.writable && <span className="ml-2 text-[9px] font-bold uppercase bg-white/20 rounded px-1.5 py-0.5">View only</span>}
                    </td>
                  </tr>
                  {group.drivers.map(driver => {
                    const { lopDays, exemptionLeaveDays, workingDays } = driverMonthSummary(driver.id);
                    const writable = group.writable;
                    return (
                      <tr key={driver.id} className={`hover:bg-purple-50/40 ${writable ? '' : 'opacity-70'}`}>
                        <td
                          className="px-2 py-1 cursor-pointer sticky left-0 bg-white whitespace-nowrap"
                          onClick={() => setSummaryDriver(driver)}
                          title="Click to view monthly summary"
                        >
                          <div className="font-semibold text-teal-700 hover:underline">{driver.name}</div>
                          {/* Vehicle No is read straight off the driver record (same field Driver
                              Salary edits, see DriverFormModal) - not a separate copy, so a change
                              made in Driver Salary shows here immediately with no extra sync step. */}
                          {driver.vehicleNo && <div className="text-[9px] font-mono font-normal text-slate-400">{driver.vehicleNo}</div>}
                        </td>
                        {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
                          const record = cellRecord(driver.id, day);
                          return (
                            <td key={day} className="p-0.5 relative group">
                              <button onClick={() => writable && handleCellClick(driver.id, day)}
                                disabled={!writable}
                                title={!writable ? 'View only - outside your assigned locations' : cellTitle(record)}
                                className={`w-9 h-6 rounded text-[9px] font-bold border ${writable ? 'cursor-pointer' : 'cursor-not-allowed'} ${record ? STATUS_STYLES[record.status] : 'bg-white border-slate-200 text-slate-300 hover:bg-slate-50'}`}>
                                {record ? STATUS_ABBR[record.status] : '-'}
                              </button>
                              {writable && <button
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
                          <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">{workingDays}</span>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <span className="inline-block bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-bold">{lopDays}</span>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <span className="inline-block bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5 font-bold">{exemptionLeaveDays}</span>
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
