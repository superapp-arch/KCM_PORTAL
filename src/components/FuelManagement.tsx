import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { FuelLog, MileageReport, Vehicle, VehicleDocument, User, VehicleMileage, Vendor, StaffEmployee, DriverEmployee } from '../types';
import SortHeader from './SortHeader';
import { SortState, SortDirection, extractLeadingNumber, compareText, compareNumber } from '../utils/sort';
import { handleVehicleNumberEnterKey } from '../utils/vehicleNumberSearch';
import { nextBunkFuelIndentNumber, nextCardFuelIndentNumber } from '../utils/fuelIndentNumber';
import {
  Fuel,
  Plus,
  Search,
  Landmark,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Paperclip,
  X,
  Building2,
  Download,
  Gauge,
  HelpCircle,
  ArrowRightLeft,
  DollarSign,
  User as UserIcon,
  Lock,
  Check
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';
import DateInput from './DateInput';
import { authFetch } from '../authFetch';
import { SaveConfirmationModal, DeleteConfirmationModal } from './ConfirmationModal';
import { PETTY_CASH_USERS } from '../utils/pettyCashUsers';

const LOCATIONS = [
  'AP', 'Nelmangala', 'Belagaum', 'BLR', 'Chennai', 'Goa', 'Hyderabad', 'Hassan',
  'Hoskote', 'Kandlakoya', 'Mysore', 'Manoharabad', 'Vijayawada', 'Vizag'
];

const BUNK_NAMES = [
  'Atharv', 'Kamala', 'H V Subbaya', 'HPCL', 'Isnapur', 'Lakshmi',
  'OM Petroleum', 'Simhadhri', 'Sri Sai Baba', 'Sri Venkateshwara',
  'Tejashri', 'Vayuputra', 'Visalakshi'
];

const CLIENTS = ['KCM', 'Swiggy', 'Reliance', 'Market Vehicle', 'Shadowfax', 'One Time Vendor'];

// Requested By - search-as-you-type suggestions (2026-09-02), same native
// list/datalist pattern already used for Bunk Name and Vehicle Number below:
// still a free-text field (a name outside this list can still be typed and
// saved), the datalist just surfaces a matching name after a few letters so
// picking one of these doesn't need to be typed out in full.
const REQUESTED_BY_NAMES = [
  'Hemanth', 'Shashi Supervisor', 'Sathaya Prakash', 'Bharath Supervisor',
  'Muniraj Supervisor', 'Saneel', 'Gangaraju Supervisor', 'Pavan Supervisor',
  'Arun Supervisor'
];

// Extra Fuel accepts a sum-of-numbers expression typed directly into the
// field (e.g. "30+40" for two separate top-ups during one trip - say
// Bangalore->Mysore, one top-up mid-route and another near the destination)
// instead of requiring the office to add them up by hand first or needing
// two separate fields; a single plain number still works exactly as before.
// Non-numeric/empty segments are ignored rather than breaking the whole sum.
const sumExtraFuelExpression = (raw: string): number =>
  raw.split('+').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)).reduce((sum, n) => sum + n, 0);

// Resolves the [start, end] date-string window (inclusive) for a "Day /
// Monthly Till Date / Year Till Date" period relative to a reference date -
// shared by the on-screen ledger's view-scope tabs and the "Download Fuel
// Report" panel below (independent controls, same underlying math).
const getPeriodDateRange = (period: 'day' | 'month' | 'year', refDate: string): { start: string; end: string } => {
  if (period === 'day') return { start: refDate, end: refDate };
  if (period === 'month') return { start: `${refDate.slice(0, 7)}-01`, end: refDate };
  return { start: `${refDate.slice(0, 4)}-01-01`, end: refDate };
};

// Which bunks are available at each location, so selecting one filters/
// auto-fills the other. Bunks shared across multiple locations (HPCL) are
// deliberately not reverse-mapped back to a single location.
const LOCATION_BUNK_MAP: Record<string, string[]> = {
  Hoskote: ['Sri Venkateshwara'],
  Nelmangala: ['Kamala'],
  Hyderabad: ['Sri Sai Baba', 'Isnapur'],
  Kandlakoya: ['Vayuputra'],
  Mysore: ['Simhadhri'],
  Vizag: ['Visalakshi'],
  Hassan: ['H V Subbaya'],
  BLR: ['HPCL'],
  Chennai: ['HPCL'],
  Goa: ['HPCL'],
  Belagaum: ['OM Petroleum', 'Atharv'],
  Vijayawada: ['Tejashri'],
  Manoharabad: ['Lakshmi']
};

// Reverse lookup, built once: a bunk maps back to a location only when it
// belongs to exactly one location (skips shared bunks like HPCL).
const BUNK_LOCATION_MAP: Record<string, string> = (() => {
  const counts: Record<string, number> = {};
  const map: Record<string, string> = {};
  Object.entries(LOCATION_BUNK_MAP).forEach(([loc, bunks]) => {
    bunks.forEach(bunk => {
      counts[bunk] = (counts[bunk] || 0) + 1;
      map[bunk] = loc;
    });
  });
  Object.keys(map).forEach(bunk => { if (counts[bunk] > 1) delete map[bunk]; });
  return map;
})();

interface FuelManagementProps {
  user: User;
  logs: FuelLog[];
  onAddLog: (log: Omit<FuelLog, 'id'>) => Promise<void>;
  onUpdateLog: (id: string, log: Partial<FuelLog>) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
  // Restricted RQ-ID-only update path for Divya (see requireFuelAccess/
  // FUEL_RQ_ID_ONLY_EMAILS in server.ts) - updates only the rqId field on an
  // existing entry, nothing else.
  onUpdateFuelLogRqId: (id: string, rqId: string) => Promise<void>;
  vehicles: Vehicle[];
  drivers: DriverEmployee[];
  mileageReports: MileageReport[];
  // Returns the new report's id so the fuel log being saved alongside it can
  // link to it (FuelLog.mileageReportId).
  onAddMileageReport: (report: Omit<MileageReport, 'id'>) => Promise<string | undefined>;
  onUpdateMileageReport: (id: string, report: Partial<MileageReport>) => Promise<void>;
  onDeleteMileageReport: (id: string) => Promise<void>;
  vehicleMileages: VehicleMileage[];
  onAddVehicleMileage: (entry: Omit<VehicleMileage, 'id'>) => Promise<void>;
  onUpdateVehicleMileage: (id: string, entry: Partial<VehicleMileage>) => Promise<void>;
  onDeleteVehicleMileage: (id: string) => Promise<void>;
  // Read-only lookup into the Vendor Management registry (separate module,
  // separate access group) - used only to auto-fill/select Vehicle Number
  // when the typed Vendor Name matches a registered vendor there.
  vendorProfiles: Vendor[];
  employees: StaffEmployee[];
}

