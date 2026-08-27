import React, { useState } from 'react';
import { StaffEmployee, User as UserType } from '../types';
import { Coins, CalendarDays } from 'lucide-react';
import StaffSalarySheet from './hr/StaffSalarySheet';
import StaffAttendanceSheet from './hr/StaffAttendanceSheet';

interface HRProps {
  user: UserType;
  employees: StaffEmployee[];
  onAddEmployee: (emp: Omit<StaffEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateEmployee: (id: string, emp: Partial<StaffEmployee>) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
}

type ModuleTab = 'salary' | 'attendance';

// Vinod gets HR & Payroll for Staff Attendance visibility only - no Staff
// Salary/Salary Slip access at all, and the attendance grid itself is
// read-only for him (view only, no marking/editing) - see
// Administration.tsx's own HR_ATTENDANCE_VIEW_ONLY_EMAILS and server.ts's
// matching restriction on the write endpoints.
const ATTENDANCE_VIEW_ONLY_EMAILS = ['vinod@kcmlogistics.in'];

export default function HR({ user, employees, onAddEmployee, onUpdateEmployee, onDeleteEmployee }: HRProps) {
  const isAttendanceViewOnly = ATTENDANCE_VIEW_ONLY_EMAILS.includes(user.email || '');
  const [moduleTab, setModuleTab] = useState<ModuleTab>(isAttendanceViewOnly ? 'attendance' : 'salary');

  return (
    <div className="space-y-6" id="hr-view-wrapper">
      {!isAttendanceViewOnly && (
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
          {([
            ['salary', 'Staff Salary', Coins],
            ['attendance', 'Staff Attendance', CalendarDays],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setModuleTab(key)}
              className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                moduleTab === key ? 'bg-gradient-to-r from-pink-600 to-purple-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      )}

      {moduleTab === 'salary' && !isAttendanceViewOnly && (
        <StaffSalarySheet user={user} employees={employees} onAddEmployee={onAddEmployee} onUpdateEmployee={onUpdateEmployee} onDeleteEmployee={onDeleteEmployee} />
      )}
      {(moduleTab === 'attendance' || isAttendanceViewOnly) && <StaffAttendanceSheet employees={employees} readOnly={isAttendanceViewOnly} />}
    </div>
  );
}
