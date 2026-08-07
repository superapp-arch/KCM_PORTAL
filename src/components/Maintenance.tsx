import React, { useState } from 'react';
import {
  MaintenanceRecord,
  Vehicle,
  DriverEmployee,
  MileageReport,
  VehicleMaintenanceProfile,
  MaintenanceServiceStation,
  BreakdownReport
} from '../types';
import { Settings, Truck, AlertTriangle, CalendarClock, Wrench } from 'lucide-react';
import { computeServiceDueStatus, latestOdometerFor } from '../utils/maintenanceDates';
import ServiceLedgerTab from './maintenance/ServiceLedgerTab';
import VehicleProfilesTab from './maintenance/VehicleProfilesTab';
import BreakdownsTab from './maintenance/BreakdownsTab';

interface MaintenanceProps {
  records: MaintenanceRecord[];
  onAddRecord: (record: Omit<MaintenanceRecord, 'id'>) => Promise<void>;
  onUpdateRecord: (id: string, record: Partial<MaintenanceRecord>) => Promise<void>;
  onDeleteRecord: (id: string) => Promise<void>;
  vehicles: Vehicle[];
  drivers: DriverEmployee[];
  mileageReports: MileageReport[];
  vehicleMaintenanceProfiles: VehicleMaintenanceProfile[];
  onAddVehicleMaintenanceProfile: (profile: Omit<VehicleMaintenanceProfile, 'id'> & { id: string }) => Promise<void>;
  onUpdateVehicleMaintenanceProfile: (id: string, profile: Partial<VehicleMaintenanceProfile>) => Promise<void>;
  onDeleteVehicleMaintenanceProfile: (id: string) => Promise<void>;
  serviceStations: MaintenanceServiceStation[];
  onAddServiceStation: (station: Omit<MaintenanceServiceStation, 'id'>) => Promise<void>;
  onDeleteServiceStation: (id: string) => Promise<void>;
  breakdownReports: BreakdownReport[];
  onAddBreakdownReport: (report: Omit<BreakdownReport, 'id'>) => Promise<void>;
  onUpdateBreakdownReport: (id: string, report: Partial<BreakdownReport>) => Promise<void>;
  onDeleteBreakdownReport: (id: string) => Promise<void>;
}

type ModuleTab = 'ledger' | 'profiles' | 'breakdowns';

