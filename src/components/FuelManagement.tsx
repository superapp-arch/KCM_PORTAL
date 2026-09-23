import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { FuelLog, MileageReport, Vehicle, VehicleDocument, User, VehicleMileage, Vendor, StaffEmployee, DriverVehicleLookup } from '../types';
import SortHeader from './SortHeader';
import ColumnFilterHeader from './ColumnFilterHeader';
import PaginationFooter, { paginateRows } from './PaginationFooter';
import { SortState, SortDirection, extractLeadingNumber, compareText, compareNumber } from '../utils/sort';
import { handleVehicleNumberEnterKey } from '../utils/vehicleNumberSearch';
import { nextBunkFuelIndentNumber, nextCardFuelIndentNumber, findDuplicateFuelIndentNumber } from '../utils/fuelIndentNumber';
import { ColumnFiltersMap, ColumnFilterState, matchesColumnFilter, isColumnFilterActive } from '../utils/columnFilter';
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
  Check,
  Upload
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';
import DateInput from './DateInput';
import { authFetch } from '../authFetch';
import { getPeriodDateRange } from '../utils/periodRange';
import PcDieselExpensePanel from './fuel/PcDieselExpensePanel';
import { SaveConfirmationModal, DeleteConfirmationModal } from './ConfirmationModal';
import { PETTY_CASH_USERS } from '../utils/pettyCashUsers';
import { fuelEnteredByLabel } from '../utils/fuelEnteredBy';
import { normalizeLocationName } from '../utils/pettyCashLocations';
import { ExtraFuelMode, EXTRA_FUEL_MODE_LABELS, resolveExtraFuelModes, extraFuelSlices, legacyExtraFuelPaymentMode } from '../utils/extraFuelModes';
import FuelBunkImportModal from './fuel/FuelBunkImportModal';
import FuelCardImportModal from './fuel/FuelCardImportModal';

const LOCATIONS = [
  'AP', 'Nelmangala', 'Belagaum', 'BLR', 'Chennai', 'Goa', 'Hyderabad', 'Hassan',
  'Hoskote', 'Kandlakoya', 'Mysore', 'Manoharabad', 'Vijayawada', 'Vizag'
];

const BUNK_NAMES = [
  'Atharv', 'Kamala', 'H V Subbaya', 'HPCL', 'Isnapur', 'Lakshmi',
  'OM Petroleum', 'Simhadhri', 'Sri Sai Baba', 'Sri Venkateshwara',
  'Tejashri', 'Vayuputra', 'Visalakshi'
];

