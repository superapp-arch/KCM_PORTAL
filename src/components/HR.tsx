import React, { useState } from 'react';
import { StaffEmployee, User as UserType } from '../types';
import { Users, CalendarDays, Coins } from 'lucide-react';
import StaffEmployees from './hr/StaffEmployees';
import StaffAttendance from './hr/StaffAttendance';
import StaffSalary from './hr/StaffSalary';

interface HRProps {
  user: UserType;
  employees: StaffEmployee[];
  onAddEmployee: (emp: Omit<StaffEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateEmployee: (id: string, emp: Partial<StaffEmployee>) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
}

type ModuleTab = 'employees' | 'attendance' | 'salary';

export default function HR({ user, employees, onAddEmployee, onUpdateEmployee, onDeleteEmployee }: HRProps) {
  const [moduleTab, setModuleTab] = useState<ModuleTab>('employees');

  return (
    <div className="space-y-6" id="hr-view-wrapper">
      <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
        {([
          ['employees', 'Employees', Users],
          ['attendance', 'Attendance', CalendarDays],
          ['salary', 'Salary', Coins],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setModuleTab(key)}
            className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              moduleTab === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {moduleTab === 'employees' && (
        <StaffEmployees user={user} employees={employees} onAddEmployee={onAddEmployee} onUpdateEmployee={onUpdateEmployee} onDeleteEmployee={onDeleteEmployee} />
      )}
      {moduleTab === 'attendance' && <StaffAttendance user={user} employees={employees} />}
      {moduleTab === 'salary' && <StaffSalary user={user} employees={employees} />}
    </div>
  );
}
