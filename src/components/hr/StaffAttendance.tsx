import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  CalendarDays, Upload, Download, Plus, Trash2, BarChart3, Users, ListChecks, CalendarHeart
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { StaffEmployee, StaffAttendance as StaffAttendanceRow, StaffHoliday, StaffLeaveBalance, AttendanceStatusCode } from '../../types';

interface StaffAttendanceProps {
  user: { username: string };
  employees: StaffEmployee[];
}

const STATUS_CODES: AttendanceStatusCode[] = ['P', 'E', 'A', 'L', 'LOP', 'W/O'];
const STATUS_STYLES: Record<AttendanceStatusCode, string> = {
  P: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  E: 'bg-sky-100 text-sky-800 border-sky-300',
  A: 'bg-rose-100 text-rose-800 border-rose-300',
  L: 'bg-amber-100 text-amber-800 border-amber-300',
  LOP: 'bg-orange-200 text-orange-900 border-orange-400',
  'W/O': 'bg-slate-200 text-slate-600 border-slate-300'
};

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function currentYearKey(): string {
  return String(new Date().getFullYear());
}

type SubView = 'grid' | 'leave' | 'holidays' | 'reports' | 'analytics';

export default function StaffAttendance({ user, employees }: StaffAttendanceProps) {
  const [subView, setSubView] = useState<SubView>('grid');
  const [month, setMonth] = useState(currentMonthKey());
  const [attendance, setAttendance] = useState<StaffAttendanceRow[]>([]);
  const [holidays, setHolidays] = useState<StaffHoliday[]>([]);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const triggerNotif = (message: string, type: 'success' | 'error') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  const loadAttendance = async () => {
    try {
      const res = await fetch('/api/staff/attendance');
      if (res.ok) setAttendance(await res.json());
    } catch { /* leave prior state on transient failure */ }
  };
  const loadHolidays = async () => {
    try {
      const res = await fetch('/api/staff/holidays');
      if (res.ok) setHolidays(await res.json());
    } catch { /* leave prior state on transient failure */ }
  };

  useEffect(() => { loadAttendance(); loadHolidays(); }, []);

  const totalDays = daysInMonth(month);
  const monthAttendance = useMemo(() => attendance.filter(a => a.date.startsWith(month)), [attendance, month]);

  const cellStatus = (empId: string, day: number): AttendanceStatusCode | null => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return monthAttendance.find(a => a.empId === empId && a.date === date)?.status || null;
  };

  const markCell = async (empId: string, day: number, nextStatus: AttendanceStatusCode) => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    try {
      const res = await fetch('/api/staff/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empId, date, status: nextStatus, recordedBy: user.username })
      });
      if (res.ok) {
        const { data } = await res.json();
        setAttendance(prev => {
          const others = prev.filter(a => a.id !== data.id);
          return [...others, data];
        });
      }
    } catch {
      triggerNotif('Failed to mark attendance.', 'error');
    }
  };

  const handleCellClick = (empId: string, day: number) => {
    const current = cellStatus(empId, day);
    const idx = current ? STATUS_CODES.indexOf(current) : -1;
    const next = STATUS_CODES[(idx + 1) % STATUS_CODES.length];
    markCell(empId, day, next);
  };

  const autoFillWeeklyOffs = async () => {
    const entries: Array<{ empId: string; date: string; status: string; recordedBy: string }> = [];
    for (let day = 1; day <= totalDays; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const dow = new Date(date).getDay();
      const holiday = holidays.find(h => h.date === date);
      employees.forEach(emp => {
        if (cellStatus(emp.id, day)) return; // don't overwrite an already-marked day
        if (holiday) entries.push({ empId: emp.id, date, status: 'E', recordedBy: user.username });
        else if (dow === 0) entries.push({ empId: emp.id, date, status: 'W/O', recordedBy: user.username });
      });
    }
    if (entries.length === 0) {
      triggerNotif('Nothing to auto-fill - all Sundays/holidays already marked.', 'success');
      return;
    }
    const res = await fetch('/api/staff/attendance/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entries)
    });
    if (res.ok) {
      await loadAttendance();
      triggerNotif(`Auto-filled ${entries.length} Sunday/holiday entries.`, 'success');
    }
  };

  const handleCSVImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = String(e.target?.result || '');
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { triggerNotif('CSV file appears empty.', 'error'); return; }
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const empIdx = header.indexOf('emp id');
      const dateIdx = header.indexOf('date');
      const statusIdx = header.indexOf('status');
      const remarksIdx = header.indexOf('remarks');
      if (empIdx === -1 || dateIdx === -1 || statusIdx === -1) {
        triggerNotif('CSV must have columns: Emp ID, Date, Status, Remarks.', 'error');
        return;
      }
      const entries = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        return {
          empId: cols[empIdx], date: cols[dateIdx], status: cols[statusIdx],
          remarks: remarksIdx !== -1 ? cols[remarksIdx] : undefined, recordedBy: user.username
        };
      }).filter(e => e.empId && e.date && e.status);

      const res = await fetch('/api/staff/attendance/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entries)
      });
      if (res.ok) {
        await loadAttendance();
        triggerNotif(`Imported ${entries.length} attendance entries.`, 'success');
      } else {
        triggerNotif('Bulk import failed.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleXLSXExport = () => {
    const rows = employees.map(emp => {
      const row: Record<string, string | number> = { 'Emp ID': emp.id, Name: emp.name };
      for (let day = 1; day <= totalDays; day++) {
        row[String(day)] = cellStatus(emp.id, day) || '';
      }
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, month);
    XLSX.writeFile(wb, `attendance-${month}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <CalendarDays className="text-blue-600 w-5 h-5" />
            Staff Attendance
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Daily/bulk marking, leave balances, holidays & reports</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold flex-wrap">
          {([
            ['grid', 'Marking', Users],
            ['leave', 'Leave Balances', CalendarHeart],
            ['holidays', 'Holidays', CalendarDays],
            ['reports', 'Reports', ListChecks],
            ['analytics', 'Analytics', BarChart3],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setSubView(key)}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                subView === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.message}
        </div>
      )}

      {subView === 'grid' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
            <button onClick={autoFillWeeklyOffs} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold cursor-pointer">
              Auto-fill Sundays (W/O) & Holidays (E)
            </button>
            <button onClick={handleXLSXExport} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold cursor-pointer flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Export XLSX
            </button>
            <button onClick={() => importInputRef.current?.click()} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold cursor-pointer flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
            <input ref={importInputRef} type="file" accept=".csv" hidden onChange={e => e.target.files?.[0] && handleCSVImport(e.target.files[0])} />
            <span className="text-slate-400 ml-auto">Click a cell to cycle: P → E → A → L → LOP → W/O</span>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-lg">
            <table className="text-[10px] border-collapse w-full">
              <thead>
                <tr className="bg-slate-50 sticky top-0">
                  <th className="px-2 py-2 text-left font-bold text-slate-500 sticky left-0 bg-slate-50 min-w-[140px]">Employee</th>
                  {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
                    <th key={day} className="px-1 py-2 text-center font-bold text-slate-400 w-7">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map(emp => (
                  <tr key={emp.id}>
                    <td className="px-2 py-1 font-semibold text-slate-700 sticky left-0 bg-white whitespace-nowrap">{emp.name}</td>
                    {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
                      const status = cellStatus(emp.id, day);
                      return (
                        <td key={day} className="p-0.5">
                          <button onClick={() => handleCellClick(emp.id, day)}
                            className={`w-6 h-6 rounded text-[9px] font-bold border cursor-pointer ${status ? STATUS_STYLES[status] : 'bg-white border-slate-200 text-slate-300 hover:bg-slate-50'}`}>
                            {status || '-'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === 'leave' && <LeaveBalancesPanel employees={employees} triggerNotif={triggerNotif} />}
      {subView === 'holidays' && <HolidaysPanel holidays={holidays} reload={loadHolidays} triggerNotif={triggerNotif} />}
      {subView === 'reports' && <ReportsPanel employees={employees} month={month} setMonth={setMonth} />}
      {subView === 'analytics' && <AnalyticsPanel />}
    </div>
  );
}

function LeaveBalancesPanel({ employees, triggerNotif }: {
  employees: StaffEmployee[];
  triggerNotif: (m: string, t: 'success' | 'error') => void;
}) {
  const [empId, setEmpId] = useState(employees[0]?.id || '');
  const [year, setYear] = useState(currentYearKey());
  const [balance, setBalance] = useState<StaffLeaveBalance | null>(null);

  useEffect(() => {
    if (!empId || !year) return;
    fetch(`/api/staff/leave-balance/${encodeURIComponent(empId)}/${year}`)
      .then(r => r.json()).then(({ data }) => setBalance(data)).catch(() => setBalance(null));
  }, [empId, year]);

  const save = async () => {
    if (!balance) return;
    const res = await fetch(`/api/staff/leave-balance/${encodeURIComponent(empId)}/${year}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(balance)
    });
    if (res.ok) triggerNotif('Leave balance updated.', 'success');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-xs space-y-4 max-w-xl">
      <div className="flex gap-3">
        <select value={empId} onChange={e => setEmpId(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 flex-1">
          {employees.map(e => <option key={e.id} value={e.id}>{e.id} - {e.name}</option>)}
        </select>
        <input value={year} onChange={e => setYear(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 w-24" />
      </div>
      {balance && (
        <div className="grid grid-cols-3 gap-3">
          {([['casual', 'Casual'], ['sick', 'Sick'], ['earned', 'Earned']] as const).map(([key, label]) => (
            <div key={key} className="border border-slate-200 rounded-lg p-3">
              <p className="font-bold text-slate-500 uppercase mb-2">{label}</p>
              <label className="text-slate-400">Granted</label>
              <input type="number" value={(balance as any)[`${key}Granted`]}
                onChange={e => setBalance({ ...balance, [`${key}Granted`]: Number(e.target.value) } as StaffLeaveBalance)}
                className="w-full border border-slate-300 rounded px-2 py-1 mt-0.5 mb-1.5" />
              <p className="text-slate-500">Used: <strong>{(balance as any)[`${key}Used`]}</strong></p>
              <p className="text-emerald-600 font-bold">Remaining: {(balance as any)[`${key}Granted`] - (balance as any)[`${key}Used`]}</p>
            </div>
          ))}
          <div className="col-span-3 text-rose-600 font-semibold">LOP taken this year: {balance.lopTaken}</div>
        </div>
      )}
      <button onClick={save} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-4 rounded-lg uppercase text-[11px] cursor-pointer">
        Save Balance
      </button>
    </div>
  );
}

function HolidaysPanel({ holidays, reload, triggerNotif }: {
  holidays: StaffHoliday[]; reload: () => Promise<void>; triggerNotif: (m: string, t: 'success' | 'error') => void;
}) {
  const [form, setForm] = useState({ date: '', name: '', type: 'public' as StaffHoliday['type'] });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.name) return;
    const res = await fetch('/api/staff/holidays', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
    });
    if (res.ok) { await reload(); setForm({ date: '', name: '', type: 'public' }); triggerNotif('Holiday added.', 'success'); }
  };
  const remove = async (id: string) => {
    const res = await fetch(`/api/staff/holidays/${id}`, { method: 'DELETE' });
    if (res.ok) { await reload(); triggerNotif('Holiday removed.', 'success'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={add} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit text-xs space-y-3">
        <h2 className="text-sm font-bold text-slate-800 uppercase mb-2 flex items-center gap-1.5"><Plus className="w-4 h-4 text-teal-600" /> Add Holiday</h2>
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" required />
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Holiday name" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" required />
        <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as StaffHoliday['type'] })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
          <option value="public">Public</option>
          <option value="regional">Regional</option>
          <option value="company">Company</option>
        </select>
        <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg uppercase text-[11px] cursor-pointer">Add</button>
      </form>
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Name</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {holidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => (
              <tr key={h.id}>
                <td className="px-3 py-2.5 font-mono">{h.date}</td>
                <td className="px-3 py-2.5 font-semibold">{h.name}</td>
                <td className="px-3 py-2.5 capitalize text-slate-500">{h.type}</td>
                <td className="px-3 py-2.5 text-right"><button onClick={() => remove(h.id)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsPanel({ employees, month, setMonth }: { employees: StaffEmployee[]; month: string; setMonth: (m: string) => void }) {
  const [summaries, setSummaries] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [reportRows, setReportRows] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/staff/attendance/summary?month=${month}`).then(r => r.json()).then(({ data }) => setSummaries(data || [])).catch(() => setSummaries([]));
  }, [month, employees.length]);

  useEffect(() => {
    const qs = status ? `month=${month}&status=${status}` : `month=${month}`;
    fetch(`/api/staff/attendance/report?${qs}`).then(r => r.json()).then(({ data }) => setReportRows(data || [])).catch(() => setReportRows([]));
  }, [month, status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-xs">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <h2 className="p-4 font-bold text-slate-800 uppercase text-xs border-b border-slate-100">Monthly Attendance Summary</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
            <tr><th className="px-3 py-2.5">Employee</th><th className="px-3 py-2.5">Present</th><th className="px-3 py-2.5">Absent</th><th className="px-3 py-2.5">Leave</th><th className="px-3 py-2.5">LOP</th><th className="px-3 py-2.5">Attendance %</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summaries.map(s => (
              <tr key={s.empId}>
                <td className="px-3 py-2.5 font-semibold">{s.name}</td>
                <td className="px-3 py-2.5">{s.presentDays}</td>
                <td className="px-3 py-2.5 text-rose-600">{s.absentDays}</td>
                <td className="px-3 py-2.5 text-amber-600">{s.leaveDays}</td>
                <td className="px-3 py-2.5 text-orange-600">{s.lopDays}</td>
                <td className="px-3 py-2.5 font-bold">{s.attendancePercentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 uppercase text-xs">Filtered Attendance Rows</h2>
          <select value={status} onChange={e => setStatus(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs">
            <option value="">All Statuses</option>
            {STATUS_CODES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Employee</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Remarks</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {reportRows.map(r => (
              <tr key={r.id}><td className="px-3 py-2.5 font-mono">{r.date}</td><td className="px-3 py-2.5 font-semibold">{r.name}</td><td className="px-3 py-2.5">{r.status}</td><td className="px-3 py-2.5 text-slate-500">{r.remarks || '-'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const [trend, setTrend] = useState<any[]>([]);
  const [absenteeism, setAbsenteeism] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/staff/attendance/analytics').then(r => r.json()).then(({ data }) => {
      setTrend(data?.trend || []);
      setAbsenteeism(data?.absenteeism || []);
    }).catch(() => {});
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h2 className="font-bold text-slate-800 uppercase text-xs mb-4">Attendance % Trend</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Legend />
            <Bar dataKey="attendancePercentage" name="Attendance %" fill="#0d9488" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h2 className="font-bold text-slate-800 uppercase text-xs mb-4">Absenteeism (Latest Month)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={absenteeism} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" fontSize={10} />
            <YAxis type="category" dataKey="name" fontSize={10} width={100} />
            <Tooltip />
            <Bar dataKey="absentCount" name="Absent/LOP Days" fill="#e11d48" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
