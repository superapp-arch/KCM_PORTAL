import React, { useMemo, useState } from 'react';
import { Vehicle, VehicleServiceSchedule, MileageReport } from '../../types';
import {
  CalendarClock, Search, Edit2, X, ShieldCheck, CheckCircle2, AlertCircle, Bell, Droplets,
  Snowflake, History, ClipboardList, Send, Loader2, Filter
} from 'lucide-react';
import DateInput from '../DateInput';
import { latestOdometerFor, computeWarrantyStatus } from '../../utils/maintenanceDates';
import {
  VEHICLE_CATEGORIES, matchVehicleCategoryOption,
  WASHING_CYCLE_DAYS, WASHING_CATEGORIES, isWashingEligible,
  AC_SERVICE_CYCLE_DAYS, AC_SERVICE_CATEGORIES, isAcServiceEligible,
  REMINDER_DAYS_BEFORE_DUE
} from '../../utils/vehicleCycleDefaults';
import { SaveConfirmationModal } from '../ConfirmationModal';
import { authFetch } from '../../authFetch';

interface ServiceScheduleTabProps {
  vehicles: Vehicle[];
  mileageReports: MileageReport[];
  vehicleServiceSchedules: VehicleServiceSchedule[];
  onSaveVehicleServiceSchedule: (schedule: VehicleServiceSchedule) => Promise<void>;
  isSuperAdmin: boolean; // gates the bulk "Send Reminder Now" action below
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

// "Urgent" = overdue or inside the reminder window - the same cutoff the
// server's own reminder email fires on (REMINDER_DAYS_BEFORE_DUE), just
// reused here for the dot color, the summary cards and the "Urgent only"
// filter so all three always agree with each other.
const isUrgentRemaining = (remainingDays: number) => remainingDays <= REMINDER_DAYS_BEFORE_DUE;
const remainingDaysColor = (remainingDays: number) =>
  remainingDays <= 0 ? 'text-rose-600' : remainingDays <= REMINDER_DAYS_BEFORE_DUE ? 'text-amber-600' : 'text-emerald-600';

// Small colored dot mirroring remainingDaysColor's own cutoffs - lets a
// glance across a wide, many-column merged row spot what's urgent without
// reading every number (point: "urgency dot" per service in the merged
// table).
function UrgencyDot({ remainingDays }: { remainingDays: number }) {
  const cls = remainingDays <= 0 ? 'bg-rose-500' : remainingDays <= REMINDER_DAYS_BEFORE_DUE ? 'bg-amber-500' : 'bg-emerald-500';
  const label = remainingDays <= 0 ? 'Overdue' : remainingDays <= REMINDER_DAYS_BEFORE_DUE ? 'Due soon' : 'On track';
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls}`} title={label} />;
}

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

// Washing and AC Service are structurally identical fixed-cycle registers
// (only the cycle length, category scope and field names differ) - both
// read through this one config keyed by `kind` rather than duplicating the
// same math/fields twice.
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

// One merged row per vehicle - Vehicle Service applies to every vehicle
// unconditionally; Washing/AC Service only apply per their own category
// eligibility (see CYCLE_TAB_CONFIG.isEligible) - a row still exists for an
// ineligible vehicle, its Washing/AC cells just render "Not Applicable"
// (point: "applicability rules by vehicle type").
interface MergedRow {
  regNo: string;
  category: string;
  schedule: VehicleServiceSchedule | undefined;
  washingApplicable: boolean;
  acApplicable: boolean;
  washingInfo: CycleInfo | null;
  acInfo: CycleInfo | null;
  urgencyRank: number; // smallest applicable remainingDays, Infinity if nothing applicable - for "Most Urgent First" sort
  isUrgent: boolean; // any applicable cycle overdue or inside the reminder window
}

// ---------------------------------------------------------------------------
export default function ServiceScheduleTab({
  vehicles, mileageReports, vehicleServiceSchedules, onSaveVehicleServiceSchedule, isSuperAdmin
}: ServiceScheduleTabProps) {
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => { setNotif({ message, type }); setTimeout(() => setNotif(null), 4000); };
  // Big, centered save confirmation (see ConfirmationModal.tsx) - no delete
  // action exists here (Service Schedule is an upsert-only register), so
  // only the save variant is wired in. Shared across all three merged
  // service groups (Vehicle Service, Washing, AC Service) and both the full
  // edit modal and the inline "Mark as Done" quick action.
  const [saveConfirmation, setSaveConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);
  const handleSaved = (label: string, identifier: string) => setSaveConfirmation({ label, identifier, key: Date.now() });

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sortMode, setSortMode] = useState<'regNo' | 'urgency'>('regNo');

  // Which modal is open, if any - `kind` picks Vehicle Service's own modal
  // body (with Warranty) vs the shared Washing/AC Service one.
  const [editing, setEditing] = useState<{ regNo: string; kind: 'schedule' | 'washing' | 'acservice' } | null>(null);
  const [form, setForm] = useState<VehicleServiceSchedule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sendingReminders, setSendingReminders] = useState(false);

  const vehicleFor = (regNo: string) => vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo);
  const scheduleFor = (regNo: string) => vehicleServiceSchedules.find(s => s.regNo === regNo);

  // Every vehicle gets a row (Vehicle Service applies to all of them) -
  // Washing/AC eligibility is decided per-row below, not by excluding a
  // vehicle from the list entirely.
  const vehicleList = useMemo(
    () => Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort(),
    [vehicles]
  );

  const mergedRows: MergedRow[] = useMemo(() => vehicleList.map(regNo => {
    const schedule = scheduleFor(regNo);
    const category = categoryOf(vehicleFor(regNo));
    const washingApplicable = CYCLE_TAB_CONFIG.washing.isEligible(category);
    const acApplicable = CYCLE_TAB_CONFIG.acservice.isEligible(category);
    const washingInfo = washingApplicable ? computeCycleInfo(schedule?.lastWashingDate, WASHING_CYCLE_DAYS) : null;
    const acInfo = acApplicable ? computeCycleInfo(schedule?.lastAcServiceDate, AC_SERVICE_CYCLE_DAYS) : null;
    const candidates = [washingInfo?.remainingDays, acInfo?.remainingDays].filter((n): n is number => n != null);
    const urgencyRank = candidates.length > 0 ? Math.min(...candidates) : Infinity;
    const isUrgent = (washingApplicable && isUrgentRemaining(washingInfo!.remainingDays)) || (acApplicable && isUrgentRemaining(acInfo!.remainingDays));
    return { regNo, category, schedule, washingApplicable, acApplicable, washingInfo, acInfo, urgencyRank, isUrgent };
  }), [vehicleList, vehicleServiceSchedules, vehicles]);

  const filteredUnsorted = mergedRows.filter(row => {
    const matchesSearch = row.regNo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || matchVehicleCategoryOption(row.category) === categoryFilter;
    const matchesUrgent = !urgentOnly || row.isUrgent;
    return matchesSearch && matchesCategory && matchesUrgent;
  });
  const filteredRows = [...filteredUnsorted].sort((a, b) =>
    sortMode === 'urgency' ? (a.urgencyRank - b.urgencyRank || a.regNo.localeCompare(b.regNo)) : a.regNo.localeCompare(b.regNo)
  );

  // Summary cards - counts across every vehicle regardless of the filters
  // above, so they always describe the whole fleet at a glance.
  const totalVehicles = mergedRows.length;
  const washingUrgentCount = mergedRows.filter(r => r.washingApplicable && isUrgentRemaining(r.washingInfo!.remainingDays)).length;
  const acUrgentCount = mergedRows.filter(r => r.acApplicable && isUrgentRemaining(r.acInfo!.remainingDays)).length;
  const servicePendingCount = mergedRows.filter(r => (r.schedule?.serviceStatus || 'Pending') !== 'Completed').length;

  const openEdit = (regNo: string, kind: 'schedule' | 'washing' | 'acservice') => {
    setEditing({ regNo, kind });
    setForm(scheduleFor(regNo) || emptySchedule(regNo));
  };
  const closeEdit = () => { setEditing(null); setForm(null); };

  const handleSave = async () => {
    if (!form || !editing) return;
    setIsSubmitting(true);
    try {
      const original = scheduleFor(form.regNo);
      let toSave: VehicleServiceSchedule = { ...form, id: form.regNo };
      if (editing.kind === 'schedule') {
        if (original?.lastServiceDate && original.lastServiceDate !== form.lastServiceDate) {
          toSave.serviceHistory = [{ date: original.lastServiceDate, km: original.lastServiceKm }, ...(toSave.serviceHistory || [])].slice(0, 10);
        }
        await onSaveVehicleServiceSchedule(toSave);
        handleSaved('Service schedule', form.regNo);
      } else {
        const cfg = CYCLE_TAB_CONFIG[editing.kind];
        const originalDate = original?.[cfg.dateField];
        const newDate = form[cfg.dateField];
        if (originalDate && originalDate !== newDate) {
          const history = [{ date: originalDate }, ...((toSave[cfg.historyField] as { date: string }[] | undefined) || [])].slice(0, 10);
          (toSave as any)[cfg.historyField] = history;
        }
        await onSaveVehicleServiceSchedule(toSave);
        handleSaved(`${cfg.label} schedule`, form.regNo);
      }
      closeEdit();
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to save service schedule.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Inline "Mark as Done" quick action - sets today's date + Completed in
  // one click, shifting whatever was there before into the same history
  // list the full edit modal itself maintains, so the two paths never
  // disagree on what "last serviced" means.
  const markDone = async (regNo: string, kind: 'schedule' | 'washing' | 'acservice') => {
    const original = scheduleFor(regNo);
    let toSave: VehicleServiceSchedule = { ...(original || emptySchedule(regNo)), id: regNo, regNo };
    try {
      if (kind === 'schedule') {
        toSave = { ...toSave, serviceStatus: 'Completed', lastServiceDate: todayIso() };
        if (original?.lastServiceDate && original.lastServiceDate !== toSave.lastServiceDate) {
          toSave.serviceHistory = [{ date: original.lastServiceDate, km: original.lastServiceKm }, ...(toSave.serviceHistory || [])].slice(0, 10);
        }
        await onSaveVehicleServiceSchedule(toSave);
        handleSaved('Service schedule', regNo);
      } else {
        const cfg = CYCLE_TAB_CONFIG[kind];
        (toSave as any)[cfg.statusField] = 'Completed';
        const originalDate = original?.[cfg.dateField];
        (toSave as any)[cfg.dateField] = todayIso();
        if (originalDate && originalDate !== todayIso()) {
          const history = [{ date: originalDate }, ...((toSave[cfg.historyField] as { date: string }[] | undefined) || [])].slice(0, 10);
          (toSave as any)[cfg.historyField] = history;
        }
        await onSaveVehicleServiceSchedule(toSave);
        handleSaved(`${cfg.label} schedule`, regNo);
      }
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to mark as done.', 'error');
    }
  };

  // Manually fires the same reminder check the server already runs hourly
  // (Super Admin only) - still respects the per-milestone dedup marker
  // server-side, so this can't spam the same vehicle twice for one cycle.
  const handleSendRemindersNow = async () => {
    setSendingReminders(true);
    try {
      const res = await authFetch('/api/service-washing-reminders/send-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send reminders.');
      triggerNotif(data.message, 'success');
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to send reminders.', 'error');
    } finally {
      setSendingReminders(false);
    }
  };

  const currentKmFor = (regNo: string) => latestOdometerFor(regNo, mileageReports);
  const warrantyFor = (row: MergedRow) => row.schedule
    ? computeWarrantyStatus(row.schedule.warrantyStatus, currentKmFor(row.regNo), regDateOf(vehicleFor(row.regNo) || {}))
    : null;

  const previewInfo = form && editing && editing.kind !== 'schedule' ? computeCycleInfo(form[CYCLE_TAB_CONFIG[editing.kind].dateField], CYCLE_TAB_CONFIG[editing.kind].cycleDays) : null;

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

      {/* Summary cards - fleet-wide counts, independent of the filters below. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Total Vehicles</p>
          <h3 className="text-xl font-black text-slate-800 mt-1">{totalVehicles}</h3>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs">
          <p className="font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Service Pending</p>
          <h3 className="text-xl font-black text-amber-700 mt-1">{servicePendingCount}</h3>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-cyan-200 shadow-xs">
          <p className="font-bold text-cyan-600 uppercase tracking-wider flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" /> Washing Urgent</p>
          <h3 className="text-xl font-black text-cyan-700 mt-1">{washingUrgentCount}</h3>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-sky-200 shadow-xs">
          <p className="font-bold text-sky-600 uppercase tracking-wider flex items-center gap-1.5"><Snowflake className="w-3.5 h-3.5" /> AC Service Urgent</p>
          <h3 className="text-xl font-black text-sky-700 mt-1">{acUrgentCount}</h3>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4 text-slate-600" /> Vehicle Service Schedule
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              title="Filter by Category"
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700"
            >
              <option value="All">All Categories</option>
              {VEHICLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as 'regNo' | 'urgency')}
              title="Sort"
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700"
            >
              <option value="regNo">Sort: Reg. No.</option>
              <option value="urgency">Sort: Most Urgent First</option>
            </select>
            <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer font-bold ${urgentOnly ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} className="cursor-pointer" />
              <Filter className="w-3.5 h-3.5" /> Urgent only
            </label>
            <div className="relative w-44">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
              <input type="text" placeholder="Search Reg No" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
            </div>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleSendRemindersNow}
                disabled={sendingReminders}
                title="Manually fire the reminder-email check right now (Super Admin only) - still skips anything already sent for its current milestone"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold cursor-pointer disabled:opacity-50"
              >
                {sendingReminders ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send Reminders Now
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 font-mono mb-3">
          Washing applies to {WASHING_CATEGORIES.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')} (every {WASHING_CYCLE_DAYS} days) &middot;
          AC Service applies to {AC_SERVICE_CATEGORIES.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')} (every {AC_SERVICE_CYCLE_DAYS} days) &middot;
          reminder email {REMINDER_DAYS_BEFORE_DUE} days before due.
        </p>

        {/* Desktop/tablet: one grouped table, one row per vehicle. */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th rowSpan={2} className="px-3 py-2.5 align-bottom">Reg. No.</th>
                <th rowSpan={2} className="px-3 py-2.5 align-bottom">Type</th>
                <th colSpan={3} className="px-3 py-1.5 text-center border-l border-slate-700">
                  <span className="flex items-center justify-center gap-1"><ClipboardList className="w-3 h-3" /> Vehicle Service</span>
                </th>
                <th colSpan={4} className="px-3 py-1.5 text-center border-l border-slate-700">
                  <span className="flex items-center justify-center gap-1"><Droplets className="w-3 h-3" /> Washing</span>
                </th>
                <th colSpan={4} className="px-3 py-1.5 text-center border-l border-slate-700">
                  <span className="flex items-center justify-center gap-1"><Snowflake className="w-3 h-3" /> AC Service</span>
                </th>
              </tr>
              <tr>
                <th className="px-3 py-2 border-l border-slate-700">Last Service</th>
                <th className="px-3 py-2">Warranty</th>
                <th className="px-3 py-2 text-right">Status</th>
                <th className="px-3 py-2 border-l border-slate-700">Last Date</th>
                <th className="px-3 py-2">Next Due</th>
                <th className="px-3 py-2 text-right">Days Left</th>
                <th className="px-3 py-2 text-right">Status</th>
                <th className="px-3 py-2 border-l border-slate-700">Last Date</th>
                <th className="px-3 py-2">Next Due</th>
                <th className="px-3 py-2 text-right">Days Left</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-slate-400 font-mono">NO VEHICLES FOUND.</td></tr>
              ) : filteredRows.map(row => {
                const effectiveWarranty = warrantyFor(row);
                return (
                  <tr key={row.regNo} className={`hover:bg-slate-50/50 transition-colors ${row.isUrgent ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">
                      <span className="flex items-center gap-1.5">{row.isUrgent && <UrgencyDot remainingDays={0} />}{row.regNo}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.category ? (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${CATEGORY_BADGE_CLASS[row.category] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                          {matchVehicleCategoryOption(row.category)}
                        </span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>

                    {/* Vehicle Service - no urgency dot (km/manual-based, not a fixed day-cycle). */}
                    <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap border-l border-slate-100">{row.schedule?.lastServiceDate || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {effectiveWarranty ? (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${effectiveWarranty === 'InWarranty' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-500 border border-slate-300'}`}>
                          {effectiveWarranty === 'InWarranty' ? 'In Warranty' : 'Out of Warranty'}
                        </span>
                      ) : <span className="text-slate-300">Not set</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {statusBadge(row.schedule?.serviceStatus)}
                        <button onClick={() => markDone(row.regNo, 'schedule')} title="Mark done today" className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openEdit(row.regNo, 'schedule')} title="Edit Vehicle Service" className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>

                    {/* Washing */}
                    {!row.washingApplicable ? (
                      <td colSpan={4} className="px-3 py-2.5 text-center text-slate-300 font-mono text-[10px] italic border-l border-slate-100">Not Applicable</td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap border-l border-slate-100">{row.schedule?.lastWashingDate || <span className="text-slate-300">Not set</span>}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{row.washingInfo!.nextDueDate}{row.washingInfo!.isDefaulted && <span className="text-slate-400"> (from today)</span>}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${remainingDaysColor(row.washingInfo!.remainingDays)}`}>
                          <span className="flex items-center justify-end gap-1.5"><UrgencyDot remainingDays={row.washingInfo!.remainingDays} /> {row.washingInfo!.remainingDays}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {statusBadge(row.schedule?.washingStatus)}
                            <button onClick={() => markDone(row.regNo, 'washing')} title="Mark done today" className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => openEdit(row.regNo, 'washing')} title="Edit Washing" className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    )}

