import React, { useState } from 'react';
import { Vehicle, VehicleServiceSchedule, MileageReport } from '../../types';
import {
  CalendarClock, Search, Edit2, X, ShieldCheck, CheckCircle2, AlertCircle, Bell, Droplets,
  Snowflake, History, ClipboardList
} from 'lucide-react';
import DateInput from '../DateInput';
import SortHeader from '../SortHeader';
import { SortState } from '../../utils/sort';
import { latestOdometerFor, computeWarrantyStatus } from '../../utils/maintenanceDates';
import {
  VEHICLE_CATEGORIES, matchVehicleCategoryOption,
  WASHING_CYCLE_DAYS, WASHING_CATEGORIES, isWashingEligible,
  AC_SERVICE_CYCLE_DAYS, AC_SERVICE_CATEGORIES, isAcServiceEligible,
  REMINDER_DAYS_BEFORE_DUE
} from '../../utils/vehicleCycleDefaults';

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

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dt;
};

// Next Due = lastDate + cycleDays, defaulting to TODAY as the anchor when no
// last date has ever been recorded yet - so a never-serviced vehicle still
// shows a live Next Due/Remaining Days Left preview instead of a blank dash.
// reminderDate = Next Due - REMINDER_DAYS_BEFORE_DUE, the exact date the
// server's reminder email fires on (see server.ts's own identical math).
interface CycleInfo { nextDueDate: string; remainingDays: number; reminderDate: string; isDefaulted: boolean }
function computeCycleInfo(lastDateIso: string | undefined, cycleDays: number): CycleInfo {
  const anchor = lastDateIso || todayIso();
  const due = addDays(anchor, cycleDays);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const remainingDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const reminder = new Date(due);
  reminder.setDate(reminder.getDate() - REMINDER_DAYS_BEFORE_DUE);
  return {
    nextDueDate: due.toISOString().slice(0, 10),
    remainingDays,
    reminderDate: reminder.toISOString().slice(0, 10),
    isDefaulted: !lastDateIso
  };
}

const remainingDaysColor = (remainingDays: number) =>
  remainingDays <= 0 ? 'text-rose-600' : remainingDays <= REMINDER_DAYS_BEFORE_DUE ? 'text-amber-600' : 'text-emerald-600';

