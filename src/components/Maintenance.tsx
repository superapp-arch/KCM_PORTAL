import React, { useState } from 'react';
import {
  MaintenanceRecord,
  Vehicle,
  DriverEmployee,
  MileageReport,
  MaintenanceServiceStation,
  BreakdownReport,
  VehicleServiceSchedule,
  TireBrand,
  TireRecord,
  BatteryRecord,
  ToolsChecklistRecord,
  ServiceStationSparePart,
  ServiceStationInspection
} from '../types';
import { Settings, Truck, AlertTriangle, CalendarClock, Wrench, CircleDot, Battery, Package } from 'lucide-react';
import { latestOdometerFor, computeKmStatus, computeAlignmentStatus } from '../utils/maintenanceDates';
import ServiceLedgerTab from './maintenance/ServiceLedgerTab';
import ServiceScheduleTab from './maintenance/ServiceScheduleTab';
import ServiceStationTab from './maintenance/ServiceStationTab';
import TireAlignmentTab from './maintenance/TireAlignmentTab';
import BatteryTab from './maintenance/BatteryTab';
import ToolsChecklistTab from './maintenance/ToolsChecklistTab';
import BreakdownsTab from './maintenance/BreakdownsTab';

interface MaintenanceProps {
  performedBy: string; // current user's username - used for the Service Invoice audit trail (Generated/Regenerated/Downloaded)
  isSuperAdmin: boolean; // gates Service Schedule's bulk "Send Reminder Now" action
  records: MaintenanceRecord[];
  onAddRecord: (record: Omit<MaintenanceRecord, 'id'>) => Promise<void>;
  onUpdateRecord: (id: string, record: Partial<MaintenanceRecord>) => Promise<void>;
  onDeleteRecord: (id: string) => Promise<void>;
  vehicles: Vehicle[];
  drivers: DriverEmployee[];
  mileageReports: MileageReport[];
  serviceStations: MaintenanceServiceStation[];
  onAddServiceStation: (station: Omit<MaintenanceServiceStation, 'id'>) => Promise<void>;
  onDeleteServiceStation: (id: string) => Promise<void>;
  breakdownReports: BreakdownReport[];
  onAddBreakdownReport: (report: Omit<BreakdownReport, 'id'>) => Promise<void>;
  onUpdateBreakdownReport: (id: string, report: Partial<BreakdownReport>) => Promise<void>;
  onDeleteBreakdownReport: (id: string) => Promise<void>;
  vehicleServiceSchedules: VehicleServiceSchedule[];
  onSaveVehicleServiceSchedule: (schedule: VehicleServiceSchedule) => Promise<void>;
  tireBrands: TireBrand[];
  onAddTireBrand: (name: string) => Promise<void>;
  tireRecords: TireRecord[];
  onSaveTireRecord: (record: TireRecord | Omit<TireRecord, 'id'>) => Promise<void>;
  onDeleteTireRecord: (id: string) => Promise<void>;
  batteryRecords: BatteryRecord[];
  onSaveBatteryRecord: (record: BatteryRecord | Omit<BatteryRecord, 'id'>) => Promise<void>;
  onDeleteBatteryRecord: (id: string) => Promise<void>;
  toolsChecklistRecords: ToolsChecklistRecord[];
  onSaveToolsChecklistRecord: (record: Omit<ToolsChecklistRecord, 'id'>) => Promise<void>;
  onDeleteToolsChecklistRecord: (id: string) => Promise<void>;
  serviceStationSpareParts: ServiceStationSparePart[];
  onSaveServiceStationSparePart: (record: Omit<ServiceStationSparePart, 'id'>) => Promise<void>;
  onDeleteServiceStationSparePart: (id: string) => Promise<void>;
  serviceStationInspections: ServiceStationInspection[];
  onSaveServiceStationInspection: (record: Omit<ServiceStationInspection, 'id'>) => Promise<void>;
  onDeleteServiceStationInspection: (id: string) => Promise<void>;
}

type ModuleTab = 'ledger' | 'schedule' | 'servicestation' | 'tires' | 'battery' | 'tools' | 'breakdowns';

