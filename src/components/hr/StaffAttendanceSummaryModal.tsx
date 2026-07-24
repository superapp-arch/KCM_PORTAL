import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { StaffEmployee, StaffAttendance, AttendanceStatusCode } from '../../types';

interface StaffAttendanceSummaryModalProps {
  employee: StaffEmployee;
  month: string;
  onClose: () => void;
}

interface MonthlySummary {
  totalDays: number; workingDays: number; presentDays: number; totalAbsent: number;
  halfDays: number; paidLeaveDays: number; leaveWithPermissionDays: number;
  medicalLeaveDays: number; lopDays: number; lopIsOverridden: boolean; holidayDays: number; weekOffDays: number;
  attendancePercentage: number; rows: StaffAttendance[];
}

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

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export default function StaffAttendanceSummaryModal({ employee, month, onClose }: StaffAttendanceSummaryModalProps) {
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [editingLop, setEditingLop] = useState(false);
  const [lopInput, setLopInput] = useState('');
  const [isSavingLop, setIsSavingLop] = useState(false);

  const loadSummary = () => {
    fetch(`/api/staff/attendance/monthly/${encodeURIComponent(employee.id)}/${month}`)
      .then(r => r.json()).then(({ data }) => setSummary(data)).catch(() => setSummary(null));
  };

  useEffect(() => { loadSummary(); setEditingLop(false); }, [employee.id, month]);

  const startEditLop = () => {
    setLopInput(String(summary?.lopDays ?? 0));
    setEditingLop(true);
  };

  const saveLopOverride = async () => {
    setIsSavingLop(true);
    try {
      const res = await fetch(`/api/staff/attendance-adjustment/${encodeURIComponent(employee.id)}/${month}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lopDaysOverride: Number(lopInput) })
      });
      if (res.ok) { loadSummary(); setEditingLop(false); }
    } finally {
      setIsSavingLop(false);
    }
  };

  const totalDays = daysInMonth(month);

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-pink-500 to-purple-600" />
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-base font-black text-slate-800">{employee.name}</h3>
            <p className="text-xs text-slate-500 font-mono mt-1">{employee.id} &middot; {month}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {summary && (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs mb-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-center">
                <p className="font-bold text-emerald-700 text-lg">{summary.presentDays}</p>
                <p className="text-emerald-600 uppercase text-[9px] font-bold">Present</p>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-center">
                <p className="font-bold text-rose-700 text-lg">{summary.totalAbsent}</p>
                <p className="text-rose-600 uppercase text-[9px] font-bold">Absent</p>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 text-center">
                <p className="font-bold text-sky-700 text-lg">{summary.paidLeaveDays}</p>
                <p className="text-sky-600 uppercase text-[9px] font-bold">Paid Leave</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
                <p className="font-bold text-amber-700 text-lg">{summary.halfDays}</p>
                <p className="text-amber-600 uppercase text-[9px] font-bold">Half Day</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-center relative">
                {editingLop ? (
                  <div className="flex items-center gap-1 justify-center">
                    <input type="number" value={lopInput} onChange={e => setLopInput(e.target.value)}
                      autoComplete="off" className="no-spinner w-12 border border-orange-300 rounded px-1 py-0.5 text-center font-bold text-orange-700" autoFocus />
                    <button onClick={saveLopOverride} disabled={isSavingLop} className="text-orange-700 hover:text-orange-900 cursor-pointer font-bold">✓</button>
                    <button onClick={() => setEditingLop(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer font-bold">✕</button>
                  </div>
                ) : (
                  <p className="font-bold text-orange-700 text-lg cursor-pointer" onClick={startEditLop} title="Click to manually set LOP days">
                    {summary.lopDays}{summary.lopIsOverridden && <span className="text-[9px] align-top ml-0.5">*</span>}
                  </p>
                )}
                <p className="text-orange-600 uppercase text-[9px] font-bold">LOP {!editingLop && '(click to edit)'}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                <p className="font-bold text-slate-700 text-lg">{summary.attendancePercentage}%</p>
                <p className="text-slate-500 uppercase text-[9px] font-bold">Attendance</p>
              </div>
            </div>

            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Calendar</p>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
                const date = `${month}-${String(day).padStart(2, '0')}`;
                const record = summary.rows.find(r => r.date === date);
                return (
                  <div key={day}
                    title={record?.status || 'Unmarked'}
                    className={`h-8 rounded-md border flex items-center justify-center text-[9px] font-bold ${record ? STATUS_STYLES[record.status] : 'bg-white border-slate-200 text-slate-300'}`}>
                    {day}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex items-center justify-end pt-4 border-t border-slate-100 mt-4">
          <button onClick={onClose} className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs uppercase cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}