// Divya's restricted RQ-ID-only edit control for a single ledger row - inline
// so she never opens the full Add/Edit sidebar, which stays off-limits to her.
function RqIdEditableCell({ log, onSave }: { log: FuelLog; onSave: (id: string, rqId: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(log.rqId || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(log.rqId || ''); }, [log.rqId]);

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span>{log.rqId || '-'}</span>
        <button type="button" onClick={() => setEditing(true)} className="text-blue-500 hover:text-blue-700 cursor-pointer" title="Edit RQ ID">
          <Edit2 className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        className="w-24 bg-white border border-blue-300 rounded px-1.5 py-0.5 font-mono text-slate-800"
      />
      <button
        type="button"
        disabled={saving}
        onClick={async () => { setSaving(true); try { await onSave(log.id, value.trim()); setEditing(false); } finally { setSaving(false); } }}
        className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
        title="Save"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => { setValue(log.rqId || ''); setEditing(false); }}
        className="text-slate-400 hover:text-rose-600 cursor-pointer"
        title="Cancel"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function FuelManagement({
  user,
  logs,
  onAddLog,
  onUpdateLog,
  onDeleteLog,
  onUpdateFuelLogRqId,
  vehicles,
  drivers,
  mileageReports,
  onAddMileageReport,
  onUpdateMileageReport,
  onDeleteMileageReport,
  vehicleMileages,
  onAddVehicleMileage,
  onUpdateVehicleMileage,
  onDeleteVehicleMileage,
  vendorProfiles,
  employees
}: FuelManagementProps) {
  const isSuperAdmin = user.department === 'super_admin';
  // Divya sees every fuel entry (to manage RQ IDs) but cannot add entries or
  // edit anything except RQ ID on an existing one - mirrors server.ts's
  // FUEL_RQ_ID_ONLY_EMAILS exactly.
  const isRqIdOnlyUser = user.email === 'divya@kcmlogistics.in';
  // Chandan's one-way exception: Praveen's own entries are visible to him
  // (server.ts's filterFuelLogsForViewer) so he can fill in the Mileage
  // section on ones Praveen left blank - but nothing else on that row is his
  // to touch, and it's never his to delete. The server strips enteredBy from
  // every row a viewer entered themselves, so a row that still HAS an
  // enteredBy (for a viewer who isn't a super admin or the RQ-ID-only
  // viewer, who both always get it on every row) is exactly this "not mine"
  // signal - see server.ts's own comment on filterFuelLogsForViewer.
  const isForeignEntry = (log: FuelLog): boolean => !isSuperAdmin && !isRqIdOnlyUser && !!log.enteredBy;

  const [searchTerm, setSearchTerm] = useState('');
  // Bunk Name filter - shared between the on-screen ledger, the Download
  // Fuel Report panel, and Bunk Summary's own download (picking a bunk to
  // view also scopes what gets downloaded, which is the expected pairing).
  const [bunkFilter, setBunkFilter] = useState('All');
  // Bunk/Card filter - whichever payment method (Bunk vs Card) an entry was
  // logged under, independent of the Bunk Name filter above.
  const [bunkOrCardFilter, setBunkOrCardFilter] = useState<'All' | 'Bunk' | 'Card'>('All');
  // Defaults to Indent No descending (highest/most-recent indent number
  // first), NOT Date - Indent Nos are entered by hand and don't necessarily
  // land in date order, so sorting by Date scrambled them and made it hard
  // to see the last-used number when starting the next entry. Sorting by
  // Indent No descending keeps that number visible right at the top instead.
  // Still fully overridable via the Sort By dropdown or the column sort
  // headers (Date/Vehicle No).
  const [sort, setSort] = useState<SortState | null>({ key: 'indentNumber', direction: 'desc' });
  const handleSort = (key: string, direction: SortDirection) => setSort({ key, direction });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Big, centered save/delete confirmation (see ConfirmationModal.tsx) -
  // replaces the old small below-button toast. `key` increments on every
  // save/delete so React remounts it fresh each time, even for back-to-back
  // actions on the same Indent No.
  const [saveConfirmation, setSaveConfirmation] = useState<{ indentNumber: string; key: number } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ indentNumber: string; key: number } | null>(null);

  // Period-based report download - reference date + day/month/year-till-date dropdown.
  const [downloadDate, setDownloadDate] = useState(new Date().toISOString().slice(0, 10));
  const [downloadPeriod, setDownloadPeriod] = useState<'day' | 'month' | 'year'>('day');

  // On-screen ledger view scope - independent of the download controls above
  // (viewing a period doesn't require also downloading it, and vice versa).
  // Defaults to 'all' (every entry, today's existing behavior) so opening
  // this module never looks like data went missing - Day/Month Till
  // Date/Year Till Date are an opt-in narrower view. 'day' = just viewDate;
  // 'month' = the 1st of viewDate's month through viewDate itself ("Monthly
  // Till Date" - pick any date inside the target month); 'year' likewise
  // from Jan 1 of viewDate's year.
  const [viewPeriod, setViewPeriod] = useState<'all' | 'day' | 'month' | 'year'>('all');
  const [viewDate, setViewDate] = useState(new Date().toISOString().slice(0, 10));

  // Sidebar / editing state
  const [showSidebar, setShowSidebar] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Add/Edit sidebar tab: fuel details are entered first, then the user
  // switches to the Mileage tab - keeps the form from showing every mileage
  // field stacked above the fuel fields at once. Both tabs stay inside the
  // one <form>, so a single Save still submits everything together.
  const [entrySection, setEntrySection] = useState<'details' | 'mileage'>('details');

  // Fuel Entry form fields
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('');
  // Whether the Location dropdown is in "Other (New Location)" mode - shows
  // a separate manual-entry field instead of the fixed LOCATIONS list, for a
  // location that hasn't been used before. Derived fresh whenever the form
  // opens/resets (see resetForm/startEdit) rather than solely from whether
  // `location` matches LOCATIONS, so picking "Other" and clearing the field
  // to start typing doesn't immediately snap back to the dropdown view.
  const [locationIsOther, setLocationIsOther] = useState(false);
  const [bunkName, setBunkName] = useState('');
  const [bunkOrCard, setBunkOrCard] = useState<'Bunk' | 'Card'>('Bunk');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [indentNumber, setIndentNumber] = useState('');
  // True only when the live server preview (GET /api/fuel/next-indent-number)
  // never came back after retrying and this field got filled from this
  // browser's own already-loaded `logs` instead (see the auto-continue
  // effect below) - shown as a small inline warning so the office knows to
  // double-check the number rather than assuming it's as authoritative as
  // the normal server-computed preview always was.
  const [indentNumberIsLocalEstimate, setIndentNumberIsLocalEstimate] = useState(false);
  // True only while the Indent No. preview fetch above is actually in
  // flight - lets the field tell apart "still loading" from "loaded, and
  // genuinely nothing to continue from" (see the first-of-period hint below)
  // instead of both looking like the same blank field.
  const [indentNumberLoading, setIndentNumberLoading] = useState(false);
  // Bumped by every resetForm() call, keepOpen or not - see the Indent No.
  // auto-continue effect below. It's the one dependency that reliably
  // changes on a back-to-back "add another" save, when Bunk Name/Date/
  // Bunk-Card/showSidebar can all legitimately stay exactly the same as the
  // entry that was just committed (same bunk stop, same day).
  const [formResetToken, setFormResetToken] = useState(0);
  const [ltrs, setLtrs] = useState('');
  const [rate, setRate] = useState('');
  const [amount, setAmount] = useState('');
  const [client, setClient] = useState('');
  const [entryType, setEntryType] = useState<'Vendor' | 'KCM'>('KCM');
  const [vendorName, setVendorName] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [remarks, setRemarks] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [rqId, setRqId] = useState('');
  const [entryDocs, setEntryDocs] = useState<VehicleDocument[]>([]);

  // --- Mileage section (top of the Fuel Entry form) - creates/updates a
  // linked MileageReport (Fleet Mileage Tracker) alongside this fuel entry,
  // mirroring the same fields/rules the old standalone Trip Details form used.
  const [linkedMileageReportId, setLinkedMileageReportId] = useState<string | null>(null);
  const [mOpeningKm, setMOpeningKm] = useState('');
  const [mClosingKm, setMClosingKm] = useState('');
  const [mTotalKm, setMTotalKm] = useState('');
  const [mTotalLtrs, setMTotalLtrs] = useState(''); // Litres + Extra Fuel - see sumExtraFuelExpression
  const [mMileage, setMMileage] = useState('');
  const [mCostPerKm, setMCostPerKm] = useState('');
  const [mActualMileage, setMActualMileage] = useState('');
  const [mDriverName, setMDriverName] = useState('');
  const [mDriverId, setMDriverId] = useState('');
  const [mRemarks, setMRemarks] = useState('');
  const [mExtraFuel, setMExtraFuel] = useState('');
  const [mRatePerLitreNew, setMRatePerLitreNew] = useState('');
  const [mTotalAmount, setMTotalAmount] = useState('');
  // "Paid by Petty Cash" for Extra Fuel - see MileageReport.extraFuelPaymentMode.
  // 'normal' (default) is today's original behavior (extraFuel folds into
  // Total Ltrs/Total Amount below); 'petty_cash' excludes it from both
  // instead, routing its cost to a linked Petty Cash voucher server-side
  // (see server.ts's syncFuelExtraPettyCashLink) rather than double-counting
  // it here as a normal fuel expense.
  const [mExtraFuelPaymentMode, setMExtraFuelPaymentMode] = useState<'normal' | 'petty_cash'>('normal');
  const [mPettyCashHolder, setMPettyCashHolder] = useState('');
  const [showMileageManager, setShowMileageManager] = useState(false);
  const [mileageFormVehicleNo, setMileageFormVehicleNo] = useState('');
  const [mileageFormValue, setMileageFormValue] = useState('');

  // Bunk-wise Summary panel (top of page, beside Average Rate/Litre): For
  // the Day (today's entries only - was "Till Date"/all-time before) vs
  // This Month (unchanged).
  const [bunkSummaryPeriod, setBunkSummaryPeriod] = useState<'day' | 'month'>('day');

  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  // Vehicle Number autofetch list: registered fleet + previously entered numbers
  const vehicleList = Array.from(
    new Set([
      ...vehicles.map(v => v.regNo || v['Reg. No.'] || '').filter(Boolean),
      ...vendorProfiles.flatMap(v => v.vehicleNumbers || []),
      ...logs.map(l => l.vehicleNumber).filter(Boolean)
    ])
  ).sort();

  // Vehicle Number Enter-to-complete (shared with every other Vehicle Number
  // field across the app - see utils/vehicleNumberSearch.ts): typing just
  // the last few digits (e.g. "9514") and pressing Enter resolves and fills
  // in the full registration number instead of leaving the partial digits
  // sitting in the field, and prevents that Enter from prematurely
  // submitting the whole form.
  const handleVehicleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>
    handleVehicleNumberEnterKey(e, vehicleNumber, vehicleList, setVehicleNumber);

  // Authorized Driver autofetch list, from Driver Details
  const driverNameList = Array.from(new Set(drivers.map(d => d.name).filter(Boolean))).sort();

  // Driver ID auto-fetch: only resolves when Authorized Driver contains
  // exactly one name that exactly matches exactly one registered driver
  // (same single-name-only rule as the fuel-audit note's resolveDriverWord
  // below) - multiple names ("Suresh / Adhithya") or an unregistered name
  // leave Driver ID for manual entry instead.
  const matchedMileageDriver = (() => {
    const names = mDriverName.split('/').map(n => n.trim()).filter(Boolean);
    if (names.length !== 1) return undefined;
    const matches = drivers.filter(d => (d.name || '').trim().toLowerCase() === names[0].toLowerCase());
    return matches.length === 1 ? matches[0] : undefined;
  })();

  // Auto-fills when a match is found; never clears an already-typed Driver ID
  // just because the name stopped matching, so a manually-entered ID for a
  // not-yet-registered driver is never silently wiped.
  useEffect(() => {
    if (matchedMileageDriver) setMDriverId(matchedMileageDriver.id);
  }, [matchedMileageDriver]);

  // Every bunk name available to filter by - the fixed BUNK_NAMES list plus
  // any other bunk name that's actually shown up in the ledger (a new bunk
  // typed in that isn't in the fixed list yet) - used by both the ledger's
  // own Bunk Name filter and the Download/Bunk Summary panels below.
  const usedBunks = Array.from(new Set([...BUNK_NAMES, ...logs.map(l => l.bunkName).filter(Boolean)])).sort();

  // Amount auto-calc = Ltrs * Rate (editable override afterward)
  useEffect(() => {
    const l = parseFloat(ltrs) || 0;
    const r = parseFloat(rate) || 0;
    setAmount(String(parseFloat((l * r).toFixed(2))));
  }, [ltrs, rate]);

  // RQ ID: whenever Client is "KCM", it auto-fills to "KCM". Regardless of
  // Client, the field is locked for everyone except Divya (who manages RQ
  // IDs directly, here and via her exclusive inline edit on the ledger
  // table) and a Super Admin override - nobody else can set or change it on
  // this form, on any entry.
  useEffect(() => {
    if (client === 'KCM') setRqId('KCM');
  }, [client]);
  const rqIdLocked = !isRqIdOnlyUser && user.department !== 'super_admin';

  // Whether the entry currently open in the sidebar is a foreign one
  // (Chandan viewing one of Praveen's) - drives the Details fieldset lock
  // below and the Delete button's visibility in the ledger table.
  const editingLog = editingId ? logs.find(l => l.id === editingId) : undefined;
  const editingIsForeign = !!editingLog && isForeignEntry(editingLog);

  // Client = "One Time Vendor" auto-sets Type to "Vendor" - the user
  // shouldn't have to also manually flip Type after picking this Client.
  // One-directional only: Type stays a normal, freely-editable field the
  // rest of the time (nothing forces it back when Client changes away from
  // One Time Vendor, same as Client=KCM never locks Type either).
  useEffect(() => {
    if (client === 'One Time Vendor') setEntryType('Vendor');
  }, [client]);

  // Vendor Name/Code/Vehicle all come from the Vendor Management registry
  // (vendorProfiles) - there is no separate "Manage Vendors" list anymore.
  // Requires a non-empty vendorName so an empty/malformed vendor record
  // (missing name) can never false-match the field's blank initial state.
  const matchedVendorProfile = vendorName.trim() ? vendorProfiles.find(
    v => (v.name || '').trim().toLowerCase() === vendorName.trim().toLowerCase()
  ) : undefined;

  // Vendor Code auto-fill based on the selected Vendor Name
  useEffect(() => {
    if (matchedVendorProfile) setVendorCode(matchedVendorProfile.code);
  }, [matchedVendorProfile]);

  // Vehicle Number auto-fill: if the matched vendor has exactly one
  // registered vehicle, fill it directly; if several, a picker is shown
  // below instead so the user chooses which one.
  useEffect(() => {
    if (matchedVendorProfile && (matchedVendorProfile.vehicleNumbers || []).length === 1) {
      setVehicleNumber(matchedVendorProfile.vehicleNumbers[0]);
    }
  }, [matchedVendorProfile]);

  // Reverse lookup: Vehicle Number -> Vendor Name/Code, the other direction
  // from matchedVendorProfile above (which goes Vendor Name -> Vehicle
  // Number). Selecting/typing a vehicle number that's registered against a
  // Vendor Management vendor auto-fills that vendor's Name and Code here too
  // - still sourced only from vendorProfiles (Vendor Management), never a
  // second maintained list.
  //
  // A genuine Vendor Management registration always wins (2026-09-11
  // correction, per direct instruction) - a vehicle can legitimately be both
  // in Fleet & Vehicles AND registered under a vendor's own vehicleNumbers
  // (e.g. KA51AH3973 / Chandrashekar VK), and that vendor's Name/Code must
  // still auto-fill in that case. An earlier version of this effect had it
  // backwards - treating any Fleet match as an automatic override that
  // cleared Vendor Name/Code even when a real vendor registration existed,
  // which is exactly the bug this fixes. Only a vehicle that's Fleet-owned
  // AND NOT registered under any vendor gets its Vendor Name/Code cleared;
  // a vehicle number that's neither Fleet nor a registered vendor vehicle
  // leaves the gap alone for manual entry.
  const isFleetVehicleNumber = (num: string) =>
    vehicles.some(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === num.trim().toUpperCase());
  const matchedVendorByVehicle = vehicleNumber.trim() ? vendorProfiles.find(
    v => (v.vehicleNumbers || []).some(n => n.trim().toUpperCase() === vehicleNumber.trim().toUpperCase())
  ) : undefined;
  useEffect(() => {
    const trimmed = vehicleNumber.trim();
    if (!trimmed) return;
    if (matchedVendorByVehicle) {
      setVendorName(matchedVendorByVehicle.name);
      setVendorCode(matchedVendorByVehicle.code);
      return;
    }
    if (isFleetVehicleNumber(trimmed)) {
      setVendorName('');
      setVendorCode('');
      return;
    }
    // Not Fleet-owned and not registered in Vendor Management - fall back to
    // this vehicle's own most recent Fuel Management entry: if it was last
    // logged as a One Time Vendor, assume the same for this entry too, so
    // the office doesn't have to re-select it every single time that
    // vehicle shows up again. Any other/blank prior vendorName is left
    // alone for manual entry, same as before.
    const priorLog = [...logs]
      .filter(l => (l.vehicleNumber || '').trim().toUpperCase() === trimmed.toUpperCase())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if ((priorLog?.vendorName || '').trim().toLowerCase() === 'one time vendor') {
      setVendorName('One Time Vendor');
      setVendorCode('Vendor');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleNumber, vehicles, matchedVendorByVehicle, logs]);

  // Vendor Name = "One Time Vendor" auto-sets Vendor Code to "Vendor" - same
  // one-directional auto-fill idea as Client=One Time Vendor -> Type=Vendor
  // above; Vendor Code stays freely editable the rest of the time.
  useEffect(() => {
    if (vendorName.trim().toLowerCase() === 'one time vendor') setVendorCode('Vendor');
  }, [vendorName]);

  // Bunk options for the currently selected location, per LOCATION_BUNK_MAP -
  // falls back to the full list if the location isn't mapped (or none picked).
  const bunkOptionsForLocation = location && LOCATION_BUNK_MAP[location] ? LOCATION_BUNK_MAP[location] : BUNK_NAMES;

  // Location -> Bunk: auto-fill when the location maps to exactly one bunk.
  useEffect(() => {
    const bunks = location ? LOCATION_BUNK_MAP[location] : undefined;
    if (bunks && bunks.length === 1) setBunkName(bunks[0]);
  }, [location]);

  // Bunk -> Location: auto-fill only when that bunk belongs to exactly one
  // location (skipped for bunks shared across locations, like HPCL).
  useEffect(() => {
    const loc = BUNK_LOCATION_MAP[bunkName];
    if (loc) setLocation(loc);
  }, [bunkName]);

  // Same-(bunk, date) Rate carry-forward: the first entry for a bunk on a
  // given day sets the rate; later entries for that same bunk that day
  // auto-fill it. A new date (or backdated entry for a different date)
  // requires fresh manual entry, keyed off whatever date is in the form.
  useEffect(() => {
    if (!bunkName || !date || editingId) return;
    const sameBunkDayLogs = logs.filter(l => l.bunkName === bunkName && l.date === date);
    if (sameBunkDayLogs.length > 0) {
      setRate(String(sameBunkDayLogs[sameBunkDayLogs.length - 1].rate));
    }
  }, [bunkName, date, logs, editingId]);

  // Indent No auto-continue - Bunk and Card are two completely independent
  // sequences (see utils/fuelIndentNumber.ts's nextBunkFuelIndentNumber/
  // nextCardFuelIndentNumber), preferring the live server preview via GET
  // /api/fuel/next-indent-number (computed fresh from the actual saved
  // database rows, not this form's own possibly-stale `logs` prop) so two
  // people adding entries at the same time both see the real next number and
  // never collide. Bunk continues within the selected Date's calendar month
  // (blank on the first entry of a new month - typed by hand, then
  // auto-continues from there for the rest of that month); Card is one
  // continuous 5-digit sequence that never resets and ignores Date entirely.
  // Still just a prefill - fully editable afterward, and the actual save is
  // re-validated server-side (duplicate check) regardless of what ends up in
  // this field.
  //
  // 2026-09-10: a bare, un-retried fetch here used to leave the field
  // silently blank on any single transient failure (a DB/network blip, a
  // deploy mid-restart) - the office had no idea why, and could only "fix"
  // it by repeatedly re-opening the form and hoping the next attempt
  // happened to land after the blip passed. Now retries twice (short
  // backoff) before giving up, and only THEN falls back to the same
  // algorithm computed from this browser's own already-loaded `logs` -
  // slightly less authoritative than the live server preview (another
  // device's very latest entry might not be in this browser's own cache
  // yet), but always something concrete instead of a silent blank, and
  // flagged via indentNumberIsLocalEstimate so the inline warning below
  // tells the office to double-check it.
  //
  // Also keyed off `showSidebar` and `formResetToken`, not just
  // [bunkOrCard, date, editingId] - resetForm() (see "Add Entry" button
  // below) unconditionally clears indentNumber to '' every time the form is
  // reset, but if bunkOrCard/date/editingId all happen to already equal
  // their previous values (the common case - same day, still Bunk), those 3
  // alone never change and this effect would never re-run to refill it,
  // leaving the field permanently blank after that clear. showSidebar
  // covers a fresh open of "Add Entry" (false -> true is always a real
  // change); formResetToken additionally covers the back-to-back "add
  // another" case (2026-09-02 fix) - resetForm(true) after a save keeps the
  // sidebar open throughout, so showSidebar never toggles there either, and
  // without formResetToken this preview would keep showing the just-used
  // (now taken) number for every entry after the first in the same session.
  useEffect(() => {
    if (!showSidebar || editingId) { setIndentNumberLoading(false); return; }
    if (bunkOrCard === 'Bunk' && !date) { setIndentNumberLoading(false); return; }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const params = new URLSearchParams({ bunkOrCard });
    if (bunkOrCard === 'Bunk') params.set('date', date);
    setIndentNumberLoading(true);

    const MAX_ATTEMPTS = 3;
    const attempt = (n: number) => {
      authFetch(`/api/fuel/next-indent-number?${params.toString()}`)
        .then(async r => {
          if (!r.ok) throw new Error(`status ${r.status}`);
          const body = await r.json();
          if (!body || typeof body !== 'object' || !('indentNumber' in body)) throw new Error('malformed response');
          return body as { indentNumber: string | null };
        })
        .then(body => {
          if (cancelled) return;
          setIndentNumber(body.indentNumber || '');
          setIndentNumberIsLocalEstimate(false);
          setIndentNumberLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          if (n < MAX_ATTEMPTS - 1) {
            retryTimer = setTimeout(() => attempt(n + 1), 500 * (n + 1));
            return;
          }
          // Every attempt failed - fall back to a local estimate rather than
          // leaving the field silently blank (see this effect's own comment
          // above).
          setIndentNumberLoading(false);
          const estimate = bunkOrCard === 'Card'
            ? nextCardFuelIndentNumber(logs, user.username)
            : nextBunkFuelIndentNumber(logs, date, user.username);
          setIndentNumber(estimate || '');
          setIndentNumberIsLocalEstimate(true);
        });
    };
    attempt(0);
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bunkOrCard, date, editingId, showSidebar, formResetToken]);

  // True once the preview above has actually finished loading, isn't a
  // failed-fetch local estimate, and still came back blank - i.e. this is
  // genuinely the first entry of a new month (Bunk) or the first entry ever
  // under this login (Card), by design (see nextBunkFuelIndentNumber's own
  // comment) - not a bug. 2026-09-02: surfaced as an unmissable banner
  // instead of only the small grey caption below, since the tiny caption
  // alone was clearly not enough - the same "Indent No. isn't coming" report
  // kept recurring right as a new calendar month started, which is exactly
  // when this by-design blank is expected to show up for the very first
  // entry.
  const indentNumberFirstOfPeriod = !editingId && !indentNumberLoading && !indentNumberIsLocalEstimate && !indentNumber
    && (bunkOrCard === 'Card' || !!date);
  const indentNumberPeriodLabel = bunkOrCard === 'Bunk' && date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : '';

  // --- Mileage section calculations - identical rules to the old standalone
  // Trip Details form (see MileageReport.tsx), just keyed off this form's own
  // Vehicle Number/Date/Rate/Ltrs/Amount instead of re-entering them. ---

  // The selected vehicle's fixed Actual Mileage reference from the Vehicle
  // Mileage Master (same value editable from Fleet & Vehicles).
  const fixedMileageForVehicle = vehicleMileages.find(
    v => (v.vehicleNo || '').trim().toUpperCase() === vehicleNumber.trim().toUpperCase()
  )?.mileage;

  // Opening KM: auto-fill from this vehicle's last mileage report's Closing
  // KM; first-ever entry for a vehicle is entered manually.
  //
  // The "don't clobber it while editing the same vehicle" guard only holds
  // when there's actually a saved Opening KM to protect. A fuel entry is
  // routinely saved *before* its Mileage section is filled in (diesel logged
  // at fill-up, trip details added afterward) - editing that entry later has
  // editingId set and the vehicle unchanged, but mOpeningKm is still blank,
  // so the old guard skipped auto-fill entirely and this field just sat
  // empty forever. Checking mOpeningKm too means it only skips when there's
  // a real previously-saved/auto-filled value worth preserving.
  useEffect(() => {
    if (!vehicleNumber) return;
    const editingSameVehicleWithOpeningKm =
      editingId && logs.find(l => l.id === editingId)?.vehicleNumber === vehicleNumber && mOpeningKm;
    if (editingSameVehicleWithOpeningKm) return;
    const vehicleReports = mileageReports
      .filter(r => (r.vehicleNo || '').trim().toUpperCase() === vehicleNumber.trim().toUpperCase())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (vehicleReports.length > 0) {
      const lastReport = vehicleReports[vehicleReports.length - 1];
      setMOpeningKm(String(lastReport.closingKm));
    } else if (!editingId) {
      setMOpeningKm('');
    }
    // mOpeningKm deliberately excluded - it's only read here to decide
    // whether to skip, not something this effect should re-run for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleNumber, mileageReports, editingId, logs]);

  // Authorized Driver: auto-fills from this vehicle's most recent prior
  // entry (its latest saved mileage report) - same "last entry wins"
  // pattern as Opening KM above. If this vehicle has never had an entry
  // before, falls back to Driver Details' own vehicle assignment (a driver
  // whose Vehicle No(s) includes this one) - so a first-time vehicle still
  // auto-fills when the office already knows who normally drives it. If
  // neither source has anything, it's left blank for manual (first-time)
  // entry, same as before. The driver can still be changed by hand for any
  // one entry (a substitute driver that day, say) - that becomes the new
  // "latest" (from the mileage-report history, not the Driver Details
  // assignment), so the vehicle's very next entry then picks up from it.
  // Driver ID keeps auto-fetching off whatever driver name ends up here via
  // the separate matchedMileageDriver effect further below.
  useEffect(() => {
    if (!vehicleNumber) return;
    const editingSameVehicleWithDriver =
      editingId && logs.find(l => l.id === editingId)?.vehicleNumber === vehicleNumber && mDriverName;
    if (editingSameVehicleWithDriver) return;
    const vehicleReports = mileageReports
      .filter(r => (r.vehicleNo || '').trim().toUpperCase() === vehicleNumber.trim().toUpperCase() && r.driverName)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (vehicleReports.length > 0) {
      const lastReport = vehicleReports[vehicleReports.length - 1];
      setMDriverName(lastReport.driverName || '');
      setMDriverId(lastReport.driverId || '');
      return;
    }
    const assignedDriver = drivers.find(d => {
      const target = vehicleNumber.trim().toUpperCase();
      return (d.vehicleNos || []).some(v => (v || '').trim().toUpperCase() === target) ||
        (d.vehicleNo || '').trim().toUpperCase() === target;
    });
    if (assignedDriver) {
      setMDriverName(assignedDriver.name || '');
      setMDriverId(assignedDriver.id || '');
    } else if (!editingId) {
      setMDriverName('');
      setMDriverId('');
    }
    // mDriverName deliberately excluded - same reasoning as mOpeningKm above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleNumber, mileageReports, editingId, logs, drivers]);

  // Actual Mileage = the vehicle's fixed reference rating (per-vehicle
  // constant), not computed per trip.
  useEffect(() => {
    setMActualMileage(fixedMileageForVehicle != null ? String(fixedMileageForVehicle) : '0');
  }, [fixedMileageForVehicle]);

  // Total KM = Closing KM - Opening KM
  useEffect(() => {
    const o = parseFloat(mOpeningKm) || 0;
    const c = parseFloat(mClosingKm) || 0;
    setMTotalKm(c >= o ? String(c - o) : '0');
  }, [mOpeningKm, mClosingKm]);

  // Total Ltrs = Litres (from the Fuel Entry section above) + Extra Fuel -
  // the actual total fuel consumed this trip, including any mid-trip
  // top-up(s). Extra Fuel accepts a sum expression like "30+40" - see
  // sumExtraFuelExpression. EXCEPT when Extra Fuel is Paid by Petty Cash -
  // then it's litres only, since that fuel's cost/litres are tracked
  // entirely through the linked Petty Cash voucher instead (see
  // MileageReport.extraFuelPaymentMode).
  useEffect(() => {
    const l = parseFloat(ltrs) || 0;
    const extra = sumExtraFuelExpression(mExtraFuel);
    const total = mExtraFuelPaymentMode === 'petty_cash' ? l : l + extra;
    setMTotalLtrs(String(parseFloat(total.toFixed(2))));
  }, [ltrs, mExtraFuel, mExtraFuelPaymentMode]);

  // Mileage (this trip, real achieved efficiency) = Total KM / Total Ltrs -
  // NOT the bare Litres field, since fuel topped up mid-trip is fuel that
  // trip actually used.
  useEffect(() => {
    const tKm = parseFloat(mTotalKm) || 0;
    const tL = parseFloat(mTotalLtrs) || 0;
    setMMileage(tL > 0 ? String(parseFloat((tKm / tL).toFixed(2))) : '0');
  }, [mTotalKm, mTotalLtrs]);

  // Cost per KM = Rate per Litre (from Fuel Entry) / Mileage (this trip)
  useEffect(() => {
    const r = parseFloat(rate) || 0;
    const m = parseFloat(mMileage) || 0;
    setMCostPerKm(m > 0 ? String(parseFloat((r / m).toFixed(2))) : '0');
  }, [rate, mMileage]);

  // Total Amount = Diesel Amount (from Fuel Entry) + (Extra Fuel * new Rate)
  // - EXCEPT when Extra Fuel is Paid by Petty Cash, where it's Diesel Amount
  // only: that ₹ moves entirely to the linked Petty Cash voucher instead of
  // being double-counted here as a normal fuel expense (see
  // MileageReport.extraFuelPaymentMode).
  useEffect(() => {
    const diesel = parseFloat(amount) || 0;
    const extra = sumExtraFuelExpression(mExtraFuel);
    const rateNew = parseFloat(mRatePerLitreNew) || 0;
    const total = mExtraFuelPaymentMode === 'petty_cash' ? diesel : diesel + extra * rateNew;
    setMTotalAmount(String(parseFloat(total.toFixed(2))));
  }, [amount, mExtraFuel, mRatePerLitreNew, mExtraFuelPaymentMode]);

  const AUDIT_NOTE_PATTERN = /\s*\(Fuel Audit:[^)]*\)\s*$/;
  const stripPreviousAuditNote = (text: string) => text.replace(AUDIT_NOTE_PATTERN, '').trim();

  // Resolves "the driver" wording for the audit note - only names a specific
  // employee when Authorized Driver contains exactly one name that exactly
  // matches exactly one Staff Employee, otherwise stays generic.
  const resolveDriverWord = (driverNameValue: string): string => {
    const names = driverNameValue.split('/').map(n => n.trim()).filter(Boolean);
    if (names.length !== 1) return 'the driver';
    const matches = employees.filter(e => (e.name || '').trim().toLowerCase() === names[0].toLowerCase());
    return matches.length === 1 ? matches[0].name : 'the driver';
  };

  // Difference (Litres): compares what the fixed Actual Mileage says this
  // trip should have needed against what was actually filled - catches fuel
  // theft/misuse/meter tampering. Negative = wasted, positive = saved.
  const computeFuelAudit = (totalKmVal: number, litresVal: number, rateVal: number, actualMileageVal: number, driverNameValue: string) => {
    if (actualMileageVal <= 0 || litresVal <= 0) return { difference: undefined as number | undefined, note: undefined as string | undefined };
    const expectedLitres = totalKmVal / actualMileageVal;
    const difference = parseFloat((expectedLitres - litresVal).toFixed(2));
    if (difference === 0) return { difference, note: undefined as string | undefined };
    const costDelta = parseFloat((Math.abs(difference) * rateVal).toFixed(2));
    const driverWord = resolveDriverWord(driverNameValue);
    const note = difference < 0
      ? `-Rs.${costDelta} to be deducted from ${driverWord}'s salary`
      : `+Rs.${costDelta} to be credited to ${driverWord}`;
    return { difference, note };
  };

  const handleAddVehicleMileage = async () => {
    if (!mileageFormVehicleNo.trim() || !mileageFormValue.trim()) return;
    try {
      const vNo = mileageFormVehicleNo.trim().toUpperCase();
      const mileageValue = parseFloat(mileageFormValue);
      const existing = vehicleMileages.find(v => (v.vehicleNo || '').trim().toUpperCase() === vNo);
      if (existing) {
        await onUpdateVehicleMileage(existing.id, { mileage: mileageValue });
      } else {
        await onAddVehicleMileage({ vehicleNo: vNo, mileage: mileageValue });
      }
      setMileageFormVehicleNo('');
      setMileageFormValue('');
      triggerNotif('Vehicle mileage rating saved.');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save vehicle mileage rating.', 'error');
    }
  };

  // keepOpen=true (used only right after a successful save, see
  // handleSubmit) resets every field for a fresh entry but leaves the
  // sidebar open, so the office can keep logging entries back-to-back
  // without reopening it each time, and so the save-confirmation toast
  // below the Commit button actually has something to render under. Every
  // other caller (Cancel, the header X, the backdrop click) still closes it
  // as before.
  const resetForm = (keepOpen = false) => {
    setEditingId(null);
    setFormResetToken(t => t + 1);
    setPeriod(new Date().toISOString().slice(0, 7));
    // Date/Location/Bunk Name/Bunk-Card are left untouched when keepOpen is
    // true (back-to-back logging, sidebar staying open for "add another") -
    // 2026-09-02 fix. Back-to-back entries are almost always for the SAME
    // bunk stop on the SAME day (that's exactly the scenario the "same bunk,
    // same day -> carry forward the Rate" auto-fill exists for), so wiping
    // these to blank forced re-typing Location/Bunk Name by hand every single
    // entry. Re-typing is exactly where this silently broke: Bunk Name is a
    // free-text field (see the datalist input below) and the Rate carry
    // forward match is an exact string comparison against what was saved on
    // the prior entry - a re-typed value that differs by so much as casing
    // or a stray space/character (easy to do on a phone) would never match,
    // leaving Rate blank with no explanation, "fixed" only by reloading the
    // page and being more careful on the retry. Keeping these fields exactly
    // as they were still lets the Rate/Indent No. previews correctly refire
    // (their effects already depend on `logs`, which does change once the
    // freshly-saved entry comes back from fetchAllData), now matching a
    // guaranteed-identical Bunk Name/date instead of a hand-retyped one.
    // Vehicle Number/Rate/Ltrs/Amount/driver etc. below still always clear -
    // those are genuinely per-entry, not per-bunk-stop.
    if (!keepOpen) {
      setDate(new Date().toISOString().slice(0, 10));
      setLocation('');
      setLocationIsOther(false);
      setBunkName('');
      setBunkOrCard('Bunk');
    }
    setVehicleNumber('');
    setIndentNumber('');
    setIndentNumberIsLocalEstimate(false);
    setLtrs('');
    setRate('');
    setAmount('');
    setClient('');
    setEntryType('KCM');
    setVendorName('');
    setVendorCode('');
    setRemarks('');
    setRequestedBy('');
    setRqId('');
    setEntryDocs([]);
    setLinkedMileageReportId(null);
    setMOpeningKm('');
    setMClosingKm('');
    setMDriverName('');
    setMDriverId('');
    setMRemarks('');
    setMExtraFuel('');
    setMRatePerLitreNew('');
    setMExtraFuelPaymentMode('normal');
    setMPettyCashHolder('');
    setShowMileageManager(false);
    setMileageFormVehicleNo('');
    setMileageFormValue('');
    setEntrySection('details');
    if (!keepOpen) {
      setShowSidebar(false);
      // Otherwise a stale toast from a previous save could flash back up the
      // next time the sidebar reopens, well after its own 3s auto-dismiss
      // should have cleared it (its timer only runs while mounted, i.e.
      // while the sidebar showing it stays open).
      setSaveConfirmation(null);
    }
  };

  const startEdit = (log: FuelLog) => {
    setEditingId(log.id);
    setPeriod(log.period);
    setDate(log.date);
    setLocation(log.location);
    setLocationIsOther(!!log.location && !LOCATIONS.includes(log.location));
    setBunkName(log.bunkName);
    setBunkOrCard(log.bunkOrCard || 'Bunk'); // pre-existing record saved before this field existed - see item 8 backward-compat note above
    setVehicleNumber(log.vehicleNumber);
    setIndentNumber(log.indentNumber);
    setIndentNumberIsLocalEstimate(false);
    setLtrs(String(log.ltrs));
    setRate(String(log.rate));
    setAmount(String(log.amount));
    setClient(log.client);
    setEntryType(log.type);
    setVendorName(log.vendorName || '');
    setVendorCode(log.vendorCode || '');
    setRemarks(log.remarks || '');
    setRequestedBy(log.requestedBy || '');
    setRqId(log.rqId || '');
    setEntryDocs(log.documents || []);

    const linkedReport = log.mileageReportId ? mileageReports.find(r => r.id === log.mileageReportId) : undefined;
    if (linkedReport) {
      setLinkedMileageReportId(linkedReport.id);
      setMOpeningKm(linkedReport.openingKm != null ? String(linkedReport.openingKm) : '');
      setMClosingKm(linkedReport.closingKm != null ? String(linkedReport.closingKm) : '');
      setMDriverName(linkedReport.driverName || '');
      setMDriverId(linkedReport.driverId || '');
      setMRemarks(stripPreviousAuditNote(linkedReport.remarks || ''));
      setMExtraFuel(String(linkedReport.extraFuel || ''));
      setMRatePerLitreNew(String(linkedReport.ratePerLitreNew || ''));
      setMExtraFuelPaymentMode(linkedReport.extraFuelPaymentMode === 'petty_cash' ? 'petty_cash' : 'normal');
      setMPettyCashHolder(linkedReport.pettyCashHolderUsername || '');
    } else {
      setLinkedMileageReportId(null);
      setMOpeningKm('');
      setMClosingKm('');
      setMDriverName('');
      setMDriverId('');
      setMRemarks('');
      setMExtraFuel('');
      setMRatePerLitreNew('');
      setMExtraFuelPaymentMode('normal');
      setMPettyCashHolder('');
    }

    // A foreign entry (Chandan opening one of Praveen's) opens straight on
    // the Mileage tab, since Details is locked read-only for him there - no
    // reason to land him on a tab he can't do anything with.
    setEntrySection(isForeignEntry(log) ? 'mileage' : 'details');
    setShowSidebar(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!period || !date || !location || !bunkName || !vehicleNumber || !ltrs || !rate || !client) {
      triggerNotif('Please complete all required fields (*)');
      return;
    }
    // Rate per Ltr (new) is only mandatory once Extra Fuel actually has a
    // value typed in - otherwise it stays optional, same as today. Checked
    // here (not just via the input's own `required`) since the Mileage
    // sub-tab can be unmounted at submit time if the user is currently on
    // Fuel Entry Details - switching them there so the field they need to
    // fix is actually visible.
    if (mExtraFuel.trim() && !mRatePerLitreNew.trim()) {
      triggerNotif('Rate per Ltr (new) is required when Extra Fuel has a value.');
      setEntrySection('mileage');
      return;
    }
    // Petty Cash Paid By is mandatory the moment "Paid by Petty Cash" is
    // checked - same "checked here, not just via `required`" reasoning as
    // Rate per Ltr (new) above (the Mileage tab can be unmounted at submit
    // time).
    if (mExtraFuelPaymentMode === 'petty_cash' && !mPettyCashHolder.trim()) {
      triggerNotif('Petty Cash Paid By is required when Extra Fuel is Paid by Petty Cash.');
      setEntrySection('mileage');
      return;
    }
    // Mileage is optional - plenty of vehicles only ever get a fuel entry,
    // with no trip/mileage data at all. Only treat the Mileage tab as filled
    // in (and validate/save it) when Opening KM, Closing KM, and Authorized
    // Driver are all present; otherwise the fuel entry commits on its own.
    const hasMileageData = !!(mOpeningKm && mClosingKm && mDriverName);
    let oKm = 0;
    let cKm = 0;
    if (hasMileageData) {
      oKm = parseFloat(mOpeningKm);
      cKm = parseFloat(mClosingKm);
      if (cKm < oKm) {
        triggerNotif('Closing KM cannot be less than Opening KM.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const l = parseFloat(ltrs);
      const r = parseFloat(rate);
      const a = parseFloat(amount) || parseFloat((l * r).toFixed(2));
      const nextEntryNumber = logs.length > 0 ? Math.max(...logs.map(lg => lg.entryNumber || 0)) + 1 : 1;

      let mileageReportId = linkedMileageReportId;
      if (hasMileageData) {
        // Mileage/fuel-audit calculations, mirroring MileageReport.tsx's own
        // handleSubmit exactly, using this form's rate/litres/amount/date/
        // vehicle/location instead of separately-entered values.
        const calculatedTotalKm = cKm - oKm;
        // Total Ltrs (Litres + Extra Fuel, e.g. "30+40" for two top-ups
        // during one trip) is what actually got consumed, not just the main
        // fill-up - Mileage/Cost-per-KM/the fuel-theft audit all key off it.
        // EXCEPT when Extra Fuel is Paid by Petty Cash: that fuel's
        // cost/litres are tracked entirely through the linked Petty Cash
        // voucher instead (server-side, see server.ts's
        // syncFuelExtraPettyCashLink), so totalLitres/totalAmount here fall
        // back to the base litres/diesel amount only - not double-counted.
        // extraFuel/ratePerLitreNew are still stored below either way, so
        // the 20 L itself stays visible on the record.
        const extra = sumExtraFuelExpression(mExtraFuel);
        const isPettyCashExtra = mExtraFuelPaymentMode === 'petty_cash' && extra > 0 && !!mPettyCashHolder.trim();
        const totalLitres = isPettyCashExtra ? l : parseFloat((l + extra).toFixed(2));
        const calculatedMileage = totalLitres > 0 ? parseFloat((calculatedTotalKm / totalLitres).toFixed(2)) : 0;
        const calculatedCostPerKm = calculatedMileage > 0 ? parseFloat((r / calculatedMileage).toFixed(2)) : 0;
        const calculatedActualMileage = fixedMileageForVehicle || 0;
        const { difference, note } = computeFuelAudit(calculatedTotalKm, totalLitres, r, calculatedActualMileage, mDriverName);
        // Mileage Remarks now also carries forward whatever's typed into
        // Fuel Entry Details' own Remarks field above, so a note logged
        // there is visible from Mileage Report too - not just this form's
        // separate Mileage Remarks box - combined ahead of the auto Fuel
        // Audit note.
        const baseMileageRemarks = [remarks.trim(), stripPreviousAuditNote(mRemarks)].filter(Boolean).join(' | ');
        const finalMileageRemarks = note ? `${baseMileageRemarks}${baseMileageRemarks ? ' ' : ''}(Fuel Audit: ${note})` : baseMileageRemarks;
        const rateNew = parseFloat(mRatePerLitreNew) || 0;
        const calculatedTotalAmount = isPettyCashExtra ? a : parseFloat((a + extra * rateNew).toFixed(2));
        const nextSlNo = mileageReports.length > 0 ? Math.max(...mileageReports.map(rep => rep.slNo || 0)) + 1 : 1;

        const mileagePayload = {
          slNo: linkedMileageReportId ? mileageReports.find(rep => rep.id === linkedMileageReportId)?.slNo || nextSlNo : nextSlNo,
          date,
          vehicleNo: vehicleNumber.trim().toUpperCase(),
          openingKm: oKm,
          closingKm: cKm,
          totalKm: calculatedTotalKm,
          ratePerLitre: r,
          litres: l,
          totalLitres,
          dieselAmount: a,
          mileage: calculatedMileage,
          costPerKm: calculatedCostPerKm,
          driverName: mDriverName.trim(),
          driverId: mDriverId.trim() || undefined,
          location: location.trim(),
          remarks: finalMileageRemarks,
          actualMileage: calculatedActualMileage,
          difference,
          fuelAuditNote: note,
          extraFuel: extra,
          ratePerLitreNew: rateNew,
          totalAmount: calculatedTotalAmount,
          extraFuelPaymentMode: isPettyCashExtra ? 'petty_cash' as const : 'normal' as const,
          pettyCashHolderUsername: isPettyCashExtra ? mPettyCashHolder : undefined
        };

        if (linkedMileageReportId) {
          await onUpdateMileageReport(linkedMileageReportId, mileagePayload);
        } else {
          mileageReportId = (await onAddMileageReport(mileagePayload)) || null;
        }
      } else if (linkedMileageReportId) {
        // Editing an entry that previously had mileage data, but the Mileage
        // tab has since been cleared out - drop the now-stale linked report
        // rather than leaving it orphaned.
        await onDeleteMileageReport(linkedMileageReportId);
        mileageReportId = null;
      }

      const payload = {
        entryNumber: editingId ? logs.find(lg => lg.id === editingId)?.entryNumber || nextEntryNumber : nextEntryNumber,
        period,
        date,
        location: location.trim(),
        bunkName: bunkName.trim(),
        bunkOrCard,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        indentNumber: indentNumber.trim(),
        ltrs: l,
        rate: r,
        amount: a,
        client,
        type: entryType,
        vendorName: vendorName.trim(),
        vendorCode: vendorCode.trim(),
        remarks: remarks.trim(),
        requestedBy: requestedBy.trim(),
        rqId: rqId.trim(),
        documents: entryDocs,
        mileageReportId: mileageReportId || undefined
      };

      if (editingId) {
        await onUpdateLog(editingId, payload);
        triggerNotif('Fuel entry updated successfully!');
      } else {
        await onAddLog(payload);
        triggerNotif('Fuel entry logged successfully!');
      }
      // Big centered save-confirmation modal (see ConfirmationModal.tsx) -
      // captures the just-saved Indent No. before resetForm() clears the
      // field, and bumps `key` so a fresh confetti burst plays even for
      // back-to-back saves. The form is already reset/ready for the next
      // entry by the time this shows.
      setSaveConfirmation({ indentNumber: payload.indentNumber || '-', key: Date.now() });
      resetForm(true);
    } catch (err) {
      console.error(err);
      // Surfaces the server's actual message (e.g. a duplicate Indent No.
      // rejection - see findDuplicateFuelIndentNumber in server.ts) instead
      // of a generic failure notice, so the office can see exactly why and
      // correct the Indent No.
      triggerNotif(err instanceof Error ? err.message : 'Failed to save fuel entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLog = async (log: FuelLog) => {
    // A foreign entry (Chandan's view of one of Praveen's) is never
    // deletable by anyone but its own entrant or a super admin - the server
    // already rejects this too, this just avoids the round trip.
    if (isForeignEntry(log)) return;
    if (!confirm('Are you sure you want to delete this fuel entry? This also removes its linked mileage report entry. This action is irreversible.')) return;
    try {
      await onDeleteLog(log.id);
      if (log.mileageReportId) {
        await onDeleteMileageReport(log.mileageReportId);
      }
      setDeleteConfirmation({ indentNumber: log.indentNumber || '-', key: Date.now() });
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete fuel entry.', 'error');
    }
  };


  // View-scope range for the ledger below (Day / Month Till Date / Year
  // Till Date tabs) - independent of the Download panel's own date/period.
  // 'all' skips the date check entirely (start/end unused in that case).
  const { start: viewStart, end: viewEnd } = viewPeriod === 'all' ? { start: '', end: '' } : getPeriodDateRange(viewPeriod, viewDate);

  const filteredLogsUnsorted = logs.filter(log =>
    (viewPeriod === 'all' || (log.date >= viewStart && log.date <= viewEnd)) &&
    (bunkFilter === 'All' || log.bunkName === bunkFilter) &&
    (bunkOrCardFilter === 'All' || (log.bunkOrCard || 'Bunk') === bunkOrCardFilter) &&
    (
      (log?.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log?.vendorName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log?.rqId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log?.indentNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const filteredLogs = sort
    ? [...filteredLogsUnsorted].sort((a, b) => {
        let cmp: number;
        switch (sort.key) {
          case 'indentNumber': cmp = extractLeadingNumber(a.indentNumber) - extractLeadingNumber(b.indentNumber); break;
          case 'vehicleNumber': cmp = extractLeadingNumber(a.vehicleNumber) - extractLeadingNumber(b.vehicleNumber); break;
          case 'period': cmp = compareText(a.period, b.period); break;
          case 'location': cmp = compareText(a.location, b.location); break;
          case 'bunkName': cmp = compareText(a.bunkName, b.bunkName); break;
          case 'bunkOrCard': cmp = compareText(a.bunkOrCard, b.bunkOrCard); break;
          case 'ltrs': cmp = compareNumber(a.ltrs, b.ltrs); break;
          case 'rate': cmp = compareNumber(a.rate, b.rate); break;
          case 'amount': cmp = compareNumber(a.amount, b.amount); break;
          case 'client': cmp = compareText(a.client, b.client); break;
          case 'type': cmp = compareText(a.type, b.type); break;
          case 'vendorName': cmp = compareText(a.vendorName, b.vendorName); break;
          case 'vendorCode': cmp = compareText(a.vendorCode, b.vendorCode); break;
          case 'requestedBy': cmp = compareText(a.requestedBy, b.requestedBy); break;
          case 'rqId': cmp = compareText(a.rqId, b.rqId); break;
          default:
            // Ties (same date) break on Vehicle No so the order stays stable.
            cmp = a.date === b.date ? extractLeadingNumber(a.vehicleNumber) - extractLeadingNumber(b.vehicleNumber) : (a.date < b.date ? -1 : 1);
        }
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredLogsUnsorted;

  // Groups entries by their (Location, Bunk Name) pair - the same bunk name
  // can exist at multiple locations (e.g. HPCL at BLR/Chennai/Goa), and each
  // pair is its own account/tab, matching the reference spreadsheet's
  // "Location Bunk Diesel Summary" naming.
  const bunkLocationKey = (l: { location?: string; bunkName?: string }) => `${l.location || ''}|||${l.bunkName || ''}`;

  // Maps fuel log rows to the flat shape used for the "Download Fuel Report"
  // Excel export, matching the reference bunk-wise diesel summary format:
  // Date, Location, Bunk Name, Vehicle Number, OIL, Indent No, Ltrs, Rate,
  // Amt, Client, (blank), Vendor Code, Vendor Name, Remarks - Location/Bunk
  // Name are included on every download.
  const toFuelSheetRows = (rows: FuelLog[]) => {
    return rows.map(l => ({
      'Date': l.date,
      'Location': l.location,
      'Bunk Name': l.bunkName,
      'Vehicle Number': l.vehicleNumber,
      'OIL': '',
      'Indent No': l.indentNumber,
      'Ltrs': l.ltrs,
      'Rate': l.rate,
      'Amt': l.amount,
      'Client': l.client,
      ' ': '',
      'Vendor Code': l.vendorCode || '',
      'Vendor Name': l.vendorName || '',
      'Remarks': l.remarks || ''
    }));
  };

  // Sanitizes a (location, bunk) pair into a valid, unique-within-workbook
  // Excel sheet name (max 31 chars; \ / ? * [ ] : are not allowed).
  const toSheetName = (location: string, bunkName: string, used: Set<string>): string => {
    const base = `${location || 'Unknown'}-${bunkName || 'Unknown'}`.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    let name = base;
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      name = `${base.slice(0, 28)}~${suffix}`;
      suffix++;
    }
    used.add(name.toLowerCase());
    return name;
  };


  // Fuel Entry download: Date, Period (Day/MTD/YTD), and Bunk all connect
  // together. When "All Bunks" is selected (or the selected bunk spans
  // multiple locations, e.g. HPCL), the data is separated into one sheet per
  // (Location, Bunk Name) pair - each with its own TOTAL row (Litres/Amount)
  // and its own running Pending Amount balance, matching the reference
  // per-bunk-per-location diesel summary workbook.
  const handleDownloadFuelEntryReport = () => {
    if (!downloadDate) {
      triggerNotif('Please pick a reference date first.');
      return;
    }
    const { start, end } = getPeriodDateRange(downloadPeriod, downloadDate);
    const periodLogs = logs.filter(l => l.date >= start && l.date <= end && (bunkFilter === 'All' || l.bunkName === bunkFilter));

    if (periodLogs.length === 0) {
      triggerNotif('No fuel entries found for the selected period/bunk.');
      return;
    }

    // Group into (Location, Bunk Name) pairs, preserving first-seen order.
    const groups = new Map<string, FuelLog[]>();
    periodLogs.forEach(l => {
      const key = bunkLocationKey(l);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(l);
    });

    const workbook = XLSX.utils.book_new();
    const usedSheetNames = new Set<string>();
    groups.forEach(groupLogs => {
      const totalLitres = groupLogs.reduce((s, l) => s + (l.ltrs || 0), 0);
      const totalAmount = groupLogs.reduce((s, l) => s + (l.amount || 0), 0);
      const summaryRow = {
        'Date': '', 'Location': '', 'Bunk Name': '', 'Vehicle Number': 'TOTAL', 'OIL': '', 'Indent No': '',
        'Ltrs': totalLitres, 'Rate': '', 'Amt': totalAmount,
        'Client': '', ' ': '', 'Vendor Code': '', 'Vendor Name': '', 'Remarks': ''
      };
      const sheetName = toSheetName(groupLogs[0].location, groupLogs[0].bunkName, usedSheetNames);
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([...toFuelSheetRows(groupLogs), summaryRow]), sheetName);
    });

    const periodLabel = downloadPeriod === 'day' ? 'Daily' : downloadPeriod === 'month' ? 'MTD' : 'YTD';
    const bunkLabel = bunkFilter === 'All' ? 'AllBunks' : bunkFilter.replace(/\s+/g, '_');
    XLSX.writeFile(workbook, `KCM_Fuel_Entries_${periodLabel}_${bunkLabel}_${downloadDate}.xlsx`);
    triggerNotif('Fuel entries report downloaded successfully!');
  };

  // Bunk-wise Summary panel download: every entry for one (Location, Bunk
  // Name) pair, scoped to whichever tab is active - For the Day (today's
  // entries only) or This Month - with a TOTAL row. Works identically in
  // both tabs, per-bunk.
  const handleDownloadBunkSummary = (location: string, bunkNameVal: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const nowMonth = new Date().toISOString().slice(0, 7);
    const groupLogs = logs.filter(l =>
      l.location === location && l.bunkName === bunkNameVal &&
      (bunkSummaryPeriod === 'day' ? l.date === today : l.date.slice(0, 7) === nowMonth)
    );
    if (groupLogs.length === 0) {
      triggerNotif('No fuel entries found for this bunk in the selected period.');
      return;
    }
    const totalLitres = groupLogs.reduce((s, l) => s + (l.ltrs || 0), 0);
    const totalAmount = groupLogs.reduce((s, l) => s + (l.amount || 0), 0);
    const summaryRow = {
      'Date': '', 'Location': '', 'Bunk Name': '', 'Vehicle Number': 'TOTAL', 'OIL': '', 'Indent No': '',
      'Ltrs': totalLitres, 'Rate': '', 'Amt': totalAmount,
      'Client': '', ' ': '', 'Vendor Code': '', 'Vendor Name': '', 'Remarks': ''
    };
    const workbook = XLSX.utils.book_new();
    const sheetName = toSheetName(location, bunkNameVal, new Set());
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([...toFuelSheetRows(groupLogs), summaryRow]), sheetName);
    const periodLabel = bunkSummaryPeriod === 'day' ? 'ForTheDay' : 'ThisMonth';
    XLSX.writeFile(workbook, `KCM_Bunk_Summary_${sheetName}_${periodLabel}.xlsx`);
    triggerNotif('Bunk summary downloaded successfully!');
  };

  // Bunk-wise Summary panel data: grouped by (Location, Bunk Name), scoped
  // to For the Day (today only) or This Month.
  const bunkSummaryRows = (() => {
    const today = new Date().toISOString().slice(0, 10);
    const nowMonth = new Date().toISOString().slice(0, 7);
    const scopedLogs = bunkSummaryPeriod === 'day' ? logs.filter(l => l.date === today) : logs.filter(l => l.date.slice(0, 7) === nowMonth);
    const groups = new Map<string, { location: string; bunkName: string; litres: number; amount: number }>();
    scopedLogs.forEach(l => {
      const key = bunkLocationKey(l);
      if (!groups.has(key)) groups.set(key, { location: l.location, bunkName: l.bunkName, litres: 0, amount: 0 });
      const g = groups.get(key)!;
      g.litres += l.ltrs || 0;
      g.amount += l.amount || 0;
    });
    return Array.from(groups.values()).sort((a, b) => b.amount - a.amount);
  })();


  // KPI calculations - unchanged in label/position/layout, only field refs updated (ltrs replaces quantity)
  const totalFuelAmt = logs.reduce((sum, log) => sum + (log.amount || 0), 0);
  const totalLitres = logs.reduce((sum, log) => sum + (log.ltrs || 0), 0);
  const avgRate = logs.length > 0 ? (logs.reduce((sum, log) => sum + (log.rate || 0), 0) / logs.length) : 0;

  return (
    <div className="space-y-6" id="fuel-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Fuel className="text-blue-600 w-5 h-5" />
            KCM Fuel Management Desk
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Fuel Entry - Mileage &amp; trip details are logged together and feed the Fleet Mileage Tracker
          </p>
        </div>
      </div>

      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {notif.message}
        </div>
      )}

      {/* Average Rate/Litre + Bunk-wise Summary - side by side, first thing
          visible above the entries table (moved up from below the ledger,
          see bunkSummaryRows/handleDownloadBunkSummary above). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between h-full">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average Rate / Litre</p>
            <h3 className="text-xl font-bold text-slate-800 mt-1">₹{avgRate.toFixed(2)}</h3>
            <p className="text-xs text-slate-400 mt-0.5">National Fuel Index Linked</p>
          </div>
          <div className="p-3 bg-slate-50 text-slate-500 rounded-lg">
            <Landmark className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              Bunk-wise Summary
            </h3>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                onClick={() => setBunkSummaryPeriod('day')}
                className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${bunkSummaryPeriod === 'day' ? 'bg-white shadow-xs text-blue-700' : 'text-slate-500'}`}
              >
                For the Day
              </button>
              <button
                onClick={() => setBunkSummaryPeriod('month')}
                className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${bunkSummaryPeriod === 'month' ? 'bg-white shadow-xs text-blue-700' : 'text-slate-500'}`}
              >
                This Month
              </button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1.5">
            {bunkSummaryRows.length === 0 ? (
              <p className="text-center text-slate-400 text-[11px] py-4">
                {bunkSummaryPeriod === 'day' ? 'No fuel entries recorded today.' : 'No fuel entries recorded this month.'}
              </p>
            ) : (
              bunkSummaryRows.map((b, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-[11px]">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{b.bunkName}</p>
                    <p className="text-slate-400 font-mono text-[9.5px]">{b.location}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-slate-600">{b.litres.toFixed(1)} L</p>
                    <p className="font-mono font-bold text-emerald-700">₹{b.amount.toLocaleString('en-IN')}</p>
                  </div>
                  <button
                    onClick={() => handleDownloadBunkSummary(b.location, b.bunkName)}
                    title={`Download ${b.bunkName} (${b.location})`}
                    className="p-1.5 bg-teal-50 text-teal-600 hover:bg-teal-100 rounded-lg cursor-pointer shrink-0 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Total Fuel Expended + Download Fuel Report - unchanged, just moved
          to their own row beneath Average Rate/Litre + Bunk-wise Summary. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Fuel Expended</p>
            <h3 className="text-xl font-bold text-slate-800 mt-1">₹{totalFuelAmt.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{totalLitres.toFixed(1)} Litres Filled</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Fuel className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Download Fuel Report
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <DateInput
                  value={downloadDate}
                  onChange={(e) => setDownloadDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-mono text-slate-800"
                />
              </div>
              <select
                value={downloadPeriod}
                onChange={(e) => setDownloadPeriod(e.target.value as 'day' | 'month' | 'year')}
                className="bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[10px] font-semibold text-slate-800 focus:outline-none"
              >
                <option value="day">For the Day</option>
                <option value="month">Monthly Till Date</option>
                <option value="year">Year Till Date</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={bunkFilter}
                onChange={(e) => setBunkFilter(e.target.value)}
                title="Filter by bunk"
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 focus:outline-none"
              >
                <option value="All">All Bunks</option>
                {usedBunks.map((b, i) => <option key={i} value={b}>{b}</option>)}
              </select>
              <button
                onClick={handleDownloadFuelEntryReport}
                title="Download Fuel Entries for the selected date, period, and bunk"
                className="p-2 bg-teal-50 text-teal-600 hover:bg-teal-100 rounded-lg cursor-pointer shrink-0 transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 mt-1.5">{logs.length} fuel vouchers logged</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Fuel className="w-4 h-4 text-emerald-600" />
              Fuel Entry Ledger
            </h2>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-48">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Search vehicle, vendor, RQ ID"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 text-[11px] focus:outline-none text-slate-800 font-semibold"
                />
              </div>
              {/* Sort By - Indent No descending (default, most-recent number
                  on top so the next entry's number is easy to spot) /
                  ascending. Reuses the same `sort` state the column sort
                  headers drive. */}
              <select
                value={sort?.key === 'indentNumber' && sort.direction === 'asc' ? 'oldest' : 'newest'}
                onChange={(e) => setSort({ key: 'indentNumber', direction: e.target.value === 'oldest' ? 'asc' : 'desc' })}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700"
                title="Sort by Indent No"
              >
                <option value="newest">Indent No: Newest First</option>
                <option value="oldest">Indent No: Oldest First</option>
              </select>
              {/* Bunk Name filter - All Bunks + BUNK_NAMES + any other bunk
                  name already used in the ledger (see usedBunks above). Also
                  scopes the Download Fuel Report/Bunk Summary panels below. */}
              <select
                value={bunkFilter}
                onChange={(e) => setBunkFilter(e.target.value)}
                title="Filter by Bunk Name"
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700"
              >
                <option value="All">All Bunks</option>
                {usedBunks.map((b, i) => <option key={i} value={b}>{b}</option>)}
              </select>
              {!isRqIdOnlyUser && (
                <button
                  onClick={() => { resetForm(); setShowSidebar(true); }}
                  className="bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-xs text-white font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" /> Add Entry
                </button>
              )}
            </div>
          </div>

          {/* Bunk | Card - the two ledgers are clearly separated views over
              the same underlying entries (bunkOrCard on each FuelLog), not
              separate Add Entry forms - saving an entry as Bunk shows it
              only here in Bunk, Card only in Card. "All" keeps the
              previously-only view (everything together) available too, so
              this is additive, not a removal of existing behavior. */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ledger:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
              {([['All', 'All'], ['Bunk', 'Bunk'], ['Card', 'Card']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBunkOrCardFilter(key)}
                  className={`px-3.5 py-1.5 rounded-md cursor-pointer transition-colors ${bunkOrCardFilter === key ? 'bg-white shadow-xs text-emerald-700' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Ledger view scope - All (default) / Day / Month Till Date /
              Year Till Date, independent of the Download Fuel Report panel
              above. Picking a date only matters for Day/Month/Year - it's
              hidden in All. */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
              {([['all', 'All'], ['day', 'Day'], ['month', 'Month Till Date'], ['year', 'Year Till Date']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setViewPeriod(key)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${viewPeriod === key ? 'bg-white shadow-xs text-emerald-700' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {viewPeriod !== 'all' && (
              <div className="w-40">
                <DateInput
                  value={viewDate}
                  onChange={(e) => setViewDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-mono text-slate-800"
                />
              </div>
            )}
            <span className="text-[10px] text-slate-400 font-mono">{filteredLogsUnsorted.length} of {logs.length} entries</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                <tr>
                  <th className="px-3 py-2.5">Entry #</th>
                  {/* Period column hidden from the listing (per direct
                      instruction) - log.period is still saved/exported, just
                      not shown as its own column here anymore. */}
                  <th className="px-3 py-2.5"><SortHeader label="Date" sortKey="date" sort={sort} onSort={handleSort} type="numeric" /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Location" sortKey="location" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Bunk Name" sortKey="bunkName" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Bunk/Card" sortKey="bunkOrCard" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Vehicle No" sortKey="vehicleNumber" sort={sort} onSort={handleSort} type="numeric" /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Indent No" sortKey="indentNumber" sort={sort} onSort={handleSort} type="numeric" /></th>
                  <th className="px-3 py-2.5 text-right"><SortHeader label="Ltrs" sortKey="ltrs" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                  <th className="px-3 py-2.5 text-right"><SortHeader label="Rate" sortKey="rate" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                  <th className="px-3 py-2.5 text-right"><SortHeader label="Amount" sortKey="amount" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Client" sortKey="client" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Type" sortKey="type" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Vendor Name" sortKey="vendorName" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Vendor Code" sortKey="vendorCode" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Requested By" sortKey="requestedBy" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><SortHeader label="RQ ID" sortKey="rqId" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5 max-w-xs">Remarks</th>
                  <th className="px-3 py-2.5 text-center">Docs</th>
                  {(isSuperAdmin || isRqIdOnlyUser) && <th className="px-3 py-2.5">Entered By</th>}
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={19 + (isSuperAdmin || isRqIdOnlyUser ? 1 : 0)} className="text-center py-10 text-slate-400 font-mono">
                      NO FUEL ENTRIES FOUND IN CURRENT LEDGER.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, i) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{i + 1}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{log.date}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.location}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.bunkName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.bunkOrCard || 'Bunk'}</td>
                      <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase tracking-wider whitespace-nowrap">{log.vehicleNumber}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{log.indentNumber}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-800">{(log.ltrs || 0)} L</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">₹{(log.rate || 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">₹{(log.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.client}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.type}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.vendorName || '-'}</td>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">{log.vendorCode || '-'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.requestedBy || '-'}</td>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                        {isRqIdOnlyUser ? <RqIdEditableCell log={log} onSave={onUpdateFuelLogRqId} /> : (log.rqId || '-')}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 max-w-xs truncate" title={log.remarks}>{log.remarks || '-'}</td>
                      <td className="px-3 py-2.5 text-center">
                        {log.documents && log.documents.length > 0 ? (
                          <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
                            <Paperclip className="w-2.5 h-2.5 mr-0.5" />
                            {log.documents.length}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      {(isSuperAdmin || isRqIdOnlyUser) && (
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                          {log.enteredBy || '-'}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {isRqIdOnlyUser ? (
                          <span className="text-slate-300 text-[10px] uppercase font-bold">View only</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {isForeignEntry(log) && (
                              <span className="text-[9px] uppercase font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5" title={`Logged by ${log.enteredBy} - Mileage only`}>
                                Mileage only
                              </span>
                            )}
                            <button
                              onClick={() => startEdit(log)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                              title={isForeignEntry(log) ? 'Fill in Mileage section' : 'Edit entry'}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {!isForeignEntry(log) && (
                              <button
                                onClick={() => handleDeleteLog(log)}
                                className="p-1 text-slate-400 hover:text-pink-600 hover:bg-slate-100 rounded cursor-pointer"
                                title="Delete entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Slide-out Sidebar for Add/Edit Fuel Entry */}
      <AnimatePresence>
        {showSidebar && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end z-50">
            <div className="absolute inset-0" onClick={() => resetForm()} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 border-l border-blue-100"
            >
              <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-emerald-400" />
                    {editingId ? 'Edit Fuel Entry' : 'Add Fuel Entry'}
                  </h3>
                  <span className="text-[9px] text-blue-300 font-bold uppercase tracking-widest block mt-0.5">
                    KCM Logistics Fuel Desk
                  </span>
                </div>
                <button onClick={() => resetForm()} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3.5 text-xs">
                <form id="fuel-entry-form" onSubmit={handleSubmit} className="space-y-3.5" autoComplete="off">
                  {/* Details / Mileage tab switcher - fuel details are filled
                      first, then this flips to the Mileage sub-module instead
                      of showing every mileage field stacked above the fuel
                      fields at once. Both stay inside this one form, so a
                      single Save/Update in the footer submits everything
                      together regardless of which tab is currently visible. */}
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
                    {([['details', 'Fuel Entry Details'], ['mileage', 'Mileage']] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setEntrySection(key)}
                        className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          entrySection === key ? 'bg-gradient-to-r from-emerald-500 to-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                        }`}
                      >
                        {key === 'mileage' && <Gauge className="w-3.5 h-3.5" />}
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Mileage section - creates/updates a linked Fleet Mileage
                      Tracker entry from this same submission. None of this
                      shows up in the Fuel Entry ledger above. */}
                  {entrySection === 'mileage' && (
                  <div className="p-3 bg-pink-50/40 rounded-xl border border-pink-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-pink-700 uppercase tracking-wider flex items-center gap-1">
                        <Gauge className="w-3.5 h-3.5" /> Mileage
                      </span>
                      <span className="text-[9px] text-pink-400 font-mono">
                        {vehicleNumber ? `for ${vehicleNumber}` : 'select Vehicle Number below'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Opening KM</label>
                        <input
                          type="number"
                          placeholder="Automatic/Manual"
                          value={mOpeningKm}
                          onChange={(e) => setMOpeningKm(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                        />
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                          {mOpeningKm ? '✓ Autoloaded previous' : 'Optional - leave blank if this vehicle has no mileage tracking'}
                        </p>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Closing KM</label>
                        <input
                          type="number"
                          placeholder="Current reading"
                          value={mClosingKm}
                          onChange={(e) => setMClosingKm(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="p-2.5 bg-white rounded-lg border border-pink-100 flex items-center justify-between font-mono">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">Total KM (auto)</span>
                        <span className="text-xs font-black text-pink-700">{mTotalKm || 0} Kilometers</span>
                      </div>
                      <ArrowRightLeft className="w-4 h-4 text-pink-300" />
                    </div>

                    {/* Vehicle Mileage Master mini-manager */}
                    <div className="p-2.5 bg-white rounded-lg border border-pink-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <Gauge className="w-3 h-3" /> Vehicle Mileage Master
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!showMileageManager && vehicleNumber) setMileageFormVehicleNo(vehicleNumber);
                            setShowMileageManager(!showMileageManager);
                          }}
                          className="text-[10px] font-bold text-pink-600 hover:text-pink-800 cursor-pointer"
                        >
                          {showMileageManager ? 'Hide' : 'Manage Ratings'}
                        </button>
                      </div>
                      <p className="text-[9.5px] font-mono text-slate-500">
                        {vehicleNumber
                          ? fixedMileageForVehicle != null
                            ? `Fixed rating for ${vehicleNumber}: ${fixedMileageForVehicle} KM/L`
                            : `No fixed mileage set yet for ${vehicleNumber} - add one below.`
                          : 'Select a vehicle below to see its fixed mileage rating.'}
                      </p>
                      {showMileageManager && (
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Vehicle No"
                              value={mileageFormVehicleNo}
                              onChange={(e) => setMileageFormVehicleNo(e.target.value.toUpperCase())}
                              autoComplete="off"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-800 text-[11px] font-mono"
                            />
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Mileage (KM/L)"
                              value={mileageFormValue}
                              onChange={(e) => setMileageFormValue(e.target.value)}
                              autoComplete="off"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-800 text-[11px] font-mono"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleAddVehicleMileage}
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-lg py-1.5 font-semibold text-[10px] uppercase cursor-pointer"
                          >
                            Save Rating
                          </button>
                          {(() => {
                            const visibleMileages = vehicleNumber
                              ? vehicleMileages.filter(v => (v.vehicleNo || '').trim().toUpperCase() === vehicleNumber.trim().toUpperCase())
                              : [];
                            return visibleMileages.length > 0 && (
                              <div className="max-h-24 overflow-y-auto space-y-1 pt-1">
                                {visibleMileages.map(v => (
                                  <div key={v.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-md px-2 py-1">
                                    <span className="text-[10px] font-semibold text-slate-700">{v.vehicleNo} <span className="text-slate-400 font-mono">({v.mileage} KM/L)</span></span>
                                    <button type="button" onClick={() => onDeleteVehicleMileage(v.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Diesel Amount / Total Ltrs / Mileage / Cost per KM /
                        Fixed Mileage - all auto, Diesel Amount mirrors the
                        Amount entered below */}
                    <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-lg border border-pink-100 font-mono">
                      <div>
                        <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Diesel Amount</span>
                        <span className="text-xs font-black text-teal-700">₹{amount || 0}</span>
                      </div>
                      <div>
                        <span className="text-[8.5px] text-slate-400 font-bold uppercase block">
                          Total Ltrs {mExtraFuelPaymentMode === 'petty_cash' ? '(Litres only - Extra Fuel is Paid by Petty Cash)' : '(Litres + Extra Fuel)'}
                        </span>
                        <span className="text-xs font-black text-teal-700">{mTotalLtrs || 0} L</span>
                      </div>
                      <div>
                        <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Cost/KM</span>
                        <span className="text-xs font-black text-amber-700">₹{mCostPerKm || 0}</span>
                      </div>
                      <div>
                        <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Mileage (this trip)</span>
                        <span className="text-xs font-black text-pink-700">{mMileage || 0} KM/L</span>
                      </div>
                      <div>
                        <span className="text-[8.5px] text-slate-400 font-bold uppercase flex items-center gap-1">
                          <HelpCircle className="w-2.5 h-2.5 text-purple-500" /> Fixed Mileage
                        </span>
                        <span className="text-xs font-black text-purple-700">{mActualMileage || 0} KM/L</span>
                      </div>
                      {(() => {
                        const totalKmVal = parseFloat(mTotalKm) || 0;
                        const totalLtrsVal = parseFloat(mTotalLtrs) || 0;
                        const actualMileageVal = parseFloat(mActualMileage) || 0;
                        const { difference } = computeFuelAudit(totalKmVal, totalLtrsVal, 0, actualMileageVal, mDriverName);
                        return (
                          <div className="col-span-2 pt-2 border-t border-slate-100">
                            <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Difference (Litres wasted/saved)</span>
                            <span className={`text-xs font-black ${difference == null ? 'text-slate-400' : difference > 0 ? 'text-emerald-600' : difference < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                              {difference == null ? '-' : `${difference > 0 ? '+' : ''}${difference} L`}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {(() => {
                      const totalKmVal = parseFloat(mTotalKm) || 0;
                      const totalLtrsVal = parseFloat(mTotalLtrs) || 0;
                      const rateVal = parseFloat(rate) || 0;
                      const actualMileageVal = parseFloat(mActualMileage) || 0;
                      const { note } = computeFuelAudit(totalKmVal, totalLtrsVal, rateVal, actualMileageVal, mDriverName);
                      if (!note) return null;
                      return (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                          <span className="text-[9px] text-amber-600 font-bold uppercase block mb-0.5">Fuel Audit (auto-added to Mileage Remarks)</span>
                          <p className="text-xs font-semibold text-amber-800">{note}</p>
                        </div>
                      );
                    })()}

                    {/* Extra Fuel and Rate per Ltr (new) */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Extra Fuel{mExtraFuelPaymentMode === 'petty_cash' && <span className="text-indigo-600 font-bold"> (Paid by Petty Cash)</span>}
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 5, or 30+40 for two top-ups"
                          value={mExtraFuel}
                          onChange={(e) => setMExtraFuel(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                        />
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                          Multiple top-ups this trip? Type them as e.g. "30+40" - added up automatically into Total Ltrs.
                        </p>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Rate per Ltr (new){mExtraFuel.trim() && <span className="text-rose-500"> *</span>}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required={!!mExtraFuel.trim()}
                          placeholder="e.g. 96.50"
                          value={mRatePerLitreNew}
                          onChange={(e) => setMRatePerLitreNew(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                        />
                        {mExtraFuel.trim() && !mRatePerLitreNew.trim() && (
                          <p className="text-[9px] text-rose-500 font-mono mt-0.5">Required since Extra Fuel has a value.</p>
                        )}
                      </div>
                    </div>

                    {/* "Paid by Petty Cash" - when checked, this Extra Fuel
                        top-up was paid out of a Petty Cash handler's float,
                        not the normal fuel/vendor account. Only relevant
                        once Extra Fuel actually has a value; unmounted
                        (state stays but stops mattering) otherwise so it
                        doesn't sit there with nothing to apply to. Server
                        creates/keeps in sync a linked Petty Cash voucher for
                        this - see server.ts's syncFuelExtraPettyCashLink. */}
                    {sumExtraFuelExpression(mExtraFuel) > 0 && (
                      <div className="p-2.5 bg-indigo-50/60 rounded-lg border border-indigo-100 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={mExtraFuelPaymentMode === 'petty_cash'}
                            onChange={(e) => {
                              setMExtraFuelPaymentMode(e.target.checked ? 'petty_cash' : 'normal');
                              if (!e.target.checked) setMPettyCashHolder('');
                            }}
                            className="cursor-pointer"
                          />
                          <span className="font-semibold text-indigo-800">Paid by Petty Cash</span>
                        </label>
                        {mExtraFuelPaymentMode === 'petty_cash' && (
                          <div>
                            <label className="block font-semibold text-slate-600 mb-1">
                              Petty Cash Paid By <span className="text-rose-500">*</span>
                            </label>
                            <select
                              required
                              value={mPettyCashHolder}
                              onChange={(e) => setMPettyCashHolder(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                            >
                              <option value="">Select...</option>
                              {PETTY_CASH_USERS.map(u => <option key={u.username} value={u.username}>{u.label}</option>)}
                            </select>
                            {!mPettyCashHolder && (
                              <p className="text-[9px] text-rose-500 font-mono mt-0.5">Required when Extra Fuel is Paid by Petty Cash.</p>
                            )}
                            <p className="text-[9px] text-indigo-500 font-mono mt-1">
                              Extra Fuel: {sumExtraFuelExpression(mExtraFuel)} L - ₹{(sumExtraFuelExpression(mExtraFuel) * (parseFloat(mRatePerLitreNew) || 0)).toLocaleString('en-IN')} moves to a linked Petty Cash entry
                              {mPettyCashHolder ? ` (${PETTY_CASH_USERS.find(u => u.username === mPettyCashHolder)?.label || mPettyCashHolder})` : ''} - excluded from Total Ltrs/Total Amount below.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Total Amount - only meaningfully different from Diesel
                        Amount once Extra Fuel is added and NOT Paid by
                        Petty Cash (that portion is excluded, see above). */}
                    <div className="p-2.5 bg-white rounded-lg border border-pink-100 flex items-center justify-between font-mono">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">
                          Total Amount {mExtraFuelPaymentMode === 'petty_cash' ? '(Diesel only - Extra Fuel is Petty Cash)' : sumExtraFuelExpression(mExtraFuel) > 0 ? '(Diesel + Extra Fuel)' : '(auto)'}
                        </span>
                        <span className="text-xs font-black text-pink-700">₹{mTotalAmount || 0}</span>
                      </div>
                      <DollarSign className="w-4 h-4 text-pink-300" />
                    </div>

                    {/* Authorized Driver / Driver ID are now entered on the
                        Fuel Entry Details tab (that's when the vehicle is
                        actually at the pump, which is when the driver is
                        physically there) - reflected here read-only so it's
                        still visible while filling in mileage figures,
                        without a second place to edit it. */}
                    <div className="p-2.5 bg-white rounded-lg border border-pink-100 flex items-center justify-between font-mono">
                      <div className="min-w-0">
                        <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Authorized Driver (from Fuel Entry Details)</span>
                        <span className="text-xs font-black text-pink-700 truncate block">
                          {mDriverName || '-'} {mDriverId && <span className="text-slate-400 font-normal">({mDriverId})</span>}
                        </span>
                      </div>
                      <UserIcon className="w-4 h-4 text-pink-300 shrink-0" />
                    </div>

                    {/* Mileage Remarks */}
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Mileage Remarks</label>
                      <textarea
                        placeholder="Enter additional remarks or trip logs..."
                        value={mRemarks}
                        onChange={(e) => setMRemarks(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 h-14 text-slate-800"
                      />
                    </div>
                  </div>
                  )}

                  {/* Fuel Entry Details tab - everything except the Mileage
                      sub-module above. */}
                  {entrySection === 'details' && (
                  <fieldset disabled={editingIsForeign} className="space-y-3.5 border-0 p-0 m-0 disabled:opacity-60">
                  {editingIsForeign && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-semibold">
                      This entry was logged by {editingLog?.enteredBy} - you can only fill in the Mileage section below, not Details.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Period (Month) *</label>
                      <input
                        type="month"
                        required
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Date *</label>
                      <DateInput required value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Location *</label>
                      <select
                        required={!locationIsOther}
                        value={locationIsOther ? 'Other' : location}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'Other') { setLocationIsOther(true); setLocation(''); }
                          else { setLocationIsOther(false); setLocation(val); }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      >
                        <option value="">Select location</option>
                        {LOCATIONS.map((l, i) => <option key={i} value={l}>{l}</option>)}
                        <option value="Other">Other (New Location)</option>
                      </select>
                      {locationIsOther && (
                        <div className="mt-1.5">
                          <label className="block text-[9.5px] font-bold text-slate-500 uppercase mb-0.5">Other - Specify Location</label>
                          <input
                            type="text"
                            required
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="Type the new location"
                            autoComplete="off"
                            className="w-full bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-slate-800"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Bunk Name *</label>
                      <input
                        type="text"
                        required
                        list="fuel-bunks-datalist"
                        value={bunkName}
                        onChange={(e) => setBunkName(e.target.value)}
                        placeholder={locationIsOther ? 'New bunk - enter manually' : 'Search bunk'}
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                      <datalist id="fuel-bunks-datalist">
                        {bunkOptionsForLocation.map((b, i) => <option key={i} value={b} />)}
                      </datalist>
                      {location && LOCATION_BUNK_MAP[location] && (
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                          Suggested for {location}: {LOCATION_BUNK_MAP[location].join(', ')}
                        </p>
                      )}
                      {locationIsOther && (
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                          New location - type the bunk name for it manually.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Bunk / Card *</label>
                      <select
                        required
                        value={bunkOrCard}
                        onChange={(e) => setBunkOrCard(e.target.value as 'Bunk' | 'Card')}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      >
                        <option value="Bunk">Bunk</option>
                        <option value="Card">Card</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Vehicle Number *</label>
                      <input
                        type="text"
                        required
                        list="fuel-vehicles-datalist"
                        value={vehicleNumber}
                        onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                        onKeyDown={handleVehicleNumberKeyDown}
                        placeholder="e.g. KA53AA0069 or just the last 4 digits"
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold uppercase text-slate-800"
                      />
                      <datalist id="fuel-vehicles-datalist">
                        {vehicleList.map((v, i) => <option key={i} value={v} />)}
                      </datalist>
                      {matchedVendorProfile && (matchedVendorProfile.vehicleNumbers || []).length > 1 && (
                        <div className="mt-1.5">
                          <label className="block text-[9.5px] font-bold text-slate-500 uppercase mb-0.5">
                            {matchedVendorProfile.name} has multiple vehicles - pick one
                          </label>
                          <select
                            value={vehicleNumber}
                            onChange={(e) => setVehicleNumber(e.target.value)}
                            className="w-full bg-indigo-50 border border-indigo-200 rounded-lg p-1.5 font-mono font-bold text-indigo-800 text-[11px]"
                          >
                            <option value="">Select vehicle...</option>
                            {matchedVendorProfile.vehicleNumbers.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Authorized Driver / Driver ID - captured here (Fuel
                      Entry Details) since that's the moment the vehicle is
                      actually at the pump and the driver is physically
                      there, rather than buried in the optional Mileage tab.
                      Still auto-fetches Driver ID the same way, and still
                      reflected (read-only) on the Mileage tab so it stays
                      visible while filling in mileage figures. */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5 text-emerald-600" />
                        Authorized Driver
                      </label>
                      <input
                        type="text"
                        list="fuel-driver-names-datalist"
                        placeholder="e.g. Suresh / Adhithya"
                        value={mDriverName}
                        onChange={(e) => setMDriverName(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold"
                      />
                      <datalist id="fuel-driver-names-datalist">
                        {driverNameList.map((n, i) => <option key={i} value={n} />)}
                      </datalist>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        Multiple drivers can be entered in one field, separated by "/".
                      </p>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Driver ID</label>
                      <input
                        type="text"
                        placeholder="e.g. KCMDRV19102"
                        value={mDriverId}
                        onChange={(e) => setMDriverId(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                      />
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        {matchedMileageDriver ? `✓ Auto-fetched from Driver Details (${matchedMileageDriver.name})` : 'Not found in Driver Details - enter manually for a new driver'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Indent Number</label>
                    <input
                      type="text"
                      value={indentNumber}
                      onChange={(e) => setIndentNumber(e.target.value)}
                      autoComplete="off"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                    />
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                      {bunkOrCard === 'Card'
                        ? 'Card has its own sequence (00001, 00002...), completely separate from Bunk.'
                        : 'Auto-continues within this month for Bunk - blank means this is the first entry of a new month; type the starting number.'}
                      {' '}Still fully editable - correcting an existing entry never renumbers others.
                    </p>
                    {indentNumberIsLocalEstimate && (
                      <p className="text-[9px] text-amber-600 font-mono mt-0.5 flex items-center gap-1">
                        <AlertCircle className="w-2.5 h-2.5 shrink-0" /> Couldn't reach the live count just now - this is an estimate from this device's own last-loaded data. Please double-check it before saving.
                      </p>
                    )}
                    {indentNumberFirstOfPeriod && (
                      <p className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1.5 mt-1 flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
                        <span>
                          {bunkOrCard === 'Card'
                            ? "This is the first Card entry ever logged under your login - that's why it's blank, not a bug. Type a starting number (e.g. 00001) and every entry after this will auto-continue from it."
                            : `This is the first Bunk entry for ${indentNumberPeriodLabel} under your login - the sequence restarts every month, so it's correctly blank, not a bug. Type the starting number and every other entry this month will auto-continue from it.`}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Ltrs *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={ltrs}
                        onChange={(e) => setLtrs(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Rate *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Amount (auto, editable)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      autoComplete="off"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Client *</label>
                      <select required value={client} onChange={(e) => setClient(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800">
                        <option value="">Select client</option>
                        {CLIENTS.map((c, i) => <option key={i} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Type *</label>
                      <select required value={entryType} onChange={(e) => setEntryType(e.target.value as 'Vendor' | 'KCM')} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800">
                        <option value="Vendor">Vendor</option>
                        <option value="KCM">KCM</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> Vendor (from Vendor Management)
                    </span>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Vendor Name</label>
                      <input
                        type="text"
                        list="fuel-vendors-datalist"
                        value={vendorName}
                        onChange={(e) => setVendorName(e.target.value)}
                        placeholder="Search vendor"
                        autoComplete="off"
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                      <datalist id="fuel-vendors-datalist">
                        <option value="One Time Vendor" />
                        {vendorProfiles.map((v) => <option key={v.id} value={v.name} />)}
                      </datalist>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        Type a name registered in Vendor Management, pick "One Time Vendor" for a one-off (auto-sets Vendor Code to "Vendor"), or enter one manually if not found. Also auto-fills from Vehicle Number above when that vehicle belongs to a registered vendor, or was last logged as One Time Vendor.
                      </p>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Vendor Code (auto)</label>
                      <input
                        type="text"
                        value={vendorCode}
                        onChange={(e) => setVendorCode(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Remarks</label>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      autoComplete="off"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Requested By</label>
                      <input
                        type="text"
                        list="fuel-requested-by-datalist"
                        value={requestedBy}
                        onChange={(e) => setRequestedBy(e.target.value)}
                        placeholder="Search name"
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                      <datalist id="fuel-requested-by-datalist">
                        {REQUESTED_BY_NAMES.map((n, i) => <option key={i} value={n} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        RQ ID
                        {rqIdLocked && <Lock className="w-3 h-3 text-slate-400" />}
                      </label>
                      <input
                        type="text"
                        value={rqId}
                        disabled={rqIdLocked}
                        onChange={(e) => setRqId(e.target.value)}
                        autoComplete="off"
                        className={`w-full border rounded-lg p-2 ${rqIdLocked ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                      />
                      {rqIdLocked && (
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-filled to "KCM" when Client = KCM, blank otherwise - only Divya (or a Super Admin) can enter or edit RQ ID.</p>
                      )}
                    </div>
                  </div>

                  <DocumentAttachment documents={entryDocs} onChange={setEntryDocs} label="Attach Fuel Receipt / Invoice" />
                  </fieldset>
                  )}
                </form>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button type="button" onClick={() => resetForm()} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  form="fuel-entry-form"
                  disabled={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : editingId ? 'Update Entry' : 'Commit Entry'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Big, centered save/delete confirmation (see ConfirmationModal.tsx) -
          rendered at the module root (not inside the sidebar) so it still
          shows even though handleDeleteLog runs from the ledger row, with
          the sidebar closed. Keyed by .key so each fully remounts (fresh
          confetti/shake) on every save/delete, including consecutive ones
          on the same Indent No. */}
      <SaveConfirmationModal
        key={saveConfirmation?.key}
        open={!!saveConfirmation}
        label="Entry"
        identifier={saveConfirmation ? `Indent no. ${saveConfirmation.indentNumber}` : undefined}
        onDone={() => setSaveConfirmation(null)}
      />
      <DeleteConfirmationModal
        key={deleteConfirmation?.key}
        open={!!deleteConfirmation}
        label="Entry"
        identifier={deleteConfirmation ? `Indent no. ${deleteConfirmation.indentNumber}` : undefined}
        onDone={() => setDeleteConfirmation(null)}
      />
    </div>
  );
}
