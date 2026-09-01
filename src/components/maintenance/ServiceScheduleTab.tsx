import React, { useMemo, useState } from 'react';
import { Vehicle, VehicleServiceSchedule, VehicleMaintenanceReference, MileageReport } from '../../types';
import {
  CalendarClock, Search, Edit2, X, ShieldCheck, CheckCircle2, AlertCircle, Bell, Droplets,
  Snowflake, History, ClipboardList, Send, Loader2, Filter, UserSearch, Lock, Eye
} from 'lucide-react';
import DateInput from '../DateInput';
import { latestOdometerFor, parseWarrantyPeriodStatus, WarrantyPeriodInfo } from '../../utils/maintenanceDates';
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
  vehicleMaintenanceReferences: VehicleMaintenanceReference[];
  onSaveVehicleMaintenanceReference: (record: VehicleMaintenanceReference) => Promise<void>;
  isSuperAdmin: boolean; // gates the bulk "Send Reminder Now" action below
}

const regDateOf = (v: Vehicle) => v.regDate || v['Reg Date'] || '';
const categoryOf = (v: Vehicle | undefined) => String(v?.Category || v?.category || '').trim().toLowerCase();
const vehicleTypeOf = (v: Vehicle | undefined) => String(v?.type || v?.['Type'] || '').trim();
const modelOf = (v: Vehicle | undefined) => String(v?.model || v?.['Model'] || '').trim();

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
// glance across the table spot what's urgent without reading every number.
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

