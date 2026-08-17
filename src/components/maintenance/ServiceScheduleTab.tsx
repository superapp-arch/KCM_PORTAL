import React, { useState } from 'react';
import { Vehicle, VehicleServiceSchedule, MileageReport } from '../../types';
import { CalendarClock, Search, Edit2, X, ShieldCheck, Gauge, CheckCircle2, AlertCircle, Bell, Droplets, History } from 'lucide-react';
import DateInput from '../DateInput';
import SortHeader from '../SortHeader';
import { SortState } from '../../utils/sort';
import { latestOdometerFor, computeKmStatus, computeWarrantyStatus, KmStatus } from '../../utils/maintenanceDates';
import { VEHICLE_CATEGORIES, matchVehicleCategoryOption, cycleDefaultFor } from '../../utils/vehicleCycleDefaults';

interface ServiceScheduleTabProps {
  vehicles: Vehicle[];
  mileageReports: MileageReport[];
  vehicleServiceSchedules: VehicleServiceSchedule[];
  onSaveVehicleServiceSchedule: (schedule: VehicleServiceSchedule) => Promise<void>;
}

const regDateOf = (v: Vehicle) => v.regDate || v['Reg Date'] || '';
const categoryOf = (v: Vehicle | undefined) => String(v?.Category || v?.category || '').trim().toLowerCase();

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  dry: 'bg-amber-50 text-amber-800 border-amber-300',
  hybrid: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  walkes: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300',
  reefer: 'bg-cyan-50 text-cyan-800 border-cyan-300',
};

// Fixed calendar-day cycle status (Service Due for Reefer/Hybrid, Washing Due
// for Walkes) - separate from the km-based statusBadge below, which is a
// different system (Service Interval km). Dry-category vehicles have no
// cycle here at all - they only ever show the km-based status. Reads its
// cycle length/reminder days off the schedule itself (schedule.cycleDays /
// reminderDays), falling back to that category's fixed default
// (VEHICLE_CYCLE_DEFAULTS) when the vehicle hasn't been given its own
// override yet - the exact same resolution order server.ts's
// calculateServiceWashingReminders uses, so this badge and the actual
// emailed milestones can never disagree. Also doubles as the edit form's
// live "Next Due Date" preview, called with the in-progress form state.
interface CycleAlert { label: string; dueDate: string; daysRemaining: number; status: KmStatus; cycleDays: number; reminderDays: number[] }
function computeCycleAlert(schedule: VehicleServiceSchedule | undefined, category: string): CycleAlert | null {
  if (!schedule) return null;
  const def = cycleDefaultFor(category);
  if (!def) return null;
  const anchor = def.dateField === 'lastServiceDate' ? schedule.lastServiceDate : schedule.lastWashingDate;
  if (!anchor) return null;

  const cycleDays = schedule.cycleDays ?? def.cycleDays;
  const reminderDays = schedule.reminderDays ?? def.reminderDays;

  const [y, m, d] = anchor.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  due.setDate(due.getDate() + cycleDays);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysRemaining = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  return { label: def.alertType, dueDate: due.toISOString().slice(0, 10), daysRemaining, status: cycleStatus(daysRemaining), cycleDays, reminderDays };
}
// Reuses the earliest (largest) configured reminder threshold as the
// "due-soon" boundary, so the badge's colour always agrees with whenever the
// first reminder email actually goes out.
function cycleStatus(daysRemaining: number): KmStatus {
  if (daysRemaining <= 0) return 'overdue';
  if (daysRemaining <= 15) return 'due-soon';
  return 'ok';
}

const emptySchedule = (regNo: string): VehicleServiceSchedule => ({
  id: regNo,
  regNo,
  serviceIntervalKm: 10000,
  warrantyStatus: 'InWarranty'
});