                    {/* AC Service */}
                    {!row.acApplicable ? (
                      <td colSpan={4} className="px-3 py-2.5 text-center text-slate-300 font-mono text-[10px] italic border-l border-slate-100">Not Applicable</td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap border-l border-slate-100">{row.schedule?.lastAcServiceDate || <span className="text-slate-300">Not set</span>}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{row.acInfo!.nextDueDate}{row.acInfo!.isDefaulted && <span className="text-slate-400"> (from today)</span>}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${remainingDaysColor(row.acInfo!.remainingDays)}`}>
                          <span className="flex items-center justify-end gap-1.5"><UrgencyDot remainingDays={row.acInfo!.remainingDays} /> {row.acInfo!.remainingDays}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {statusBadge(row.schedule?.acServiceStatus)}
                            <button onClick={() => markDone(row.regNo, 'acservice')} title="Mark done today" className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => openEdit(row.regNo, 'acservice')} title="Edit AC Service" className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: one stacked card per vehicle instead of the wide table. */}
        <div className="md:hidden space-y-3">
          {filteredRows.length === 0 ? (
            <p className="text-center py-10 text-slate-400 font-mono text-xs">NO VEHICLES FOUND.</p>
          ) : filteredRows.map(row => {
            const effectiveWarranty = warrantyFor(row);
            return (
              <div key={row.regNo} className={`rounded-xl border p-3 space-y-2.5 text-xs ${row.isUrgent ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold font-mono text-slate-900 uppercase flex items-center gap-1.5">{row.isUrgent && <UrgencyDot remainingDays={0} />} {row.regNo}</span>
                  {row.category && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${CATEGORY_BADGE_CLASS[row.category] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                      {matchVehicleCategoryOption(row.category)}
                    </span>
                  )}
                </div>

                <div className="rounded-lg border border-slate-100 p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase"><span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" /> Vehicle Service</span> {statusBadge(row.schedule?.serviceStatus)}</div>
                  <div className="flex items-center justify-between font-mono text-slate-600"><span>Last: {row.schedule?.lastServiceDate || '-'}</span>{effectiveWarranty && <span className={effectiveWarranty === 'InWarranty' ? 'text-sky-600' : 'text-slate-400'}>{effectiveWarranty === 'InWarranty' ? 'In Warranty' : 'Out of Warranty'}</span>}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => markDone(row.regNo, 'schedule')} className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 font-bold cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /> Mark Done</button>
                    <button onClick={() => openEdit(row.regNo, 'schedule')} className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 font-bold cursor-pointer"><Edit2 className="w-3.5 h-3.5" /> Edit</button>
                  </div>
                </div>

                {!row.washingApplicable ? (
                  <div className="rounded-lg border border-slate-100 p-2.5 text-center text-slate-300 font-mono text-[10px] italic flex items-center justify-center gap-1"><Droplets className="w-3 h-3" /> Washing - Not Applicable</div>
                ) : (
                  <div className="rounded-lg border border-slate-100 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase"><span className="flex items-center gap-1"><Droplets className="w-3 h-3" /> Washing</span> {statusBadge(row.schedule?.washingStatus)}</div>
                    <div className="flex items-center justify-between font-mono text-slate-600">
                      <span>Last: {row.schedule?.lastWashingDate || 'Not set'}</span>
                      <span className={`flex items-center gap-1 font-bold ${remainingDaysColor(row.washingInfo!.remainingDays)}`}><UrgencyDot remainingDays={row.washingInfo!.remainingDays} /> {row.washingInfo!.remainingDays}d</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => markDone(row.regNo, 'washing')} className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 font-bold cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /> Mark Done</button>
                      <button onClick={() => openEdit(row.regNo, 'washing')} className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 font-bold cursor-pointer"><Edit2 className="w-3.5 h-3.5" /> Edit</button>
                    </div>
                  </div>
                )}

                {!row.acApplicable ? (
                  <div className="rounded-lg border border-slate-100 p-2.5 text-center text-slate-300 font-mono text-[10px] italic flex items-center justify-center gap-1"><Snowflake className="w-3 h-3" /> AC Service - Not Applicable</div>
                ) : (
                  <div className="rounded-lg border border-slate-100 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase"><span className="flex items-center gap-1"><Snowflake className="w-3 h-3" /> AC Service</span> {statusBadge(row.schedule?.acServiceStatus)}</div>
                    <div className="flex items-center justify-between font-mono text-slate-600">
                      <span>Last: {row.schedule?.lastAcServiceDate || 'Not set'}</span>
                      <span className={`flex items-center gap-1 font-bold ${remainingDaysColor(row.acInfo!.remainingDays)}`}><UrgencyDot remainingDays={row.acInfo!.remainingDays} /> {row.acInfo!.remainingDays}d</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => markDone(row.regNo, 'acservice')} className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 font-bold cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /> Mark Done</button>
                      <button onClick={() => openEdit(row.regNo, 'acservice')} className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 font-bold cursor-pointer"><Edit2 className="w-3.5 h-3.5" /> Edit</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Vehicle Service edit modal - Warranty, Last Service, Remarks. */}
      {editing?.kind === 'schedule' && form && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4 text-blue-400" /> Service Schedule - {editing.regNo}</h3>
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

      {/* Washing / AC Service edit modal - shared by both via CYCLE_TAB_CONFIG. */}
      {(editing?.kind === 'washing' || editing?.kind === 'acservice') && form && previewInfo && (() => {
        const cfg = CYCLE_TAB_CONFIG[editing.kind];
        const Icon = cfg.icon;
        return (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 bg-gradient-to-r from-slate-900 to-cyan-950 text-white flex items-center justify-between sticky top-0 z-10">
                <h3 className="font-extrabold text-sm flex items-center gap-2"><Icon className="w-4 h-4 text-cyan-400" /> {cfg.label} - {editing.regNo}</h3>
                <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Vehicle Type</label>
                  <select value={matchVehicleCategoryOption(categoryOf(vehicleFor(editing.regNo)))} disabled className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 text-slate-600 font-semibold cursor-not-allowed">
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
        );
      })()}

      <SaveConfirmationModal key={saveConfirmation?.key} open={!!saveConfirmation} label={saveConfirmation?.label || 'Entry'} identifier={saveConfirmation?.identifier} onDone={() => setSaveConfirmation(null)} />
    </div>
  );
}
