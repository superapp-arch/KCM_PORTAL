import React, { useState, useEffect } from 'react';
import {
  MaintenanceRecord,
  MaintenanceWorkItem,
  Vehicle,
  DriverEmployee,
  MileageReport,
  VehicleServiceSchedule,
  MaintenanceServiceStation,
  VehicleDocument
} from '../../types';
import {
  Plus, Search, CheckCircle2, AlertCircle, Settings, Edit2, Trash2, Paperclip, X, Filter
} from 'lucide-react';
import DocumentAttachment from '../DocumentAttachment';
import DateInput from '../DateInput';
import { latestOdometerFor, computeKmStatus, computeWarrantyStatus } from '../../utils/maintenanceDates';

interface ServiceLedgerTabProps {
  records: MaintenanceRecord[];
  onAddRecord: (record: Omit<MaintenanceRecord, 'id'>) => Promise<void>;
  onUpdateRecord: (id: string, record: Partial<MaintenanceRecord>) => Promise<void>;
  onDeleteRecord: (id: string) => Promise<void>;
  vehicles: Vehicle[];
  drivers: DriverEmployee[];
  mileageReports: MileageReport[];
  vehicleServiceSchedules: VehicleServiceSchedule[];
  serviceStations: MaintenanceServiceStation[];
  onAddServiceStation: (station: Omit<MaintenanceServiceStation, 'id'>) => Promise<void>;
  onDeleteServiceStation: (id: string) => Promise<void>;
}

const SERVICE_TYPES: MaintenanceRecord['serviceType'][] = [
  'Scheduled Servicing', 'Breakdown Repair', 'Parts Replacement', 'Electrical Repair', 'Tire Service', 'Battery Service', 'Tools Check'
];