const statusBadge = (status: KmStatus | null) => {
  if (!status) return <span className="text-slate-300">-</span>;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
      status === 'overdue' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
      status === 'due-soon' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
      'bg-emerald-50 text-emerald-700 border border-emerald-200'
    }`}>
      {status === 'ok' ? 'OK' : status}
    </span>
  );
};

// Parses a comma-separated "15, 7, 3" input into a sorted-descending number
// array - the order reminders are meant to fire in.
const parseDaysList = (raw: string): number[] =>
  raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0).sort((a, b) => b - a);

export default function ServiceScheduleTab({
  vehicles, mileageReports, vehicleServiceSchedules, onSaveVehicleServiceSchedule
}: ServiceScheduleTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRegNo, setEditingRegNo] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleServiceSchedule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // No default sort (null) - this is a per-vehicle master list, not a
  // chronological ledger, so it keeps its original alphabetical-by-Reg-No
  // order until the user actively picks Last Service Newest/Oldest.
  const [sort, setSort] = useState<SortState | null>(null);
  const handleSort = (key: string, direction: SortState['direction']) => setSort({ key, direction });

  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => { setNotif({ message, type }); setTimeout(() => setNotif(null), 4000); };

  const vehicleList = Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort();
  const filteredVehiclesUnsorted = vehicleList.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()));

  const scheduleFor = (regNo: string) => vehicleServiceSchedules.find(s => s.regNo === regNo);
  const vehicleFor = (regNo: string) => vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo);

  const filteredVehicles = sort
    ? [...filteredVehiclesUnsorted].sort((a, b) => {
        let cmp = 0;
        switch (sort.key) {
          case 'lastServiceDate': {
            const da = scheduleFor(a)?.lastServiceDate || '';
            const db = scheduleFor(b)?.lastServiceDate || '';
            cmp = da === db ? a.localeCompare(b) : (da < db ? -1 : 1);
            break;
          }
          default: cmp = a.localeCompare(b);
        }
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredVehiclesUnsorted;

  // Auto-fills a not-yet-overridden schedule's Cycle (days) / Reminder Days
  // from its vehicle's actual category default (see cycleDefaultFor) - still
  // freely editable below, and only becomes a real per-vehicle override once
  // the form is actually saved.
  const openEdit = (regNo: string) => {
    const existing = scheduleFor(regNo) || emptySchedule(regNo);
    const def = cycleDefaultFor(categoryOf(vehicleFor(regNo)));
    setEditingRegNo(regNo);
    setForm({
      ...existing,
      cycleDays: existing.cycleDays ?? def?.cycleDays,
      reminderDays: existing.reminderDays ?? def?.reminderDays,
    });
  };
  const closeEdit = () => { setEditingRegNo(null); setForm(null); };

  const handleSave = async () => {
    if (!form) return;
    setIsSubmitting(true);
    try {
      // Changes apply going forward only - already-sent reminders for the
      // current cycle aren't re-sent (dedup lives server-side, keyed off the
      // old cycleStartDate, so a genuinely new Last Service/Washing Date
      // always starts a fresh reminder cycle). Before overwriting either
      // date, snapshot the value being replaced into that field's history so
      // past service/washing dates stay visible on the vehicle's record.
      const original = scheduleFor(form.regNo);
      let toSave: VehicleServiceSchedule = { ...form, id: form.regNo };
      if (original?.lastServiceDate && original.lastServiceDate !== form.lastServiceDate) {
        toSave.serviceHistory = [{ date: original.lastServiceDate, km: original.lastServiceKm }, ...(toSave.serviceHistory || [])].slice(0, 10);
      }
      if (original?.lastWashingDate && original.lastWashingDate !== form.lastWashingDate) {
        toSave.washingHistory = [{ date: original.lastWashingDate }, ...(toSave.washingHistory || [])].slice(0, 10);
      }
      await onSaveVehicleServiceSchedule(toSave);
      triggerNotif(`Service schedule saved for ${form.regNo}.`);
      closeEdit();
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save service schedule.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {notif.message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4 text-slate-600" /> Vehicle Service Schedule
          </h2>
          <div className="relative w-48 text-xs">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
            <input type="text" placeholder="Search Reg No" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5"><SortHeader label="Reg. No." sortKey="regNo" sort={sort} onSort={handleSort} /></th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Warranty</th>
                <th className="px-3 py-2.5 text-right">Current Odometer</th>
                <th className="px-3 py-2.5"><SortHeader label="Last Service" sortKey="lastServiceDate" sort={sort} onSort={handleSort} type="numeric" /></th>
                <th className="px-3 py-2.5 text-right">Interval (km)</th>
                <th className="px-3 py-2.5 text-right">Next Due (km)</th>
                <th className="px-3 py-2.5 text-right">Remaining</th>
                <th className="px-3 py-2.5">Service Status</th>
                <th className="px-3 py-2.5">Cycle Alert</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredVehicles.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-slate-400 font-mono">NO VEHICLES FOUND.</td></tr>
              ) : filteredVehicles.map(regNo => {
                const schedule = scheduleFor(regNo);
                const currentKm = latestOdometerFor(regNo, mileageReports);
                const nextDueKm = schedule?.lastServiceKm != null ? schedule.lastServiceKm + (schedule.serviceIntervalKm || 10000) : undefined;
                const remaining = nextDueKm != null && currentKm != null ? nextDueKm - currentKm : undefined;
                const status = computeKmStatus(remaining);
                const effectiveWarranty = schedule
                  ? computeWarrantyStatus(schedule.warrantyStatus, currentKm, regDateOf(vehicleFor(regNo) || {}))
                  : null;
                const category = categoryOf(vehicleFor(regNo));
                const cycleAlert = computeCycleAlert(schedule, category);
                return (
                  <tr key={regNo} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{regNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {category ? (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${CATEGORY_BADGE_CLASS[category] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                          {matchVehicleCategoryOption(category)}
                        </span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {effectiveWarranty ? (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${effectiveWarranty === 'InWarranty' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-500 border border-slate-300'}`}>
                          {effectiveWarranty === 'InWarranty' ? 'In Warranty' : 'Out of Warranty'}
                        </span>
                      ) : <span className="text-slate-300">Not set</span>}
                      {schedule && schedule.warrantyStatus === 'InWarranty' && effectiveWarranty === 'OutOfWarranty' && (
                        <div className="text-[9px] text-amber-600 font-mono mt-0.5">Auto-expired (km/age)</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{currentKm != null ? currentKm.toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {schedule?.lastServiceDate || '-'} {schedule?.lastServiceKm != null && <span className="text-slate-400">({schedule.lastServiceKm.toLocaleString('en-IN')} km)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{(schedule?.serviceIntervalKm ?? 10000).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{nextDueKm != null ? nextDueKm.toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{remaining != null ? remaining.toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2.5">{statusBadge(status)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {cycleAlert ? (
                        <div className="flex flex-col gap-0.5">
                          {statusBadge(cycleAlert.status)}
                          <span className="text-[9px] text-slate-400 font-mono">{cycleAlert.label} {cycleAlert.dueDate} ({cycleAlert.daysRemaining}d)</span>
                        </div>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => openEdit(regNo)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit schedule"><Edit2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 font-mono mt-3 flex items-center gap-1"><Gauge className="w-3 h-3" /> Current Odometer is always read live from Fuel Management's latest Closing KM - never entered manually here.</p>
      </div>

      {editingRegNo && form && (() => {
        const category = categoryOf(vehicleFor(editingRegNo));
        const vehicleTypeOption = matchVehicleCategoryOption(category);
        const def = cycleDefaultFor(category);
        const previewAlert = computeCycleAlert(form, category);
        return (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between sticky top-0 z-10">
                <h3 className="font-extrabold text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4 text-blue-400" /> Service Schedule - {editingRegNo}</h3>
                <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Vehicle Type</label>
                  <select value={vehicleTypeOption} disabled className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 text-slate-600 font-semibold cursor-not-allowed">
                    {VEHICLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">Set from this vehicle's Category in Fleet &amp; Vehicles - edit it there to change the type, cycle default, and reminders below.</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Last Service</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Date</label>
                      <DateInput value={form.lastServiceDate || ''} onChange={(e) => setForm(f => f && ({ ...f, lastServiceDate: e.target.value }))} max={new Date().toISOString().slice(0, 10)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Odometer (km)</label>
                      <input type="number" value={form.lastServiceKm ?? ''} onChange={(e) => setForm(f => f && ({ ...f, lastServiceKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                    </div>
                  </div>
                  {form.serviceHistory && form.serviceHistory.length > 0 && (
                    <p className="text-[9px] text-slate-400 font-mono flex items-start gap-1"><History className="w-3 h-3 shrink-0 mt-0.5" /> Previous: {form.serviceHistory.slice(0, 5).map(h => `${h.date}${h.km != null ? ` (${h.km.toLocaleString('en-IN')} km)` : ''}`).join(', ')}</p>
                  )}
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Service Interval (km)</label>
                    <input type="number" value={form.serviceIntervalKm} onChange={(e) => setForm(f => f && ({ ...f, serviceIntervalKm: parseInt(e.target.value) || 10000 }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">Default 10,000 km. Service Status: &gt;3000 km remaining = OK, 0-3000 = Due Soon, &le;0 = Overdue.</p>
                  </div>
                </div>

                {/* Service Due (Reefer/Hybrid) / Washing Due (Walkes) fixed
                    calendar-day cycle - only shown for categories that
                    actually get this alert (Dry keeps only the km-based
                    system above). Cycle (days) and Reminder Days are
                    per-vehicle overrides here, auto-filled from this
                    category's default when the form opened but still fully
                    editable. */}
                {def && (
                  <div className={`p-3 rounded-xl border space-y-2 ${def.alertType === 'Service Due' ? 'bg-blue-50 border-blue-200' : 'bg-cyan-50 border-cyan-200'}`}>
                    <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${def.alertType === 'Service Due' ? 'text-blue-700' : 'text-cyan-700'}`}>
                      {def.alertType === 'Service Due' ? <Bell className="w-3.5 h-3.5" /> : <Droplets className="w-3.5 h-3.5" />} {def.alertType} Reminders
                    </span>

                    {def.dateField === 'lastWashingDate' && (
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Last Washing Date</label>
                        <DateInput value={form.lastWashingDate || ''} onChange={(e) => setForm(f => f && ({ ...f, lastWashingDate: e.target.value }))} max={new Date().toISOString().slice(0, 10)} className="w-full bg-white border border-cyan-200 rounded-lg p-2 font-mono text-slate-800" />
                        {form.washingHistory && form.washingHistory.length > 0 && (
                          <p className="text-[9px] text-slate-400 font-mono mt-1 flex items-start gap-1"><History className="w-3 h-3 shrink-0 mt-0.5" /> Previous: {form.washingHistory.slice(0, 5).map(h => h.date).join(', ')}</p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Cycle (days)</label>
                        <input type="number" value={form.cycleDays ?? ''} onChange={(e) => setForm(f => f && ({ ...f, cycleDays: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{vehicleTypeOption} default: {def.cycleDays} days.</p>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Reminder Days Before Due</label>
                        <input type="text" value={(form.reminderDays ?? []).join(', ')} onChange={(e) => setForm(f => f && ({ ...f, reminderDays: parseDaysList(e.target.value) }))}
                          placeholder={def.reminderDays.join(', ')} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">Default: {def.reminderDays.join('/')}.</p>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-white/60 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Next Due Date</span>
                      {previewAlert ? (
                        <span className="flex items-center gap-1.5 font-mono text-slate-700">
                          {previewAlert.dueDate} <span className="text-slate-400">({previewAlert.daysRemaining}d)</span> {statusBadge(previewAlert.status)}
                        </span>
                      ) : <span className="text-slate-300">Set the date above</span>}
                    </div>
                    <p className="text-[9px] text-slate-400 font-mono">Auto-calculated as Last {def.dateField === 'lastWashingDate' ? 'Washing' : 'Service'} Date + Cycle (days). Changes apply going forward only - reminders already sent for the current cycle aren't re-sent.</p>
                  </div>
                )}

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Warranty</span>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Status</label>
                    <select value={form.warrantyStatus} onChange={(e) => setForm(f => f && ({ ...f, warrantyStatus: e.target.value as any }))} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
                      <option value="InWarranty">In Warranty</option>
                      <option value="OutOfWarranty">Out of Warranty</option>
                    </select>
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                      Auto-forced to Out of Warranty once the vehicle crosses 3,00,000 km or 3 years from its Fleet &amp; Vehicles Registration Date, whichever first - this only ever floors towards Out of Warranty, it never auto-reverts a manual Out of Warranty back.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Warranty Expiry Date</label>
                      <DateInput value={form.warrantyExpiryDate || ''} onChange={(e) => setForm(f => f && ({ ...f, warrantyExpiryDate: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Warranty Expiry (km)</label>
                      <input type="number" value={form.warrantyExpiryKm ?? ''} onChange={(e) => setForm(f => f && ({ ...f, warrantyExpiryKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Remarks</label>
                  <textarea value={form.remarks || ''} onChange={(e) => setForm(f => f && ({ ...f, remarks: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 text-slate-800" />
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 sticky bottom-0">
                <button type="button" onClick={closeEdit} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="button" onClick={handleSave} disabled={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
                  {isSubmitting ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
