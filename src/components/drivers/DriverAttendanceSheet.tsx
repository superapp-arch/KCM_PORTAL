import React, { useState, useEffect, useMemo } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DriverEmployee, DriverAttendance } from '../../types';
import { authFetch } from '../../authFetch';
import DriverAttendanceSummaryModal from './DriverAttendanceSummaryModal';

interface DriverAttendanceSheetProps {
  drivers: DriverEmployee[];
}

const CYCLE: { status: DriverAttendance['status']; label: string }[] = [
  { status: 'Present', label: 'P' },
  { status: 'Absent', label: 'A' },
  { status: 'Leave', label: 'L' },
];

const STATUS_STYLES: Record<DriverAttendance['status'], string> = {
  Present: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Absent: 'bg-rose-100 text-rose-800 border-rose-300',
  Leave: 'bg-sky-100 text-sky-800 border-sky-300'
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

export default function DriverAttendanceSheet({ drivers }: DriverAttendanceSheetProps) {
  const [month, setMonth] = useState(currentMonthKey());
  const [attendance, setAttendance] = useState<DriverAttendance[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [summaryDriver, setSummaryDriver] = useState<DriverEmployee | null>(null);

  const loadAttendance = () => authFetch('/api/drivers/attendance').then(r => r.json()).then(setAttendance).catch(() => {});
  useEffect(() => { loadAttendance(); }, []);

  const totalDays = daysInMonth(month);
  const monthAttendance = useMemo(() => attendance.filter(a => a.date.startsWith(month)), [attendance, month]);

  const filteredDrivers = useMemo(() => {
    if (!searchTerm) return drivers;
    const q = searchTerm.toLowerCase();
    return drivers.filter(d => d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || (d.vehicleNo || '').toLowerCase().includes(q));
  }, [drivers, searchTerm]);

  // LOP/Exemption Leave summary columns - mirrors the server's
  // computeDriverMonthlyAttendanceSummary so this and the Salary Breakup tab
  // always agree.
  const driverMonthSummary = (driverId: string) => {
    const rows = monthAttendance.filter(a => a.driverId === driverId);
    const lopDays = rows.filter(r => r.status === 'Absent').length;
    const exemptionLeaveDays = rows.filter(r => r.status === 'Leave').length;
    const workingDays = totalDays - lopDays - exemptionLeaveDays;
    return { lopDays, exemptionLeaveDays, workingDays };
  };

  const cellRecord = (driverId: string, day: number) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return monthAttendance.find(a => a.driverId === driverId && a.date === date) || null;
  };

  const markCell = async (driverId: string, day: number, status: DriverAttendance['status']) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const res = await authFetch('/api/drivers/attendance/mark', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, date, status })
    });
    if (res.ok) {
      const { data } = await res.json();
      setAttendance(prev => [...prev.filter(a => a.id !== data.id), data]);
    }
  };

  const handleCellClick = (driverId: string, day: number) => {
    const current = cellRecord(driverId, day);
    const idx = current ? CYCLE.findIndex(c => c.status === current.status) : -1;
    const next = CYCLE[(idx + 1) % CYCLE.length];
    markCell(driverId, day, next.status);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <CalendarDays className="text-blue-600 w-5 h-5" />
            Driver Attendance
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Click a day to cycle Present / Absent / Leave</p>
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
                <th className="px-2 py-2 text-center font-bold text-orange-200 uppercase tracking-wider min-w-[50px]">LOP</th>
                <th className="px-2 py-2 text-center font-bold text-sky-200 uppercase tracking-wider min-w-[70px]">Exemption Leave</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDrivers.length === 0 ? (
                <tr><td colSpan={totalDays + 3} className="text-center py-10 text-slate-400">No driver records found.</td></tr>
              ) : filteredDrivers.map(driver => {
                const { lopDays, exemptionLeaveDays } = driverMonthSummary(driver.id);
                return (
                  <tr key={driver.id} className="hover:bg-purple-50/40">
                    <td
                      className="px-2 py-1 font-semibold text-teal-700 hover:underline cursor-pointer sticky left-0 bg-white whitespace-nowrap"
                      onClick={() => setSummaryDriver(driver)}
                      title="Click to view monthly summary"
                    >
                      {driver.name}
                    </td>
                    {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
                      const record = cellRecord(driver.id, day);
                      return (
                        <td key={day} className="p-0.5">
                          <button onClick={() => handleCellClick(driver.id, day)}
                            className={`w-9 h-6 rounded text-[9px] font-bold border cursor-pointer ${record ? STATUS_STYLES[record.status] : 'bg-white border-slate-200 text-slate-300 hover:bg-slate-50'}`}>
                            {record ? CYCLE.find(c => c.status === record.status)?.label : '-'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center">
                      <span className="inline-block bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-bold">{lopDays}</span>
                    </td>
                    <td className="px-2 py-1 text-center">
                      <span className="inline-block bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5 font-bold">{exemptionLeaveDays}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {summaryDriver && (
        <DriverAttendanceSummaryModal driver={summaryDriver} month={month} onClose={() => setSummaryDriver(null)} />
      )}
    </div>
  );
}