export default function Maintenance(props: MaintenanceProps) {
  const {
    records, vehicles, mileageReports, vehicleMaintenanceProfiles, breakdownReports
  } = props;
  const [moduleTab, setModuleTab] = useState<ModuleTab>('ledger');
  const [showScheduledList, setShowScheduledList] = useState(false);
  const [showBreakdownList, setShowBreakdownList] = useState(false);

  const regNoOf = (v: Vehicle) => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase();
  const vehicleList = Array.from(new Set(vehicles.map(regNoOf).filter(Boolean))).sort();

  // Scheduled Vehicles widget (item 8): vehicles whose service is due-soon or
  // overdue, per computeServiceDueStatus - reads each vehicle's last service
  // date/odometer from its most recent MaintenanceRecord (falling back to
  // nothing if it's never been serviced) plus its VehicleMaintenanceProfile's
  // configured intervals.
  const scheduledVehicles = vehicleList
    .map(regNo => {
      const profile = vehicleMaintenanceProfiles.find(p => p.regNo === regNo);
      if (!profile || (profile.serviceIntervalDays == null && profile.serviceIntervalKm == null)) return null;
      const vehicleRecords = records.filter(r => (r.regNo || '').trim().toUpperCase() === regNo).sort((a, b) => a.date < b.date ? 1 : -1);
      const lastService = vehicleRecords[0];
      const currentKm = latestOdometerFor(regNo, mileageReports);
      const status = computeServiceDueStatus(
        lastService?.date,
        profile.serviceIntervalDays,
        profile.serviceLastOdometerKm,
        currentKm,
        profile.serviceIntervalKm
      );
      return status === 'ok' ? null : { regNo, status, lastServiceDate: lastService?.date };
    })
    .filter((v): v is { regNo: string; status: 'due-soon' | 'overdue'; lastServiceDate: string | undefined } => v != null)
    .sort((a, b) => (a.status === 'overdue' ? -1 : 1) - (b.status === 'overdue' ? -1 : 1));

  const openBreakdowns = breakdownReports.filter(b => b.status === 'Open');

  const TABS: [ModuleTab, string, React.ComponentType<{ className?: string }>][] = [
    ['ledger', 'Service Ledger', Settings],
    ['profiles', 'Vehicle Profiles', Truck],
    ['breakdowns', 'Breakdowns', AlertTriangle]
  ];

  return (
    <div className="space-y-6" id="maintenance-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Settings className="text-blue-600 w-5 h-5" />
            KCM Fleet Maintenance & Garage Center
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Service ledger, vehicle maintenance profiles, and breakdown/workshop visit tracking
          </p>
        </div>
      </div>

      {/* Dashboard widgets - always visible regardless of active tab (item 8) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <button
          type="button"
          onClick={() => setShowScheduledList(s => !s)}
          className="text-left bg-white p-4 rounded-xl border border-amber-200 shadow-xs hover:shadow-sm transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" /> Scheduled Vehicles
              </p>
              <h3 className="text-lg font-bold text-amber-700 mt-1">{scheduledVehicles.length} Due</h3>
              <p className="text-slate-400 mt-0.5">Service due-soon or overdue - click to {showScheduledList ? 'hide' : 'view'}</p>
            </div>
            <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          {showScheduledList && (
            <div className="mt-3 pt-3 border-t border-amber-100 space-y-1 max-h-40 overflow-y-auto">
              {scheduledVehicles.length === 0 ? (
                <p className="text-slate-400">Nothing due right now.</p>
              ) : scheduledVehicles.map(v => (
                <div key={v.regNo} className="flex items-center justify-between font-mono">
                  <span className="font-bold text-slate-800">{v.regNo}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${v.status === 'overdue' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {v.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowBreakdownList(s => !s)}
          className="text-left bg-white p-4 rounded-xl border border-rose-200 shadow-xs hover:shadow-sm transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" /> Breakdown Vehicles
              </p>
              <h3 className="text-lg font-bold text-rose-700 mt-1">{openBreakdowns.length} Open</h3>
              <p className="text-slate-400 mt-0.5">Currently reported broken down - click to {showBreakdownList ? 'hide' : 'view'}</p>
            </div>
            <div className="p-2.5 bg-rose-50 rounded-lg text-rose-600 animate-pulse">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          {showBreakdownList && (
            <div className="mt-3 pt-3 border-t border-rose-100 space-y-1 max-h-40 overflow-y-auto">
              {openBreakdowns.length === 0 ? (
                <p className="text-slate-400">No open breakdowns.</p>
              ) : openBreakdowns.map(b => (
                <div key={b.id} className="flex items-center justify-between font-mono">
                  <span className="font-bold text-slate-800">{b.regNo}</span>
                  <span className="text-slate-500">{b.date} - {b.location || '-'}</span>
                </div>
              ))}
            </div>
          )}
        </button>
      </div>

      <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setModuleTab(key)}
            className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              moduleTab === key ? 'bg-gradient-to-r from-blue-600 to-slate-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {moduleTab === 'ledger' && (
        <ServiceLedgerTab
          records={props.records}
          onAddRecord={props.onAddRecord}
          onUpdateRecord={props.onUpdateRecord}
          onDeleteRecord={props.onDeleteRecord}
          vehicles={props.vehicles}
          drivers={props.drivers}
          mileageReports={props.mileageReports}
          vehicleMaintenanceProfiles={props.vehicleMaintenanceProfiles}
          serviceStations={props.serviceStations}
          onAddServiceStation={props.onAddServiceStation}
          onDeleteServiceStation={props.onDeleteServiceStation}
        />
      )}
      {moduleTab === 'profiles' && (
        <VehicleProfilesTab
          vehicles={props.vehicles}
          mileageReports={props.mileageReports}
          records={props.records}
          vehicleMaintenanceProfiles={props.vehicleMaintenanceProfiles}
          onAddVehicleMaintenanceProfile={props.onAddVehicleMaintenanceProfile}
          onDeleteVehicleMaintenanceProfile={props.onDeleteVehicleMaintenanceProfile}
        />
      )}
      {moduleTab === 'breakdowns' && (
        <BreakdownsTab
          breakdownReports={props.breakdownReports}
          onAddBreakdownReport={props.onAddBreakdownReport}
          onUpdateBreakdownReport={props.onUpdateBreakdownReport}
          onDeleteBreakdownReport={props.onDeleteBreakdownReport}
          vehicles={props.vehicles}
          drivers={props.drivers}
          serviceStations={props.serviceStations}
          onAddServiceStation={props.onAddServiceStation}
          onAddRecord={props.onAddRecord}
        />
      )}
    </div>
  );
}