export default function ServiceLedgerTab({
  records, onAddRecord, onUpdateRecord, onDeleteRecord,
  vehicles, drivers, mileageReports, vehicleServiceSchedules,
  serviceStations, onAddServiceStation, onDeleteServiceStation
}: ServiceLedgerTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | MaintenanceRecord['serviceType']>('All');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [regNo, setRegNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [serviceType, setServiceType] = useState<MaintenanceRecord['serviceType']>('Scheduled Servicing');
  const [serviceStationId, setServiceStationId] = useState('');
  const [garageName, setGarageName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverId, setDriverId] = useState('');
  const [workItems, setWorkItems] = useState<MaintenanceWorkItem[]>([{ description: '', cost: 0 }]);
  const [docs, setDocs] = useState<VehicleDocument[]>([]);
  const [showStationManager, setShowStationManager] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  const vehicleList = Array.from(new Set(vehicles.map(v => v.regNo || v['Reg. No.'] || '').filter(Boolean))).sort();
  const driverNameList = Array.from(new Set(drivers.map(d => d.name).filter(Boolean))).sort();

  const matchedDriver = (() => {
    const names = driverName.split('/').map(n => n.trim()).filter(Boolean);
    if (names.length !== 1) return undefined;
    const matches = drivers.filter(d => (d.name || '').trim().toLowerCase() === names[0].toLowerCase());
    return matches.length === 1 ? matches[0] : undefined;
  })();

  useEffect(() => {
    if (matchedDriver) setDriverId(matchedDriver.id);
  }, [matchedDriver]);

  const totalCost = workItems.reduce((s, w) => s + (w.cost || 0), 0);

  const addWorkItemRow = () => setWorkItems(items => [...items, { description: '', cost: 0 }]);
  const removeWorkItemRow = (idx: number) => setWorkItems(items => items.filter((_, i) => i !== idx));
  const updateWorkItem = (idx: number, patch: Partial<MaintenanceWorkItem>) =>
    setWorkItems(items => items.map((w, i) => i === idx ? { ...w, ...patch } : w));

  const resetForm = () => {
    setEditingId(null);
    setRegNo('');
    setDate(new Date().toISOString().slice(0, 10));
    setServiceType('Scheduled Servicing');
    setServiceStationId('');
    setGarageName('');
    setDriverName('');
    setDriverId('');
    setWorkItems([{ description: '', cost: 0 }]);
    setDocs([]);
    setShowStationManager(false);
    setNewStationName('');
    setShowSidebar(false);
  };

  const startEdit = (r: MaintenanceRecord) => {
    setEditingId(r.id);
    setRegNo(r.regNo);
    setDate(r.date);
    setServiceType(r.serviceType);
    setServiceStationId(r.serviceStationId || '');
    setGarageName(r.garageName || '');
    setDriverName(r.driverName || '');
    setDriverId(r.driverId || '');
    setWorkItems(r.workItems && r.workItems.length > 0 ? r.workItems : [{ description: r.description || '', cost: r.cost || 0 }]);
    setDocs(r.documents || []);
    setShowSidebar(true);
  };

  const handleAddStation = async () => {
    if (!newStationName.trim()) return;
    try {
      await onAddServiceStation({ name: newStationName.trim() });
      setNewStationName('');
      triggerNotif('Service station saved.');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save service station.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = workItems.filter(w => w.description.trim() || w.cost);
    if (!regNo.trim() || !(serviceStationId || garageName.trim()) || validItems.length === 0) {
      triggerNotif('Please fill Vehicle, Service Station, and at least one work item.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const station = serviceStations.find(s => s.id === serviceStationId);
      const payload = {
        regNo: regNo.trim().toUpperCase(),
        date,
        serviceType,
        serviceStationId: serviceStationId || undefined,
        garageName: station?.name || garageName.trim(),
        driverName: driverName.trim() || undefined,
        driverId: driverId.trim() || undefined,
        workItems: validItems,
        description: validItems.map(w => w.description).filter(Boolean).join('; '),
        cost: validItems.reduce((s, w) => s + (w.cost || 0), 0),
        documents: docs
      };
      if (editingId) {
        await onUpdateRecord(editingId, payload);
        triggerNotif('✏️ Maintenance record updated successfully!');
      } else {
        await onAddRecord(payload);
        triggerNotif('🔧 Maintenance report published and archived in active logs!');
      }
      resetForm();
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save maintenance record.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (r: MaintenanceRecord) => {
    if (!confirm(`Delete maintenance entry for vehicle ${r.regNo}? This action is irreversible.`)) return;
    try {
      await onDeleteRecord(r.id);
      triggerNotif('🗑️ Maintenance log successfully deleted from server.');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete maintenance log.', 'error');
    }
  };

  const filteredRecords = records.filter(r =>
    (typeFilter === 'All' || r.serviceType === typeFilter) &&
    ((r?.regNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r?.garageName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r?.driverName || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalCostAll = records.reduce((sum, r) => sum + (r.cost || 0), 0);
  const totalBreakdowns = records.filter(r => r.serviceType === 'Breakdown Repair').length;

  // Warranty + due-status badge per vehicle - computed from that vehicle's
  // Service Schedule plus its live Fuel Management odometer (see
  // src/utils/maintenanceDates.ts - Maintenance.tsx's own Scheduled Vehicles
  // widget uses this exact same math).
  const dueStatusFor = (regNoVal: string) => {
    const schedule = vehicleServiceSchedules.find(s => s.regNo === regNoVal);
    if (!schedule || schedule.lastServiceKm == null) return null;
    const currentKm = latestOdometerFor(regNoVal, mileageReports);
    if (currentKm == null) return null;
    const remaining = (schedule.lastServiceKm + (schedule.serviceIntervalKm || 10000)) - currentKm;
    const status = computeKmStatus(remaining);
    if (!status) return null;
    const vehicle = vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNoVal.trim().toUpperCase());
    const warranty = computeWarrantyStatus(schedule.warrantyStatus, currentKm, vehicle?.regDate || vehicle?.['Reg Date'] || '');
    return { warranty, status };
  };

  return (
    <div className="space-y-4">
      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {notif.message}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider">Total Garage Expended</p>
          <h3 className="text-lg font-bold text-slate-800 mt-1">₹{totalCostAll.toLocaleString('en-IN')}</h3>
          <p className="text-slate-400 mt-0.5">{records.length} total work orders</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-rose-600 uppercase tracking-wider">Breakdown Repairs Logged</p>
          <h3 className="text-lg font-bold text-rose-700 mt-1">{totalBreakdowns} Incidents</h3>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Settings className="w-4 h-4 text-slate-600" /> Garage Work Orders Ledger
          </h2>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-40">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
              <input
                type="text" placeholder="Search Reg No, station, driver" value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 text-[11px] focus:outline-none text-slate-800 font-semibold"
              />
            </div>
            <div className="relative flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700">
                <option value="All">All Types</option>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button
              onClick={() => { resetForm(); setShowSidebar(true); }}
              className="bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Add Entry
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Reg. No.</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Service Station</th>
                <th className="px-3 py-2.5">Driver</th>
                <th className="px-3 py-2.5">Work Items</th>
                <th className="px-3 py-2.5 text-right">Total Cost</th>
                <th className="px-3 py-2.5 text-center">Docs</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRecords.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-slate-400 font-mono">NO FLEET GARAGE ENTRIES FOUND.</td></tr>
              ) : (
                filteredRecords.map((r) => {
                  const due = dueStatusFor(r.regNo);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors align-top">
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{r.regNo}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {due ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase w-fit ${due.warranty === 'InWarranty' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-500 border border-slate-300'}`}>
                              {due.warranty === 'InWarranty' ? 'In Warranty' : 'Out of Warranty'}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase w-fit ${
                              due.status === 'overdue' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              due.status === 'due-soon' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {due.status === 'ok' ? 'OK' : due.status}
                            </span>
                          </div>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          r.serviceType === 'Breakdown Repair' ? 'bg-red-50 text-red-700 border border-red-100' :
                          r.serviceType === 'Parts Replacement' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          r.serviceType === 'Electrical Repair' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                          'bg-teal-50 text-teal-700 border border-teal-100'
                        }`}>
                          {r.serviceType}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800 truncate max-w-[120px]">{r.garageName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.driverName ? <>{r.driverName} {r.driverId && <span className="text-slate-400 font-mono text-[10px]">({r.driverId})</span>}</> : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 max-w-[180px]">
                        {r.workItems && r.workItems.length > 0 ? (
                          <ul className="space-y-0.5">
                            {r.workItems.map((w, i) => (
                              <li key={i} className="flex justify-between gap-2 text-[10.5px]">
                                <span className="truncate">{w.description || '-'}</span>
                                <span className="font-mono text-slate-600 shrink-0">₹{(w.cost || 0).toLocaleString('en-IN')}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (r.description || '-')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">₹{(r.cost || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 text-center">
                        {r.documents && r.documents.length > 0 ? (
                          <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
                            <Paperclip className="w-2.5 h-2.5 mr-0.5" />{r.documents.length}
                          </span>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1">
                          <button onClick={() => startEdit(r)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(r)} className="p-1 text-slate-400 hover:text-pink-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Sidebar */}
      {showSidebar && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end z-50">
          <div className="absolute inset-0" onClick={resetForm} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Settings className="w-4 h-4 text-blue-400" /> {editingId ? 'Edit Work Order' : 'Issue Garage Work Order'}</h3>
              <button onClick={resetForm} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 text-xs">
              <form id="maintenance-entry-form" onSubmit={handleSubmit} className="space-y-3.5" autoComplete="off">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Vehicle Registration Number *</label>
                  <input type="text" required list="maintenance-vehicles-datalist" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} placeholder="e.g. KA53AA0069" autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider text-slate-800 uppercase focus:outline-none focus:ring-1 focus:ring-slate-500" />
                  <datalist id="maintenance-vehicles-datalist">{vehicleList.map(v => <option key={v} value={v} />)}</datalist>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Date of Work Order</label>
                    <DateInput required value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Maintenance Scope</label>
                    <select value={serviceType} onChange={(e) => setServiceType(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
                      {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Service Station - dropdown from master, with inline mini-manager to add a new one */}
                <div>
                  <label className="block font-semibold text-slate-600 mb-1 flex items-center justify-between">
                    Authorised Service Station *
                    <button type="button" onClick={() => setShowStationManager(s => !s)} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer">
                      {showStationManager ? 'Hide' : 'Add New'}
                    </button>
                  </label>
                  <select
                    required={serviceStations.length > 0}
                    value={serviceStationId}
                    onChange={(e) => setServiceStationId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold"
                  >
                    <option value="">Select station...</option>
                    {serviceStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {serviceStations.length === 0 && !serviceStationId && (
                    <input type="text" placeholder="No stations yet - type a name (will auto-add)" value={garageName} onChange={(e) => setGarageName(e.target.value)}
                      className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
                  )}
                  {showStationManager && (
                    <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex gap-2">
                      <input type="text" placeholder="New station name" value={newStationName} onChange={(e) => setNewStationName(e.target.value)} autoComplete="off"
                        className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-800" />
                      <button type="button" onClick={handleAddStation} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-3 text-[10px] font-bold uppercase cursor-pointer">Save</button>
                    </div>
                  )}
                </div>

                {/* Driver Name / Driver ID - item 7 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Driver Name</label>
                    <input type="text" list="maintenance-driver-names-datalist" value={driverName} onChange={(e) => setDriverName(e.target.value)} autoComplete="off" placeholder="Who was driving"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold" />
                    <datalist id="maintenance-driver-names-datalist">{driverNameList.map((n, i) => <option key={i} value={n} />)}</datalist>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Driver ID</label>
                    <input type="text" value={driverId} onChange={(e) => setDriverId(e.target.value)} autoComplete="off" placeholder="Auto-fetched or manual"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                </div>

                {/* Work Items - per-item cost tracking (item 10) */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Work Items *</span>
                    <button type="button" onClick={addWorkItemRow} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer">+ Add Item</button>
                  </div>
                  {workItems.map((w, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input type="text" placeholder="e.g. Oil change, brake pads" value={w.description} onChange={(e) => updateWorkItem(idx, { description: e.target.value })} autoComplete="off"
                        className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-800" />
                      <input type="number" step="0.01" placeholder="₹" value={w.cost || ''} onChange={(e) => updateWorkItem(idx, { cost: parseFloat(e.target.value) || 0 })}
                        className="w-24 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-mono font-bold text-slate-800" />
                      {workItems.length > 1 && (
                        <button type="button" onClick={() => removeWorkItemRow(idx)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-mono">
                    <span className="text-[9px] text-slate-400 uppercase font-bold">Total Cost</span>
                    <span className="text-sm font-black text-slate-800">₹{totalCost.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <DocumentAttachment documents={docs} onChange={setDocs} label="Attach Workshop Bills / Warranty Invoices" />
              </form>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
              <button type="button" onClick={resetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">Cancel</button>
              <button type="submit" form="maintenance-entry-form" disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
                {isSubmitting ? 'Saving...' : editingId ? 'Save Changes' : 'Authorize Garage Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