const warrantyBadge = (info: WarrantyPeriodInfo | null) => info ? (
  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
    info.status === 'InWarranty' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-300'
  }`}>
    {info.status === 'InWarranty' ? 'In Warranty' : 'Out of Warranty'}
  </span>
) : <span className="text-slate-300">Not set</span>;

const emptySchedule = (regNo: string): VehicleServiceSchedule => ({
  id: regNo,
  regNo,
  serviceIntervalKm: 10000,
  warrantyStatus: 'InWarranty'
});

const emptyRefForm = () => ({ responsible: '', lastServiceDoneKm: '', warrantyPeriod: '', servicePeriod: '' });

// Washing and AC Service are structurally identical fixed-cycle registers
// (only the cycle length, category scope and field names differ) - both
// read through this one config keyed by `kind` rather than duplicating the
// same math/fields twice, for both the View panel's display and the Edit
// panel's single editable date field.
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
    label: 'AC Service', dateLabel: 'Last AC Service Date', dateField: 'lastAcServiceDate',
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
  reference: VehicleMaintenanceReference | undefined;
  washingApplicable: boolean;
  acApplicable: boolean;
  washingInfo: CycleInfo | null;
  acInfo: CycleInfo | null;
  urgencyRank: number; // smallest applicable remainingDays, Infinity if nothing applicable - for "Most Urgent First" sort
  isUrgent: boolean; // any applicable cycle overdue or inside the reminder window
}

// ---------------------------------------------------------------------------
export default function ServiceScheduleTab({
  vehicles, mileageReports, vehicleServiceSchedules, onSaveVehicleServiceSchedule,
  vehicleMaintenanceReferences, onSaveVehicleMaintenanceReference, isSuperAdmin
}: ServiceScheduleTabProps) {
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => { setNotif({ message, type }); setTimeout(() => setNotif(null), 4000); };
  // Big, centered save confirmation (see ConfirmationModal.tsx) - no delete
  // action exists here (Service Schedule is an upsert-only register), so
  // only the save variant is wired in.
  const [saveConfirmation, setSaveConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);
  const handleSaved = (label: string, identifier: string) => setSaveConfirmation({ label, identifier, key: Date.now() });

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [warrantyFilter, setWarrantyFilter] = useState<'All' | 'InWarranty' | 'OutOfWarranty'>('All');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sortMode, setSortMode] = useState<'regNo' | 'urgency'>('regNo');

  const [sendingReminders, setSendingReminders] = useState(false);

  const vehicleFor = (regNo: string) => vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo);
  const scheduleFor = (regNo: string) => vehicleServiceSchedules.find(s => s.regNo === regNo);
  const referenceFor = (regNo: string) => vehicleMaintenanceReferences.find(r => r.vehicleNo === regNo);
  const currentKmFor = (regNo: string) => latestOdometerFor(regNo, mileageReports);
  // Warranty Status is always computed from this vehicle's own Maintenance
  // Reference Warranty Period ("{km}/{years} YEAR") + Fleet & Vehicles Reg
  // Date + Current Odometer (see parseWarrantyPeriodStatus) - read-only
  // everywhere, never a manual override in this tab. Either the km limit or
  // the date limit alone is enough to flip it Out of Warranty. Returns null
  // (shown as "Not set") when the Warranty Period or Reg Date is missing/
  // unparseable - never guessed.
  const warrantyInfoFor = (row: MergedRow): WarrantyPeriodInfo | null =>
    parseWarrantyPeriodStatus(row.reference?.warrantyPeriod, regDateOf(vehicleFor(row.regNo) || {}), currentKmFor(row.regNo));

  // --- View panel (2026-09-06) - clicking a row's Vehicle No opens a
  // read-only consolidated view, same "look, don't touch" pattern as Fleet &
  // Vehicles' own detail view. Nothing here is ever editable - it's purely a
  // display of the same figures the table/Edit panel already compute.
  const [viewingRegNo, setViewingRegNo] = useState<string | null>(null);

  // --- Unified Edit panel (2026-09-06) - replaces the previous 4 separate
  // edit screens (Maintenance Reference, Vehicle Service, Washing, AC
  // Service) with one panel per vehicle, covering every field that's
  // actually manually set across all of them. `form` covers the Vehicle
  // Service + Washing + AC Service fields (all on the one
  // VehicleServiceSchedule record); `refForm` covers Maintenance Reference
  // (a separate record) - Save persists both together in one action.
  // Auto-calculated fields (Warranty Status, Due Dates, Days Remaining)
  // are never part of either form - they're always read from the same live
  // computation the table and View panel use, shown here only for context.
  const [editingRegNo, setEditingRegNo] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleServiceSchedule | null>(null);
  const [refForm, setRefForm] = useState(emptyRefForm());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Every vehicle gets a row (Vehicle Service applies to all of them) -
  // Washing/AC eligibility is decided per-row below, not by excluding a
  // vehicle from the list entirely.
  const vehicleList = useMemo(
    () => Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort(),
    [vehicles]
  );

  const mergedRows: MergedRow[] = useMemo(() => vehicleList.map(regNo => {
    const schedule = scheduleFor(regNo);
    const reference = vehicleMaintenanceReferences.find(r => r.vehicleNo === regNo);
    const category = categoryOf(vehicleFor(regNo));
    const washingApplicable = CYCLE_TAB_CONFIG.washing.isEligible(category);
    const acApplicable = CYCLE_TAB_CONFIG.acservice.isEligible(category);
    const washingInfo = washingApplicable ? computeCycleInfo(schedule?.lastWashingDate, WASHING_CYCLE_DAYS) : null;
    const acInfo = acApplicable ? computeCycleInfo(schedule?.lastAcServiceDate, AC_SERVICE_CYCLE_DAYS) : null;
    const candidates = [washingInfo?.remainingDays, acInfo?.remainingDays].filter((n): n is number => n != null);
    const urgencyRank = candidates.length > 0 ? Math.min(...candidates) : Infinity;
    const isUrgent = (washingApplicable && isUrgentRemaining(washingInfo!.remainingDays)) || (acApplicable && isUrgentRemaining(acInfo!.remainingDays));
    return { regNo, category, schedule, reference, washingApplicable, acApplicable, washingInfo, acInfo, urgencyRank, isUrgent };
  }), [vehicleList, vehicleServiceSchedules, vehicleMaintenanceReferences, vehicles]);

  const filteredUnsorted = mergedRows.filter(row => {
    const matchesSearch = row.regNo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || matchVehicleCategoryOption(row.category) === categoryFilter;
    const matchesUrgent = !urgentOnly || row.isUrgent;
    const matchesWarranty = warrantyFilter === 'All' || warrantyInfoFor(row)?.status === warrantyFilter;
    return matchesSearch && matchesCategory && matchesUrgent && matchesWarranty;
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

  const openView = (regNo: string) => setViewingRegNo(regNo);
  const closeView = () => setViewingRegNo(null);

  const openEdit = (regNo: string) => {
    setForm(scheduleFor(regNo) || emptySchedule(regNo));
    const rec = referenceFor(regNo);
    setRefForm({
      responsible: rec?.responsible || '',
      lastServiceDoneKm: rec?.lastServiceDoneKm != null ? String(rec.lastServiceDoneKm) : '',
      warrantyPeriod: rec?.warrantyPeriod || '',
      servicePeriod: rec?.servicePeriod != null ? String(rec.servicePeriod) : ''
    });
    setEditingRegNo(regNo);
  };
  const closeEdit = () => { setEditingRegNo(null); setForm(null); setRefForm(emptyRefForm()); };

  // Single Save action for the whole consolidated panel - persists the
  // Vehicle Service Schedule record (Vehicle Service + Washing + AC Service
  // fields together) and the Maintenance Reference record, one after the
  // other, so what used to be 4 separate saves is now genuinely one action.
  const handleSave = async () => {
    if (!form || !editingRegNo) return;
    setIsSubmitting(true);
    try {
      const original = scheduleFor(editingRegNo);
      const toSave: VehicleServiceSchedule = { ...form, id: editingRegNo, regNo: editingRegNo };
      if (original?.lastServiceDate && original.lastServiceDate !== toSave.lastServiceDate) {
        toSave.serviceHistory = [{ date: original.lastServiceDate, km: original.lastServiceKm }, ...(toSave.serviceHistory || [])].slice(0, 10);
      }
      if (original?.lastWashingDate && original.lastWashingDate !== toSave.lastWashingDate) {
        toSave.washingHistory = [{ date: original.lastWashingDate }, ...(toSave.washingHistory || [])].slice(0, 10);
      }
      if (original?.lastAcServiceDate && original.lastAcServiceDate !== toSave.lastAcServiceDate) {
        toSave.acServiceHistory = [{ date: original.lastAcServiceDate }, ...(toSave.acServiceHistory || [])].slice(0, 10);
      }
      await onSaveVehicleServiceSchedule(toSave);
      await onSaveVehicleMaintenanceReference({
        vehicleNo: editingRegNo,
        responsible: refForm.responsible.trim() || undefined,
        lastServiceDoneKm: refForm.lastServiceDoneKm.trim() ? Number(refForm.lastServiceDoneKm) : undefined,
        warrantyPeriod: refForm.warrantyPeriod.trim() || undefined,
        servicePeriod: refForm.servicePeriod.trim() ? Number(refForm.servicePeriod) : undefined
      });
      handleSaved('Service schedule', editingRegNo);
      closeEdit();
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to save service schedule.', 'error');
    } finally {
      setIsSubmitting(false);
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

  // Live previews inside the Edit panel, from the form's own in-progress
  // date values (not yet saved) - same "auto-fills, still just a preview"
  // pattern the rest of this tab already used.
  const washingPreview = form ? computeCycleInfo(form.lastWashingDate, WASHING_CYCLE_DAYS) : null;
  const acPreview = form ? computeCycleInfo(form.lastAcServiceDate, AC_SERVICE_CYCLE_DAYS) : null;

  const viewingRow = viewingRegNo ? mergedRows.find(r => r.regNo === viewingRegNo) : undefined;
  const editingRow = editingRegNo ? mergedRows.find(r => r.regNo === editingRegNo) : undefined;

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
              value={warrantyFilter}
              onChange={(e) => setWarrantyFilter(e.target.value as 'All' | 'InWarranty' | 'OutOfWarranty')}
              title="Filter by Warranty Status"
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700"
            >
              <option value="All">All Warranty Status</option>
              <option value="InWarranty">In Warranty</option>
              <option value="OutOfWarranty">Out of Warranty</option>
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
          reminder email {REMINDER_DAYS_BEFORE_DUE} days before due &middot;
          click a Vehicle No to view full details, or the Edit icon to change anything.
        </p>

        {/* Desktop/tablet: one flat table, one row per vehicle - no grouping
            header row above the column headers (2026-09-06). */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5">Reg. No.</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Responsible</th>
                <th className="px-3 py-2.5 text-center">Warranty Status</th>
                <th className="px-3 py-2.5 text-right">Last Service KM</th>
                <th className="px-3 py-2.5 text-right">Current Odometer</th>
                <th className="px-3 py-2.5">Warranty Period</th>
                <th className="px-3 py-2.5">Washing Due Date</th>
                <th className="px-3 py-2.5">AC Service Due Date</th>
                <th className="px-3 py-2.5 text-right">Service Period</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-center">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-10 text-slate-400 font-mono">NO VEHICLES FOUND.</td></tr>
              ) : filteredRows.map(row => {
                const currentKm = currentKmFor(row.regNo);
                return (
                  <tr key={row.regNo} className={`hover:bg-slate-50/50 transition-colors ${row.isUrgent ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-3 py-2.5 font-bold font-mono whitespace-nowrap">
                      <button onClick={() => openView(row.regNo)} title="View full details" className="flex items-center gap-1.5 text-slate-900 hover:text-blue-600 hover:underline cursor-pointer">
                        {row.isUrgent && <UrgencyDot remainingDays={0} />}{row.regNo}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.category ? (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${CATEGORY_BADGE_CLASS[row.category] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                          {matchVehicleCategoryOption(row.category)}
                        </span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{row.reference?.responsible || <span className="text-slate-300">-</span>}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">{warrantyBadge(warrantyInfoFor(row))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700 whitespace-nowrap">{row.reference?.lastServiceDoneKm != null ? row.reference.lastServiceDoneKm.toLocaleString('en-IN') : <span className="text-slate-300">-</span>}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                      {currentKm != null ? `${currentKm.toLocaleString('en-IN')} km` : <span className="text-slate-300 font-normal">No reading yet</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap">{row.reference?.warrantyPeriod || <span className="text-slate-300">-</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.washingApplicable ? (
                        <span className="flex items-center gap-1.5 font-mono text-slate-600">
                          <UrgencyDot remainingDays={row.washingInfo!.remainingDays} /> {row.washingInfo!.nextDueDate}
                        </span>
                      ) : <span className="text-slate-300 italic text-[10px]">Not Applicable</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.acApplicable ? (
                        <span className="flex items-center gap-1.5 font-mono text-slate-600">
                          <UrgencyDot remainingDays={row.acInfo!.remainingDays} /> {row.acInfo!.nextDueDate}
                        </span>
                      ) : <span className="text-slate-300 italic text-[10px]">Not Applicable</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700 whitespace-nowrap">{row.reference?.servicePeriod != null ? `${row.reference.servicePeriod.toLocaleString('en-IN')} km` : <span className="text-slate-300">-</span>}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">{statusBadge(row.schedule?.serviceStatus)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => openEdit(row.regNo)} title="Edit" className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                    </td>
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
            const currentKm = currentKmFor(row.regNo);
            return (
              <div key={row.regNo} className={`rounded-xl border p-3 space-y-2.5 text-xs ${row.isUrgent ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between">
                  <button onClick={() => openView(row.regNo)} className="font-bold font-mono text-slate-900 uppercase flex items-center gap-1.5 cursor-pointer hover:text-blue-600 hover:underline">
                    {row.isUrgent && <UrgencyDot remainingDays={0} />} {row.regNo}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {row.category && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${CATEGORY_BADGE_CLASS[row.category] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                        {matchVehicleCategoryOption(row.category)}
                      </span>
                    )}
                    <button onClick={() => openEdit(row.regNo)} title="Edit" className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-slate-600">
                  <span>Responsible: {row.reference?.responsible || <span className="text-slate-300">-</span>}</span>
                  <span>{statusBadge(row.schedule?.serviceStatus)}</span>
                  <span className="flex items-center gap-1">Warranty: {warrantyBadge(warrantyInfoFor(row))}</span>
                  <span>Last Service KM: {row.reference?.lastServiceDoneKm != null ? row.reference.lastServiceDoneKm.toLocaleString('en-IN') : <span className="text-slate-300">-</span>}</span>
                  <span>Current Odo: {currentKm != null ? `${currentKm.toLocaleString('en-IN')} km` : <span className="text-slate-300">-</span>}</span>
                  <span>Warranty: {row.reference?.warrantyPeriod || <span className="text-slate-300">-</span>}</span>
                  <span>Service Period: {row.reference?.servicePeriod != null ? `${row.reference.servicePeriod.toLocaleString('en-IN')} km` : <span className="text-slate-300">-</span>}</span>
                  <span className="col-span-2 flex items-center gap-1">Washing Due: {row.washingApplicable ? <><UrgencyDot remainingDays={row.washingInfo!.remainingDays} /> {row.washingInfo!.nextDueDate}</> : <span className="text-slate-300 italic">Not Applicable</span>}</span>
                  <span className="col-span-2 flex items-center gap-1">AC Service Due: {row.acApplicable ? <><UrgencyDot remainingDays={row.acInfo!.remainingDays} /> {row.acInfo!.nextDueDate}</> : <span className="text-slate-300 italic">Not Applicable</span>}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= View panel - read-only, same pattern as Fleet &
          Vehicles' own detail view. Nothing here is editable. ================= */}
      {viewingRow && (() => {
        const vehicle = vehicleFor(viewingRow.regNo);
        const currentKm = currentKmFor(viewingRow.regNo);
        const warranty = warrantyInfoFor(viewingRow);
        return (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-700 text-white flex items-center justify-between sticky top-0 z-10">
                <h3 className="font-extrabold text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-slate-300" /> {viewingRow.regNo} - Full Details</h3>
                <button onClick={closeView} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-4 gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div><span className="block text-[9px] text-slate-400 uppercase font-bold">Vehicle No</span><span className="font-mono font-black text-slate-800">{viewingRow.regNo}</span></div>
                  <div><span className="block text-[9px] text-slate-400 uppercase font-bold">Reg Date</span><span className="font-mono text-slate-700">{regDateOf(vehicle || {}) || '-'}</span></div>
                  <div><span className="block text-[9px] text-slate-400 uppercase font-bold">Vehicle Type</span><span className="font-mono text-slate-700">{vehicleTypeOf(vehicle) || '-'}</span></div>
                  <div><span className="block text-[9px] text-slate-400 uppercase font-bold">Model</span><span className="font-mono text-slate-700">{modelOf(vehicle) || '-'}</span></div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><UserSearch className="w-3.5 h-3.5" /> Maintenance Reference</span>
                  <div className="grid grid-cols-2 gap-2.5 font-mono text-slate-700">
                    <div><span className="block text-[9px] text-slate-400 uppercase font-sans font-bold">Responsible</span>{viewingRow.reference?.responsible || <span className="text-slate-300">-</span>}</div>
                    <div><span className="block text-[9px] text-slate-400 uppercase font-sans font-bold">Last Service Done KM</span>{viewingRow.reference?.lastServiceDoneKm != null ? viewingRow.reference.lastServiceDoneKm.toLocaleString('en-IN') : <span className="text-slate-300">-</span>}</div>
                    <div><span className="block text-[9px] text-slate-400 uppercase font-sans font-bold">Warranty Period</span>{viewingRow.reference?.warrantyPeriod || <span className="text-slate-300">-</span>}</div>
                    <div><span className="block text-[9px] text-slate-400 uppercase font-sans font-bold">Service Period</span>{viewingRow.reference?.servicePeriod != null ? `${viewingRow.reference.servicePeriod.toLocaleString('en-IN')} km` : <span className="text-slate-300">-</span>}</div>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" /> Vehicle Service</span>
                  <div className="grid grid-cols-2 gap-2.5 font-mono text-slate-700">
                    <div><span className="block text-[9px] text-slate-400 uppercase font-sans font-bold">Current Odometer</span>{currentKm != null ? `${currentKm.toLocaleString('en-IN')} km` : <span className="text-slate-300 font-sans">No reading yet</span>}</div>
                    <div>
                      <span className="block text-[9px] text-slate-400 uppercase font-sans font-bold flex items-center gap-1"><ShieldCheck className="w-2.5 h-2.5" /> Warranty Status</span>
                      {warrantyBadge(warranty)}
                      {warranty?.warrantyEndDate && <span className="block text-[9px] text-slate-400 mt-0.5">Ends {warranty.warrantyEndDate}</span>}
                    </div>
                  </div>
                </div>

                {(['washing', 'acservice'] as const).map(kind => {
                  const cfg = CYCLE_TAB_CONFIG[kind];
                  const Icon = cfg.icon;
                  const applicable = kind === 'washing' ? viewingRow.washingApplicable : viewingRow.acApplicable;
                  const info = kind === 'washing' ? viewingRow.washingInfo : viewingRow.acInfo;
                  const lastDate = viewingRow.schedule?.[cfg.dateField];
                  const status = viewingRow.schedule?.[cfg.statusField];
                  return (
                    <div key={kind} className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> {cfg.label}</span>
                      {!applicable ? (
                        <p className="text-slate-300 italic text-[10px]">Not Applicable for this vehicle's category.</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2.5 font-mono text-slate-700">
                          <div><span className="block text-[9px] text-slate-400 uppercase font-sans font-bold">{cfg.dateLabel}</span>{lastDate || <span className="text-slate-300 font-sans">Not set</span>}</div>
                          <div><span className="block text-[9px] text-slate-400 uppercase font-sans font-bold">Due Date</span>{info!.nextDueDate}{info!.isDefaulted && <span className="text-slate-400 font-sans text-[9px]"> (from today)</span>}</div>
                          <div><span className="block text-[9px] text-slate-400 uppercase font-sans font-bold">Days Remaining</span><span className={remainingDaysColor(info!.remainingDays)}>{info!.remainingDays}</span></div>
                          <div><span className="block text-[9px] text-slate-400 uppercase font-sans font-bold">Status</span>{statusBadge(status)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex sticky bottom-0">
                <button type="button" onClick={closeView} className="w-full bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= Unified Edit panel - every manually-set field
          across Maintenance Reference, Vehicle Service, Washing and AC
          Service, in one place. Auto-calculated fields (Warranty Status,
          Due Dates, Days Remaining) are shown read-only for context, never
          as inputs. ================= */}
      {editingRow && form && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Edit2 className="w-4 h-4 text-blue-400" /> Edit - {editingRow.regNo}</h3>
              <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Reg Date</label>
                  <input type="text" readOnly value={regDateOf(vehicleFor(editingRow.regNo) || {}) || '-'} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 font-mono text-slate-600 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Vehicle Type</label>
                  <input type="text" readOnly value={vehicleTypeOf(vehicleFor(editingRow.regNo)) || '-'} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 font-mono text-slate-600 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Model</label>
                  <input type="text" readOnly value={modelOf(vehicleFor(editingRow.regNo)) || '-'} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 font-mono text-slate-600 cursor-not-allowed" />
                </div>
              </div>

              {/* Maintenance Reference */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><UserSearch className="w-3.5 h-3.5" /> Maintenance Reference</span>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Responsible</label>
                    <input type="text" placeholder="e.g. Vinod" value={refForm.responsible}
                      onChange={(e) => setRefForm(f => ({ ...f, responsible: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Last Service Done KM</label>
                    <input type="number" placeholder="0" value={refForm.lastServiceDoneKm}
                      onChange={(e) => setRefForm(f => ({ ...f, lastServiceDoneKm: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Warranty Period</label>
                    <input type="text" placeholder="e.g. 300000/3 YEAR" value={refForm.warrantyPeriod}
                      onChange={(e) => setRefForm(f => ({ ...f, warrantyPeriod: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Service Period (km)</label>
                    <input type="number" placeholder="e.g. 40000" value={refForm.servicePeriod}
                      onChange={(e) => setRefForm(f => ({ ...f, servicePeriod: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                </div>
              </div>

              {/* Vehicle Service */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" /> Vehicle Service</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Last Service Date</label>
                    <div className="flex items-center gap-1.5">
                      <DateInput value={form.lastServiceDate || ''} onChange={(e) => setForm(f => f && ({ ...f, lastServiceDate: e.target.value }))} max={todayIso()} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                      <button type="button" title="Mark done today" onClick={() => setForm(f => f && ({ ...f, lastServiceDate: todayIso(), serviceStatus: 'Completed' }))} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 cursor-pointer shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Odometer at Service (km)</label>
                    <input type="number" value={form.lastServiceKm ?? ''} onChange={(e) => setForm(f => f && ({ ...f, lastServiceKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                </div>
                {form.serviceHistory && form.serviceHistory.length > 0 && (
                  <p className="text-[9px] text-slate-400 font-mono flex items-start gap-1"><History className="w-3 h-3 shrink-0 mt-0.5" /> Previous: {form.serviceHistory.slice(0, 5).map(h => `${h.date}${h.km != null ? ` (${h.km.toLocaleString('en-IN')} km)` : ''}`).join(', ')}</p>
                )}
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Service Status</label>
                  <select value={form.serviceStatus || 'Pending'} onChange={(e) => setForm(f => f && ({ ...f, serviceStatus: e.target.value as 'Completed' | 'Pending' }))} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
                    <option value="Pending">Pending</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Current Odometer</span>
                    <span className="text-xs font-black text-slate-700">{currentKmFor(editingRow.regNo) != null ? `${currentKmFor(editingRow.regNo)!.toLocaleString('en-IN')} km` : <span className="text-slate-300 font-normal">No reading yet</span>}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Warranty Status</span>
                    {warrantyBadge(warrantyInfoFor(editingRow))}
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 font-mono">Current Odometer and Warranty Status are always computed - not editable here.</p>
              </div>

              {/* Washing / AC Service - editable date only, everything else read-only context. */}
              {(['washing', 'acservice'] as const).map(kind => {
                const cfg = CYCLE_TAB_CONFIG[kind];
                const Icon = cfg.icon;
                const applicable = kind === 'washing' ? editingRow.washingApplicable : editingRow.acApplicable;
                const preview = kind === 'washing' ? washingPreview : acPreview;
                if (!applicable) {
                  return (
                    <div key={kind} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> {cfg.label}</span>
                      <p className="text-slate-300 italic text-[10px] mt-1">Not Applicable for this vehicle's category.</p>
                    </div>
                  );
                }
                return (
                  <div key={kind} className="p-3 bg-cyan-50 rounded-xl border border-cyan-200 space-y-2">
                    <span className="text-[10px] font-bold text-cyan-700 uppercase flex items-center gap-1"><Bell className="w-3.5 h-3.5" /> {cfg.dateLabel}</span>
                    <div className="flex items-center gap-1.5">
                      <DateInput value={form[cfg.dateField] || ''} onChange={(e) => setForm(f => f && ({ ...f, [cfg.dateField]: e.target.value }))} max={todayIso()} className="w-full bg-white border border-cyan-200 rounded-lg p-2 font-mono text-slate-800" />
                      <button type="button" title="Mark done today" onClick={() => setForm(f => f && ({ ...f, [cfg.dateField]: todayIso(), [cfg.statusField]: 'Completed' }))} className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg border border-emerald-200 cursor-pointer shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                    </div>
                    {form[cfg.historyField] && (form[cfg.historyField] as { date: string }[]).length > 0 && (
                      <p className="text-[9px] text-slate-500 font-mono flex items-start gap-1"><History className="w-3 h-3 shrink-0 mt-0.5" /> Previous: {(form[cfg.historyField] as { date: string }[]).slice(0, 5).map(h => h.date).join(', ')}</p>
                    )}
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Service Status</label>
                      <select value={form[cfg.statusField] || 'Pending'} onChange={(e) => setForm(f => f && ({ ...f, [cfg.statusField]: e.target.value as 'Completed' | 'Pending' }))} className="w-full bg-white border border-cyan-200 rounded-lg p-2 text-slate-800 font-semibold">
                        <option value="Pending">Pending</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                    {preview && (
                      <div className="pt-2 border-t border-cyan-100 grid grid-cols-2 gap-2 font-mono">
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Due Date</span>
                          <span className="text-xs font-black text-slate-800">{preview.nextDueDate}{preview.isDefaulted && <span className="text-slate-400 font-normal text-[9px]"> (from today)</span>}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Days Remaining</span>
                          <span className={`text-xs font-black ${remainingDaysColor(preview.remainingDays)}`}>{preview.remainingDays}</span>
                        </div>
                      </div>
                    )}
                    <p className="text-[9px] text-cyan-800 font-mono">Due Date/Days Remaining are always computed - not editable here.</p>
                  </div>
                );
              })}

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Remarks</label>
                <textarea value={form.remarks || ''} onChange={(e) => setForm(f => f && ({ ...f, remarks: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 text-slate-800" />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 sticky bottom-0">
              <button type="button" onClick={closeEdit} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">Cancel</button>
              <button type="button" onClick={handleSave} disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SaveConfirmationModal key={saveConfirmation?.key} open={!!saveConfirmation} label={saveConfirmation?.label || 'Entry'} identifier={saveConfirmation?.identifier} onDone={() => setSaveConfirmation(null)} />
    </div>
  );
}