export default function Maintenance(props: MaintenanceProps) {
  const {
    vehicles, mileageReports, vehicleServiceSchedules, tireRecords, breakdownReports
  } = props;
  const [moduleTab, setModuleTab] = useState<ModuleTab>('ledger');
  const [showScheduledList, setShowScheduledList] = useState(false);
  const [showAlignmentList, setShowAlignmentList] = useState(false);
  const [showBreakdownList, setShowBreakdownList] = useState(false);

  const regNoOf = (v: Vehicle) => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase();
  const vehicleList = Array.from(new Set(vehicles.map(regNoOf).filter(Boolean))).sort();

  // Scheduled Vehicles widget: vehicles whose Service Status is due-soon or
  // overdue, per computeKmStatus against that vehicle's VehicleServiceSchedule
  // and live Fuel Management odometer - see src/utils/maintenanceDates.ts.
  const scheduledVehicles = vehicleServiceSchedules
    .map(schedule => {
      if (schedule.lastServiceKm == null) return null;
      const currentKm = latestOdometerFor(schedule.regNo, mileageReports);
      if (currentKm == null) return null;
      const remaining = (schedule.lastServiceKm + (schedule.serviceIntervalKm || 10000)) - currentKm;
      const status = computeKmStatus(remaining);
      return status && status !== 'ok' ? { regNo: schedule.regNo, status, remaining } : null;
    })
    .filter((v): v is { regNo: string; status: 'due-soon' | 'overdue'; remaining: number } => v != null)
    .sort((a, b) => (a.status === 'overdue' ? -1 : 1) - (b.status === 'overdue' ? -1 : 1));

  // Wheel Alignment widget - same KM-driven pattern, per tyre position.
  // Replaced/removed tires (isCurrent: false - see Tire & Alignment's Bulk
  // Tire Entry) are excluded so a superseded tire's old alignment history
  // never keeps generating alerts.
  const alignmentVehicles = tireRecords
    .filter(tire => tire.isCurrent !== false)
    .map(tire => {
      const currentKm = latestOdometerFor(tire.regNo, mileageReports);
      const status = computeAlignmentStatus(tire.lastAlignmentKm, currentKm);
      return status && status !== 'ok' ? { regNo: tire.regNo, position: tire.position, status } : null;
    })
    .filter((v): v is { regNo: string; position: string; status: 'due-soon' | 'overdue' } => v != null)
    .sort((a, b) => (a.status === 'overdue' ? -1 : 1) - (b.status === 'overdue' ? -1 : 1));

  const openBreakdowns = breakdownReports.filter(b => b.status === 'Open');

  const TABS: [ModuleTab, string, React.ComponentType<{ className?: string }>][] = [
    ['ledger', 'Service History', Settings],
    ['schedule', 'Service Schedule', CalendarClock],
    ['servicestation', 'Service Station', Package],
    ['tires', 'Tire & Alignment', CircleDot],
    ['battery', 'Battery', Battery],
    ['tools', 'Tools Checklist', Wrench],
    ['breakdowns', 'Breakdown / Workshop / Electrical', AlertTriangle]
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
            Service schedule, service station, tire &amp; alignment, battery, tools checklist, and breakdown/workshop/electrical tracking
          </p>
        </div>
      </div>

      {/* Dashboard widgets - always visible regardless of active tab */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
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
          onClick={() => setShowAlignmentList(s => !s)}
          className="text-left bg-white p-4 rounded-xl border border-blue-200 shadow-xs hover:shadow-sm transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                <CircleDot className="w-3.5 h-3.5" /> Wheel Alignment
              </p>
              <h3 className="text-lg font-bold text-blue-700 mt-1">{alignmentVehicles.length} Due</h3>
              <p className="text-slate-400 mt-0.5">Alignment due-soon or overdue - click to {showAlignmentList ? 'hide' : 'view'}</p>
            </div>
            <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
              <CircleDot className="w-4 h-4" />
            </div>
          </div>
          {showAlignmentList && (
            <div className="mt-3 pt-3 border-t border-blue-100 space-y-1 max-h-40 overflow-y-auto">
              {alignmentVehicles.length === 0 ? (
                <p className="text-slate-400">Nothing due right now.</p>
              ) : alignmentVehicles.map((v, i) => (
                <div key={`${v.regNo}-${v.position}-${i}`} className="flex items-center justify-between font-mono">
                  <span className="font-bold text-slate-800">{v.regNo} <span className="text-slate-400 font-sans font-normal">({v.position})</span></span>
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

      <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit flex-wrap">
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
          performedBy={props.performedBy}
          records={props.records}
          onAddRecord={props.onAddRecord}
          onUpdateRecord={props.onUpdateRecord}
          onDeleteRecord={props.onDeleteRecord}
          vehicles={props.vehicles}
          drivers={props.drivers}
          mileageReports={props.mileageReports}
          vehicleServiceSchedules={props.vehicleServiceSchedules}
          serviceStations={props.serviceStations}
          onAddServiceStation={props.onAddServiceStation}
          onDeleteServiceStation={props.onDeleteServiceStation}
        />
      )}
      {moduleTab === 'schedule' && (
        <ServiceScheduleTab
          vehicles={props.vehicles}
          mileageReports={props.mileageReports}
          vehicleServiceSchedules={props.vehicleServiceSchedules}
          onSaveVehicleServiceSchedule={props.onSaveVehicleServiceSchedule}
          isSuperAdmin={props.isSuperAdmin}
        />
      )}
      {moduleTab === 'servicestation' && (
        <ServiceStationTab
          vehicles={props.vehicles}
          spareParts={props.serviceStationSpareParts}
          onSaveSparePart={props.onSaveServiceStationSparePart}
          onDeleteSparePart={props.onDeleteServiceStationSparePart}
          inspections={props.serviceStationInspections}
          onSaveInspection={props.onSaveServiceStationInspection}
          onDeleteInspection={props.onDeleteServiceStationInspection}
        />
      )}
      {moduleTab === 'tires' && (
        <TireAlignmentTab
          vehicles={props.vehicles}
          mileageReports={props.mileageReports}
          tireBrands={props.tireBrands}
          onAddTireBrand={props.onAddTireBrand}
          tireRecords={props.tireRecords}
          onSaveTireRecord={props.onSaveTireRecord}
          onDeleteTireRecord={props.onDeleteTireRecord}
        />
      )}
      {moduleTab === 'battery' && (
        <BatteryTab
          vehicles={props.vehicles}
          batteryRecords={props.batteryRecords}
          onSaveBatteryRecord={props.onSaveBatteryRecord}
          onDeleteBatteryRecord={props.onDeleteBatteryRecord}
        />
      )}
      {moduleTab === 'tools' && (
        <ToolsChecklistTab
          vehicles={props.vehicles}
          toolsChecklistRecords={props.toolsChecklistRecords}
          onSaveToolsChecklistRecord={props.onSaveToolsChecklistRecord}
          onDeleteToolsChecklistRecord={props.onDeleteToolsChecklistRecord}
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