const CLIENTS = ['KCM', 'Swiggy', 'Reliance', 'Market Vehicle', 'Shadowfax', 'DHL', 'One Time Vendor'];

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
  // Authorized Driver name/ID lookup (2026-09-09 fix) - Driver Details'
  // own /api/drivers/employees is gated by requireDriverAccess, which
  // Chandan/Praveen (fuel_management department) don't have, so the
  // "Authorized Driver" autocomplete/auto-fill silently had nothing to
  // work with for them. driverVehicleLookup (/api/drivers/vehicle-lookup)
  // is deliberately unrestricted (auth only) - same source PettyCash.tsx's
  // vehicle-number-to-driver auto-fill already uses - and carries exactly
  // what this module needs (id/name/vehicleNo), one row per (driver,
  // vehicle) pair.
  driverVehicleLookup: DriverVehicleLookup[];
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
  driverVehicleLookup,
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
  // Vinod (2026-09-05, direct request) - sees every entry from every
  // entrant, including who entered what (Entered By column/filter), but has
  // no edit ability at all - no Add Entry, no Edit, no Delete, not even the
  // Mileage-only exception Chandan gets. Bhagya (2026-09-08, direct request)
  // gets the same treatment. Mirrors server.ts's FUEL_VIEW_ONLY_EMAILS
  // exactly.
  const isViewOnlyUser = user.email === 'vinod@kcmlogistics.in' || user.email === 'bhagya@kcmlogistics.in';
  // Entered By is visible to Super Admin/Principal, Vinod's read-only view,
  // and Chandan (2026-09-09 direct request - he already sees Praveen's own
  // entries via the mileage-only exception below, so being able to filter
  // "mine vs Praveen's" is a natural extension, not new visibility - his own
  // rows still arrive with enteredBy stripped, same as before, so they show
  // blank/"you" rather than his own name). Praveen doesn't get this - he has
  // no cross-visibility of anyone else's entries to begin with.
  const canSeeEnteredBy = isSuperAdmin || isViewOnlyUser || user.email === 'chandanreddy@kcmlogistics.in';
  // Chandan's one-way exception: Praveen's own entries are visible to him
  // (server.ts's filterFuelLogsForViewer) so he can fill in the Mileage
  // section on ones Praveen left blank - but nothing else on that row is his
  // to touch, and it's never his to delete. The server strips enteredBy from
  // every row a viewer entered themselves, so a row that still HAS an
  // enteredBy (for a viewer who isn't a super admin or the RQ-ID-only
  // viewer, who both always get it on every row) is exactly this "not mine"
  // signal - see server.ts's own comment on filterFuelLogsForViewer.
  const isForeignEntry = (log: FuelLog): boolean => !isSuperAdmin && !isRqIdOnlyUser && !isViewOnlyUser && !!log.enteredBy;

  // Mileage-only exception between Chandan and Praveen - originally one-way,
  // Chandan -> Praveen (2026-09-19 direct request); symmetric since
  // 2026-09-23 (direct request: Praveen gets the same Mileage-only access
  // to Chandan's entries). Mirrors server.ts's own
  // FUEL_MILEAGE_ONLY_VISIBLE_ENTRANTS exactly and stays scoped strictly to
  // this pair. isForeignEntry() above is direction-blind by design (it only
  // ever means "not my own row" - still correct for locking the Details
  // section) and must never be used on its own to decide whether Mileage is
  // editable on a foreign row; only this helper may grant that.
  const canEditForeignMileage = (log: FuelLog): boolean =>
    (user.username === 'chandanreddy' && log.enteredBy === 'praveenkumar') ||
    (user.username === 'praveenkumar' && log.enteredBy === 'chandanreddy');

  // 2026-09-18/22 direct requests - whether an entry's Vehicle No. gets the
  // amber "Mileage not entered" highlight: missing a linked Mileage Report,
  // UNLESS it's a Vendor-type entry for a non-KCM vehicle (Type = "Vendor"
  // and Vendor Name isn't "KCM" - e.g. "One Time Vendor" or any hired
  // vehicle), which never gets a Mileage entry at all since only KCM's own
  // fleet is mileage-tracked. Shared by the row's own highlight styling AND
  // the "Mileage" column filter next to Vehicle No below, so the two can
  // never drift apart (filtering to "Highlighted" always means exactly the
  // rows that are actually shown highlighted).
  const isMileageHighlighted = (log: FuelLog): boolean => {
    const mileageNotApplicable = log.type === 'Vendor' && (log.vendorName || '').trim().toUpperCase() !== 'KCM';
    return !log.mileageReportId && !mileageNotApplicable;
  };

  const [searchTerm, setSearchTerm] = useState('');
  // Bunk Name filter - shared between the on-screen ledger, the Download
  // Fuel Report panel, and Bunk Summary's own download (picking a bunk to
  // view also scopes what gets downloaded, which is the expected pairing).
  const [bunkFilter, setBunkFilter] = useState('All');
  // Location filter (2026-09-11 direct request) - a bunk BRAND (e.g. HPCL)
  // can exist at several different physical locations, and Bunk Name alone
  // can't tell them apart - this sits beside the Bunk Name filter (both
  // apply together, AND'd) so "HPCL" + "Hyderabad" together actually
  // isolates that one specific outlet instead of merging every HPCL
  // station's entries. Shares the same "also scopes the download" pairing
  // as bunkFilter above.
  const [locationFilter, setLocationFilter] = useState('All');
  // Bunk/Card filter - whichever payment method (Bunk vs Card) an entry was
  // logged under, independent of the Bunk Name filter above.
  const [bunkOrCardFilter, setBunkOrCardFilter] = useState<'All' | 'Bunk' | 'Card' | 'Petty Cash'>('All');
  // All/Praveen/Chandan owner tab (2026-09-18 direct request) - separate
  // dimension from Ledger's own All/Bunk/Card/Petty Cash above, and from
  // the existing canSeeEnteredBy-gated Entered By filter further below
  // (that one's for Super Admin/Vinod/Bhagya/Chandan's audit-style "any
  // entrant" view; this one is specifically the Chandan<->Praveen mutual
  // visibility pair). Defaults to the logged-in user's OWN name so each of
  // them sees only their own entries on login, same as before this feature
  // existed - never defaults to "All" for these two.
  const [ownerTabFilter, setOwnerTabFilter] = useState<'All' | 'praveenkumar' | 'chandanreddy'>(
    () => (user.username === 'praveenkumar' || user.username === 'chandanreddy') ? user.username : 'All'
  );
  // Entered By filter (2026-09-04) - Super Admin/Principal only, same
  // Excel-style "show just this person's rows" ask as Mileage Report below.
  const [enteredByFilter, setEnteredByFilter] = useState<string>('All');
  // Defaults to Indent No descending (highest/most-recent indent number
  // first), NOT Date - Indent Nos are entered by hand and don't necessarily
  // land in date order, so sorting by Date scrambled them and made it hard
  // to see the last-used number when starting the next entry. Sorting by
  // Indent No descending keeps that number visible right at the top instead.
  // Still fully overridable via the Sort By dropdown or the column sort
  // headers (Date/Vehicle No).
  // Default sort: Date, newest first (2026-09-09 direct request) - groups
  // every bunk's entries by date instead of interleaving them (previously
  // defaulted to Indent Number, which mixed different bunks/dates together
  // since each bunk has its own Indent No sequence). Ties within the same
  // date break on Entry Number descending - the most recently ADDED entry
  // (whoever just saved it, Chandan or Praveen) sorts to the top of that
  // date's group, not just whichever vehicle number happens to sort first.
  const [sort, setSort] = useState<SortState | null>({ key: 'date', direction: 'desc' });
  const handleSort = (key: string, direction: SortDirection) => setSort({ key, direction });
  // Excel-style per-column filters (2026-09-08 GLOBAL UI REQUIREMENT) -
  // additive to the existing view-scope/Bunk/Bunk-Card/Entered By/Search
  // filters above, never replacing them; AND-combined with each other and
  // with those.
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersMap>({});
  const setColumnFilter = (key: string, f: ColumnFilterState | undefined) => setColumnFilters(prev => ({ ...prev, [key]: f }));
  const clearAllColumnFilters = () => setColumnFilters({});
  const activeColumnFilterCount = Object.values(columnFilters).filter(isColumnFilterActive).length;
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
  // PC Diesel Expense view (2026-09-23) - see PcDieselExpensePanel.
  const [showPcDieselExpense, setShowPcDieselExpense] = useState(false);

  // Sidebar / editing state
  const [showSidebar, setShowSidebar] = useState(false);
  // Import Fuel Excel (Bunk) / Import Card Entry modals - 2026-09-11 direct
  // request, see FuelBunkImportModal.tsx/FuelCardImportModal.tsx.
  const [showBunkImport, setShowBunkImport] = useState(false);
  const [showCardImport, setShowCardImport] = useState(false);
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
  const [bunkOrCard, setBunkOrCard] = useState<'Bunk' | 'Card' | 'Petty Cash'>('Bunk');
  // Only meaningful when bunkOrCard === 'Petty Cash' - which handler's Petty
  // Cash book this whole fuel amount is attributed to (2026-09-09).
  const [fuelPettyCashHolder, setFuelPettyCashHolder] = useState('');
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
  // Set by startEdit right before it loads a log's own ltrs/rate/amount, so
  // the Amount auto-calc effect below skips the render where those values
  // first change - without this, opening Edit on any entry whose stored
  // amount wasn't bit-for-bit Ltrs x Rate (an intentional override, a
  // rounding difference, or older data) would silently overwrite the
  // Amount the moment the sidebar opened, before the user touched anything.
  const skipNextAmountAutoCalc = useRef(false);
  // Set together by openAddEntry (below) when it prefills BOTH Location and
  // Bunk Name from the ledger's top filter dropdowns, so the Location->Bunk
  // and Bunk->Location auto-fill effects above don't fight the explicit
  // pair just set and silently swap one of them for a different bunk/
  // location that also happens to satisfy LOCATION_BUNK_MAP/BUNK_LOCATION_MAP.
  const skipLocationAutoFillRef = useRef(false);
  const skipBunkAutoFillRef = useRef(false);
  // Set by startEdit right before it loads a log's own linked-mileage-report
  // driver fields, so the Driver ID auto-sync effect below (which now also
  // CLEARS Driver ID when the current name has no match - see that effect's
  // own comment) doesn't wipe a legitimately-loaded historical Driver ID
  // just because that exact driver name no longer resolves in today's
  // Driver Details (e.g. the driver has since left, or was renamed there).
  const skipMileageDriverIdSyncRef = useRef(false);
  // Tracks the last (editingId, vehicleNumber) pair the Authorized Driver
  // auto-fill effect below has already evaluated - see that effect's own
  // comment (2026-09-19 bug fix) for why: without this, the effect used
  // mDriverName ITSELF to guess "is this still the same edit session",
  // which broke the moment the office deliberately cleared Authorized
  // Driver (now-blank mDriverName looked identical to "never had one"), and
  // got MUCH more likely to actually fire mid-edit once fetchAllData()
  // became non-blocking (a save elsewhere refreshing mileageReports/logs/
  // driverVehicleLookup in the background no longer waits for the form to
  // be done, so it can now land while the office is still editing).
  const driverAutoFillKeyRef = useRef<string | null>(null);
  // Set by startEdit right before it loads a log's own vendorName/
  // vendorCode/vehicleNumber, so the Vendor auto-fill effect below (keyed
  // off vehicleNumber) doesn't immediately recompute and overwrite the
  // just-loaded historical vendor info for whatever this exact vehicle
  // resolves to today (e.g. a Fleet vehicle now auto-filling "KCM" even
  // though this old entry legitimately had a different vendor recorded).
  const skipVendorAutoFillRef = useRef(false);
  // Tracks the vehicle number the vendor auto-fill effect last actually
  // derived Vendor Name/Code for - the effect only re-derives when this
  // vehicle number ITSELF changes, not merely because one of its other
  // dependencies (vehicles/vendorProfiles/logs) happened to get a fresh
  // array reference from an unrelated background refresh (e.g. saving
  // Mileage data elsewhere triggers fetchAllData(), which hands `logs` a
  // new array reference on every single save across the whole app) - that
  // previously re-ran this effect and, for a Fleet-owned vehicle, cleared
  // Vendor Name/Code back to blank every time, even after the user had
  // already set them.
  const lastVendorAutoFillVehicleRef = useRef<string | null>(null);
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
  // 2026-09-18 direct request: lets Total KM be typed directly (e.g. from a
  // GPS-reported distance) when there's no real Closing KM odometer reading
  // for this trip - Closing KM is then derived as Opening KM + Total KM
  // instead of the usual Total KM = Closing - Opening. See the two effects
  // right below. Off by default - the normal Closing-KM-driven calculation
  // is unaffected unless the office explicitly turns this on for a
  // particular entry.
  const [mTotalKmManualMode, setMTotalKmManualMode] = useState(false);
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
  // "Paid by Bunk"/"Paid by Petty Cash"/"Paid by Card" for Extra Fuel - see
  // MileageReport.extraFuelModes. Purely an accounting tag (2026-09-19
  // correction) - Extra Fuel always folds fully into Total Ltrs/Total
  // Amount below regardless of mode; nothing here is excluded or routed
  // anywhere else. Any combination of the three can be active at once
  // (2026-09-21 - a trip can have separate top-ups paid separate ways).
  // With 0 or 1 mode active, mExtraFuel is the WHOLE amount (today's
  // original single-field behavior, unchanged); with 2+ active,
  // mExtraFuel/mExtraFuelBunkAmount/mExtraFuelCardAmount become each
  // individually-active mode's own portion instead - see
  // toggleExtraFuelMode below for how values move between these as modes
  // are ticked/unticked.
  const [mExtraFuelModes, setMExtraFuelModes] = useState<ExtraFuelMode[]>([]);
  const [mExtraFuelBunkAmount, setMExtraFuelBunkAmount] = useState('');
  const [mExtraFuelCardAmount, setMExtraFuelCardAmount] = useState('');
  const [mPettyCashHolder, setMPettyCashHolder] = useState('');

  // Toggles one Extra Fuel payment mode on/off, moving amounts between the
  // single mExtraFuel field and the per-mode fields as the count of active
  // modes crosses the 1<->2 boundary, so ticking/unticking a second/third
  // box never silently discards what was already typed (2026-09-21).
  const extraFuelFieldFor = (mode: ExtraFuelMode) => mode === 'bunk' ? mExtraFuelBunkAmount : mode === 'card' ? mExtraFuelCardAmount : mExtraFuel;
  const setExtraFuelFieldFor = (mode: ExtraFuelMode, value: string) => {
    if (mode === 'bunk') setMExtraFuelBunkAmount(value);
    else if (mode === 'card') setMExtraFuelCardAmount(value);
    else setMExtraFuel(value);
  };
  const toggleExtraFuelMode = (mode: ExtraFuelMode) => {
    setMExtraFuelModes(prev => {
      const wasChecked = prev.includes(mode);
      const next = wasChecked ? prev.filter(m => m !== mode) : [...prev, mode];
      if (!wasChecked && prev.length <= 1 && next.length >= 2) {
        // Single-mode (or none) -> multi-mode: carry whatever was in the
        // single mExtraFuel field into the mode that was already active
        // (if any) before it starts meaning something different.
        const soleMode = prev[0];
        if (soleMode && soleMode !== mode) setExtraFuelFieldFor(soleMode, mExtraFuel);
      } else if (wasChecked && prev.length >= 2 && next.length === 1) {
        // Multi-mode -> single remaining mode: carry that mode's own slice
        // back into the single mExtraFuel field, then clear the per-mode
        // fields so they don't linger with stale values.
        const remaining = next[0];
        setMExtraFuel(extraFuelFieldFor(remaining));
        setMExtraFuelBunkAmount('');
        setMExtraFuelCardAmount('');
      } else if (wasChecked && next.length === 0) {
        setMExtraFuelBunkAmount('');
        setMExtraFuelCardAmount('');
      }
      if (mode === 'petty_cash' && wasChecked) setMPettyCashHolder('');
      return next;
    });
  };
  // Grand total across every currently-active Extra Fuel mode - the single
  // source both the on-screen preview (mTotalLtrs/mTotalAmount) and the
  // actual save computation read, so they can never disagree.
  const totalExtraFuelAmount = (): number =>
    mExtraFuelModes.length <= 1
      ? sumExtraFuelExpression(mExtraFuel)
      : mExtraFuelModes.reduce((sum, m) => sum + sumExtraFuelExpression(extraFuelFieldFor(m)), 0);
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

  // Authorized Driver autofetch list, from the unrestricted vehicle-lookup
  // (see driverVehicleLookup's own prop comment for why not Driver Details'
  // own gated /api/drivers/employees).
  const driverNameList = Array.from(new Set(driverVehicleLookup.map(d => d.name).filter(Boolean))).sort();

  // Driver ID auto-fetch: only resolves when Authorized Driver contains
  // exactly one name that exactly matches exactly one registered driver
  // (same single-name-only rule as the fuel-audit note's resolveDriverWord
  // below) - multiple names ("Suresh / Adhithya") or an unregistered name
  // leave Driver ID for manual entry instead. driverVehicleLookup has one
  // row per (driver, vehicle) pair, so a driver covering several vehicles
  // can match more than one row by name - de-duplicated by id first so
  // that alone doesn't wrongly read as "multiple different drivers".
  const matchedMileageDriver = (() => {
    const names = mDriverName.split('/').map(n => n.trim()).filter(Boolean);
    if (names.length !== 1) return undefined;
    const matchIds = new Set(
      driverVehicleLookup.filter(d => (d.name || '').trim().toLowerCase() === names[0].toLowerCase()).map(d => d.id)
    );
    if (matchIds.size !== 1) return undefined;
    return driverVehicleLookup.find(d => matchIds.has(d.id));
  })();

  // Driver ID is a fully DERIVED field off Authorized Driver (mDriverName) -
  // shared state between the Fuel Entry Details and Mileage tabs' own
  // "Authorized Driver" inputs (both read/write the same mDriverName), so
  // this effect already re-runs no matter which tab the change came from.
  // Auto-fills when a match is found; explicitly CLEARS Driver ID when it
  // stops matching (a driver switch to someone with no Driver Details
  // record, or back to a multi-name value) - previously this only ever SET
  // it and never cleared it, so switching away from a matched driver left
  // that driver's stale ID showing under the new (unmatched) name. Skipped
  // once right after startEdit loads a historical Driver ID from a linked
  // Mileage Report - see skipMileageDriverIdSyncRef's own comment.
  useEffect(() => {
    if (skipMileageDriverIdSyncRef.current) { skipMileageDriverIdSyncRef.current = false; return; }
    setMDriverId(matchedMileageDriver ? matchedMileageDriver.id : '');
  }, [matchedMileageDriver]);

  // Every bunk name available to filter by - the fixed BUNK_NAMES list plus
  // any other bunk name that's actually shown up in the ledger (a new bunk
  // typed in that isn't in the fixed list yet) - used by both the ledger's
  // own Bunk Name filter and the Download/Bunk Summary panels below.
  const usedBunks = Array.from(new Set([...BUNK_NAMES, ...logs.map(l => l.bunkName).filter(Boolean)])).sort();
  // Same "known list + anything actually used" union as usedBunks above -
  // real historical data can include a location not in the hardcoded
  // LOCATIONS list, so this never hides one just because it's missing from
  // that seed list. Each log's location is canonicalized first (2026-09-21 -
  // see normalizeLocationName) so a lingering unnormalized row (e.g. from
  // before the one-time migration runs, or a raw API write bypassing this
  // UI) can't still split into a second near-duplicate dropdown entry.
  const usedLocations = Array.from(new Set([...LOCATIONS, ...logs.map(l => normalizeLocationName(l.location)).filter(Boolean)])).sort();

  // Cascading Bunk options for the ledger's own Location filter - same
  // "Location narrows Bunk" relationship the Add/Edit Entry form already
  // gives via bunkOptionsForLocation, applied here to the top filter bar
  // too: with a specific Location filter selected (not "All"), the Bunk
  // filter only offers bunks that could actually appear there (LOCATION_BUNK_MAP's
  // known set, unioned with whatever bunk names this ledger's own entries
  // have actually logged at that location), instead of every bunk used
  // anywhere. "All Locations" still offers every bunk, unchanged.
  const bunkFilterOptions = locationFilter === 'All'
    ? usedBunks
    : Array.from(new Set([
        ...(LOCATION_BUNK_MAP[locationFilter] || []),
        ...logs.filter(l => l.location === locationFilter).map(l => l.bunkName).filter(Boolean)
      ])).sort();

  // If narrowing the Location filter leaves the currently-picked Bunk
  // filter no longer valid for it, fall back to "All Bunks" rather than
  // silently keeping a Bunk filter value that no option in the (now
  // narrower) dropdown actually matches.
  useEffect(() => {
    if (bunkFilter !== 'All' && !bunkFilterOptions.includes(bunkFilter)) setBunkFilter('All');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter]);

  // (bunkName, location) pairs for the "Import Fuel Excel" wizard's Select
  // Bunk dropdown (FuelBunkImportModal) - flattened from LOCATION_BUNK_MAP
  // (so a shared bunk name like HPCL appears once per physical location it's
  // actually mapped to at, e.g. "HPCL (BLR)" and "HPCL (Chennai)" as
  // distinct options) unioned with any (bunkName, location) combination
  // that's actually appeared together on a real saved log, deduped by the
  // same "location|||bunkName" composite key convention used throughout
  // this file's own Bunk/Location filtering.
  const bunkOptions = (() => {
    const seen = new Set<string>();
    const pairs: { bunkName: string; location: string }[] = [];
    const add = (bunkName: string, location: string) => {
      if (!bunkName || !location) return;
      const key = `${location}|||${bunkName}`;
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push({ bunkName, location });
    };
    Object.entries(LOCATION_BUNK_MAP).forEach(([location, bunks]) => bunks.forEach(bunkName => add(bunkName, location)));
    logs.forEach(l => add(l.bunkName, l.location));
    return pairs.sort((a, b) => a.bunkName.localeCompare(b.bunkName) || a.location.localeCompare(b.location));
  })();

  // Amount auto-calc = Ltrs * Rate (editable override afterward)
  useEffect(() => {
    if (skipNextAmountAutoCalc.current) {
      skipNextAmountAutoCalc.current = false;
      return;
    }
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
    if (!trimmed) { lastVendorAutoFillVehicleRef.current = null; return; }
    if (skipVendorAutoFillRef.current) {
      skipVendorAutoFillRef.current = false;
      lastVendorAutoFillVehicleRef.current = trimmed;
      return;
    }
    // Already derived Vendor Name/Code for this exact vehicle number - skip
    // re-running just because vehicles/vendorProfiles/logs got a new array
    // reference from an unrelated refresh elsewhere (see
    // lastVendorAutoFillVehicleRef's own comment above). A genuine vehicle
    // number CHANGE still always re-derives, below.
    if (lastVendorAutoFillVehicleRef.current === trimmed) return;
    lastVendorAutoFillVehicleRef.current = trimmed;
    if (matchedVendorByVehicle) {
      setVendorName(matchedVendorByVehicle.name);
      setVendorCode(matchedVendorByVehicle.code);
      return;
    }
    // 2026-09-18 direct request: a Fleet & Vehicles-owned vehicle (KCM's own
    // fleet, not a third-party vendor's) auto-fills "KCM"/"KCM" - previously
    // this cleared both fields to blank instead, which is also the exact
    // bug behind Vendor Name/Code seeming to "disappear": any unrelated
    // save elsewhere (e.g. updating Mileage) refreshes `logs`, which used to
    // re-run this whole effect and re-blank these fields even after they'd
    // already been correctly set.
    if (isFleetVehicleNumber(trimmed)) {
      setVendorName('KCM');
      setVendorCode('KCM');
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
    if (skipLocationAutoFillRef.current) { skipLocationAutoFillRef.current = false; return; }
    const bunks = location ? LOCATION_BUNK_MAP[location] : undefined;
    if (bunks && bunks.length === 1) setBunkName(bunks[0]);
  }, [location]);

  // Bunk -> Location: auto-fill only when that bunk belongs to exactly one
  // location (skipped for bunks shared across locations, like HPCL).
  useEffect(() => {
    if (skipBunkAutoFillRef.current) { skipBunkAutoFillRef.current = false; return; }
    const loc = BUNK_LOCATION_MAP[bunkName];
    if (loc) setLocation(loc);
  }, [bunkName]);

  // Same-(bunk, date) Rate carry-forward: the first entry for a bunk on a
  // given day sets the rate; later entries for that same bunk that day
  // auto-fill it. A new date (or backdated entry for a different date)
  // requires fresh manual entry, keyed off whatever date is in the form.
  // Also keyed off `showSidebar`/`formResetToken` (2026-09-05 fix, same
  // reasoning as the Indent No. preview effect above) - resetForm(true)'s
  // back-to-back "add another" flow deliberately leaves Bunk Name/Date
  // untouched (so the very next entry for the SAME bunk stop doesn't need
  // retyping either), but it also unconditionally blanks Rate every time.
  // With bunkName/date genuinely unchanged, this effect's own dependency
  // check saw nothing to react to except `logs` - which should already
  // include the just-saved entry once the parent's post-save refresh lands,
  // but relying on that alone left a real gap in practice (Rate would stay
  // blank until the sidebar was closed and reopened, forcing a fresh
  // bunkName/date "change" to kick the effect). formResetToken changes on
  // every resetForm() call regardless, so this now unconditionally re-fires
  // right after every save - closed sidebar or not.
  useEffect(() => {
    if (!bunkName || !date || editingId) return;
    const sameBunkDayLogs = logs.filter(l => l.bunkName === bunkName && l.date === date);
    if (sameBunkDayLogs.length > 0) {
      setRate(String(sameBunkDayLogs[sameBunkDayLogs.length - 1].rate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bunkName, date, logs, editingId, showSidebar, formResetToken]);

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
    // Petty Cash (2026-09-09) has no auto-generated sequence at all - one
    // Indent No, typed in manually every time, completely separate from
    // Bunk/Card's own auto-continuing sequences. Left blank here for the
    // office to fill in themselves.
    if (bunkOrCard === 'Petty Cash') { setIndentNumberLoading(false); return; }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const params = new URLSearchParams({ bunkOrCard });
    if (bunkOrCard === 'Bunk') { params.set('date', date); params.set('bunkName', bunkName); params.set('location', location); }
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
            : nextBunkFuelIndentNumber(logs, date, bunkName, location, user.username);
          setIndentNumber(estimate || '');
          setIndentNumberIsLocalEstimate(true);
        });
    };
    attempt(0);
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bunkOrCard, date, bunkName, location, editingId, showSidebar, formResetToken]);

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
    && bunkOrCard !== 'Petty Cash' && (bunkOrCard === 'Card' || !!date);
  const indentNumberPeriodLabel = bunkOrCard === 'Bunk' && date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : '';

  // Live duplicate check (2026-09-21 direct request) - runs the EXACT same
  // check the server will run on submit (findDuplicateFuelIndentNumber),
  // so a collision (which can legitimately happen - the same paper bill
  // book can repeat a number across different books/months) shows up as a
  // clear on-screen warning WHILE still filling the form, not only as a
  // rejection after clicking Save. enteredBy matches editingLog's own
  // enteredBy when editing an existing entry (whoever originally logged
  // it - relevant when a Super Admin edits someone else's entry), or the
  // current user's own username for a brand-new entry.
  const duplicateIndentWarning = !!indentNumber.trim() && findDuplicateFuelIndentNumber(
    logs,
    indentNumber,
    { bunkOrCard, bunkName, location, date, enteredBy: editingLog?.enteredBy ?? user.username },
    editingId || undefined
  );

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
    // While editing an existing entry, only ever evaluate auto-fill ONCE
    // per (entry, vehicle) - a later re-render of this effect for the SAME
    // pair (e.g. mileageReports/logs/driverVehicleLookup refreshing in the
    // background while the office is still editing) must never re-run this
    // and silently restore a driver name they may have just deliberately
    // cleared. Switching to a genuinely different vehicle mid-edit (or
    // starting a brand new entry, editingId null) still re-evaluates fresh,
    // same as always.
    const autoFillKey = editingId ? `${editingId}:${vehicleNumber}` : null;
    if (autoFillKey && driverAutoFillKeyRef.current === autoFillKey) return;
    if (autoFillKey) driverAutoFillKeyRef.current = autoFillKey;
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
    const target = vehicleNumber.trim().toUpperCase();
    const assignedDriver = driverVehicleLookup.find(d => (d.vehicleNo || '').trim().toUpperCase() === target);
    if (assignedDriver) {
      setMDriverName(assignedDriver.name || '');
      setMDriverId(assignedDriver.id || '');
    } else if (!editingId) {
      setMDriverName('');
      setMDriverId('');
    }
    // mDriverName deliberately excluded - same reasoning as mOpeningKm above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleNumber, mileageReports, editingId, logs, driverVehicleLookup]);

  // Actual Mileage = the vehicle's fixed reference rating (per-vehicle
  // constant), not computed per trip.
  useEffect(() => {
    setMActualMileage(fixedMileageForVehicle != null ? String(fixedMileageForVehicle) : '0');
  }, [fixedMileageForVehicle]);

  // Total KM = Closing KM - Opening KM (the usual case - a real odometer
  // Closing KM reading is available). 2026-09-18 direct request: sometimes
  // there's no real Closing KM to read (e.g. GPS-reported KM is used
  // instead) - mTotalKmManualMode flips the relationship so Total KM
  // becomes the typed source of truth and Closing KM derives from it
  // instead (see the effect right below). Skipped entirely in that mode so
  // it doesn't fight the manual value.
  useEffect(() => {
    if (mTotalKmManualMode) return;
    const o = parseFloat(mOpeningKm) || 0;
    const c = parseFloat(mClosingKm) || 0;
    setMTotalKm(c >= o ? String(c - o) : '0');
  }, [mOpeningKm, mClosingKm, mTotalKmManualMode]);

  // Manual Total KM mode: Closing KM = Opening KM + Total KM instead of the
  // usual Total KM = Closing - Opening - for when only a GPS-based total
  // distance is available, not a real Closing KM odometer reading. Only
  // this record's Closing KM is affected; every other calculation
  // downstream (Mileage, Cost/KM, Fuel Audit) already reads mTotalKm/
  // mClosingKm the same way regardless of which one was actually typed.
  useEffect(() => {
    if (!mTotalKmManualMode) return;
    const o = parseFloat(mOpeningKm) || 0;
    const t = parseFloat(mTotalKm) || 0;
    setMClosingKm(String(o + t));
  }, [mOpeningKm, mTotalKm, mTotalKmManualMode]);

  // Total Ltrs = Litres (from the Fuel Entry section above) + Extra Fuel -
  // the actual total fuel consumed this trip, including any mid-trip
  // top-up(s), ALWAYS (2026-09-19 correction - see MileageReport.
  // extraFuelModes' own comment for why the old Petty-Cash/Card exclusion
  // was removed). Extra Fuel accepts a sum expression like "30+40" - see
  // sumExtraFuelExpression. Every active mode's own portion counts (2+
  // modes active at once - see totalExtraFuelAmount above).
  useEffect(() => {
    const l = parseFloat(ltrs) || 0;
    const extra = totalExtraFuelAmount();
    setMTotalLtrs(String(parseFloat((l + extra).toFixed(2))));
  }, [ltrs, mExtraFuel, mExtraFuelBunkAmount, mExtraFuelCardAmount, mExtraFuelModes]);

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
  // - ALWAYS (2026-09-19 correction, same reasoning as Total Ltrs above),
  // regardless of Extra Fuel's payment mode(s). Every active mode's own
  // portion is charged at the same new Rate.
  useEffect(() => {
    const diesel = parseFloat(amount) || 0;
    const extra = totalExtraFuelAmount();
    const rateNew = parseFloat(mRatePerLitreNew) || 0;
    setMTotalAmount(String(parseFloat((diesel + extra * rateNew).toFixed(2))));
  }, [amount, mExtraFuel, mExtraFuelBunkAmount, mExtraFuelCardAmount, mExtraFuelModes, mRatePerLitreNew]);

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
    driverAutoFillKeyRef.current = null; // next open (add or edit) gets a fresh Authorized Driver auto-fill evaluation
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
    setMTotalKmManualMode(false);
    setMDriverName('');
    setMDriverId('');
    setMRemarks('');
    setMExtraFuel('');
    setMRatePerLitreNew('');
    setMExtraFuelModes([]);
    setMExtraFuelBunkAmount('');
    setMExtraFuelCardAmount('');
    setMPettyCashHolder('');
    setFuelPettyCashHolder('');
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

  // Add Entry, launched from the ledger toolbar - if the office already has
  // the top Location/Bunk filters narrowed down to one specific outlet, the
  // new entry starts pre-filled with that same Location/Bunk instead of
  // blank, so an office logging several entries for one bunk stop doesn't
  // have to re-pick it every time. Only ever touches Location/Bunk Name -
  // never entry ownership/enteredBy or any other access-scoped field, so it
  // can't interact with the separate "who can see/add which rows" rules
  // (FUEL_ENTRY_USER_EMAILS/FUEL_VIEW_ONLY_EMAILS etc.) elsewhere in this
  // module. When BOTH filters are set, the auto-fill effects above are
  // skipped once so neither Location nor Bunk Name gets silently swapped
  // for whatever LOCATION_BUNK_MAP/BUNK_LOCATION_MAP would otherwise infer
  // from the other; with only one filter set, that single-field auto-fill
  // still runs normally (same as if it had been typed by hand).
  const openAddEntry = () => {
    resetForm();
    const hasLocationFilter = locationFilter !== 'All';
    const hasBunkFilter = bunkFilter !== 'All';
    if (hasLocationFilter && hasBunkFilter) {
      skipLocationAutoFillRef.current = true;
      skipBunkAutoFillRef.current = true;
    }
    if (hasLocationFilter) {
      setLocationIsOther(!LOCATIONS.includes(locationFilter));
      setLocation(locationFilter);
    }
    if (hasBunkFilter) {
      setBunkName(bunkFilter);
    }
    setShowSidebar(true);
  };

  const startEdit = (log: FuelLog) => {
    setEditingId(log.id);
    driverAutoFillKeyRef.current = null; // fresh Authorized Driver auto-fill evaluation for this newly-opened edit session
    setPeriod(log.period);
    setDate(log.date);
    setLocation(log.location);
    setLocationIsOther(!!log.location && !LOCATIONS.includes(log.location));
    setBunkName(log.bunkName);
    setBunkOrCard(log.bunkOrCard || 'Bunk'); // pre-existing record saved before this field existed - see item 8 backward-compat note above
    setFuelPettyCashHolder(log.pettyCashHolderUsername || '');
    skipVendorAutoFillRef.current = true;
    setVehicleNumber(log.vehicleNumber);
    setIndentNumber(log.indentNumber);
    setIndentNumberIsLocalEstimate(false);
    skipNextAmountAutoCalc.current = true;
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

    skipMileageDriverIdSyncRef.current = true;
    // Always reopens in the normal Closing-KM-driven mode - there's no
    // persisted "this was entered manually" flag (Closing/Opening/Total KM
    // are always mutually consistent by construction either way), so
    // there's nothing to restore; the office can turn manual mode back on
    // again if this particular entry needs it.
    setMTotalKmManualMode(false);
    const linkedReport = log.mileageReportId ? mileageReports.find(r => r.id === log.mileageReportId) : undefined;
    if (linkedReport) {
      setLinkedMileageReportId(linkedReport.id);
      setMOpeningKm(linkedReport.openingKm != null ? String(linkedReport.openingKm) : '');
      setMClosingKm(linkedReport.closingKm != null ? String(linkedReport.closingKm) : '');
      setMDriverName(linkedReport.driverName || '');
      setMDriverId(linkedReport.driverId || '');
      setMRemarks(stripPreviousAuditNote(linkedReport.remarks || ''));
      // (2026-09-21) Resolves cleanly for a record from ANY era - legacy
      // single mode, the old two-mode-only 'both', or the current
      // any-combination extraFuelModes - via the shared resolver, so
      // reopening a saved entry always shows each mode's own portion
      // (never the raw combined total - see extraFuelSlices' own comment
      // for the 2026-09-19 bug this originally fixed for 'both' specifically).
      {
        const modes = resolveExtraFuelModes(linkedReport);
        const slices = extraFuelSlices(linkedReport);
        setMExtraFuelModes(modes);
        if (modes.length === 0) {
          setMExtraFuel('');
        } else if (modes.length === 1) {
          setMExtraFuel(String(slices[modes[0]] || ''));
        } else {
          // 2+ modes: mExtraFuel only ever carries the Petty Cash portion
          // in this shape (see mExtraFuelModes' own comment) - unused/blank
          // when Petty Cash isn't one of the active modes.
          setMExtraFuel(modes.includes('petty_cash') ? String(slices.petty_cash || '') : '');
        }
        setMExtraFuelBunkAmount(modes.length >= 2 && modes.includes('bunk') ? String(slices.bunk || '') : '');
        setMExtraFuelCardAmount(modes.length >= 2 && modes.includes('card') ? String(slices.card || '') : '');
      }
      setMRatePerLitreNew(String(linkedReport.ratePerLitreNew || ''));
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
      setMExtraFuelModes([]);
      setMExtraFuelBunkAmount('');
      setMExtraFuelCardAmount('');
      setMPettyCashHolder('');
    }

    // A foreign entry the viewer can actually edit Mileage on (Chandan on one
    // of Praveen's, or Praveen on one of Chandan's) opens straight on the
    // Mileage tab, since Details is locked read-only there - no reason to
    // land on a tab they can't do anything with. Any other foreign entry
    // just opens on Details like normal - both tabs are read-only for them
    // anyway, see the Mileage tab's own disabling below.
    setEntrySection(isForeignEntry(log) && canEditForeignMileage(log) ? 'mileage' : 'details');
    setShowSidebar(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Defense-in-depth (2026-09-19): the UI no longer offers an Edit button
    // at all for a foreign entry the viewer can't touch (see the row
    // actions' isForeignEntry/canEditForeignMileage gating), and the
    // Mileage tab's own fieldset is disabled for one they can only view -
    // but a disabled fieldset doesn't block the Save button itself, which
    // lives outside it. Block the whole submit outright for that case
    // rather than relying only on the server's own rejection, matching
    // "no input, no save option" for any foreign row the viewer has no
    // Mileage-only exception on.
    if (editingIsForeign && !(editingLog && canEditForeignMileage(editingLog))) {
      triggerNotif('You cannot modify this entry.', 'error');
      return;
    }
    // Location/Bunk Name are not applicable when the whole amount is paid
    // from Petty Cash (2026-09-10 direct request) - there's no company
    // Bunk/Card account involved, so nothing to require there.
    const isPettyCashEntry = bunkOrCard === 'Petty Cash';
    if (!period || !date || (!isPettyCashEntry && (!location || !bunkName)) || !vehicleNumber || !ltrs || !rate || !client) {
      triggerNotif('Please complete all required fields (*)', 'error');
      return;
    }
    // `!ltrs`/`!rate` above only catch a blank field - the string "0" is
    // truthy, so it passed straight through with no floor, unlike the
    // import path (fuelImportExport.ts), which explicitly rejects
    // Ltrs/Rate <= 0. A zero-litre or zero-rate manual entry would silently
    // save (Amount auto-calculating to 0) and skew ledger totals.
    if (!(parseFloat(ltrs) > 0)) {
      triggerNotif('Litres must be greater than 0.', 'error');
      return;
    }
    if (!(parseFloat(rate) > 0)) {
      triggerNotif('Rate must be greater than 0.', 'error');
      return;
    }
    // FuelLog.indentNumber is a required field (types.ts) and the import
    // path already rejects a blank one (fuelImportExport.ts), but this form
    // never enforced it - the field is legitimately blank only for the
    // "first entry of a new month" prompt (see indentNumberFirstOfPeriod
    // below, which tells the office to type a starting number by hand);
    // submitting without ever doing that used to save with an empty Indent
    // No, breaking the Bunk/Card auto-continue sequence and duplicate
    // detection for every entry after it that month.
    if (!indentNumber.trim()) {
      triggerNotif('Indent Number is required.', 'error');
      return;
    }
    // Same check the server will run (see duplicateIndentWarning above,
    // already shown live under the field, red border and all, the moment
    // the office types a colliding number) - caught here too so a duplicate
    // never even reaches the network round trip. 2026-09-22 direct request:
    // no separate toast on top of that anymore (it repeated the exact same
    // thing the field is already showing) - the Commit button below is now
    // disabled instead while a duplicate is showing, same as the live
    // warning already tells them why.
    if (duplicateIndentWarning) {
      return;
    }
    if (bunkOrCard === 'Petty Cash' && !fuelPettyCashHolder.trim()) {
      triggerNotif('Petty Cash Paid By is required when Bunk/Card is Petty Cash.', 'error');
      return;
    }
    // Rate per Ltr (new) is only mandatory once Extra Fuel actually has a
    // value typed in - otherwise it stays optional, same as today. Checked
    // here (not just via the input's own `required`) since the Mileage
    // sub-tab can be unmounted at submit time if the user is currently on
    // Fuel Entry Details - switching them there so the field they need to
    // fix is actually visible.
    if (totalExtraFuelAmount() > 0 && !mRatePerLitreNew.trim()) {
      triggerNotif('Rate per Ltr (new) is required when Extra Fuel has a value.', 'error');
      setEntrySection('mileage');
      return;
    }
    // Petty Cash Paid By is mandatory the moment "Paid by Petty Cash" is
    // checked (alone, or alongside Bunk/Card) - same "checked here, not
    // just via `required`" reasoning as Rate per Ltr (new) above (the
    // Mileage tab can be unmounted at submit time).
    if (mExtraFuelModes.includes('petty_cash') && !mPettyCashHolder.trim()) {
      triggerNotif('Petty Cash Paid By is required when Extra Fuel is Paid by Petty Cash.', 'error');
      setEntrySection('mileage');
      return;
    }
    // With 2+ modes ticked, each one needs its own actual value - a ticked
    // box with nothing typed in is almost certainly a mistake (the office
    // meant single-mode, not a genuine multi-way-split trip).
    if (mExtraFuelModes.length >= 2 && mExtraFuelModes.some(m => sumExtraFuelExpression(extraFuelFieldFor(m)) <= 0)) {
      triggerNotif('Every ticked Extra Fuel payment mode needs its own amount.', 'error');
      setEntrySection('mileage');
      return;
    }
    // Mileage is optional - plenty of vehicles only ever get a fuel entry,
    // with no trip/mileage data at all. Only treat the Mileage tab as filled
    // in (and validate/save it) when Opening KM and Closing KM are both
    // present; otherwise the fuel entry commits on its own. Authorized
    // Driver is NOT required here (2026-09-19 direct request) - a fuel
    // entry's Mileage details (Opening/Closing KM, litres, cost/KM, etc.)
    // are real and worth recording even when nobody's noted the driver yet;
    // it can always be filled in later by editing this same entry.
    const hasMileageData = !!(mOpeningKm && mClosingKm);
    // 2026-09-09 bug fix: on a foreign entry (editingIsForeign - Chandan
    // completing one of Praveen's), Details is locked read-only, so Mileage
    // is the ONLY thing this save could possibly be for. Without this guard,
    // submitting with the Mileage tab incomplete used to silently skip
    // creating/updating the Mileage Report entirely (hasMileageData false)
    // while still showing "Fuel entry updated successfully!" - a Save that
    // looked like it worked but never actually recorded any mileage data,
    // reported as "shows saved but never shows up in Mileage Report."
    if (editingIsForeign && !hasMileageData) {
      triggerNotif('Enter Opening KM and Closing KM to save mileage for this entry.', 'error');
      setEntrySection('mileage');
      return;
    }
    let oKm = 0;
    let cKm = 0;
    if (hasMileageData) {
      oKm = parseFloat(mOpeningKm);
      cKm = parseFloat(mClosingKm);
      if (cKm < oKm) {
        triggerNotif('Closing KM cannot be less than Opening KM.', 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const l = parseFloat(ltrs);
      const r = parseFloat(rate);
      // Not `|| parseFloat(...)` - that treated a deliberate Amount
      // override of exactly 0 (e.g. free/complimentary fuel) the same as
      // "field left blank," silently discarding it and recomputing
      // Ltrs x Rate instead (the same bug class already fixed for the
      // import path in commit 85079ee). Only an actually-unparseable
      // Amount falls back to the computed value.
      const parsedAmount = parseFloat(amount);
      const a = Number.isNaN(parsedAmount) ? parseFloat((l * r).toFixed(2)) : parsedAmount;
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
        // Always included here regardless of how Extra Fuel was paid for -
        // any combination of Bunk/Petty Cash/Card (2026-09-19: the
        // on-screen preview above already matches this exactly, see
        // mTotalLtrs's own effect; totalExtraFuelAmount is the one shared
        // computation both read, so they can never disagree - see the
        // 2026-09-19 bug this fixed, where a plain parseFloat here silently
        // truncated a "10+30" sum-expression to just 10 even though the
        // preview correctly showed 40).
        const extra = totalExtraFuelAmount();
        const bunkSlice = mExtraFuelModes.length >= 2 && mExtraFuelModes.includes('bunk') ? sumExtraFuelExpression(mExtraFuelBunkAmount) : 0;
        const pettyCashSlice = mExtraFuelModes.length === 0 ? 0 : mExtraFuelModes.includes('petty_cash') ? sumExtraFuelExpression(extraFuelFieldFor('petty_cash')) : 0;
        const cardSlice = mExtraFuelModes.length >= 2 && mExtraFuelModes.includes('card') ? sumExtraFuelExpression(mExtraFuelCardAmount) : 0;
        const isBunkExtra = mExtraFuelModes.includes('bunk') && (mExtraFuelModes.length === 1 ? extra > 0 : bunkSlice > 0);
        const isPettyCashExtra = mExtraFuelModes.includes('petty_cash') && (mExtraFuelModes.length === 1 ? extra > 0 : pettyCashSlice > 0) && !!mPettyCashHolder.trim();
        const isCardExtra = mExtraFuelModes.includes('card') && (mExtraFuelModes.length === 1 ? extra > 0 : cardSlice > 0);
        const activeExtraFuelModes: ExtraFuelMode[] = [
          ...(isBunkExtra ? (['bunk'] as const) : []),
          ...(isPettyCashExtra ? (['petty_cash'] as const) : []),
          ...(isCardExtra ? (['card'] as const) : [])
        ];
        const totalLitres = parseFloat((l + extra).toFixed(2));
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
        const calculatedTotalAmount = parseFloat((a + extra * rateNew).toFixed(2));
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
          // Defensive re-normalization at save time (2026-09-21) - the
          // "Other" field's own onBlur already does this, but a submit
          // that never blurred the field (e.g. Enter key straight from it)
          // must not be able to slip an un-normalized spelling through.
          location: normalizeLocationName(location.trim()),
          remarks: finalMileageRemarks,
          actualMileage: calculatedActualMileage,
          difference,
          fuelAuditNote: note,
          extraFuel: extra,
          ratePerLitreNew: rateNew,
          totalAmount: calculatedTotalAmount,
          extraFuelModes: activeExtraFuelModes.length > 0 ? activeExtraFuelModes : undefined,
          // Best-effort legacy equivalent, kept for any code that only
          // reads the older singular field - see legacyExtraFuelPaymentMode.
          extraFuelPaymentMode: legacyExtraFuelPaymentMode(activeExtraFuelModes),
          pettyCashHolderUsername: isPettyCashExtra ? mPettyCashHolder : undefined,
          extraFuelBunkAmount: activeExtraFuelModes.length >= 2 && isBunkExtra ? bunkSlice : undefined,
          extraFuelPettyCashAmount: activeExtraFuelModes.length >= 2 && isPettyCashExtra ? pettyCashSlice : undefined,
          extraFuelCardAmount: activeExtraFuelModes.length >= 2 && isCardExtra ? cardSlice : undefined,
          // 2026-09-08 bug fix: filling in Mileage on one of Praveen's own
          // fuel entries (editingIsForeign - see isForeignEntry above) used
          // to silently attribute the new Mileage Report to whoever's
          // actually typing it in (Chandan), so it never showed up under
          // Praveen's own Mileage Report view even though it's really his
          // entry. Tells the server who this mileage genuinely belongs to;
          // server.ts's own POST /api/mileage re-validates this against
          // FUEL_MILEAGE_ONLY_VISIBLE_ENTRANTS rather than trusting it
          // outright. Left undefined on a normal (non-foreign) save, same
          // as before this fix - the server just attributes it to whoever's
          // logged in, as always.
          enteredBy: editingIsForeign ? editingLog!.enteredBy : undefined
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
        location: normalizeLocationName(location.trim()),
        bunkName: bunkName.trim(),
        bunkOrCard,
        pettyCashHolderUsername: bunkOrCard === 'Petty Cash' ? fuelPettyCashHolder : undefined,
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
      // correct the Indent No. 2026-09-21 bug fix: this was missing the
      // 'error' type argument, so triggerNotif's own default ('success')
      // rendered a real rejection (e.g. "Indent No. X already exists...")
      // with a GREEN background and a checkmark icon - visually
      // indistinguishable from an actual success toast, auto-dismissing
      // after 4 seconds. That's why a genuine save failure looked like it
      // had gone through - it was only ever visible by opening DevTools.
      triggerNotif(err instanceof Error ? err.message : 'Failed to save fuel entry.', 'error');
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

  // Entered By filter's own options (2026-09-04) - only the usernames that
  // actually appear in this ledger's data, Excel-column-filter style, not a
  // fixed roster (so it never lists someone who's never logged an entry).
  const enteredByOptions = Array.from(new Set(logs.map(l => l.enteredBy).filter((x): x is string => !!x))).sort();

  const filteredLogsUnsorted = logs.filter(log => {
    if (!(
      (viewPeriod === 'all' || (log.date >= viewStart && log.date <= viewEnd)) &&
      (bunkFilter === 'All' || log.bunkName === bunkFilter) &&
      (locationFilter === 'All' || log.location === locationFilter) &&
      (bunkOrCardFilter === 'All' || (log.bunkOrCard || 'Bunk') === bunkOrCardFilter) &&
      (ownerTabFilter === 'All' || (ownerTabFilter === user.username ? !log.enteredBy || log.enteredBy === user.username : log.enteredBy === ownerTabFilter)) &&
      (!canSeeEnteredBy || enteredByFilter === 'All' || log.enteredBy === enteredByFilter) &&
      (
        (log?.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log?.vendorName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log?.rqId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log?.indentNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    )) return false;

    // Excel-style column filters (AND across every active one) - additive
    // to the filters above, never replacing them.
    if (!matchesColumnFilter(log.date, columnFilters.date, 'date')) return false;
    if (!matchesColumnFilter(log.location, columnFilters.location, 'text')) return false;
    if (!matchesColumnFilter(log.bunkName, columnFilters.bunkName, 'text')) return false;
    if (!matchesColumnFilter(log.bunkOrCard || 'Bunk', columnFilters.bunkOrCard, 'text')) return false;
    if (!matchesColumnFilter(log.vehicleNumber, columnFilters.vehicleNumber, 'text')) return false;
    // 2026-09-22 direct request - lets the office isolate just the rows
    // still missing a Mileage entry (or the opposite), instead of scanning
    // for amber cells by eye, in case any got missed.
    if (!matchesColumnFilter(isMileageHighlighted(log), columnFilters.mileageHighlight, 'boolean')) return false;
    if (!matchesColumnFilter(log.indentNumber, columnFilters.indentNumber, 'text')) return false;
    if (!matchesColumnFilter(log.ltrs, columnFilters.ltrs, 'number')) return false;
    if (!matchesColumnFilter(log.rate, columnFilters.rate, 'number')) return false;
    if (!matchesColumnFilter(log.amount, columnFilters.amount, 'number')) return false;
    if (!matchesColumnFilter(log.client, columnFilters.client, 'text')) return false;
    if (!matchesColumnFilter(log.type, columnFilters.type, 'text')) return false;
    if (!matchesColumnFilter(log.vendorName, columnFilters.vendorName, 'text')) return false;
    if (!matchesColumnFilter(log.vendorCode, columnFilters.vendorCode, 'text')) return false;
    if (!matchesColumnFilter(log.requestedBy, columnFilters.requestedBy, 'text')) return false;
    if (!matchesColumnFilter(log.rqId, columnFilters.rqId, 'text')) return false;
    if (canSeeEnteredBy && !matchesColumnFilter(log.enteredBy ? fuelEnteredByLabel(log.enteredBy) : '', columnFilters.enteredBy, 'text')) return false;
    return true;
  });

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
            // 'date' (also the fallback for any unrecognized sort.key) -
            // ties (same date) break on Entry Number so the most recently
            // ADDED entry that day sorts to the top of its date group,
            // regardless of who entered it.
            cmp = a.date === b.date ? (a.entryNumber || 0) - (b.entryNumber || 0) : (a.date < b.date ? -1 : 1);
        }
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredLogsUnsorted;

  // Pagination footer (2026-09-09 direct request) - same component/copy/
  // behavior as Petty Cash's own Ledger pagination, see PaginationFooter.tsx.
  const LEDGER_PAGE_SIZE = 50;
  const [ledgerPage, setLedgerPage] = useState(1);
  useEffect(() => { setLedgerPage(1); }, [viewPeriod, viewDate, bunkFilter, locationFilter, bunkOrCardFilter, enteredByFilter, searchTerm, columnFilters]);
  const paginatedLogs = paginateRows(filteredLogs, ledgerPage, LEDGER_PAGE_SIZE);

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
  // Driver ID (2026-09-18 direct request) - FuelLog carries no driver field
  // of its own; the only link to a driver is via mileageReportId, which
  // points at the Mileage tab's own linked MileageReport - that record's
  // driverId is the actual Driver Details id, not just a name. A fuel entry
  // with no linked mileage data has no driver to report - shown as "Not
  // Assigned" rather than left blank, so it reads as a deliberate absence.
  const driverIdForExport = (l: FuelLog): string => {
    const linked = l.mileageReportId ? mileageReports.find(r => r.id === l.mileageReportId) : undefined;
    return linked?.driverId || 'Not Assigned';
  };

  const toFuelSheetRows = (rows: FuelLog[]) => {
    return rows.map(l => ({
      'Date': l.date,
      'Location': l.location,
      'Bunk Name': l.bunkName,
      'Vehicle Number': l.vehicleNumber,
      'Driver ID': driverIdForExport(l),
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
      triggerNotif('Please pick a reference date first.', 'error');
      return;
    }
    const { start, end } = getPeriodDateRange(downloadPeriod, downloadDate);
    const periodLogs = logs.filter(l => l.date >= start && l.date <= end
      && (bunkFilter === 'All' || l.bunkName === bunkFilter)
      && (locationFilter === 'All' || l.location === locationFilter));

    if (periodLogs.length === 0) {
      triggerNotif('No fuel entries found for the selected period/bunk.', 'error');
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
        'Date': '', 'Location': '', 'Bunk Name': '', 'Vehicle Number': 'TOTAL', 'Driver ID': '', 'OIL': '', 'Indent No': '',
        'Ltrs': totalLitres, 'Rate': '', 'Amt': totalAmount,
        'Client': '', ' ': '', 'Vendor Code': '', 'Vendor Name': '', 'Remarks': ''
      };
      const sheetName = toSheetName(groupLogs[0].location, groupLogs[0].bunkName, usedSheetNames);
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([...toFuelSheetRows(groupLogs), summaryRow]), sheetName);
    });

    const periodLabel = downloadPeriod === 'day' ? 'Daily' : downloadPeriod === 'month' ? 'MTD' : 'YTD';
    const bunkLabel = bunkFilter === 'All' ? 'AllBunks' : bunkFilter.replace(/\s+/g, '_');
    const locationLabel = locationFilter === 'All' ? '' : `_${locationFilter.replace(/\s+/g, '_')}`;
    XLSX.writeFile(workbook, `KCM_Fuel_Entries_${periodLabel}_${bunkLabel}${locationLabel}_${downloadDate}.xlsx`);
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
      triggerNotif('No fuel entries found for this bunk in the selected period.', 'error');
      return;
    }
    const totalLitres = groupLogs.reduce((s, l) => s + (l.ltrs || 0), 0);
    const totalAmount = groupLogs.reduce((s, l) => s + (l.amount || 0), 0);
    const summaryRow = {
      'Date': '', 'Location': '', 'Bunk Name': '', 'Vehicle Number': 'TOTAL', 'Driver ID': '', 'OIL': '', 'Indent No': '',
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
  // 2026-09-11 direct request: these now reflect the CURRENT filtered view
  // (period/bunk/location/Bunk-Card/entered-by/search/column filters - same
  // set the ledger table itself shows), not a permanent grand total across
  // every entry ever logged - selecting one bunk's one location must show
  // that outlet's own total, not the whole brand's.
  const totalFuelAmt = filteredLogsUnsorted.reduce((sum, log) => sum + (log.amount || 0), 0);
  const totalLitres = filteredLogsUnsorted.reduce((sum, log) => sum + (log.ltrs || 0), 0);
  const avgRate = filteredLogsUnsorted.length > 0 ? (filteredLogsUnsorted.reduce((sum, log) => sum + (log.rate || 0), 0) / filteredLogsUnsorted.length) : 0;

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
              {/* Locations (2026-09-11 direct request) - a bunk brand (e.g.
                  HPCL) can exist at several locations; this sits beside Bunk
                  Name so picking both together isolates one specific
                  physical outlet instead of merging every location sharing
                  that brand. */}
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                title="Filter by location"
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 focus:outline-none"
              >
                <option value="All">All Locations</option>
                {usedLocations.map((loc, i) => <option key={i} value={loc}>{loc}</option>)}
              </select>
              <select
                value={bunkFilter}
                onChange={(e) => setBunkFilter(e.target.value)}
                title="Filter by bunk"
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 focus:outline-none"
              >
                <option value="All">All Bunks</option>
                {bunkFilterOptions.map((b, i) => <option key={i} value={b}>{b}</option>)}
              </select>
              <button
                onClick={handleDownloadFuelEntryReport}
                title="Download Fuel Entries for the selected date, period, bunk, and location"
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
              {/* Locations (2026-09-11 direct request) - sits beside Bunk
                  Name since one brand (e.g. HPCL) can exist at several
                  locations; picking both together isolates one specific
                  physical outlet, not the whole brand merged together. */}
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                title="Filter by Location"
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700"
              >
                <option value="All">All Locations</option>
                {usedLocations.map((loc, i) => <option key={i} value={loc}>{loc}</option>)}
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
                {bunkFilterOptions.map((b, i) => <option key={i} value={b}>{b}</option>)}
              </select>
              {!isRqIdOnlyUser && !isViewOnlyUser && (
                <>
                  <button
                    onClick={openAddEntry}
                    className="bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-xs text-white font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" /> Add Entry
                  </button>
                  {/* 2026-09-11 direct request: bulk-import Bunk-paid and
                      Card-paid fuel entries from Excel - same underlying
                      onAddLog -> POST /api/fuel path as a manual Add Entry,
                      so every existing validation/Indent No/duplicate rule
                      applies automatically. See FuelBunkImportModal.tsx /
                      FuelCardImportModal.tsx. */}
                  <button
                    onClick={() => setShowBunkImport(true)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-xs text-slate-700 font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4" /> Import Fuel Excel
                  </button>
                  <button
                    onClick={() => setShowCardImport(true)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-xs text-slate-700 font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4" /> Import Card Entry
                  </button>
                </>
              )}
            </div>
          </div>

          {showBunkImport && (
            <FuelBunkImportModal
              logs={logs}
              vehicles={vehicles}
              enteredBy={user.username}
              bunkOptions={bunkOptions}
              onAddLog={onAddLog}
              onClose={() => setShowBunkImport(false)}
              onImported={() => setShowBunkImport(false)}
            />
          )}
          {showCardImport && (
            <FuelCardImportModal
              logs={logs}
              vehicles={vehicles}
              enteredBy={user.username}
              onAddLog={onAddLog}
              onClose={() => setShowCardImport(false)}
              onImported={() => setShowCardImport(false)}
            />
          )}

          {/* All / Praveen / Chandan owner tab (2026-09-18 direct request) -
              only shown to these two logins, above the Ledger filter below.
              Each defaults to their own name on login (see ownerTabFilter's
              initializer); clicking the other person's name shows their
              entries. What's actually editable on a foreign row (whether
              reached via this pill or the All tab) is decided per-row by
              isForeignEntry/canEditForeignMileage below, NOT by which pill
              is selected (2026-09-19 fix - selecting the Praveen tab used to
              force strict View-only even for Chandan, incorrectly
              overriding his one-directional Mileage exception; the pill is
              now purely a filter, never itself a permission). */}
          {(user.username === 'praveenkumar' || user.username === 'chandanreddy') && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entries:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
                {([['All', 'All'], ['praveenkumar', 'Praveen'], ['chandanreddy', 'Chandan']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOwnerTabFilter(key)}
                    className={`px-3.5 py-1.5 rounded-md cursor-pointer transition-colors ${ownerTabFilter === key ? 'bg-white shadow-xs text-emerald-700' : 'text-slate-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {ownerTabFilter !== 'All' && ownerTabFilter !== user.username && (
                <span className="text-[9px] uppercase font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  Viewing {ownerTabFilter === 'praveenkumar' ? 'Praveen' : 'Chandan'}'s entries
                  {' - View only, except Mileage'}
                </span>
              )}
            </div>
          )}

          {/* Bunk | Card - the two ledgers are clearly separated views over
              the same underlying entries (bunkOrCard on each FuelLog), not
              separate Add Entry forms - saving an entry as Bunk shows it
              only here in Bunk, Card only in Card. "All" keeps the
              previously-only view (everything together) available too, so
              this is additive, not a removal of existing behavior. */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ledger:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
              {([['All', 'All'], ['Bunk', 'Bunk'], ['Card', 'Card'], ['Petty Cash', 'Petty Cash']] as const).map(([key, label]) => (
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

            {/* Entered By filter (2026-09-04) - Super Admin/Principal only,
                same "isolate just this person's rows" ask as Mileage Report's
                own copy of this filter below. */}
            {canSeeEnteredBy && enteredByOptions.length > 0 && (
              <>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-2">Entered By:</span>
                <select
                  value={enteredByFilter}
                  onChange={(e) => setEnteredByFilter(e.target.value)}
                  className="bg-slate-100 border-none rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  <option value="All">All</option>
                  {enteredByOptions.map(username => (
                    <option key={username} value={username}>{fuelEnteredByLabel(username)}</option>
                  ))}
                </select>
              </>
            )}

            {/* PC Diesel Expense (2026-09-23 direct request) - read-only
                live view of Petty Cash "Diesel Expenses" entries, for
                cross-checking against fuel entries. */}
            <button
              type="button"
              onClick={() => setShowPcDieselExpense(true)}
              className="ml-2 flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer"
            >
              <Fuel className="w-3.5 h-3.5" /> PC Diesel Expense
            </button>
          </div>
          {showPcDieselExpense && (
            <PcDieselExpensePanel
              username={user.username}
              canToggleDone={!isViewOnlyUser && !isRqIdOnlyUser}
              onClose={() => setShowPcDieselExpense(false)}
            />
          )}

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
            {activeColumnFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAllColumnFilters}
                title="Clear every column filter (the filters above are unaffected)"
                className="flex items-center gap-1 text-[10px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
              >
                <X className="w-3 h-3" /> Clear Column Filters ({activeColumnFilterCount})
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                <tr>
                  <th className="px-3 py-2.5">Entry #</th>
                  {/* Period column hidden from the listing (per direct
                      instruction) - log.period is still saved/exported, just
                      not shown as its own column here anymore. */}
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Date" type="date" value={columnFilters.date} onChange={f => setColumnFilter('date', f)} sortKey="date" sort={sort} onSort={handleSort} sortType="numeric" /></th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Location" type="text" values={logs.map(l => l.location)} value={columnFilters.location} onChange={f => setColumnFilter('location', f)} sortKey="location" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Bunk Name" type="text" values={logs.map(l => l.bunkName)} value={columnFilters.bunkName} onChange={f => setColumnFilter('bunkName', f)} sortKey="bunkName" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Bunk/Card" type="text" values={logs.map(l => l.bunkOrCard || 'Bunk')} value={columnFilters.bunkOrCard} onChange={f => setColumnFilter('bunkOrCard', f)} sortKey="bunkOrCard" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {/* 2026-09-22 direct request - isolate rows still
                          missing a Mileage entry (or the opposite), same
                          amber-highlight rule as the cell itself uses (see
                          isMileageHighlighted) - so a missed one can be
                          found by filtering instead of scanning by eye.
                          2026-09-23: moved from the Mileage header's own
                          dropdown into Vehicle No's (extraBoolFilter) -
                          same mileageHighlight filter state/logic. */}
                      <ColumnFilterHeader label="Vehicle No" type="text" values={logs.map(l => l.vehicleNumber)} value={columnFilters.vehicleNumber} onChange={f => setColumnFilter('vehicleNumber', f)} sortKey="vehicleNumber" sort={sort} onSort={handleSort} sortType="numeric" extraBoolFilter={{ value: columnFilters.mileageHighlight, onChange: f => setColumnFilter('mileageHighlight', f), labels: { yes: 'Highlighted', no: 'Not Highlighted' } }} />
                    </div>
                  </th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Indent No" type="text" values={logs.map(l => l.indentNumber)} value={columnFilters.indentNumber} onChange={f => setColumnFilter('indentNumber', f)} sortKey="indentNumber" sort={sort} onSort={handleSort} sortType="numeric" /></th>
                  <th className="px-3 py-2.5 text-right"><ColumnFilterHeader label="Ltrs" type="number" value={columnFilters.ltrs} onChange={f => setColumnFilter('ltrs', f)} sortKey="ltrs" sort={sort} onSort={handleSort} sortType="numeric" align="right" /></th>
                  <th className="px-3 py-2.5 text-right"><ColumnFilterHeader label="Rate" type="number" value={columnFilters.rate} onChange={f => setColumnFilter('rate', f)} sortKey="rate" sort={sort} onSort={handleSort} sortType="numeric" align="right" /></th>
                  <th className="px-3 py-2.5 text-right"><ColumnFilterHeader label="Amount" type="number" value={columnFilters.amount} onChange={f => setColumnFilter('amount', f)} sortKey="amount" sort={sort} onSort={handleSort} sortType="numeric" align="right" /></th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Client" type="text" values={logs.map(l => l.client)} value={columnFilters.client} onChange={f => setColumnFilter('client', f)} sortKey="client" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Type" type="text" values={logs.map(l => l.type)} value={columnFilters.type} onChange={f => setColumnFilter('type', f)} sortKey="type" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Vendor Name" type="text" values={logs.map(l => l.vendorName)} value={columnFilters.vendorName} onChange={f => setColumnFilter('vendorName', f)} sortKey="vendorName" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Vendor Code" type="text" values={logs.map(l => l.vendorCode)} value={columnFilters.vendorCode} onChange={f => setColumnFilter('vendorCode', f)} sortKey="vendorCode" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="Requested By" type="text" values={logs.map(l => l.requestedBy)} value={columnFilters.requestedBy} onChange={f => setColumnFilter('requestedBy', f)} sortKey="requestedBy" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5"><ColumnFilterHeader label="RQ ID" type="text" values={logs.map(l => l.rqId)} value={columnFilters.rqId} onChange={f => setColumnFilter('rqId', f)} sortKey="rqId" sort={sort} onSort={handleSort} /></th>
                  <th className="px-3 py-2.5 max-w-xs">Remarks</th>
                  <th className="px-3 py-2.5 text-center">Docs</th>
                  {canSeeEnteredBy && <th className="px-3 py-2.5"><ColumnFilterHeader label="Entered By" type="text" values={logs.map(l => l.enteredBy ? fuelEnteredByLabel(l.enteredBy) : '')} value={columnFilters.enteredBy} onChange={f => setColumnFilter('enteredBy', f)} /></th>}
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={19 + (canSeeEnteredBy ? 1 : 0)} className="text-center py-10 text-slate-400 font-mono">
                      NO FUEL ENTRIES FOUND IN CURRENT LEDGER.
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log, i) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{(ledgerPage - 1) * LEDGER_PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{log.date}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.location}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.bunkName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.bunkOrCard || 'Bunk'}</td>
                      {/* 2026-09-18 direct request: a light, non-white
                          highlight on Vehicle No. flags any entry with no
                          Mileage recorded yet - purely derived from
                          log.mileageReportId, so it clears itself the
                          instant Mileage is entered/updated (logs already
                          re-fetches after that save), no separate tracking
                          needed.
                          2026-09-22 refinement (direct request): a
                          Vendor-type entry (Type = "Vendor" - a hired/one-off
                          vehicle, not one of KCM's own fleet) never gets a
                          Mileage entry in the first place, since Mileage
                          tracking only applies to KCM-owned vehicles - so
                          those rows are excluded from the highlight
                          regardless of missing mileageReportId. The
                          vendorName !== 'KCM' check is a belt-and-suspenders
                          guard against the unlikely case Type is "Vendor"
                          but Vendor Name was still set to "KCM" - that
                          combination should still be flagged as worth a
                          second look, not silently excluded. */}
                      {(() => {
                        // 2026-09-19 direct request: clicking Vehicle No.
                        // jumps straight to editing this entry's Mileage
                        // tab, instead of Actions -> Edit -> Mileage tab -
                        // this is exactly the row the amber highlight above
                        // is telling the office to go fill in, so the
                        // highlight itself is now the shortcut to it. Same
                        // permission gate as the Actions column's own edit
                        // button (isRqIdOnlyUser/isViewOnlyUser have no edit
                        // access at all here; a foreign row only clicks
                        // through when canEditForeignMileage allows it) -
                        // anyone who can't act on this row still just sees
                        // plain text, same as before.
                        const canJumpToMileage = !isRqIdOnlyUser && !isViewOnlyUser && (!isForeignEntry(log) || canEditForeignMileage(log));
                        const highlight = isMileageHighlighted(log);
                        const cellClass = `px-3 py-2.5 font-bold font-mono text-slate-900 uppercase tracking-wider whitespace-nowrap ${highlight ? 'bg-amber-100' : ''} ${canJumpToMileage ? 'cursor-pointer hover:underline' : ''}`;
                        const cellTitle = canJumpToMileage
                          ? (highlight ? 'Click to enter Mileage for this entry' : 'Click to edit Mileage for this entry')
                          : (highlight ? 'Mileage not entered for this entry yet' : undefined);
                        if (!canJumpToMileage) {
                          return <td className={cellClass} title={cellTitle}>{log.vehicleNumber}</td>;
                        }
                        return (
                          <td
                            className={cellClass}
                            title={cellTitle}
                            onClick={() => { startEdit(log); setEntrySection('mileage'); }}
                          >
                            {log.vehicleNumber}
                          </td>
                        );
                      })()}
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
                      {canSeeEnteredBy && (
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                          {log.enteredBy ? fuelEnteredByLabel(log.enteredBy) : '-'}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {/* 2026-09-19 fix: gating this by ownerTabFilter
                            (which pill is selected) used to force View-only
                            even for Chandan looking at Praveen's own rows,
                            wrongly blocking his one-directional Mileage
                            exception whenever he used the Praveen tab
                            specifically (it worked fine under All). Gating
                            per-row on isForeignEntry/canEditForeignMileage
                            instead is correct regardless of which pill got
                            this row on screen - and also closes the
                            opposite gap this same condition used to leave
                            open under the All tab: Praveen viewing
                            Chandan's rows there used to see the same "Fill
                            in Mileage" affordance Chandan legitimately
                            gets, even though the server always rejected
                            that write. */}
                        {isRqIdOnlyUser || isViewOnlyUser || (isForeignEntry(log) && !canEditForeignMileage(log)) ? (
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
          <PaginationFooter page={ledgerPage} totalCount={filteredLogs.length} pageSize={LEDGER_PAGE_SIZE} onPageChange={setLedgerPage} />
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
                  <fieldset
                    disabled={editingIsForeign && !(editingLog && canEditForeignMileage(editingLog))}
                    className="p-3 bg-pink-50/40 rounded-xl border border-pink-200 space-y-3 disabled:opacity-60"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-pink-700 uppercase tracking-wider flex items-center gap-1">
                        <Gauge className="w-3.5 h-3.5" /> Mileage
                      </span>
                      <span className="text-[9px] text-pink-400 font-mono">
                        {vehicleNumber ? `for ${vehicleNumber}` : 'select Vehicle Number below'}
                      </span>
                    </div>
                    {editingIsForeign && !(editingLog && canEditForeignMileage(editingLog)) && (
                      <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-semibold">
                        This entry was logged by {editingLog?.enteredBy} - view only.
                      </p>
                    )}

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
                        <label className="block font-semibold text-slate-600 mb-1">
                          Closing KM {mTotalKmManualMode && <span className="text-slate-400 font-normal normal-case">(auto = Opening + Total KM)</span>}
                        </label>
                        <input
                          type="number"
                          placeholder="Current reading"
                          value={mClosingKm}
                          onChange={(e) => setMClosingKm(e.target.value)}
                          readOnly={mTotalKmManualMode}
                          className={`w-full border rounded-lg p-2 font-mono font-bold ${mTotalKmManualMode ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800'}`}
                        />
                      </div>
                    </div>

                    {/* Total KM manual override (2026-09-18 direct request) -
                        for when there's no real Closing KM odometer reading
                        for this trip, only a GPS-reported total distance.
                        Toggling this on makes Total KM the typed value and
                        derives Closing KM = Opening + Total KM instead of
                        the usual Total KM = Closing - Opening (see the two
                        effects above) - every other calculation downstream
                        is unaffected either way. */}
                    <div className="p-2.5 bg-white rounded-lg border border-pink-100 space-y-1.5 font-mono">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <span className="text-[9px] text-slate-400 uppercase font-bold block">
                            Total KM {mTotalKmManualMode ? '(manual)' : '(auto)'}
                          </span>
                          {mTotalKmManualMode ? (
                            <input
                              type="number"
                              placeholder="e.g. from GPS"
                              value={mTotalKm}
                              onChange={(e) => setMTotalKm(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 mt-0.5 font-mono font-black text-pink-700"
                            />
                          ) : (
                            <span className="text-xs font-black text-pink-700">{mTotalKm || 0} Kilometers</span>
                          )}
                        </div>
                        <ArrowRightLeft className="w-4 h-4 text-pink-300 shrink-0 ml-2" />
                      </div>
                      <label className="flex items-center gap-1.5 text-[9px] text-slate-500 font-sans cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mTotalKmManualMode}
                          onChange={(e) => setMTotalKmManualMode(e.target.checked)}
                        />
                        No Closing KM reading available - enter Total KM manually (e.g. from GPS)
                      </label>
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
                          Total Ltrs (Litres + Extra Fuel)
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
                          Extra Fuel
                          {mExtraFuelModes.length >= 2 && mExtraFuelModes.includes('petty_cash') && <span className="text-indigo-600 font-bold"> (Petty Cash portion)</span>}
                          {mExtraFuelModes.length === 1 && mExtraFuelModes[0] === 'bunk' && <span className="text-indigo-600 font-bold"> (Paid by Bunk)</span>}
                          {mExtraFuelModes.length === 1 && mExtraFuelModes[0] === 'petty_cash' && <span className="text-indigo-600 font-bold"> (Paid by Petty Cash)</span>}
                          {mExtraFuelModes.length === 1 && mExtraFuelModes[0] === 'card' && <span className="text-indigo-600 font-bold"> (Paid by Card)</span>}
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
                          Multiple top-ups this trip, same payment method? Type them as e.g. "30+40" - added up automatically into Total Ltrs.
                        </p>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Rate per Ltr (new){totalExtraFuelAmount() > 0 && <span className="text-rose-500"> *</span>}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required={totalExtraFuelAmount() > 0}
                          placeholder="e.g. 96.50"
                          value={mRatePerLitreNew}
                          onChange={(e) => setMRatePerLitreNew(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                        />
                        {totalExtraFuelAmount() > 0 && !mRatePerLitreNew.trim() && (
                          <p className="text-[9px] text-rose-500 font-mono mt-0.5">Required since Extra Fuel has a value.</p>
                        )}
                      </div>
                    </div>

                    {/* "Paid by Bunk" / "Paid by Petty Cash" / "Paid by
                        Card" (2026-09-21: generalized to any combination of
                        the three, not just Petty Cash+Card - a trip can have
                        separate top-ups paid separate ways). Ticking a 2nd
                        or 3rd box reveals that mode's own amount field so
                        each portion has its own value. Purely an accounting
                        tag either way - Extra Fuel always folds fully into
                        Total Ltrs/Total Amount below regardless of mode.
                        Only Petty Cash additionally asks which handler's
                        float it's charged against. Only relevant once Extra
                        Fuel actually has a value or a mode is already
                        ticked; unmounted (state stays but stops mattering)
                        otherwise so it doesn't sit there with nothing to
                        apply to. */}
                    {(sumExtraFuelExpression(mExtraFuel) > 0 || mExtraFuelModes.length > 0) && (
                      <div className="p-2.5 bg-indigo-50/60 rounded-lg border border-indigo-100 space-y-2">
                        <div className="flex items-center gap-4 flex-wrap">
                          {(['bunk', 'petty_cash', 'card'] as ExtraFuelMode[]).map(mode => (
                            <label key={mode} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={mExtraFuelModes.includes(mode)}
                                onChange={() => toggleExtraFuelMode(mode)}
                                className="cursor-pointer"
                              />
                              <span className="font-semibold text-indigo-800">Paid by {EXTRA_FUEL_MODE_LABELS[mode]}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-[9px] text-slate-400 font-mono">
                          Two or three separate top-ups this trip, paid differently? Tick all that apply - an amount field appears below for each so every portion has its own value.
                        </p>
                        {mExtraFuelModes.length >= 2 && mExtraFuelModes.includes('bunk') && (
                          <div>
                            <label className="block font-semibold text-slate-600 mb-1">
                              Extra Fuel (Bunk portion) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              required
                              placeholder="e.g. 20, or 10+10 for two Bunk top-ups"
                              value={mExtraFuelBunkAmount}
                              onChange={(e) => setMExtraFuelBunkAmount(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                            />
                          </div>
                        )}
                        {mExtraFuelModes.length >= 2 && mExtraFuelModes.includes('card') && (
                          <div>
                            <label className="block font-semibold text-slate-600 mb-1">
                              Extra Fuel (Card portion) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              required
                              placeholder="e.g. 40, or 30+10 for two Card top-ups"
                              value={mExtraFuelCardAmount}
                              onChange={(e) => setMExtraFuelCardAmount(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                            />
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                              Multiple top-ups this trip, same method? Type them as e.g. "30+10" - added up automatically, same as every other portion here.
                            </p>
                          </div>
                        )}
                        {mExtraFuelModes.includes('petty_cash') && (
                          <div>
                            <label className="block font-semibold text-slate-600 mb-1">
                              Petty Cash Paid By <span className="text-rose-500">*</span>
                            </label>
                            {mExtraFuelModes.length >= 2 && (
                              <p className="text-[9px] text-slate-400 font-mono mb-1">
                                The Petty Cash portion's amount is the "Extra Fuel (Petty Cash portion)" field above - just pick who it's charged against here.
                              </p>
                            )}
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
                              Petty Cash portion: {sumExtraFuelExpression(mExtraFuel)} L - ₹{(sumExtraFuelExpression(mExtraFuel) * (parseFloat(mRatePerLitreNew) || 0)).toLocaleString('en-IN')}
                              {mPettyCashHolder ? ` charged against ${PETTY_CASH_USERS.find(u => u.username === mPettyCashHolder)?.label || mPettyCashHolder}` : ''} - included in Total Ltrs/Total Amount below (display/tracking tag only).
                            </p>
                          </div>
                        )}
                        {mExtraFuelModes.length === 1 && mExtraFuelModes[0] === 'card' && (
                          <p className="text-[9px] text-indigo-500 font-mono mt-1">
                            Extra Fuel: {sumExtraFuelExpression(mExtraFuel)} L - ₹{(sumExtraFuelExpression(mExtraFuel) * (parseFloat(mRatePerLitreNew) || 0)).toLocaleString('en-IN')} paid by Card - included in Total Ltrs/Total Amount below (display/tracking tag only).
                          </p>
                        )}
                        {mExtraFuelModes.length === 1 && mExtraFuelModes[0] === 'bunk' && (
                          <p className="text-[9px] text-indigo-500 font-mono mt-1">
                            Extra Fuel: {sumExtraFuelExpression(mExtraFuel)} L - ₹{(sumExtraFuelExpression(mExtraFuel) * (parseFloat(mRatePerLitreNew) || 0)).toLocaleString('en-IN')} paid by Bunk - included in Total Ltrs/Total Amount below (display/tracking tag only).
                          </p>
                        )}
                      </div>
                    )}

                    {/* Total Amount = Diesel Amount + Extra Fuel (always, any
                        payment mode - 2026-09-19 correction). */}
                    <div className="p-2.5 bg-white rounded-lg border border-pink-100 flex items-center justify-between font-mono">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">
                          Total Amount {totalExtraFuelAmount() > 0 ? '(Diesel + Extra Fuel)' : '(auto)'}
                        </span>
                        <span className="text-xs font-black text-pink-700">₹{mTotalAmount || 0}</span>
                      </div>
                      <DollarSign className="w-4 h-4 text-pink-300" />
                    </div>

                    {/* Authorized Driver - editable here too (2026-09-08
                        direct request), not read-only anymore. Previously
                        this only mirrored the Fuel Entry Details tab's own
                        driver field, which stays locked for a foreign entry
                        (see the disabled fieldset below) - so completing
                        just the Mileage section on someone else's entry
                        (e.g. Chandan on one of Praveen's) had NO way to set
                        or correct the driver at all. Both fields write the
                        same mDriverName state, so editing from either tab
                        keeps them in sync. Driver ID still auto-derives from
                        whatever's typed here exactly like Details' own field
                        (see matchedMileageDriver above), so a driver change
                        here still auto-updates the ID and the Fuel Audit
                        note (computeFuelAudit already reads mDriverName
                        live) with no extra wiring needed. */}
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5 text-pink-600" />
                        Authorized Driver
                      </label>
                      <input
                        type="text"
                        list="fuel-driver-names-datalist-mileage"
                        placeholder="e.g. Suresh / Adhithya"
                        value={mDriverName}
                        onChange={(e) => setMDriverName(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-white border border-pink-100 rounded-lg p-2 text-slate-800 font-semibold"
                      />
                      <datalist id="fuel-driver-names-datalist-mileage">
                        {driverNameList.map((n, i) => <option key={i} value={n} />)}
                      </datalist>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        {mDriverId ? `Driver ID: ${mDriverId} (auto)` : 'Multiple drivers can be entered in one field, separated by "/".'}
                      </p>
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
                  </fieldset>
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
                      <label className="block font-semibold text-slate-600 mb-1">
                        Location {bunkOrCard === 'Petty Cash' ? '' : '*'}
                      </label>
                      <select
                        required={!locationIsOther && bunkOrCard !== 'Petty Cash'}
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
                            required={bunkOrCard !== 'Petty Cash'}
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            // Snaps to a known canonical spelling on blur
                            // (2026-09-21 - same fix Petty Cash's own
                            // Location field already has, see
                            // normalizeLocationName) - a free-typed
                            // "Vljayawada" here used to silently split that
                            // bunk's entries away from the real "Vijayawada"
                            // everywhere else in the app reads/filters by.
                            onBlur={() => { const n = normalizeLocationName(location); if (n !== location) setLocation(n); }}
                            placeholder="Type the new location"
                            autoComplete="off"
                            className="w-full bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-slate-800"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Bunk Name {bunkOrCard === 'Petty Cash' ? '' : '*'}
                      </label>
                      <input
                        type="text"
                        required={bunkOrCard !== 'Petty Cash'}
                        list="fuel-bunks-datalist"
                        value={bunkName}
                        onChange={(e) => setBunkName(e.target.value)}
                        placeholder={bunkOrCard === 'Petty Cash' ? 'Not applicable for Petty Cash' : locationIsOther ? 'New bunk - enter manually' : 'Search bunk'}
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
                        onChange={(e) => setBunkOrCard(e.target.value as 'Bunk' | 'Card' | 'Petty Cash')}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      >
                        <option value="Bunk">Bunk</option>
                        <option value="Card">Card</option>
                        <option value="Petty Cash">Petty Cash</option>
                      </select>
                      {bunkOrCard === 'Petty Cash' && (
                        <p className="text-[9px] text-indigo-500 font-mono mt-0.5">
                          Whole amount paid from Petty Cash - excluded from this bunk's own total in Diesel Payments.
                        </p>
                      )}
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

                  {bunkOrCard === 'Petty Cash' && (
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Petty Cash Paid By <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={fuelPettyCashHolder}
                        onChange={(e) => setFuelPettyCashHolder(e.target.value)}
                        className="w-full bg-indigo-50 border border-indigo-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                      >
                        <option value="">Select...</option>
                        {PETTY_CASH_USERS.map(u => <option key={u.username} value={u.username}>{u.label}</option>)}
                      </select>
                      {!fuelPettyCashHolder && (
                        <p className="text-[9px] text-rose-500 font-mono mt-0.5">Required when Bunk/Card is Petty Cash.</p>
                      )}
                    </div>
                  )}

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
                    <label className="block font-semibold text-slate-600 mb-1">Indent Number *</label>
                    <input
                      type="text"
                      required
                      value={indentNumber}
                      onChange={(e) => setIndentNumber(e.target.value)}
                      autoComplete="off"
                      className={`w-full bg-slate-50 border rounded-lg p-2 text-slate-800 ${duplicateIndentWarning ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'}`}
                    />
                    {duplicateIndentWarning && (
                      <p className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5 mt-1 flex items-start gap-1.5 font-semibold">
                        <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
                        <span>
                          Indent No. {indentNumber.trim()} already exists in your {bunkOrCard === 'Card' ? 'Card' : bunkOrCard === 'Petty Cash' ? 'Petty Cash' : 'Bunk'} sequence
                          {bunkOrCard === 'Bunk' && bunkName ? ` for ${bunkName}${location ? `, ${location}` : ''} this month` : ''} - Save will be rejected until this is changed.
                        </span>
                      </p>
                    )}
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                      {bunkOrCard === 'Petty Cash'
                        ? 'Petty Cash has its own separate sequence - type the Indent No yourself, it never auto-fills.'
                        : bunkOrCard === 'Card'
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
                        <option value="KCM" />
                        <option value="One Time Vendor" />
                        {vendorProfiles.map((v) => <option key={v.id} value={v.name} />)}
                      </datalist>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        Type a name registered in Vendor Management, pick "KCM" for KCM's own Fleet vehicles (auto-fills when the Vehicle No. above is Fleet-owned), "One Time Vendor" for a one-off (auto-sets Vendor Code to "Vendor"), or enter one manually if not found. Also auto-fills from Vehicle Number above when that vehicle belongs to a registered vendor, or was last logged as One Time Vendor.
                      </p>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Vendor Code (auto)</label>
                      <input
                        type="text"
                        list="fuel-vendor-codes-datalist"
                        value={vendorCode}
                        onChange={(e) => setVendorCode(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800"
                      />
                      <datalist id="fuel-vendor-codes-datalist">
                        <option value="KCM" />
                        <option value="Vendor" />
                        {vendorProfiles.map((v) => <option key={v.id} value={v.code} />)}
                      </datalist>
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
                  disabled={isSubmitting || duplicateIndentWarning}
                  title={duplicateIndentWarning ? 'This Indent No already exists - enter a different number before saving.' : undefined}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
