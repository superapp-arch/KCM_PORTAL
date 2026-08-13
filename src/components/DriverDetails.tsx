import React, { useState } from 'react';
import { DriverEmployee, DriverLocationCategory, User as UserType } from '../types';
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

// WRITE scope only - mirrors server.ts's DRIVER_LOCATION_SCOPES exactly, so
// the Add/Edit Driver location dropdown and the attendance grid's editable
// cells match what the backend will actually accept. Which drivers/locations
// each of these people can *see* is a separate, usually broader, question -
// the backend already only sends drivers within their view scope (see
// server.ts's DRIVER_VIEW_ALL_EMAILS), so `drivers` here is already correct.
const DRIVER_WRITE_LOCATION_SCOPES: Record<string, DriverLocationCategory[]> = {
  'rajeshwar@kcmlogistics.in': ['Hyd Swiggy', 'Swiggy - Vizag Driver'],
  'nagaraju.linga@kcmlogistics.in': ['Hyd Swiggy', 'Swiggy - Vizag Driver', 'Walkes & Parking Drivers HYD', 'Vijayawada Drivers Details'],
  'ramesh@kcmlogistics.in': ['Nelmangala Reliance', 'Nidaghatta Reliance', 'Chennai Hybrid', 'Swiggy DHL'],
  'saneel@kcmlogistics.in': ['BLR Swiggy', 'Goa Vehicle', 'Cold Star BLR', 'Belgaum Drivers Details'],
  'hemanth@kcmlogistics.in': ['BLR Swiggy', 'Goa Vehicle', 'Cold Star BLR', 'Belgaum Drivers Details'],
  'vinod@kcmlogistics.in': ['Market Vehicle Driver Details', 'HSK RIL F&V Drivers', 'KCM Service Station']
};

// Full read+write everywhere - mirrors server.ts's DRIVER_ALL_LOCATIONS_EMAILS.
// Note Vinod is deliberately NOT here: he can view every location (server
// already sends him every driver) but only write within his scope above.
const DRIVER_ALL_LOCATIONS_EMAILS = ['bhagya@kcmlogistics.in', 'divya@kcmlogistics.in'];

export default function DriverDetails({ user, drivers, onAddDriver, onUpdateDriver, onDeleteDriver }: DriverDetailsProps) {
  const [moduleTab, setModuleTab] = useState<ModuleTab>('salary');

  const writableLocations: DriverLocationCategory[] | 'ALL' =
    user.department === 'super_admin' || DRIVER_ALL_LOCATIONS_EMAILS.includes(user.email || '')
      ? 'ALL'
      : DRIVER_WRITE_LOCATION_SCOPES[user.email || ''] || [];

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
        <DriverSalarySheet performedBy={user.username} drivers={drivers} writableLocations={writableLocations} onAddDriver={onAddDriver} onUpdateDriver={onUpdateDriver} onDeleteDriver={onDeleteDriver} />
      )}
      {moduleTab === 'attendance' && <DriverAttendanceSheet drivers={drivers} writableLocations={writableLocations} />}
    </div>
  );
}