const statusBadge = (status: 'Completed' | 'Pending' | undefined) => (
  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
    status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
  }`}>
    {status === 'Completed' ? 'Completed' : 'Pending'}
  </span>
);

const emptySchedule = (regNo: string): VehicleServiceSchedule => ({
  id: regNo,
  regNo,
  serviceIntervalKm: 10000,
  warrantyStatus: 'InWarranty'
});

// ---------------------------------------------------------------------------
// Tab 1: Vehicle Service Schedule - the general per-vehicle record (Warranty,
// Last Service, a manual Completed/Pending status, Remarks). No more km-based
// Cycle Alert here - Washing and AC Service below are the two real fixed-
// cycle registers now. Last Service KM/Service Interval (km) stay editable
// (not shown as their own columns anymore, but Service Ledger and Service
// Invoice generation both still read them for their own km-remaining
// alert/"next service due" note - removing them would silently break those).
function VehicleScheduleTable({
  vehicles, mileageReports, vehicleServiceSchedules, onSave, triggerNotif
}: {
  vehicles: Vehicle[]; mileageReports: MileageReport[]; vehicleServiceSchedules: VehicleServiceSchedule[];
  onSave: (s: VehicleServiceSchedule) => Promise<void>; triggerNotif: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [editingRegNo, setEditingRegNo] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleServiceSchedule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);
  const handleSort = (key: string, direction: SortState['direction']) => setSort({ key, direction });

  const vehicleList = Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort();
  const scheduleFor = (regNo: string) => vehicleServiceSchedules.find(s => s.regNo === regNo);
  const vehicleFor = (regNo: string) => vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo);

  const filteredUnsorted = vehicleList.filter(regNo => {
    const matchesSearch = regNo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || matchVehicleCategoryOption(categoryOf(vehicleFor(regNo))) === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const filtered = sort
    ? [...filteredUnsorted].sort((a, b) => {
        let cmp = 0;
        if (sort.key === 'lastServiceDate') {
          const da = scheduleFor(a)?.lastServiceDate || '';
          const db = scheduleFor(b)?.lastServiceDate || '';
          cmp = da === db ? a.localeCompare(b) : (da < db ? -1 : 1);
        } else cmp = a.localeCompare(b);
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredUnsorted;

  const openEdit = (regNo: string) => {
    setEditingRegNo(regNo);
    setForm(scheduleFor(regNo) || emptySchedule(regNo));
  };
  const closeEdit = () => { setEditingRegNo(null); setForm(null); };

  const handleSave = async () => {
    if (!form) return;
    setIsSubmitting(true);
    try {
      const original = scheduleFor(form.regNo);
      let toSave: VehicleServiceSchedule = { ...form, id: form.regNo };
      if (original?.lastServiceDate && original.lastServiceDate !== form.lastServiceDate) {
        toSave.serviceHistory = [{ date: original.lastServiceDate, km: original.lastServiceKm }, ...(toSave.serviceHistory || [])].slice(0, 10);
      }
      await onSave(toSave);
      triggerNotif(`Service schedule saved for ${form.regNo}.`);
      closeEdit();
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to save service schedule.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-slate-600" /> Vehicle Service Schedule
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Category filter - matches Fleet & Vehicles exactly (same
              VEHICLE_CATEGORIES source, no separate hardcoded list). */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            title="Filter by Category"
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700"
          >
            <option value="All">All Categories</option>
            {VEHICLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative w-48 text-xs">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
            <input type="text" placeholder="Search Reg No" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
            <tr>
              <th className="px-3 py-2.5"><SortHeader label="Reg. No." sortKey="regNo" sort={sort} onSort={handleSort} /></th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Warranty</th>
              <th className="px-3 py-2.5"><SortHeader label="Last Service" sortKey="lastServiceDate" sort={sort} onSort={handleSort} type="numeric" /></th>
              <th className="px-3 py-2.5">Service Status</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400 font-mono">NO VEHICLES FOUND.</td></tr>
            ) : filtered.map(regNo => {
              const schedule = scheduleFor(regNo);
              const currentKm = latestOdometerFor(regNo, mileageReports);
              const effectiveWarranty = schedule
                ? computeWarrantyStatus(schedule.warrantyStatus, currentKm, regDateOf(vehicleFor(regNo) || {}))
                : null;
              const category = categoryOf(vehicleFor(regNo));
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
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{schedule?.lastServiceDate || '-'}</td>
                  <td className="px-3 py-2.5">{schedule ? statusBadge(schedule.serviceStatus) : <span className="text-slate-300">-</span>}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => openEdit(regNo)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit schedule"><Edit2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingRegNo && form && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4 text-blue-400" /> Service Schedule - {editingRegNo}</h3>
              <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Last Service</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Date</label>
                    <DateInput value={form.lastServiceDate || ''} onChange={(e) => setForm(f => f && ({ ...f, lastServiceDate: e.target.value }))} max={todayIso()} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
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
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">Default 10,000 km. Used by Service Ledger's km-remaining alert and Service Invoice's "next service due" note - not shown as a column here anymore.</p>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Service Status</label>
                <select value={form.serviceStatus || 'Pending'} onChange={(e) => setForm(f => f && ({ ...f, serviceStatus: e.target.value as 'Completed' | 'Pending' }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

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
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs 2 & 3: Washing and AC Service - structurally identical fixed-cycle
// registers (only the cycle length, category scope, and field names differ),
// so both share this one component keyed by `kind`.
interface CycleTabConfig {
  label: string;
  dateLabel: string;
  dateField: 'lastWashingDate' | 'lastAcServiceDate';
  statusField: 'washingStatus' | 'acServiceStatus';
  historyField: 'washingHistory' | 'acServiceHistory';
  cycleDays: number;
  categories: readonly string[];
  isEligible: (category: string | undefined | null) => boolean;
  icon: React.ComponentType<{ className?: string }>;
}
const CYCLE_TAB_CONFIG: Record<'washing' | 'acservice', CycleTabConfig> = {
  washing: {
    label: 'Washing', dateLabel: 'Last Washing Date', dateField: 'lastWashingDate',
    statusField: 'washingStatus', historyField: 'washingHistory',
    cycleDays: WASHING_CYCLE_DAYS, categories: WASHING_CATEGORIES, isEligible: isWashingEligible, icon: Droplets
  },
  acservice: {
    label: 'AC Service', dateLabel: 'Last Service Date', dateField: 'lastAcServiceDate',
    statusField: 'acServiceStatus', historyField: 'acServiceHistory',
    cycleDays: AC_SERVICE_CYCLE_DAYS, categories: AC_SERVICE_CATEGORIES, isEligible: isAcServiceEligible, icon: Snowflake
  }
};

function CycleTable({
  kind, vehicles, vehicleServiceSchedules, onSave, triggerNotif
}: {
  kind: 'washing' | 'acservice'; vehicles: Vehicle[]; vehicleServiceSchedules: VehicleServiceSchedule[];
  onSave: (s: VehicleServiceSchedule) => Promise<void>; triggerNotif: (msg: string, type?: 'success' | 'error') => void;
}) {
  const cfg = CYCLE_TAB_CONFIG[kind];
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [editingRegNo, setEditingRegNo] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleServiceSchedule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);
  const handleSort = (key: string, direction: SortState['direction']) => setSort({ key, direction });

  const vehicleFor = (regNo: string) => vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo);
  const scheduleFor = (regNo: string) => vehicleServiceSchedules.find(s => s.regNo === regNo);

  // Only vehicles whose Fleet & Vehicles category is eligible for this tab
  // ever appear here at all - the Category filter below only narrows
  // further within that already-scoped set (e.g. Washing never shows Dry).
  const eligibleVehicleList = Array.from(new Set(
    vehicles.filter(v => cfg.isEligible(categoryOf(v))).map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean)
  )).sort();

  const filteredUnsorted = eligibleVehicleList.filter(regNo => {
    const matchesSearch = regNo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || matchVehicleCategoryOption(categoryOf(vehicleFor(regNo))) === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const filtered = sort
    ? [...filteredUnsorted].sort((a, b) => {
        let cmp = 0;
        if (sort.key === 'lastDate') {
          const da = scheduleFor(a)?.[cfg.dateField] || '';
          const db = scheduleFor(b)?.[cfg.dateField] || '';
          cmp = da === db ? a.localeCompare(b) : (da < db ? -1 : 1);
        } else cmp = a.localeCompare(b);
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredUnsorted;

  const openEdit = (regNo: string) => {
    setEditingRegNo(regNo);
    setForm(scheduleFor(regNo) || emptySchedule(regNo));
  };
  const closeEdit = () => { setEditingRegNo(null); setForm(null); };

  const handleSave = async () => {
    if (!form) return;
    setIsSubmitting(true);
    try {
      const original = scheduleFor(form.regNo);
      let toSave: VehicleServiceSchedule = { ...form, id: form.regNo };
      const originalDate = original?.[cfg.dateField];
      const newDate = form[cfg.dateField];
      if (originalDate && originalDate !== newDate) {
        const history = [{ date: originalDate }, ...((toSave[cfg.historyField] as { date: string }[] | undefined) || [])].slice(0, 10);
        (toSave as any)[cfg.historyField] = history;
      }
      await onSave(toSave);
      triggerNotif(`${cfg.label} schedule saved for ${form.regNo}.`);
      closeEdit();
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : `Failed to save ${cfg.label.toLowerCase()} schedule.`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const Icon = cfg.icon;
  const previewInfo = form ? computeCycleInfo(form[cfg.dateField], cfg.cycleDays) : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Icon className="w-4 h-4 text-cyan-600" /> {cfg.label}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            title="Filter by Category"
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700"
          >
            <option value="All">All Categories</option>
            {VEHICLE_CATEGORIES.filter(c => cfg.categories.includes(c.toLowerCase())).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative w-48 text-xs">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
            <input type="text" placeholder="Search Reg No" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
          </div>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 font-mono mb-3">
        Applies to {cfg.categories.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')} - every {cfg.cycleDays} days, reminder email {REMINDER_DAYS_BEFORE_DUE} days before due.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
            <tr>
              <th className="px-3 py-2.5"><SortHeader label="Reg. No." sortKey="regNo" sort={sort} onSort={handleSort} /></th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5"><SortHeader label={cfg.dateLabel} sortKey="lastDate" sort={sort} onSort={handleSort} type="numeric" /></th>
              <th className="px-3 py-2.5">Next Due Date</th>
              <th className="px-3 py-2.5 text-right">Remaining Days Left</th>
              <th className="px-3 py-2.5">Service Status</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400 font-mono">NO VEHICLES FOUND.</td></tr>
            ) : filtered.map(regNo => {
              const schedule = scheduleFor(regNo);
              const category = categoryOf(vehicleFor(regNo));
              const info = computeCycleInfo(schedule?.[cfg.dateField], cfg.cycleDays);
              return (
                <tr key={regNo} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{regNo}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${CATEGORY_BADGE_CLASS[category] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                      {matchVehicleCategoryOption(category)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                    {schedule?.[cfg.dateField] || <span className="text-slate-300">Not set</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                    {info.nextDueDate}{info.isDefaulted && <span className="text-slate-400"> (from today)</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono font-bold ${remainingDaysColor(info.remainingDays)}`}>{info.remainingDays}</td>
                  <td className="px-3 py-2.5">{statusBadge(schedule?.[cfg.statusField])}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => openEdit(regNo)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer" title={`Edit ${cfg.label.toLowerCase()}`}><Edit2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingRegNo && form && previewInfo && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-cyan-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Icon className="w-4 h-4 text-cyan-400" /> {cfg.label} - {editingRegNo}</h3>
              <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Vehicle Type</label>
                <select value={matchVehicleCategoryOption(categoryOf(vehicleFor(editingRegNo)))} disabled className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 text-slate-600 font-semibold cursor-not-allowed">
                  {VEHICLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="text-[9px] text-slate-400 font-mono mt-0.5">Set from this vehicle's Category in Fleet &amp; Vehicles.</p>
              </div>

              <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-200 space-y-2">
                <span className="text-[10px] font-bold text-cyan-700 uppercase flex items-center gap-1"><Bell className="w-3.5 h-3.5" /> {cfg.dateLabel}</span>
                <DateInput value={form[cfg.dateField] || ''} onChange={(e) => setForm(f => f && ({ ...f, [cfg.dateField]: e.target.value }))} max={todayIso()} className="w-full bg-white border border-cyan-200 rounded-lg p-2 font-mono text-slate-800" />
                {form[cfg.historyField] && (form[cfg.historyField] as { date: string }[]).length > 0 && (
                  <p className="text-[9px] text-slate-500 font-mono flex items-start gap-1"><History className="w-3 h-3 shrink-0 mt-0.5" /> Previous: {(form[cfg.historyField] as { date: string }[]).slice(0, 5).map(h => h.date).join(', ')}</p>
                )}

                <div className="pt-2 border-t border-cyan-100 grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Next Due Date</span>
                    <span className="text-xs font-black text-slate-800">{previewInfo.nextDueDate}{previewInfo.isDefaulted && <span className="text-slate-400 font-normal text-[9px]"> (from today)</span>}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Remaining Days Left</span>
                    <span className={`text-xs font-black ${remainingDaysColor(previewInfo.remainingDays)}`}>{previewInfo.remainingDays}</span>
                  </div>
                </div>
                <p className="text-[9px] text-cyan-800 font-mono">
                  Reminder email scheduled for <strong>{previewInfo.reminderDate}</strong> ({REMINDER_DAYS_BEFORE_DUE} days before due) - fixed, not configurable here.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Service Status</label>
                <select value={form[cfg.statusField] || 'Pending'} onChange={(e) => setForm(f => f && ({ ...f, [cfg.statusField]: e.target.value as 'Completed' | 'Pending' }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 sticky bottom-0">
              <button type="button" onClick={closeEdit} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">Cancel</button>
              <button type="button" onClick={handleSave} disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-cyan-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
                {isSubmitting ? 'Saving...' : `Save ${cfg.label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function ServiceScheduleTab({
  vehicles, mileageReports, vehicleServiceSchedules, onSaveVehicleServiceSchedule
}: ServiceScheduleTabProps) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'washing' | 'acservice'>('schedule');
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => { setNotif({ message, type }); setTimeout(() => setNotif(null), 4000); };

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

      <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
        {([
          ['schedule', 'Vehicle Service Schedule', ClipboardList],
          ['washing', 'Washing', Droplets],
          ['acservice', 'AC Service', Snowflake]
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === key ? 'bg-gradient-to-r from-blue-600 to-slate-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'schedule' && (
        <VehicleScheduleTable vehicles={vehicles} mileageReports={mileageReports} vehicleServiceSchedules={vehicleServiceSchedules} onSave={onSaveVehicleServiceSchedule} triggerNotif={triggerNotif} />
      )}
      {activeTab === 'washing' && (
        <CycleTable kind="washing" vehicles={vehicles} vehicleServiceSchedules={vehicleServiceSchedules} onSave={onSaveVehicleServiceSchedule} triggerNotif={triggerNotif} />
      )}
      {activeTab === 'acservice' && (
        <CycleTable kind="acservice" vehicles={vehicles} vehicleServiceSchedules={vehicleServiceSchedules} onSave={onSaveVehicleServiceSchedule} triggerNotif={triggerNotif} />
      )}
    </div>
  );
}
