import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { DriverEmployee, DriverAttendance } from '../../types';
import { authFetch } from '../../authFetch';

interface DriverAttendanceSummaryModalProps {
  driver: DriverEmployee;
  month: string;
  onClose: () => void;
}

interface MonthlySummary {
  totalDays: number; workingDays: number; lopDays: number; exemptionLeaveDays: number;
  presentDays: number; rows: DriverAttendance[];
}

const STATUS_STYLES: Record<DriverAttendance['status'], string> = {
  Present: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Absent: 'bg-rose-100 text-rose-800 border-rose-300',
  Leave: 'bg-sky-100 text-sky-800 border-sky-300'
};

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export default function DriverAttendanceSummaryModal({ driver, month, onClose }: DriverAttendanceSummaryModalProps) {
  const [summary, setSummary] = useState<MonthlySummary | null>(null);

  useEffect(() => {
    authFetch(`/api/drivers/attendance/monthly/${encodeURIComponent(driver.id)}/${month}`)
      .then(r => r.json()).then(({ data }) => setSummary(data)).catch(() => setSummary(null));
  }, [driver.id, month]);

  const totalDays = daysInMonth(month);

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-pink-500 to-purple-600" />
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-base font-black text-slate-800">{driver.name}</h3>
            <p className="text-xs text-slate-500 font-mono mt-1">{driver.id} &middot; {month}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {summary && (
          <>
            <div className="grid grid-cols-4 gap-2 text-xs mb-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                <p className="font-bold text-slate-700 text-lg">{summary.totalDays}</p>
                <p className="text-slate-400 uppercase text-[9px] font-bold">No. of Days</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-center">
                <p className="font-bold text-emerald-700 text-lg">{summary.presentDays}</p>
                <p className="text-emerald-600 uppercase text-[9px] font-bold">Present</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-center">
                <p className="font-bold text-orange-700 text-lg">{summary.lopDays}</p>
                <p className="text-orange-600 uppercase text-[9px] font-bold">LOP (Absent)</p>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 text-center">
                <p className="font-bold text-sky-700 text-lg">{summary.exemptionLeaveDays}</p>
                <p className="text-sky-600 uppercase text-[9px] font-bold">Exemption Leave</p>
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
