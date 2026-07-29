import React, { useState } from 'react';
import { DriverEmployee, User as UserType } from '../types';
import { Coins, CalendarDays } from 'lucide-react';
import DriverSalarySheet from './drivers/DriverSalarySheet';
import DriverAttendanceSheet from './drivers/DriverAttendanceSheet';

interface DriverDetailsProps {
  user: UserType;
  drivers: DriverEmployee[];
  onAddDriver: (driver: Omit<DriverEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateDriver: (id: string, driver: Partial<DriverEmployee>) => Promise<void>;
  onDeleteDriver: (id: string) => Promise<void>;
}

type ModuleTab = 'salary' | 'attendance';

export default function DriverDetails({ drivers, onAddDriver, onUpdateDriver, onDeleteDriver }: DriverDetailsProps) {
  const [moduleTab, setModuleTab] = useState<ModuleTab>('salary');

  return (
    <div className="space-y-6" id="driver-view-wrapper">
      <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
        {([
          ['salary', 'Driver Salary', Coins],
          ['attendance', 'Driver Attendance', CalendarDays],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setModuleTab(key)}
            className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              moduleTab === key ? 'bg-gradient-to-r from-pink-600 to-purple-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {moduleTab === 'salary' && (
        <DriverSalarySheet drivers={drivers} onAddDriver={onAddDriver} onUpdateDriver={onUpdateDriver} onDeleteDriver={onDeleteDriver} />
      )}
      {moduleTab === 'attendance' && <DriverAttendanceSheet drivers={drivers} />}
    </div>
  );
}
