import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { PettyCashVoucher, VehicleDocument, Vehicle, MarketPodEntry, MarketPodBalanceReceipt, MarketPodStatus, MarketPodPaymentMode, User, DriverVehicleLookup, Vendor, PettyCashAdvance } from '../types';
import {
  Landmark,
  Plus,
  Search,
  CheckCircle2,
  Calendar,
  Download,
  Share2,
  Filter,
  FileSpreadsheet,
  ChevronDown,
  Info,
  Check,
  Maximize2,
  Minimize2,
  Paperclip,
  X,
  Mail,
  Phone,
  Truck,
  Lock,
  Unlock,
  Wallet,
  AlertTriangle,
  Trash2,
  Clock,
  ArrowRightLeft
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';
import DateInput from './DateInput';
import SortHeader from './SortHeader';
import { SortState, SortDirection, extractLeadingNumber, extractTrailingNumber, compareText } from '../utils/sort';
import { handleVehicleNumberEnterKey } from '../utils/vehicleNumberSearch';
import { exportReportToExcel, exportReportToPdf, ReportTableSection } from '../utils/reportExport';
import { SaveConfirmationModal, DeleteConfirmationModal } from './ConfirmationModal';
import { PETTY_CASH_USERS } from '../utils/pettyCashUsers';

interface PettyCashProps {
  user: User;
  vouchers: PettyCashVoucher[];
  onAddVoucher: (voucher: Omit<PettyCashVoucher, 'id'>) => Promise<void>;
  onUpdateVoucher: (id: string, voucher: Partial<PettyCashVoucher>) => Promise<void>;
  onDeleteVoucher: (id: string) => Promise<void>;
  // Read-only: Fleet & Vehicles is the sole source of truth for registered
  // vehicles - this module (and every other one) only ever reads this list,
  // never writes to it.
  vehicles: Vehicle[];
  // Company-wide, unrestricted vehicle -> driver lookup (see
  // /api/drivers/vehicle-lookup) - NOT the same list as Driver Details'
  // own `drivers` state elsewhere in the app, which is location-scoped per
  // viewer. Petty Cash needs to match ANY vehicle to its driver regardless
  // of the current handler's own Driver Details location access.
  driverVehicleLookup: DriverVehicleLookup[];
  vendors: Vendor[];
  marketPodEntries: MarketPodEntry[];
  onAddMarketPodEntry: (entry: Omit<MarketPodEntry, 'id'>) => Promise<void>;
  onUpdateMarketPodEntry: (id: string, entry: Partial<MarketPodEntry>) => Promise<void>;
  onDeleteMarketPodEntry: (id: string) => Promise<void>;
  onMarketPodBalanceReceipt: (id: string, amount: number, date: string) => Promise<void>;
  // Amount Received / Balance Net tracking was removed from the UI (see
  // handleSubmit et al below) but these stay in the prop contract so
  // Administration.tsx doesn't need to change what it passes down.
  pettyCashAdvances: PettyCashAdvance[];
  onAddPettyCashAdvance: (advance: Omit<PettyCashAdvance, 'id'>) => Promise<void>;
  onDeletePettyCashAdvance: (id: string) => Promise<void>;
}

const MARKET_POD_STATUSES: MarketPodStatus[] = ['Pending', 'Closed'];

// Display-only relabel: the stored/compared value is still exactly 'Cash'
// (old records, filters, and reports keep working unchanged) - only what's
// shown to the user changed, from "Cash" to "Company Account".
const PAYMENT_MODE_LABELS: Record<MarketPodPaymentMode, string> = {
  'Cash': 'Company Account',
  'Petty Cash': 'Petty Cash'
};

// The 3 Petty Cash logins - mirrors PETTY_CASH_ACCESS_EMAILS in
// Administration.tsx/server.ts. Used to label/select whose ledger a Super
// Admin/Principal is viewing, since vouchers/advances arrive unfiltered (with
// `enteredBy`/`username` intact) for them but per-user-filtered for everyone
// else. Now shared from utils/pettyCashUsers.ts - see that file's comment for
// every other place that also reads this same list.

const EXPENSE_CATEGORIES = [
  "ACCIDENT AND SETTELMENT",
  "BANK CHARGES",
  "BATTA EXPENSES",
  "CNG GAS EXPENSES",
  "DEF OIL",
  "DIESEL EXPENSES",
  "DRIVER ROOM RENT",
  "DRIVER SALARY",
  "DRIVER SALARY ADV",
  "DRIVER SALARY PAYABLE",
  "ELECTRICITY CHARGES",
  "FOOD EXPENSES",
  "LOADING AND UNLOADING EXPENSE",
  "MARKET DRIVER PAYMENT",
  "MISC EXPENSES",
  "NP SP FC TAX RENEWALS",
  "OFFICE MAINTENANCE",
  "OTHER EXPENSES",
  "PARKING EXPENSES",
  "POLICE EXPENSES",
  "POOJA EXPENSES",
  "PRINTING & STATIONERY",
  "STAFF WELFARE EXPENSES",
  "SUPERVISOR SALARY ADV",
  "TOLL CHARGES",
  "TRAVELLING EXPENSES",
  "VEHICLE HIRE EXPENSES-ADHOC",
  "VEHICLE REGISTERATION EXPS",
  "VENDOR ADVANCE",
  "Grand Total",
  "PAID FROM",
  "RATIO"
];

const CLIENT_NAMES = ["Swiggy", "Reliance F&V", "Market Load", "KCM", "Other"];

// Locations selectable (dropdown/type-to-search) for Ramesh's Petty Cash
// login only - every other login keeps the free-text Location field.
const RAMESH_LOCATIONS = ["Nelamangala", "Nidagatta", "DHL Attibele", "Chennai"];

// Dedicated fleet vehicles with a fixed operating location - selecting one of
// these Vehicle Numbers auto-fills Location accordingly (see the auto-fill
// effect below). Sourced from the fleet list of vehicles permanently based
// out of each site.
const NELAMANGALA_VEHICLES = [
  "KA51AF5645", "KA51AG5798", "KA51AG5801", "KA51AG5806", "KA51AG9297",
  "KA51AG9298", "KA51AH0197", "KA51AH0208", "KA51AH0651", "KA51AH0657",
  "KA51AH0658", "KA51AH3428", "KA51AH3431", "KA51AH3432", "KA51AH3973",
  "KA51AH7869", "KA51AG5795", "KA52A6597", "KA53AA0063", "KA53AB3695",
  "KA53D4713"
];
const DHL_ATTIBELE_VEHICLES = [
  "KA51AH3421", "KA51AH3422", "KA51AG9295", "KA51AH3429", "KA51AH7868",
  "KA51AH7870", "KA51AG9306", "KA51AG9305", "KA51AG5807", "KA51AG5805",
  "KA53AA2995", "KA53AA0069", "KA53AA2272", "KA51AF5646"
];
const NIDAGATTA_VEHICLES = [
  "KA51AH3425", "KA53AA0067", "KA51AG5804", "KA51AN0236", "KA51AN0238",
  "KA51AH3426", "KA53D9303", "KA51AG2979", "KA53D9298", "KA51AK4717",
  "KA51AK4722", "KA51AN0237", "KA51AH3427", "KA53AA2224", "KA53AA0064",
  "KA53AA0065", "KA51AH3423", "KA51AG9301", "KA51AG9302", "KA51AG9303",
  "KA51AG9304", "KA53D9299", "KA51AH3424", "KA51AH2019", "KA51AH0653",
  "KA51AH0659", "KA51AH0660", "KA52B6137", "KA52B6437", "KA52A6575",
  "KA16D5037", "KA52B4137"
];
const DEDICATED_VEHICLE_LOCATIONS: Record<string, string> = {};
NELAMANGALA_VEHICLES.forEach(v => { DEDICATED_VEHICLE_LOCATIONS[v] = "Nelamangala"; });
DHL_ATTIBELE_VEHICLES.forEach(v => { DEDICATED_VEHICLE_LOCATIONS[v] = "DHL Attibele"; });
NIDAGATTA_VEHICLES.forEach(v => { DEDICATED_VEHICLE_LOCATIONS[v] = "Nidagatta"; });

// A Market Trip (Payment Mode = Petty Cash) merged into the Ledger as a
// read-only Credit row (point 2) - green left border + tint so it's visibly
// distinct from a real petty cash voucher at a glance, no Edit/Delete (that
// stays exclusively in Market Trip Ledger), "View in Market Trip" is the
// closest this app's tab-based navigation (no URL routing) gets to a real
// deep link: it switches to the Market Trip tab and opens this trip's own
// edit sidebar. Column order matches the voucher row exactly so cells line
// up (see the header this shares).
function MarketTripCreditRow({ trip, date, amount, balanceNet, isSuperAdmin, onViewInMarketTrip }: {
  trip: MarketPodEntry; date: string; amount: number; balanceNet: number; isSuperAdmin: boolean; onViewInMarketTrip: () => void;
}) {
  return (
    <tr className="hover:bg-emerald-50/50 transition-colors text-[11px] bg-emerald-50/20 border-l-4 border-emerald-400">
      <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{date}</td>
      <td className="px-3 py-2 font-mono font-bold text-emerald-700 whitespace-nowrap" title="This trip's own real Market Trip entry number - shared by its advance row and every balance-settlement row it later generates, until the trip's balance reaches 0">{trip.entryNo}</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[120px] truncate" title={`${trip.from} → ${trip.to}`}>{trip.from} &rarr; {trip.to}</td>
      <td className="px-3 py-2 text-slate-800 font-semibold whitespace-nowrap">{trip.customer || '-'}</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 font-mono font-bold text-slate-800 whitespace-nowrap">{trip.vehicleNumber || '-'}</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{trip.coordinator || '-'}</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-200">Credit</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-emerald-100 text-emerald-800 border-emerald-300">Market trip</span>
      </td>
      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/40">₹{amount.toLocaleString('en-IN')}</td>
      <td className="px-3 py-2 text-right font-mono text-slate-400">&mdash;</td>
      <td className={`px-3 py-2 text-right font-mono font-black ${balanceNet < 0 ? 'text-rose-600 bg-rose-50/30' : 'text-emerald-700 bg-emerald-50/30'}`} title="This holder's running balance across the merged, date-sorted Petty Cash + Market Trip + Amount Received credit list">
        {balanceNet < 0 && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
        ₹{balanceNet.toLocaleString('en-IN')}
      </td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate" title={trip.remarks}>{trip.remarks || '-'}</td>
      {isSuperAdmin && <td className="px-3 py-2 whitespace-nowrap text-slate-500 font-mono text-[10px]">{trip.enteredBy || '-'}</td>}
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 whitespace-nowrap text-center">
        <button
          onClick={onViewInMarketTrip}
          className="text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
          title="Open this trip in the Market Trip Ledger"
        >
          View in Market Trip
        </button>
      </td>
    </tr>
  );
}

// A manually-logged Amount Received top-up (Petty Cash change request part
// 3/4) merged into the Ledger as its own read-only Credit row - amber left
// border + tint so it's visibly distinct from both a real voucher and a
// Market Trip credit row at a glance. No "View in ..." link (there's no
// other module this row belongs to - it lives only here), but does reuse
// the existing Amount Received delete handler so it can still be removed
// from this merged view.
function AmountReceivedCreditRow({ advance, balanceNet, isSuperAdmin, onDelete }: {
  advance: PettyCashAdvance; balanceNet: number; isSuperAdmin: boolean; onDelete: () => void;
}) {
  const receiverLabel = PETTY_CASH_USERS.find(u => u.username === advance.username)?.label || advance.username;
  return (
    <tr className="hover:bg-amber-50/50 transition-colors text-[11px] bg-amber-50/20 border-l-4 border-amber-400">
      <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{advance.date}</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 text-slate-700 font-semibold whitespace-nowrap capitalize">{advance.account || '-'}</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{receiverLabel}</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-200">Credit</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-amber-100 text-amber-800 border-amber-300">Amount received</span>
      </td>
      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/40">₹{advance.amount.toLocaleString('en-IN')}</td>
      <td className="px-3 py-2 text-right font-mono text-slate-400">&mdash;</td>
      <td className={`px-3 py-2 text-right font-mono font-black ${balanceNet < 0 ? 'text-rose-600 bg-rose-50/30' : 'text-emerald-700 bg-emerald-50/30'}`} title="This holder's running balance across the merged, date-sorted Petty Cash + Market Trip + Amount Received credit list">
        {balanceNet < 0 && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
        ₹{balanceNet.toLocaleString('en-IN')}
      </td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate" title={advance.remarks}>{advance.remarks || '-'}</td>
      {isSuperAdmin && <td className="px-3 py-2 whitespace-nowrap text-slate-500 font-mono text-[10px]">{advance.username}</td>}
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">-</td>
      <td className="px-3 py-2 whitespace-nowrap text-center">
        <button
          onClick={onDelete}
          className="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
          title="Delete this Amount Received entry"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

export default function PettyCash({
  user,
  vouchers,
  onAddVoucher,
  onUpdateVoucher,
  onDeleteVoucher,
  vehicles,
  driverVehicleLookup,
  vendors,
  marketPodEntries,
  onAddMarketPodEntry,
  onUpdateMarketPodEntry,
  onDeleteMarketPodEntry,
  onMarketPodBalanceReceipt,
  pettyCashAdvances,
  onAddPettyCashAdvance,
  onDeletePettyCashAdvance
}: PettyCashProps) {
  // Rakshina (Accounts & Finance, finance@kcmlogistics.in) gets the same
  // full cross-handler visibility + manage rights as Super Admin here - an
  // oversight/reconciliation role, not one of the 3 Petty Cash handlers who
  // only ever see their own rows. Every "isSuperAdmin" check in this file is
  // specifically about that full-view/manage capability (Entered By column,
  // Per-Handler Breakdown, editing another handler's row, etc.), not general
  // admin rights, so broadening this one flag is enough - mirrors
  // server.ts's PETTY_CASH_FULL_VIEW_EMAILS exactly.
  const isSuperAdmin = user.department === 'super_admin' || user.email === 'finance@kcmlogistics.in';
  const [activeTab, setActiveTab] = useState<'ledger' | 'summary' | 'marketpod'>('ledger');
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  // Big, centered save/delete confirmation (see ConfirmationModal.tsx),
  // shared across every Petty Cash sub-module (Ledger vouchers, Market POD
  // trips, Amount Received) - `label`/`identifier` are set per sub-module at
  // the call site, `key` increments on every save/delete so React remounts
  // it fresh each time.
  const [saveConfirmation, setSaveConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Add/Edit Petty Cash Entry slide-out sidebar (mirrors Fuel Entry's pattern)
  const [showSidebar, setShowSidebar] = useState(false);

  // Download (replaces Export): a reference date + preset period
  const [downloadDate, setDownloadDate] = useState(new Date().toISOString().slice(0, 10));
  const [downloadPeriod, setDownloadPeriod] = useState<'day' | 'month' | 'year'>('day');

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  // Transaction Type filter (All Types / Debit / Credit) - Type is fully
  // determined by Source now (every Petty Cash row is a Debit, every Market
  // Trip credit row is a Credit), not a per-voucher field. ANDs with every
  // other filter below.
  const [selectedTransactionTypeFilter, setSelectedTransactionTypeFilter] = useState<'All' | 'debit' | 'credit'>('All');
  // Source filter (All / Petty cash / Market trip) - which ledger a merged
  // row actually came from (see the Ledger's merged petty-cash-vouchers +
  // market-trip-credits view below). ANDs with every other filter, same as
  // Transaction Type above. Distinct from the per-voucher "Origin" badge
  // (Fuel Management vs manually-entered Petty Cash), which is about how a
  // single voucher record was created, not which table a row came from.
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<'All' | 'petty-cash' | 'market-trip' | 'amount-received'>('All');
  // Client / Vehicle No / Receiver filters - all populated dynamically from
  // whatever's actually been entered in the ledger (see usedClientNames/
  // usedVehicleNumbers/usedReceivers below), not a fixed suggestion list, so
  // a newly-typed client/receiver or a newly-used vehicle immediately shows
  // up as a filter option too.
  const [selectedClientFilter, setSelectedClientFilter] = useState('All');
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState('All');
  const [selectedReceiverFilter, setSelectedReceiverFilter] = useState('All');
  // Defaults to newest-first by Date (the "Sort by" dropdown's default) so
  // the most recent entry is always on top when the module opens fresh -
  // still fully overridable via the column sort headers or the dropdown.
  const [sort, setSort] = useState<SortState | null>({ key: 'date', direction: 'desc' });
  const handleSort = (key: string, direction: SortDirection) => setSort({ key, direction });

  // Date range filter for staff to access historical data
  const [filterYear, setFilterYear] = useState('2026');
  const [filterMonth, setFilterMonth] = useState('All'); // All, 01, 02... 12

  // Summary Report year state
  const [summaryYear, setSummaryYear] = useState('2026');

  // Combined Petty Cash + Market POD report (Consolidated Summary, below the
  // Audit Calculation Note) - '' means no lower/upper bound.
  const [combinedFrom, setCombinedFrom] = useState('');
  const [combinedTo, setCombinedTo] = useState('');

  // Form State
  const [date, setDate] = useState('2026-07-09');
  const [entryNo, setEntryNo] = useState('');
  // Vinod/Saneel's manually-typed sequence for the month's first entry (see
  // canManualFirstEntryNo) - just the trailing digits, the ENT-<year>-<MM>
  // prefix is fixed/shown separately and never part of what they type.
  const [manualEntryNoSeq, setManualEntryNoSeq] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [location, setLocation] = useState('');
  const [clientName, setClientName] = useState('Swiggy');
  const [customClientName, setCustomClientName] = useState('');
  const [vendor, setVendor] = useState<PettyCashVoucher['vendor']>('kcm supply');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vendorVehicleNumber, setVendorVehicleNumber] = useState('');
  const [receiver, setReceiver] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [cashPaid, setCashPaid] = useState('');
  const [balance, setBalance] = useState('');
  const [tripSheet, setTripSheet] = useState('');
  const [remarks, setRemarks] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedCellFilter, setSelectedCellFilter] = useState<{ category: string; month: string; vendor?: 'kcm insta' | 'kcm supply' | 'all' } | null>(null);

  // Document management states for Petty Cash entries
  const [selectedVoucherForDocs, setSelectedVoucherForDocs] = useState<PettyCashVoucher | null>(null);

  const handleOpenDocModal = (v: PettyCashVoucher) => {
    setSelectedVoucherForDocs(v);
  };

  // --- Market POD (freight trip ledger) state ---
  const [showMarketPodSidebar, setShowMarketPodSidebar] = useState(false);
  const [mpEditingId, setMpEditingId] = useState<string | null>(null);
  const [mpVehicleNumber, setMpVehicleNumber] = useState('');
  const [mpDate, setMpDate] = useState(new Date().toISOString().slice(0, 10));
  const [mpFrom, setMpFrom] = useState('');
  const [mpTo, setMpTo] = useState('');
  const [mpCustomer, setMpCustomer] = useState('');
  const [mpTotalFreight, setMpTotalFreight] = useState('');
  const [mpReceivedAdvance, setMpReceivedAdvance] = useState('');
  const [mpOtherExpenses, setMpOtherExpenses] = useState('');
  const [mpPaymentMode, setMpPaymentMode] = useState<MarketPodPaymentMode>('Petty Cash');
  const [mpExtraTripAmount, setMpExtraTripAmount] = useState('');
  const [mpCoordinator, setMpCoordinator] = useState('');
  const [mpStatus, setMpStatus] = useState<MarketPodStatus>('Pending');
  const [mpRemarks, setMpRemarks] = useState('');
  const [mpDriverId, setMpDriverId] = useState('');
  // Read-only by default (auto-fetched from Driver Details); only a super
  // admin can flip this to manually override it.
  const [mpDriverOverride, setMpDriverOverride] = useState(false);
  const [mpIsSubmitting, setMpIsSubmitting] = useState(false);
  // Balance Settlement mini-form (Petty Cash change request part 2, point 2)
  // - records one receipt at a time against the currently-edited trip's
  // Balance via onMarketPodBalanceReceipt; only meaningful once the trip
  // itself has been saved (needs a real id), same "save first" gating as
  // Driver Salary's Salary Breakup tab.
  const [mpBalanceReceiptAmount, setMpBalanceReceiptAmount] = useState('');
  const [mpBalanceReceiptDate, setMpBalanceReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [mpBalanceReceiptSubmitting, setMpBalanceReceiptSubmitting] = useState(false);
  const [mpSearchTerm, setMpSearchTerm] = useState('');
  // Same newest-first-by-default convention as the Petty Cash Ledger's `sort`
  // above.
  const [mpSort, setMpSort] = useState<SortState | null>({ key: 'date', direction: 'desc' });
  const handleMpSort = (key: string, direction: SortDirection) => setMpSort({ key, direction });

  // --- Petty Cash Balance Net / Amount Received state ---
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().slice(0, 10));
  // Which company account this top-up actually came from - "this amount
  // receiving is also have two accounts sometimes 'KCM INSTA' ,AND 'KCM
  // SUPPLY'" - shown afterwards in the merged Ledger row's Vendor column
  // (see AmountReceivedCreditRow), same two options real vouchers already
  // use for this same distinction.
  const [advanceAccount, setAdvanceAccount] = useState<'kcm insta' | 'kcm supply'>('kcm insta');
  const [advanceRemarks, setAdvanceRemarks] = useState('');
  const [advanceIsSubmitting, setAdvanceIsSubmitting] = useState(false);
  // Which user's ledger the balance card/modal is scoped to - only meaningful
  // for a Super Admin/Principal (everyone else only ever sees their own rows,
  // so there's nothing to pick).
  const [balanceUserFilter, setBalanceUserFilter] = useState<string>(user.username);

  const mpBalance = (parseFloat(mpTotalFreight) || 0) - (parseFloat(mpReceivedAdvance) || 0) - (parseFloat(mpOtherExpenses) || 0);

  // Balance Settlement derived state - read from the live saved record (not
  // the in-progress form fields), since receipts are recorded against
  // whatever's actually persisted.
  const editingMpEntry = mpEditingId ? marketPodEntries.find(e => e.id === mpEditingId) : undefined;
  const mpBalanceReceipts = editingMpEntry?.balanceReceipts || [];
  const mpBalanceReceivedTotal = mpBalanceReceipts.reduce((s, r) => s + r.amount, 0);
  const mpBalancePending = Math.max(0, (editingMpEntry?.balance ?? mpBalance) - mpBalanceReceivedTotal);
  const mpSettlementStatus: 'Pending' | 'Partially Received' | 'Received' =
    mpBalanceReceivedTotal <= 0 ? 'Pending' : mpBalancePending <= 0.01 ? 'Received' : 'Partially Received';
  // Point 2's "flag the mismatch rather than silently recalculate a settled
  // amount" - true once the trip's Freight/Advance/Balance have drifted from
  // whatever they were at the moment the first balance receipt was recorded.
  const mpSettlementMismatch = !!editingMpEntry?.balanceSettledSnapshot && (
    editingMpEntry.balanceSettledSnapshot.totalFreight !== editingMpEntry.totalFreight ||
    editingMpEntry.balanceSettledSnapshot.receivedAdvance !== editingMpEntry.receivedAdvance ||
    editingMpEntry.balanceSettledSnapshot.balance !== editingMpEntry.balance
  );

  const handleRecordBalanceReceipt = async () => {
    if (!mpEditingId) return;
    const amt = parseFloat(mpBalanceReceiptAmount);
    if (!amt || amt <= 0) { triggerNotif('Enter a valid amount received.', 'error'); return; }
    if (!mpBalanceReceiptDate) { triggerNotif('Enter the date received.', 'error'); return; }
    setMpBalanceReceiptSubmitting(true);
    try {
      await onMarketPodBalanceReceipt(mpEditingId, amt, mpBalanceReceiptDate);
      setSaveConfirmation({ label: 'Balance receipt', identifier: `₹${amt.toLocaleString('en-IN')} on ${mpBalanceReceiptDate}`, key: Date.now() });
      setMpBalanceReceiptAmount('');
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to record the balance receipt.', 'error');
    } finally {
      setMpBalanceReceiptSubmitting(false);
    }
  };

  const mpVehicleList = Array.from(new Set(vehicles.map(v => v.regNo || v['Reg. No.'] || '').filter(Boolean))).sort();

  // Vendor Vehicle Number autofetch list - Vendor Management's registered
  // vehicles, not Fleet & Vehicles (separate source, for vendor-owned
  // vehicles vs. own fleet).
  const vendorVehicleList = Array.from(new Set(vendors.flatMap(v => v.vehicleNumbers || []).filter(Boolean))).sort();

  const vehicleByRegNo = (regNo: string): Vehicle | undefined =>
    vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo.trim().toUpperCase());

  // Auto-fetch Driver ID: matches Market POD's Vehicle Number against the
  // company-wide driverVehicleLookup - unrestricted by the current handler's
  // own Driver Details location scope, so this still finds the right driver
  // even for a vehicle/location they don't personally have Driver Details
  // access to. Read-only unless a super admin flips the override toggle.
  // A vehicle can now match more than one driver (two drivers sharing a
  // vehicle, e.g. shift-based) - only auto-fill when the match is
  // unambiguous; otherwise leave it for the picker below to resolve rather
  // than silently guessing which driver it was.
  const matchingDrivers = mpVehicleNumber.trim()
    ? driverVehicleLookup.filter(d => (d.vehicleNo || '').trim().toUpperCase() === mpVehicleNumber.trim().toUpperCase())
    : [];
  const matchedDriver = matchingDrivers.length === 1 ? matchingDrivers[0] : undefined;

  useEffect(() => {
    if (mpDriverOverride) return;
    if (matchingDrivers.length === 1) { setMpDriverId(matchingDrivers[0].id); return; }
    if (matchingDrivers.length === 0) { setMpDriverId(''); return; }
    // Ambiguous (2+) - the picker below resolves it. Keep whatever's
    // currently set as long as it's still one of the valid candidates (e.g.
    // already chosen from the picker) rather than clearing on every
    // incidental re-render; only actually reset once it stops being a valid
    // match (typically because the vehicle number itself changed).
    setMpDriverId(prev => matchingDrivers.some(d => d.id === prev) ? prev : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpVehicleNumber, mpDriverOverride, driverVehicleLookup]);

  // Entry No is auto-generated and never user-editable, e.g. "TRIP-000001" -
  // same live-max-plus-one convention as Fuel Entry's own auto-numbering.
  const nextMarketPodEntryNo = () => {
    const maxNum = marketPodEntries.reduce((max, e) => {
      const match = (e.entryNo || '').match(/(\d+)$/);
      const n = match ? parseInt(match[1], 10) : 0;
      return n > max ? n : max;
    }, 0);
    return `TRIP-${String(maxNum + 1).padStart(6, '0')}`;
  };

  // Ledger Entry No is likewise auto-generated and never user-editable (for
  // everyone except Vinod/Saneel's very first entry of a month - see
  // MANUAL_FIRST_ENTRY_USERNAMES below) - this is only a display preview of
  // what the server will assign (the actual save always regenerates it
  // server-side, see server.ts's own nextPettyCashEntryNo, which this
  // mirrors exactly so the preview shown before saving matches what
  // actually gets saved).
  //
  // Numbering scheme (per direct instruction, effective 2026-08-13):
  // - Aug 2026 and earlier: flat ENT-<year>-<4-digit-seq>, continuing from
  //   2673 for the rest of Aug 2026 specifically, skipping past the
  //   duplicate/out-of-order zone that had built up. One shared sequence
  //   across all 3 handlers, unaffected by the per-holder change below.
  // - Sep 2026 onward: ENT-<year>-<2-digit-month><2-digit-seq>, e.g.
  //   ENT-2026-0901, 0902... - seq resets to 01 each new month, based on
  //   the real calendar month (not the voucher's own Date field). Now
  //   per-HOLDER (see holderVouchersFor below) - each of the 3 logins has
  //   their own independent monthly count, so the same-looking Entry No can
  //   legitimately belong to two different handlers.
  const holderVouchersFor = (username: string) => vouchers.filter(v => (v.enteredBy || user.username) === username);
  const pettyCashMonthlyPrefix = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    return { year, month, prefix: `ENT-${year}-${String(month).padStart(2, '0')}`, useMonthlyFormat: year > 2026 || (year === 2026 && month >= 9) };
  };
  // Vinod and Saneel each manually type that month's very first Entry No
  // (continuing their own physical cash-book numbering into the app) -
  // every entry after that within the same real calendar month is
  // auto-sequential and locked again, same as every other handler always
  // was. Ramesh is unaffected (he'd already been entering vouchers under
  // the old scheme when this shipped). Only meaningful once the monthly
  // format is active - the flat pre-Sep-2026 format has no per-month reset
  // for "first entry of the month" to mean anything.
  const MANUAL_FIRST_ENTRY_USERNAMES = ['vinoda', 'saneel'];
  const canManualFirstEntryNo = (() => {
    if (editingId || isSuperAdmin) return false; // never applies to an edit, or to a Super Admin who isn't one of the 3 handlers
    const { prefix, useMonthlyFormat } = pettyCashMonthlyPrefix();
    if (!useMonthlyFormat || !MANUAL_FIRST_ENTRY_USERNAMES.includes(user.username)) return false;
    return !holderVouchersFor(user.username).some(v => {
      const upper = (v.entryNo || '').toUpperCase();
      return upper.startsWith(prefix) && upper.length === prefix.length + 2;
    });
  })();

  const nextPettyCashEntryNo = () => {
    const { year, month, prefix, useMonthlyFormat } = pettyCashMonthlyPrefix();

    if (useMonthlyFormat) {
      const holderVouchers = holderVouchersFor(user.username);
      const maxNum = holderVouchers.reduce((max, v) => {
        const upper = (v.entryNo || '').toUpperCase();
        if (!upper.startsWith(prefix) || upper.length !== prefix.length + 2) return max;
        const n = parseInt(upper.slice(prefix.length), 10);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
      return `${prefix}${String(maxNum + 1).padStart(2, '0')}`;
    }

    // Flat pre-Sep-2026 format - one shared sequence across all 3 handlers,
    // untouched by the per-holder change above (see this function's own
    // doc comment).
    const flatPrefix = `ENT-${year}-`;
    const maxNum = vouchers.reduce((max, v) => {
      if (!(v.entryNo || '').toUpperCase().startsWith(flatPrefix)) return max;
      const match = (v.entryNo || '').match(/(\d+)$/);
      const n = match ? parseInt(match[1], 10) : 0;
      return n > max ? n : max;
    }, year === 2026 && month === 8 ? 2672 : 0);
    return `${flatPrefix}${String(maxNum + 1).padStart(4, '0')}`;
  };

  const resetMarketPodForm = () => {
    setMpEditingId(null);
    setMpVehicleNumber('');
    setMpDate(new Date().toISOString().slice(0, 10));
    setMpFrom('');
    setMpTo('');
    setMpCustomer('');
    setMpTotalFreight('');
    setMpReceivedAdvance('');
    setMpOtherExpenses('');
    setMpPaymentMode('Petty Cash');
    setMpExtraTripAmount('');
    setMpCoordinator('');
    setMpStatus('Pending');
    setMpRemarks('');
    setMpDriverId('');
    setMpDriverOverride(false);
    setMpBalanceReceiptAmount('');
    setMpBalanceReceiptDate(new Date().toISOString().slice(0, 10));
    setShowMarketPodSidebar(false);
  };

  const handleStartEditMarketPod = (entry: MarketPodEntry) => {
    setMpEditingId(entry.id);
    setMpVehicleNumber(entry.vehicleNumber);
    setMpDate(entry.date);
    setMpFrom(entry.from);
    setMpTo(entry.to);
    setMpCustomer(entry.customer);
    setMpTotalFreight(entry.totalFreight != null ? String(entry.totalFreight) : '');
    setMpReceivedAdvance(entry.receivedAdvance != null ? String(entry.receivedAdvance) : '');
    setMpOtherExpenses(entry.otherExpenses != null ? String(entry.otherExpenses) : '');
    setMpPaymentMode(entry.paymentMode || 'Petty Cash');
    setMpExtraTripAmount(entry.extraTripAmount != null ? String(entry.extraTripAmount) : '');
    setMpCoordinator(entry.coordinator);
    setMpStatus(entry.status);
    setMpRemarks(entry.remarks);
    setMpDriverId(entry.driverId || '');
    // If the saved driverId isn't one of the vehicle's current valid matches
    // (there can be more than one now - two drivers sharing a vehicle),
    // treat it as a standing override so re-opening this entry doesn't
    // silently discard it. Still not an override if it's simply which of
    // several valid drivers was picked at save time.
    const autoMatches = driverVehicleLookup.filter(d => (d.vehicleNo || '').trim().toUpperCase() === entry.vehicleNumber.trim().toUpperCase());
    setMpDriverOverride(!!entry.driverId && !autoMatches.some(d => d.id === entry.driverId));
    setShowMarketPodSidebar(true);
  };

  const handleMarketPodSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mpVehicleNumber.trim() || !mpDate) {
      triggerNotif('Please select a Vehicle Number and Date.', 'error');
      return;
    }
    setMpIsSubmitting(true);
    try {
      // Fleet & Vehicles is the sole source of truth for what counts as a
      // registered vehicle - every other module (Fuel Management, Mileage
      // Report, Warehouse Details, Loan Management, and this one) only ever
      // reads that list, never writes to it. A vehicle number typed here
      // that Fleet & Vehicles doesn't have yet is still accepted on this
      // entry (free text), it just won't show up as a *registered* vehicle
      // anywhere else until someone adds it in Fleet & Vehicles directly.
      const regNo = mpVehicleNumber.toUpperCase().trim();
      const payload = {
        entryNo: mpEditingId ? marketPodEntries.find(e => e.id === mpEditingId)?.entryNo || nextMarketPodEntryNo() : nextMarketPodEntryNo(),
        vehicleNumber: regNo,
        date: mpDate,
        from: mpFrom.trim(),
        to: mpTo.trim(),
        customer: mpCustomer.trim(),
        totalFreight: parseFloat(mpTotalFreight) || 0,
        receivedAdvance: parseFloat(mpReceivedAdvance) || 0,
        otherExpenses: parseFloat(mpOtherExpenses) || 0,
        balance: mpBalance,
        paymentMode: mpPaymentMode,
        extraTripAmount: parseFloat(mpExtraTripAmount) || 0,
        coordinator: mpCoordinator.trim(),
        status: mpStatus,
        remarks: mpRemarks.trim(),
        driverId: mpDriverId.trim() || undefined
      };
      if (mpEditingId) {
        await onUpdateMarketPodEntry(mpEditingId, payload);
      } else {
        await onAddMarketPodEntry(payload);
      }
      setSaveConfirmation({ label: 'Market trip', identifier: `Entry no. ${payload.entryNo}`, key: Date.now() });
      resetMarketPodForm();
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save Market Trip entry.', 'error');
    } finally {
      setMpIsSubmitting(false);
    }
  };

  const filteredMarketPodUnsorted = marketPodEntries.filter(e => {
    if (!mpSearchTerm) return true;
    const q = mpSearchTerm.toLowerCase();
    return (e.entryNo || '').toLowerCase().includes(q) ||
      (e.vehicleNumber || '').toLowerCase().includes(q) ||
      (e.from || '').toLowerCase().includes(q) ||
      (e.to || '').toLowerCase().includes(q) ||
      (e.customer || '').toLowerCase().includes(q) ||
      (e.coordinator || '').toLowerCase().includes(q);
  });

  const filteredMarketPod = mpSort
    ? [...filteredMarketPodUnsorted].sort((a, b) => {
        let cmp = 0;
        switch (mpSort.key) {
          case 'vehicleNumber': cmp = extractLeadingNumber(a.vehicleNumber) - extractLeadingNumber(b.vehicleNumber); break;
          case 'customer': cmp = compareText(a.customer, b.customer); break;
          case 'entryNo': cmp = extractTrailingNumber(a.entryNo) - extractTrailingNumber(b.entryNo); break;
          // Ties (same date) break on Entry No, newest sequence first.
          case 'date': cmp = a.date === b.date ? extractTrailingNumber(a.entryNo) - extractTrailingNumber(b.entryNo) : (a.date < b.date ? -1 : 1); break;
        }
        return mpSort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredMarketPodUnsorted;

  // Refs
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Auto calculate balance from amountReceived and cashPaid (both fields are
  // no longer collected via the Add form, but the underlying computation is
  // left in place since PettyCashVoucher.balance is still a required field
  // sent on save).
  useEffect(() => {
    const r = parseFloat(amountReceived) || 0;
    const p = parseFloat(cashPaid) || 0;
    setBalance(String(r - p));
  }, [amountReceived, cashPaid]);

  // Auto-fetch Vendor ID / Driver ID: on Vehicle Number OR Vendor Vehicle
  // Number match, checks Vendor Management first (by registered
  // vehicleNumbers), then falls back to Driver Details (by vehicleNo) -
  // whichever matches first wins, trying Vehicle Number before Vendor
  // Vehicle Number. Leaves the field blank (still manually editable) when
  // neither module has this vehicle mapped.
  useEffect(() => {
    const vNo = vehicleNumber.trim().toUpperCase();
    const vvNo = vendorVehicleNumber.trim().toUpperCase();
    if (!vNo && !vvNo) return;

    const matchFor = (regNo: string): string | undefined => {
      if (!regNo) return undefined;
      const matchedVendor = vendors.find(v => (v.vehicleNumbers || []).some(num => (num || '').trim().toUpperCase() === regNo));
      if (matchedVendor) return matchedVendor.code;
      const matchedDriverRecord = driverVehicleLookup.find(d => (d.vehicleNo || '').trim().toUpperCase() === regNo);
      return matchedDriverRecord ? matchedDriverRecord.id : undefined;
    };

    setVendorId(matchFor(vNo) || matchFor(vvNo) || '');
  }, [vehicleNumber, vendorVehicleNumber, vendors, driverVehicleLookup]);

  // Location -> Client Name auto-fill (Nelamangala/Nidagatta => Reliance
  // F&V, DHL Attibele/Chennai or a TN Vehicle Number => Swiggy). Applied from
  // the onChange handlers below rather than as a useEffect so it only fires
  // on the user's own action, not when the form is populated programmatically
  // (handleStartEdit re-opening a saved entry, resetVoucherForm clearing it) -
  // otherwise opening an existing entry for edit could silently overwrite an
  // intentionally-different saved Client Name.
  const applyLocationAutoClient = (loc: string, vNoUpper: string) => {
    if (loc === 'Nelamangala' || loc === 'Nidagatta') {
      setClientName('Reliance F&V');
    } else if (loc === 'DHL Attibele' || loc === 'Chennai' || vNoUpper.startsWith('TN')) {
      setClientName('Swiggy');
    }
  };

  // Vehicle Number field's onChange: also auto-fills Location for dedicated
  // fleet vehicles (DEDICATED_VEHICLE_LOCATIONS) or TN-registered vehicles
  // (assumed Chennai), which in turn cascades into the Client Name auto-fill;
  // and auto-fills Receiver Name from that vehicle's assigned driver in
  // Driver Details (same vehicleNo match Vendor ID/Driver ID already uses).
  // Onchange-driven rather than a useEffect for the same reason as the
  // Location/Client Name auto-fill above - so re-opening a saved entry for
  // edit never overwrites who actually received the cash on that entry, even
  // if Driver Details' vehicle-to-driver assignment has since changed.
  const handleVehicleNumberChange = (raw: string) => {
    const vNo = raw.toUpperCase();
    setVehicleNumber(vNo);
    const trimmed = vNo.trim();
    if (!trimmed) return;
    const newLocation = DEDICATED_VEHICLE_LOCATIONS[trimmed] || (trimmed.startsWith('TN') ? 'Chennai' : undefined);
    if (newLocation) {
      setLocation(newLocation);
      applyLocationAutoClient(newLocation, trimmed);
    }
    const matchedDriverRecord = driverVehicleLookup.find(d => (d.vehicleNo || '').trim().toUpperCase() === trimmed);
    if (matchedDriverRecord?.name) {
      setReceiver(matchedDriverRecord.name);
    }
  };

  // Location field's onChange (both the Ramesh dropdown and the free-text
  // field for everyone else) - cascades into the Client Name auto-fill.
  const handleLocationChange = (raw: string) => {
    setLocation(raw);
    applyLocationAutoClient(raw, vehicleNumber.trim().toUpperCase());
  };

  // Handle clicking outside of category dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerNotif = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  const handleStartEdit = (v: PettyCashVoucher) => {
    setActiveTab('ledger');
    setEditingId(v.id);
    setDate(v.date);
    setEntryNo(v.entryNo);
    setCategoryInput(v.category);
    setLocation(v.location);
    if (CLIENT_NAMES.includes(v.clientName)) {
      setClientName(v.clientName);
      setCustomClientName('');
    } else {
      setClientName('Other');
      setCustomClientName(v.clientName);
    }
    setVendor(v.vendor);
    setVehicleNumber(v.vehicleNumber);
    setVendorVehicleNumber(v.vendorVehicleNumber || '');
    setReceiver(v.receiver);
    setVendorId(v.vendorId);
    setAmountReceived(v.amountReceived ? String(v.amountReceived) : '');
    setCashPaid(v.cashPaid ? String(v.cashPaid) : '');
    setBalance(v.balance ? String(v.balance) : '');
    setTripSheet(v.tripSheet);
    setRemarks(v.remarks);
    setShowSidebar(true);
  };

  const resetVoucherForm = () => {
    setEditingId(null);
    setEntryNo('');
    setManualEntryNoSeq('');
    setCategoryInput('');
    setLocation('');
    setVehicleNumber('');
    setVendorVehicleNumber('');
    setReceiver('');
    setVendorId('');
    setAmountReceived('');
    setCashPaid('');
    setBalance('');
    setTripSheet('');
    setRemarks('');
    setCustomClientName('');
  };

  const handleCancelEdit = () => {
    resetVoucherForm();
    setShowSidebar(false);
  };

  const handleOpenAddVoucher = () => {
    resetVoucherForm();
    setShowSidebar(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !categoryInput || !receiver) {
      triggerNotif('Please fill in Date, Category, and Receiver.', 'error');
      return;
    }
    if (canManualFirstEntryNo && !manualEntryNoSeq.trim()) {
      triggerNotif('Enter this month\'s first Entry No sequence.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalClient = clientName === 'Other' ? customClientName || 'Other' : clientName;
      // A manually-typed first-of-month Entry No previews as what it'll
      // actually become (prefix + the typed sequence) rather than the
      // auto-generated preview, which the server would otherwise ignore.
      const localEntryNo = editingId
        ? entryNo
        : canManualFirstEntryNo && manualEntryNoSeq.trim()
        ? `${pettyCashMonthlyPrefix().prefix}${manualEntryNoSeq.trim().padStart(2, '0')}`
        : nextPettyCashEntryNo();
      const voucherData = {
        date,
        entryNo: localEntryNo,
        // Only ever read server-side when this exact login is genuinely
        // eligible for this month's first entry (see server.ts's own
        // canManualFirstEntry check) - harmless to include otherwise, the
        // server ignores it.
        manualEntryNoSeq: canManualFirstEntryNo ? manualEntryNoSeq.trim() : undefined,
        category: categoryInput.trim(),
        location: location.trim(),
        clientName: finalClient,
        vendor,
        vehicleNumber: vehicleNumber.toUpperCase().trim(),
        vendorVehicleNumber: vendorVehicleNumber.toUpperCase().trim() || undefined,
        receiver: receiver.trim(),
        vendorId: vendorId.trim(),
        amountReceived: parseFloat(amountReceived) || 0,
        cashPaid: parseFloat(cashPaid) || 0,
        balance: parseFloat(balance) || 0,
        // Every Petty Cash-sourced row is a Debit now, full stop - no
        // longer a per-voucher choice (see the removed Transaction Type
        // selector this form used to have).
        transactionType: 'debit' as const,
        tripSheet: tripSheet.trim(),
        remarks: remarks.trim()
      };

      if (editingId) {
        await onUpdateVoucher(editingId, voucherData);
        setEditingId(null);
      } else {
        await onAddVoucher(voucherData);
      }
      setSaveConfirmation({ label: 'Entry', identifier: `Entry no. ${voucherData.entryNo}`, key: Date.now() });

      resetVoucherForm();
      setShowSidebar(false);
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to write voucher to ledger.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getYearFromDate = (dateStr: string): string => {
    if (!dateStr) return '';
    // Extract only a 4-digit year (1900-2100)
    const match = dateStr.match(/\b(19\d{2}|20\d{2})\b/);
    if (match) return match[1];
    return '';
  };

  const getMonthFromDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return parts[1].padStart(2, '0');
      if (parts[2].length === 4) return parts[1].padStart(2, '0');
    }
    return '';
  };

  // --- Balance Net Tracking helpers ---
  // Regular Petty Cash users only ever receive their own rows from the
  // server (enteredBy/username stripped, see filterEntryRowsForViewer in
  // server.ts) - for them `vouchers`/`pettyCashAdvances` already *is* "my
  // data". A Super Admin/Principal receives every user's rows with
  // enteredBy/username intact, so their view needs to scope by username.
  const vouchersFor = (username: string): PettyCashVoucher[] =>
    isSuperAdmin ? vouchers.filter(v => v.enteredBy === username) : vouchers;
  const advancesFor = (username: string): PettyCashAdvance[] =>
    isSuperAdmin ? pettyCashAdvances.filter(a => a.username === username) : pettyCashAdvances;

  // Current running balance for a user = total Amount Received - total Cash
  // Paid across all of their petty cash entries (computed live, not stored -
  // mathematically equivalent to an incremental running-balance chain, but
  // self-correcting if a past entry/advance is later edited or deleted).
  const receivedFor = (username: string): number => advancesFor(username).reduce((s, a) => s + (a.amount || 0), 0);
  const disbursedFor = (username: string): number => vouchersFor(username).reduce((s, v) => s + (v.cashPaid || 0), 0);

  const currentBalanceFor = (username: string): number => receivedFor(username) - disbursedFor(username);

  // Who the Dashboard Summary cards break down by - all 3 logins for a Super
  // Admin/Principal (who sees every user's rows), just the current user
  // otherwise (server-filtered data means there's nothing else to show).
  const dashboardSummaryUsers = isSuperAdmin ? PETTY_CASH_USERS : [{ username: user.username, label: user.name }];

  // --- Merged Ledger rows: real vouchers (Debit) + two kinds of Credit ---
  // Market Trip credit events - one row PER EVENT, not one combined row per
  // trip: a trip's Received Advance is its own row, and each later Balance
  // Settlement receipt (often logged a month+ after the trip itself, once
  // the customer actually pays) is its own separate row too, dated whenever
  // it was actually received - never backdated onto/merged into the
  // original advance row. Every row from the SAME trip shares that trip's
  // own real entryNo (e.g. "TRIP-000001", shown directly in the Entry No
  // column - not a synthetic "MT-" reference) for as long as that trip still
  // has money coming in; a different trip gets its own distinct entryNo, so
  // nothing about the sequence is shared across trips.
  const marketTripAdvanceAmount = (trip: MarketPodEntry): number => trip.receivedAdvance || 0;

  const marketTripEntriesFor = (username: string): MarketPodEntry[] =>
    (isSuperAdmin ? marketPodEntries.filter(e => e.enteredBy === username) : marketPodEntries)
      .filter(e => e.paymentMode === 'Petty Cash');

  // Manually-logged "Amount Received" top-ups (Add Amount Received modal) -
  // excludes the market-pod-auto-synced ones (source starts with
  // 'market-pod'), since those are already represented above as their own
  // Market Trip credit rows; merging both would double the same money.
  const manualAdvancesFor = (username: string): PettyCashAdvance[] =>
    advancesFor(username).filter(a => !a.source);

  type MergedOwnerRow =
    | { key: string; date: string; id: string; entryNo: string; kind: 'voucher'; voucher: PettyCashVoucher }
    | { key: string; date: string; id: string; entryNo: string; kind: 'trip-advance'; trip: MarketPodEntry }
    | { key: string; date: string; id: string; entryNo: string; kind: 'trip-balance'; trip: MarketPodEntry; receipt: MarketPodBalanceReceipt }
    | { key: string; date: string; id: string; entryNo: string; kind: 'amount-received'; advance: PettyCashAdvance };

  // Balance Net (single source of truth for running balance - see the
  // removed "Balance" column) is a genuine chronological walk, starting at 0
  // - not "Total Received Float minus cumulative Cash Paid" anymore, since
  // that treated every credit as already banked from day one. Now a credit
  // only raises the balance from the date it's actually logged onward, so
  // adding a new Amount Received/Market Trip credit today can never change
  // what an earlier row already displayed (point 4's core ask).
  //
  // Ties (same date) break on Entry No's own trailing number - the exact
  // same tiebreak the Ledger table itself sorts by (see mergedLedgerRows'
  // own sort below) - NOT the row's raw id/creation timestamp. The two must
  // always agree: if the walk processed same-day rows in a different order
  // than they're actually displayed, a row shown "after" a credit could
  // still get computed with the OLD Amt Rec/Balance Net from before it (the
  // exact bug this fixes - a debit entered on the same day as a credit,
  // sharing that credit's date, was walked using its creation-time id
  // instead of its Entry No's real sequence, so it could land on either
  // side of the credit in the walk while displaying on the other side of it
  // in the table). Amount Received rows have no Entry No, so they tie-break
  // as 0 - lowest for that day - meaning any credit logged today is treated
  // as this holder's very first event of the day; any real Petty Cash entry
  // dated the same day (always Entry No >= 1) is walked after it.
  const mergedOwnerRows = (owner: string): MergedOwnerRow[] => {
    const rows: MergedOwnerRow[] = [];
    vouchersFor(owner).forEach(v => rows.push({ key: `PC:${v.id}`, date: v.date, id: v.id, entryNo: v.entryNo || '', kind: 'voucher', voucher: v }));
    marketTripEntriesFor(owner).forEach(t => {
      if (marketTripAdvanceAmount(t) > 0) rows.push({ key: `MT:${t.id}:adv`, date: t.date, id: t.id, entryNo: t.entryNo || '', kind: 'trip-advance', trip: t });
      (t.balanceReceipts || []).forEach(r => rows.push({ key: `MT:${t.id}:bal:${r.id}`, date: r.date, id: r.id, entryNo: t.entryNo || '', kind: 'trip-balance', trip: t, receipt: r }));
    });
    manualAdvancesFor(owner).forEach(a => rows.push({ key: `AR:${a.id}`, date: a.date, id: a.id, entryNo: '', kind: 'amount-received', advance: a }));
    return rows.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const entryCmp = extractTrailingNumber(a.entryNo) - extractTrailingNumber(b.entryNo);
      if (entryCmp !== 0) return entryCmp;
      return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
    });
  };

  // Each row carries both the running Balance Net (a true cumulative total -
  // never resets when a new credit lands, just keeps adding to whatever was
  // left) AND "Amt Rec" - which credit is currently the active one to spend
  // against. Amt Rec is NOT the running total - it's whichever credit
  // (Amount Received or Market Trip) most recently landed at or before this
  // row, carried forward unchanged across every Debit row that follows it,
  // right up until the next credit event. A brand-new credit only ever
  // changes Amt Rec on ITS OWN row and every row after it - rows before it
  // keep showing whatever credit was active back then, so adding a new
  // credit today can never retroactively change what an earlier row
  // displayed (point 4/5's core ask still holds for both columns).
  const balanceNetMapFor = (owner: string): Map<string, { balance: number; amtRec: number }> => {
    const map = new Map<string, { balance: number; amtRec: number }>();
    let bal = 0;
    let amtRec = 0;
    for (const row of mergedOwnerRows(owner)) {
      if (row.kind === 'voucher') {
        bal -= row.voucher.cashPaid || 0;
        // Debit rows don't touch Amt Rec - they just spend against whatever
        // credit is currently active.
      } else if (row.kind === 'trip-advance') {
        const amount = marketTripAdvanceAmount(row.trip);
        bal += amount;
        amtRec = amount;
      } else if (row.kind === 'trip-balance') {
        const amount = row.receipt.amount || 0;
        bal += amount;
        amtRec = amount;
      } else {
        const amount = row.advance.amount || 0;
        bal += amount;
        amtRec = amount;
      }
      map.set(row.key, { balance: bal, amtRec });
    }
    return map;
  };

  const balanceNetAt = (voucher: PettyCashVoucher): number =>
    balanceNetMapFor(voucher.enteredBy || user.username).get(`PC:${voucher.id}`)?.balance ?? 0;

  // The credit currently "active" as of this voucher's own position in the
  // chronological ledger - see balanceNetMapFor above. 0 when this holder
  // hasn't received anything yet as of this row (nothing to reference).
  const amtRecAt = (voucher: PettyCashVoucher): number =>
    balanceNetMapFor(voucher.enteredBy || user.username).get(`PC:${voucher.id}`)?.amtRec ?? 0;

  const balanceNetAtTripAdvance = (trip: MarketPodEntry): number =>
    balanceNetMapFor(trip.enteredBy || user.username).get(`MT:${trip.id}:adv`)?.balance ?? 0;

  const balanceNetAtTripBalance = (trip: MarketPodEntry, receipt: MarketPodBalanceReceipt): number =>
    balanceNetMapFor(trip.enteredBy || user.username).get(`MT:${trip.id}:bal:${receipt.id}`)?.balance ?? 0;

  const balanceNetAtAdvance = (advance: PettyCashAdvance): number =>
    balanceNetMapFor(advance.username).get(`AR:${advance.id}`)?.balance ?? 0;

  const handleAddAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceAmount || parseFloat(advanceAmount) <= 0 || !advanceDate) {
      triggerNotif('Enter a valid amount and date.', 'error');
      return;
    }
    setAdvanceIsSubmitting(true);
    try {
      await onAddPettyCashAdvance({
        username: isSuperAdmin ? balanceUserFilter : user.username,
        amount: parseFloat(advanceAmount),
        date: advanceDate,
        account: advanceAccount,
        remarks: advanceRemarks.trim()
      });
      setSaveConfirmation({ label: 'Amount Received', identifier: `₹${parseFloat(advanceAmount).toLocaleString('en-IN')} on ${advanceDate}`, key: Date.now() });
      setAdvanceAmount('');
      setAdvanceRemarks('');
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to log Amount Received.', 'error');
    } finally {
      setAdvanceIsSubmitting(false);
    }
  };

  // Client / Vehicle No / Receiver filter option lists - dynamic, sourced
  // straight from the actual ledger (not a fixed suggestion list), so any
  // newly-entered value immediately becomes a filterable option. Vehicle No
  // merges both vehicleNumber and vendorVehicleNumber, per direct instruction.
  const usedClientNames = Array.from(new Set(vouchers.map(v => v.clientName).filter(Boolean))).sort();
  const usedVehicleNumbers = Array.from(new Set(vouchers.flatMap(v => [v.vehicleNumber, v.vendorVehicleNumber]).filter((n): n is string => !!n))).sort();
  const usedReceivers = Array.from(new Set(vouchers.map(v => v.receiver).filter(Boolean))).sort();

  // Filter vouchers based on search, client, vehicle, receiver, category, year and month
  const filteredVouchersUnsorted = vouchers.filter(v => {
    // Search Term matching (EntryNo, Category, Location, Receiver, VehicleNumber, ClientName)
    const matchesSearch =
      (v.entryNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.location || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.receiver || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.clientName || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesClient = selectedClientFilter === 'All' || v.clientName === selectedClientFilter;
    const matchesVehicle = selectedVehicleFilter === 'All' || v.vehicleNumber === selectedVehicleFilter || v.vendorVehicleNumber === selectedVehicleFilter;
    const matchesReceiver = selectedReceiverFilter === 'All' || v.receiver === selectedReceiverFilter;
    const matchesCategory = selectedCategoryFilter === 'All' || v.category === selectedCategoryFilter;
    // Every Petty Cash-sourced row is a Debit, full stop - see the Type
    // column render below (matches this exactly, no per-voucher exception).
    const matchesTransactionType = selectedTransactionTypeFilter === 'All' || selectedTransactionTypeFilter === 'debit';
    const matchesSource = selectedSourceFilter === 'All' || selectedSourceFilter === 'petty-cash';

    // Date filtering (Date structure is YYYY-MM-DD or DD-MM-YYYY)
    if (!v.date) return false;
    const year = getYearFromDate(v.date);
    const month = getMonthFromDate(v.date);
    const matchesYear = filterYear === 'All' || year === filterYear;
    const matchesMonth = filterMonth === 'All' || month === filterMonth;

    return matchesSearch && matchesClient && matchesVehicle && matchesReceiver && matchesCategory && matchesTransactionType && matchesSource && matchesYear && matchesMonth;
  });

  const filteredVouchers = sort
    ? [...filteredVouchersUnsorted].sort((a, b) => {
        const cmp = sort.key === 'entryNo'
          ? extractTrailingNumber(a.entryNo) - extractTrailingNumber(b.entryNo)
          : sort.key === 'date'
          // Ties (same date) break on Entry No, newest sequence first, so
          // the "Sort by" dropdown's order is stable and predictable.
          ? (a.date === b.date ? extractTrailingNumber(a.entryNo) - extractTrailingNumber(b.entryNo) : a.date < b.date ? -1 : 1)
          : extractLeadingNumber(a.vehicleNumber) - extractLeadingNumber(b.vehicleNumber);
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredVouchersUnsorted;

  // The Ledger's merged, read-only view (point 2 + the Market Trip/Amount
  // Received rework) - petty cash vouchers (Debit) + Market Trip credit
  // EVENTS (Received Advance and each Balance Settlement receipt, as their
  // own separate rows - never combined) + manually-logged Amount Received
  // top-ups (Credit), composite-keyed so ids/events never collide:
  // PC:<voucherId>, MT:<tripId>:adv, MT:<tripId>:bal:<receiptId>,
  // AR:<advanceId>. Sorted by whatever the on-screen Sort By/column headers
  // already drive (same `sort` state), so switching to Date genuinely
  // interleaves every row type instead of grouping by source.
  type LedgerRow =
    | { key: string; source: 'petty-cash'; date: string; entryNo: string; vehicleNumberSort: string; voucher: PettyCashVoucher }
    | { key: string; source: 'market-trip'; date: string; entryNo: string; vehicleNumberSort: string; trip: MarketPodEntry; amount: number; balanceNet: number }
    | { key: string; source: 'amount-received'; date: string; entryNo: string; vehicleNumberSort: string; advance: PettyCashAdvance; balanceNet: number };

  // Category/Client/Receiver/Vehicle don't apply to Credit rows (no matching
  // concept on either entity) - picking a specific value for any of those
  // simply excludes every Credit row, same "AND against a field this row
  // type doesn't have" rule the rest of this filter set already follows.
  const matchesCreditRowFilters = (date: string, searchable: string[]): boolean => {
    const matchesSearch = searchable.some(s => (s || '').toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesClient = selectedClientFilter === 'All';
    const matchesReceiver = selectedReceiverFilter === 'All';
    const matchesCategory = selectedCategoryFilter === 'All';
    const matchesVehicle = selectedVehicleFilter === 'All';
    const matchesTransactionType = selectedTransactionTypeFilter === 'All' || selectedTransactionTypeFilter === 'credit';
    if (!date) return false;
    const year = getYearFromDate(date);
    const month = getMonthFromDate(date);
    const matchesYear = filterYear === 'All' || year === filterYear;
    const matchesMonth = filterMonth === 'All' || month === filterMonth;
    return matchesSearch && matchesClient && matchesReceiver && matchesCategory && matchesVehicle && matchesTransactionType && matchesYear && matchesMonth;
  };

  // Every Market Trip credit EVENT across every trip this viewer can see
  // (marketPodEntries is already server-filtered, same as `vouchers`),
  // pre-computed here (not scoped to one owner) so the same list feeds the
  // on-screen table, the Super-Admin summary strip, and the export.
  const allMarketTripCreditRows: { trip: MarketPodEntry; amount: number; date: string; key: string }[] = [];
  marketPodEntries.filter(e => e.paymentMode === 'Petty Cash').forEach(t => {
    if (marketTripAdvanceAmount(t) > 0) allMarketTripCreditRows.push({ trip: t, amount: marketTripAdvanceAmount(t), date: t.date, key: `MT:${t.id}:adv` });
    (t.balanceReceipts || []).forEach(r => allMarketTripCreditRows.push({ trip: t, amount: r.amount || 0, date: r.date, key: `MT:${t.id}:bal:${r.id}` }));
  });

  const filteredMarketTripRows = allMarketTripCreditRows.filter(({ trip: t, date }) =>
    matchesCreditRowFilters(date, [t.entryNo, t.vehicleNumber, t.customer, t.from, t.to]) &&
    (selectedSourceFilter === 'All' || selectedSourceFilter === 'market-trip')
  );

  // Manually-logged Amount Received top-ups, module-wide (same scoping as
  // `vouchers`/`pettyCashAdvances` themselves - already server-filtered per
  // viewer) - excludes market-pod-auto-synced ones (already represented
  // above as Market Trip credit rows).
  const allAmountReceivedRows = pettyCashAdvances.filter(a => !a.source);
  const filteredAmountReceivedRows = allAmountReceivedRows.filter(a =>
    matchesCreditRowFilters(a.date, [a.remarks || '', PETTY_CASH_USERS.find(u => u.username === a.username)?.label || a.username]) &&
    (selectedSourceFilter === 'All' || selectedSourceFilter === 'amount-received')
  );

  const mergedLedgerRowsUnsorted: LedgerRow[] = [
    ...filteredVouchersUnsorted.map((v): LedgerRow => ({ key: `PC:${v.id}`, source: 'petty-cash', date: v.date, entryNo: v.entryNo, vehicleNumberSort: v.vehicleNumber, voucher: v })),
    ...filteredMarketTripRows.map(({ trip, amount, date, key }): LedgerRow => ({
      key, source: 'market-trip', date, entryNo: trip.entryNo, vehicleNumberSort: trip.vehicleNumber, trip, amount,
      balanceNet: key.includes(':adv') ? balanceNetAtTripAdvance(trip) : balanceNetAtTripBalance(trip, trip.balanceReceipts!.find(r => key.endsWith(`:${r.id}`))!)
    })),
    ...filteredAmountReceivedRows.map((a): LedgerRow => ({ key: `AR:${a.id}`, source: 'amount-received', date: a.date, entryNo: '', vehicleNumberSort: '', advance: a, balanceNet: balanceNetAtAdvance(a) }))
  ];
  // A row's Type is fully determined by its Source (every Petty Cash row is
  // a Debit, every Market Trip/Amount Received row is a Credit) - see
  // LedgerRow above.
  const typeRank = (row: LedgerRow): number => row.source === 'petty-cash' ? 1 : 0; // 0 = Credit, 1 = Debit
  const mergedLedgerRows = sort
    ? [...mergedLedgerRowsUnsorted].sort((a, b) => {
        // Type isn't alphabetic or numeric - "Credit First"/"Debit First"
        // groups by that value instead of an Ascending/Descending order,
        // with newest-first-by-date as the tie-break within each group.
        if (sort.key === 'type') {
          const cmp = typeRank(a) - typeRank(b) || (a.date === b.date ? 0 : a.date < b.date ? 1 : -1);
          return sort.direction === 'asc' ? cmp : -cmp;
        }
        const cmp = sort.key === 'entryNo'
          ? extractTrailingNumber(a.entryNo) - extractTrailingNumber(b.entryNo)
          : sort.key === 'date'
          ? (a.date === b.date ? extractTrailingNumber(a.entryNo) - extractTrailingNumber(b.entryNo) : a.date < b.date ? -1 : 1)
          : extractLeadingNumber(a.vehicleNumberSort) - extractLeadingNumber(b.vehicleNumberSort);
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : mergedLedgerRowsUnsorted;

  // "7 entries (5 petty cash + 1 market trip + 1 amount received)" - the
  // mixed-source breakdown for the entry-count label, so the different kinds
  // of rows are never confused for one another at a glance.
  const ledgerEntryCountLabel = (() => {
    const parts = [
      `${filteredVouchers.length} petty cash`,
      filteredMarketTripRows.length > 0 ? `${filteredMarketTripRows.length} market trip` : null,
      filteredAmountReceivedRows.length > 0 ? `${filteredAmountReceivedRows.length} amount received` : null
    ].filter(Boolean);
    return parts.length > 1 ? `${mergedLedgerRows.length} entries (${parts.join(' + ')})` : `${mergedLedgerRows.length} entries`;
  })();

  // Unique years list from existing vouchers to populate filter
  const availableYears = Array.from(new Set(vouchers.map(v => getYearFromDate(v.date)))).filter(Boolean).sort().reverse();
  const currentYears = availableYears.includes('2026') ? availableYears : ['2026', ...availableYears];

  // List of Month labels
  const MONTHS = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  // Helper to convert category suggestions
  const suggestedCategories = EXPENSE_CATEGORIES.filter(cat =>
    cat.toLowerCase().includes(categoryInput.toLowerCase())
  );

  // Download replaces the old CSV export: a reference date plus a preset
  // period (Day / Monthly Till Date / Yearly Till Date) computes the actual
  // date range to include, on top of whatever ledger filters are active.
  const getDownloadDateRange = (period: 'day' | 'month' | 'year', refDate: string): { start: string; end: string } => {
    if (period === 'day') return { start: refDate, end: refDate };
    if (period === 'month') return { start: `${refDate.slice(0, 7)}-01`, end: refDate };
    return { start: `${refDate.slice(0, 4)}-01-01`, end: refDate };
  };

  // Same merged Petty Cash + Market Trip credit event + Amount Received rows
  // the on-screen Ledger shows (point 2's export requirement: same columns,
  // same order, plus a Source column) - single "Balance" field removed,
  // "Balance Net" is the one balance column, matching the table exactly.
  // Amount Received is blank for real vouchers (a per-row figure now, not
  // the holder's repeated running total) and only populated on the actual
  // credit row it belongs to.
  const handleDownload = () => {
    const { start, end } = getDownloadDateRange(downloadPeriod, downloadDate);
    const rangeFilteredVouchers = filteredVouchersUnsorted.filter(v => v.date >= start && v.date <= end);
    const rangeFilteredTrips = filteredMarketTripRows.filter(({ date }) => date >= start && date <= end);
    const rangeFilteredAdvances = filteredAmountReceivedRows.filter(a => a.date >= start && a.date <= end);
    if (rangeFilteredVouchers.length === 0 && rangeFilteredTrips.length === 0 && rangeFilteredAdvances.length === 0) {
      triggerNotif('No data available to download for the selected period.', 'info');
      return;
    }

    const voucherRows = rangeFilteredVouchers.map(v => ({
      'Date': v.date,
      'Entry No': v.entryNo,
      'Category': v.category,
      'Location': v.location,
      'Client Name': v.clientName,
      'Vendor': v.vendor,
      'Vehicle Number': v.vehicleNumber,
      'Receiver': v.receiver,
      'Vendor ID': v.vendorId,
      'Transaction Type': 'Debit', // every Petty Cash-sourced row is a Debit
      'Source': 'Petty cash',
      'Amount Received': amtRecAt(v) > 0 ? amtRecAt(v) : '',
      'Cash Paid': v.cashPaid,
      'Balance Net': balanceNetAt(v),
      'Trip Sheet': v.tripSheet,
      'Remarks': v.remarks
    }));
    const tripRows = rangeFilteredTrips.map(({ trip: t, amount, key }) => ({
      'Date': key.includes(':adv') ? t.date : (t.balanceReceipts!.find(r => key.endsWith(`:${r.id}`))!.date),
      'Entry No': t.entryNo, // the trip's own real reference - shared by every credit event this same trip generates
      'Category': '-',
      'Location': `${t.from} -> ${t.to}`,
      'Client Name': t.customer,
      'Vendor': '-',
      'Vehicle Number': t.vehicleNumber,
      'Receiver': t.coordinator || '-',
      'Vendor ID': '-',
      'Transaction Type': 'Credit',
      'Source': 'Market trip',
      'Amount Received': amount,
      'Cash Paid': 0,
      'Balance Net': key.includes(':adv') ? balanceNetAtTripAdvance(t) : balanceNetAtTripBalance(t, t.balanceReceipts!.find(r => key.endsWith(`:${r.id}`))!),
      'Trip Sheet': '-',
      'Remarks': t.remarks
    }));
    const advanceRows = rangeFilteredAdvances.map(a => ({
      'Date': a.date,
      'Entry No': '-',
      'Category': '-',
      'Location': '-',
      'Client Name': '-',
      'Vendor': a.account || '-',
      'Vehicle Number': '-',
      'Receiver': PETTY_CASH_USERS.find(u => u.username === a.username)?.label || a.username,
      'Vendor ID': '-',
      'Transaction Type': 'Credit',
      'Source': 'Amount received',
      'Amount Received': a.amount,
      'Cash Paid': 0,
      'Balance Net': balanceNetAtAdvance(a),
      'Trip Sheet': '-',
      'Remarks': a.remarks || ''
    }));
    const data = [...voucherRows, ...tripRows, ...advanceRows].sort((a, b) => (a.Date < b.Date ? -1 : a.Date > b.Date ? 1 : 0));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Petty Cash Ledger");
    const periodLabel = downloadPeriod === 'day' ? downloadDate : downloadPeriod === 'month' ? downloadDate.slice(0, 7) : downloadDate.slice(0, 4);
    XLSX.writeFile(workbook, `KCM_Petty_Cash_Ledger_${periodLabel}.xlsx`);
    triggerNotif('Ledger Excel downloaded successfully!', 'success');
  };

  // Share text builder
  const buildShareSummaryText = () => {
    // Amount Received is a per-holder Total Received Float, not a per-entry
    // figure - sum each unique holder appearing in this filtered view once,
    // not once per voucher (which would double/triple-count them).
    const uniqueHolders = Array.from(new Set(filteredVouchers.map(v => v.enteredBy || user.username)));
    const totalRec = uniqueHolders.reduce((s, h) => s + receivedFor(h), 0);
    const totalPaid = filteredVouchers.reduce((s, v) => s + (v.cashPaid || 0), 0);
    const totalBal = totalRec - totalPaid;

    return `*KCM LOGISTICS - PETTY CASH VOUCHERS REPORT*
Date Filter: Year ${filterYear} / Month ${filterMonth === 'All' ? 'All Months' : MONTHS.find(m=>m.value===filterMonth)?.label}
Total Records Checked: ${filteredVouchers.length}
----------------------------------------
- Total Amount Received: ₹${totalRec.toLocaleString('en-IN')}
- Total Cash Paid: ₹${totalPaid.toLocaleString('en-IN')}
- Current Net Balance: ₹${totalBal.toLocaleString('en-IN')}
----------------------------------------
Shared on ${new Date().toLocaleDateString('en-IN')}`;
  };

  // Primary share entry point: uses the native OS share sheet when available,
  // otherwise falls back to the WhatsApp/Email/Copy modal.
  const handleShareLedger = async () => {
    const summaryText = buildShareSummaryText();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'KCM Petty Cash Report', text: summaryText });
        triggerNotif('Report shared successfully!', 'success');
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    setShowShareModal(true);
  };

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildShareSummaryText())}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareEmail = () => {
    const subject = 'KCM Petty Cash Report';
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildShareSummaryText())}`;
  };

  const handleCopySummary = () => {
    navigator.clipboard.writeText(buildShareSummaryText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      triggerNotif('Summary report text copied to clipboard!', 'success');
    }).catch(err => {
      console.error(err);
      setShowShareModal(true);
    });
  };

  // --- Summary Section Dynamic calculations ---
  // Returns matrix of Category vs Months for the selected summaryYear
  const generateSummaryReport = () => {
    const reportData: {
      category: string;
      months: Record<string, { kcmInsta: number; kcmSupply: number; total: number }>;
    }[] = EXPENSE_CATEGORIES.map(cat => {
      const monthData: Record<string, { kcmInsta: number; kcmSupply: number; total: number }> = {};
      
      MONTHS.forEach(m => {
        // filter vouchers of this category, this year, this month
        const matchedVouchers = vouchers.filter(v => {
          if (!v.date) return false;
          const year = getYearFromDate(v.date);
          const month = getMonthFromDate(v.date);
          const matchesYear = summaryYear === 'All' ? true : year === summaryYear;
          return matchesYear && month === m.value && v.category === cat;
        });

        const kcmInsta = matchedVouchers.filter(v => v.vendor === 'kcm insta').reduce((sum, v) => sum + (v.cashPaid || 0), 0);
        const kcmSupply = matchedVouchers.filter(v => v.vendor === 'kcm supply').reduce((sum, v) => sum + (v.cashPaid || 0), 0);
        const total = kcmInsta + kcmSupply;

        monthData[m.value] = { kcmInsta, kcmSupply, total };
      });

      return {
        category: cat,
        months: monthData
      };
    });

    // Calculate vertical grand totals for each month column
    const grandTotals: Record<string, { kcmInsta: number; kcmSupply: number; total: number }> = {};
    MONTHS.forEach(m => {
      const monthlyVouchers = vouchers.filter(v => {
        if (!v.date) return false;
        const year = getYearFromDate(v.date);
        const month = getMonthFromDate(v.date);
        const matchesYear = summaryYear === 'All' ? true : year === summaryYear;
        return matchesYear && month === m.value;
      });

      const kcmInsta = monthlyVouchers.filter(v => v.vendor === 'kcm insta').reduce((sum, v) => sum + (v.cashPaid || 0), 0);
      const kcmSupply = monthlyVouchers.filter(v => v.vendor === 'kcm supply').reduce((sum, v) => sum + (v.cashPaid || 0), 0);
      const total = kcmInsta + kcmSupply;

      grandTotals[m.value] = { kcmInsta, kcmSupply, total };
    });

    return { reportData, grandTotals };
  };

  const { reportData, grandTotals } = generateSummaryReport();

  // --- Combined Petty Cash + Market POD report, and per-handler breakdown
  // (Consolidated Summary, below the Audit Calculation Note - Petty Cash
  // change request part 2, points 1 & 4) ---
  const handlerLabel = (username?: string): string =>
    PETTY_CASH_USERS.find(u => u.username === username)?.label || username || '-';

  const combinedReportRows = (() => {
    const inRange = (d: string) => (!combinedFrom || d >= combinedFrom) && (!combinedTo || d <= combinedTo);
    const pcRows = vouchers.filter(v => v.date && inRange(v.date)).map(v => ({
      id: `pc-${v.id}`,
      date: v.date,
      source: 'Petty Cash' as const,
      entryNo: v.entryNo,
      handler: handlerLabel(v.enteredBy),
      description: v.category || '-',
      amount: v.cashPaid || 0
    }));
    const mpRows = marketPodEntries.filter(e => e.date && inRange(e.date)).map(e => ({
      id: `mp-${e.id}`,
      date: e.date,
      source: 'Market Trip' as const,
      entryNo: e.entryNo,
      handler: handlerLabel(e.enteredBy),
      description: `${e.from || '-'} → ${e.to || '-'} (${e.customer || '-'})`,
      amount: e.totalFreight || 0
    }));
    // Each row sorts by its own date field (a voucher's entry date, a trip's
    // own trip date) - newest first, oldest last.
    return [...pcRows, ...mpRows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  })();
  const combinedReportTotal = combinedReportRows.reduce((s, r) => s + r.amount, 0);

  // Float = every PettyCashAdvance for that handler, manual or auto (from a
  // Market POD trip's Received Advance/Balance Settlement - see
  // syncMarketPodPettyCashLinks) - identical to the Ledger tab's own Total
  // Received Float card. Balance Received is broken out separately as the
  // Market-POD-balance-settlement portion specifically, since that's the new
  // figure this feature introduces.
  const handlerBreakdown = dashboardSummaryUsers.map(u => {
    const float = receivedFor(u.username);
    const disbursed = disbursedFor(u.username);
    const balanceReceived = advancesFor(u.username).filter(a => a.source === 'market-pod-balance').reduce((s, a) => s + (a.amount || 0), 0);
    return { username: u.username, label: u.label, float, disbursed, balanceReceived, net: float - disbursed };
  });
  const handlerBreakdownTotal = handlerBreakdown.reduce((acc, h) => ({
    float: acc.float + h.float,
    disbursed: acc.disbursed + h.disbursed,
    balanceReceived: acc.balanceReceived + h.balanceReceived,
    net: acc.net + h.net
  }), { float: 0, disbursed: 0, balanceReceived: 0, net: 0 });

  // Downloads mirror exactly what's on screen - same rows, same sort order,
  // same date filter - via the shared Reports & Analytics export utility so
  // Excel/PDF stay in lockstep with any future formatting change there.
  const buildCombinedReportSections = (): ReportTableSection[] => {
    const sections: ReportTableSection[] = [{
      heading: 'Combined Report',
      columns: ['Date', 'Source', 'Entry No', 'Handler', 'Description', 'Amount'],
      rows: [
        ...combinedReportRows.map(r => [r.date, r.source, r.entryNo, r.handler, r.description, r.amount]),
        ['', '', '', '', 'TOTAL', combinedReportTotal]
      ]
    }];
    if (isSuperAdmin) {
      sections.push({
        heading: 'Per-Handler Breakdown',
        columns: ['Handler', 'Float (Total Received)', 'Disbursed', 'Balance Received', 'Net Balance'],
        rows: [
          ...handlerBreakdown.map(h => [h.label, h.float, h.disbursed, h.balanceReceived, h.net]),
          ['COMBINED TOTAL', handlerBreakdownTotal.float, handlerBreakdownTotal.disbursed, handlerBreakdownTotal.balanceReceived, handlerBreakdownTotal.net]
        ]
      });
    }
    return sections;
  };
  const combinedReportFilename = `KCM_Combined_Report_${combinedFrom || 'all'}_to_${combinedTo || 'all'}`;
  const combinedReportSubtitle = `${combinedFrom || 'All dates'} to ${combinedTo || 'All dates'}`;
  const handleDownloadCombinedReportExcel = () => exportReportToExcel(combinedReportFilename, buildCombinedReportSections());
  const handleDownloadCombinedReportPdf = () => exportReportToPdf(combinedReportFilename, 'KCM Logistics - Combined Petty Cash & Market Trip Report', combinedReportSubtitle, buildCombinedReportSections());

  // Export summary matrix as Excel
  const handleExportSummaryCSV = () => {
    const rows: any[][] = [];
    
    // Title row
    rows.push([`KCM Logistics Petty Cash Summary Report - Year ${summaryYear}`]);
    rows.push([]); // blank row

    // First header line: Category, Month names spanned
    const headerRow = ['Expense Category'];
    MONTHS.forEach(m => {
      headerRow.push(`${m.label} (KCM INSTA)`, `${m.label} (KCM SUPPLY)`, `${m.label} (Total)`);
    });
    rows.push(headerRow);

    // Rows
    reportData.forEach(row => {
      const rRow: (string | number)[] = [row.category];
      MONTHS.forEach(m => {
        const data = row.months[m.value];
        rRow.push(data.kcmInsta, data.kcmSupply, data.total);
      });
      rows.push(rRow);
    });

    // Grand Total Row
    const grandTotalRow: (string | number)[] = ['GRAND TOTALS'];
    MONTHS.forEach(m => {
      const gt = grandTotals[m.value];
      grandTotalRow.push(gt.kcmInsta, gt.kcmSupply, gt.total);
    });
    rows.push(grandTotalRow);

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Monthly Summary Matrix");
    XLSX.writeFile(workbook, `KCM_Petty_Cash_Summary_Report_${summaryYear}.xlsx`);
    triggerNotif('Summary Monthly Matrix Excel downloaded successfully!', 'success');
  };

  const mainContent = (
    <div className={`space-y-6 ${isFullscreen ? 'p-6 md:p-8 bg-slate-50 min-h-screen' : ''}`} id="pettycash-vouchers-system">
      {/* Header and navigation tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 font-sans flex items-center gap-2">
            <Landmark className="text-teal-600 w-5 h-5" />
            Petty Cash & Branch Vouchers Desk {isFullscreen && <span className="text-xs bg-teal-500 text-white font-mono px-2 py-0.5 rounded-full uppercase tracking-widest font-black animate-pulse">Fullscreen Desk</span>}
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Secure multi-vendor operational expense ledger & consolidated summary reporting system
          </p>
        </div>
        <div className="flex items-center gap-2 mt-4 md:mt-0">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold mr-1">
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Petty Cash Details
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'summary'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consolidated Summary
            </button>
            <button
              onClick={() => setActiveTab('marketpod')}
              className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'marketpod'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Market Trip
            </button>
          </div>

          <button
            onClick={() => setIsFullscreen(prev => !prev)}
            className={`border font-bold p-2 rounded-xl shadow-2xs transition-all cursor-pointer ${
              isFullscreen 
                ? 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 animate-pulse' 
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
            title={isFullscreen ? "Exit Fullscreen Desk View" : "Enter Immersive Fullscreen Workspace"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Dashboard Summary - kept at the top so it's visible without
          scrolling past the table. Built from the Balance Net ledger
          (Amount Received advances + Cash Paid across entries), not the
          filtered table below, so these numbers always reflect the whole
          picture regardless of search/filter state. Each card shows the
          combined grand total plus a per-person breakdown for a Super Admin/
          Principal (who sees all 3 logins); a regular Petty Cash login only
          ever has their own data server-side, so they just see their own
          figure with no breakdown. */}
      {activeTab === 'ledger' && (() => {
        const totalReceived = dashboardSummaryUsers.reduce((s, u) => s + receivedFor(u.username), 0);
        const totalDisbursed = dashboardSummaryUsers.reduce((s, u) => s + disbursedFor(u.username), 0);
        const totalNetBalance = totalReceived - totalDisbursed;
        // Total Received Float already includes Market Trip credits (the
        // existing PettyCashAdvance auto-sync - see server.ts's
        // syncFuelExtraPettyCashLink's sibling syncMarketPodPettyCashLinks -
        // credits mp-adv-/mp-bal- rows into the same float this sums) - this
        // is just the breakout of how much of that total came from there.
        const totalReceivedFromMarketTrip = dashboardSummaryUsers.reduce(
          (s, u) => s + advancesFor(u.username).filter(a => a.source === 'market-pod-advance' || a.source === 'market-pod-balance').reduce((s2, a) => s2 + (a.amount || 0), 0),
          0
        );
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1"><Wallet className="w-3 h-3" /> Total Received Float</span>
              <div className="text-sm font-black text-slate-800 font-mono mt-0.5">₹{totalReceived.toLocaleString('en-IN')}</div>
              {totalReceivedFromMarketTrip > 0 && (
                <div className="text-[10px] text-emerald-600 font-mono mt-0.5">incl. ₹{totalReceivedFromMarketTrip.toLocaleString('en-IN')} from market trip</div>
              )}
              {isSuperAdmin && (
                <div className="mt-2 pt-2 border-t border-slate-200 space-y-0.5">
                  {dashboardSummaryUsers.map(u => (
                    <div key={u.username} className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                      <span className="font-sans font-semibold">{u.label}</span>
                      <span>₹{receivedFor(u.username).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-rose-50/30 p-3 rounded-xl border border-rose-100">
              <span className="text-[10px] text-rose-500 font-bold uppercase">Total Disbursed Expenses</span>
              <div className="text-sm font-black text-rose-700 font-mono mt-0.5">₹{totalDisbursed.toLocaleString('en-IN')}</div>
              {isSuperAdmin && (
                <div className="mt-2 pt-2 border-t border-rose-100 space-y-0.5">
                  {dashboardSummaryUsers.map(u => (
                    <div key={u.username} className="flex items-center justify-between text-[10px] font-mono text-rose-500">
                      <span className="font-sans font-semibold">{u.label}</span>
                      <span>₹{disbursedFor(u.username).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`p-3 rounded-xl border ${totalNetBalance < 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50/30 border-emerald-100'}`}>
              <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${totalNetBalance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {totalNetBalance < 0 && <AlertTriangle className="w-3 h-3" />} Net Remaining Balance
              </span>
              <div className={`text-sm font-black font-mono mt-0.5 ${totalNetBalance < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>₹{totalNetBalance.toLocaleString('en-IN')}</div>
              <div className={`mt-2 pt-2 border-t space-y-0.5 ${totalNetBalance < 0 ? 'border-rose-200' : 'border-emerald-100'}`}>
                {dashboardSummaryUsers.map(u => {
                  const bal = currentBalanceFor(u.username);
                  return (
                    <div key={u.username} className={`flex items-center justify-between text-[10px] font-mono ${bal < 0 ? 'text-rose-600 font-bold' : 'text-emerald-700'}`}>
                      <span className="font-sans font-semibold">{u.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span>₹{bal.toLocaleString('en-IN')}</span>
                        <button
                          type="button"
                          onClick={() => { setBalanceUserFilter(u.username); setShowAdvanceModal(true); }}
                          title={`Log Amount Received for ${u.label}`}
                          className="p-0.5 bg-white border border-current rounded cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Market Trip credit summary strip (point 2) - Super Admin only, so
          they can spot the inflow at a glance without opening the Ledger
          table itself. Scoped to whatever's actually visible to this viewer
          (allMarketTripCreditRows already reflects the same server-side row
          filtering every other list here does) - one entry per credit EVENT
          now (advance + each balance receipt counted separately), not one
          per trip. */}
      {activeTab === 'ledger' && isSuperAdmin && allMarketTripCreditRows.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs">
          <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="font-bold text-emerald-800">
            Market trip credit — ₹{allMarketTripCreditRows.reduce((s, t) => s + t.amount, 0).toLocaleString('en-IN')} across {allMarketTripCreditRows.length} {allMarketTripCreditRows.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      )}

      {notif && (
        <div
          className={`p-3 border rounded-xl text-xs font-medium flex items-center gap-2.5 shadow-sm transition-all animate-fade-in ${
            notif.type === 'success'
              ? 'bg-teal-50 border-teal-200 text-teal-800'
              : notif.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <CheckCircle2 className={`w-4 h-4 ${notif.type === 'success' ? 'text-teal-600' : notif.type === 'error' ? 'text-red-500' : 'text-blue-500'} shrink-0`} />
          <span className="font-sans leading-relaxed">{notif.message}</span>
        </div>
      )}

      {activeTab === 'ledger' ? (
        <div className="space-y-4">
          {/* Ledger: Filters, Search, Actions (Add Entry, Download, Share) */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 flex flex-col space-y-4">
            
            {/* Action Bar (Add Entry, Download, Share) */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
              <div className="font-semibold text-slate-800 flex items-center gap-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Ledger Operations:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Add Petty Cash Entry - opens the slide-out sidebar, mirrors Fuel Entry's "+ Add Entry" */}
                <button
                  type="button"
                  onClick={handleOpenAddVoucher}
                  className="bg-gradient-to-r from-teal-600 to-emerald-700 hover:shadow-md text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Petty Cash Entry
                </button>

                {/* Amount Received - opening/top-up advance for this user's (or, for Super Admin, the selected user's) Balance Net ledger */}
                <button
                  type="button"
                  onClick={() => { setBalanceUserFilter(isSuperAdmin ? balanceUserFilter || PETTY_CASH_USERS[0].username : user.username); setShowAdvanceModal(true); }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Add Amount Received
                </button>

                {/* Download - reference date + preset period */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <DateInput
                    value={downloadDate}
                    onChange={(e) => setDownloadDate(e.target.value)}
                    className="border-none p-0.5 font-mono text-slate-700 focus:outline-none w-28"
                  />
                  <select
                    value={downloadPeriod}
                    onChange={(e) => setDownloadPeriod(e.target.value as 'day' | 'month' | 'year')}
                    className="border-l border-slate-200 pl-1.5 font-semibold text-slate-700 focus:outline-none bg-transparent"
                  >
                    <option value="day">For the Day</option>
                    <option value="month">Monthly Till Date</option>
                    <option value="year">Yearly Till Date</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                  title="Download records for the selected period as Excel (.xlsx)"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  Download
                </button>

                {/* Share summary */}
                <button
                  type="button"
                  onClick={handleShareLedger}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                  title="Share ledger summary via WhatsApp, Email, or copy to clipboard"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share Report
                </button>
              </div>
            </div>

            {/* Robust Filter Console */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs text-xs space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 font-bold text-slate-700 text-[10px] uppercase tracking-wider">
                <span className="flex items-center gap-1"><Filter className="w-3 h-3 text-teal-600" /> Filters & Historical Lookup</span>
                <span>Matches: {ledgerEntryCountLabel}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-10 gap-2.5">
                {/* Sort By - Newest First (default) / Oldest First. Reuses
                    the same `sort` state the column headers drive, so it's
                    always exactly what's currently applied - re-sorts the
                    already-filtered list instantly, no extra fetch needed. */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Sort By</label>
                  <select
                    value={sort?.key === 'date' && sort.direction === 'asc' ? 'oldest' : 'newest'}
                    onChange={(e) => setSort({ key: 'date', direction: e.target.value === 'oldest' ? 'asc' : 'desc' })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                  </select>
                </div>

                {/* Year Dropdown */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Year Lookup</label>
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="All">All Years</option>
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                  </select>
                </div>

                {/* Month Dropdown */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Month Lookup</label>
                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="All">All Months</option>
                    {MONTHS.map((m, idx) => (
                      <option key={idx} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Category Filter</label>
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="All">All Categories</option>
                    {EXPENSE_CATEGORIES.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Transaction Type Filter - Debit (every Petty Cash-sourced
                    row) / Credit (every Market Trip credit row) - fully
                    determined by Source, not a per-voucher field. ANDs with
                    every filter here, same as the rest. */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Transaction Type</label>
                  <select
                    value={selectedTransactionTypeFilter}
                    onChange={(e) => setSelectedTransactionTypeFilter(e.target.value as 'All' | 'debit' | 'credit')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="All">All Types</option>
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>

                {/* Source Filter - which ledger a merged row came from (see
                    the Ledger's merged petty-cash-vouchers + market-trip-
                    credits view above/below). ANDs with every filter here. */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Source</label>
                  <select
                    value={selectedSourceFilter}
                    onChange={(e) => setSelectedSourceFilter(e.target.value as 'All' | 'petty-cash' | 'market-trip' | 'amount-received')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="All">All Sources</option>
                    <option value="petty-cash">Petty cash</option>
                    <option value="market-trip">Market trip</option>
                    <option value="amount-received">Amount received</option>
                  </select>
                </div>

                {/* Client Filter - dynamic from whatever clientName values
                    are actually in the ledger (see usedClientNames above),
                    not the fixed CLIENT_NAMES suggestion list, so a custom
                    "Other" client someone typed in shows up here too. */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Client</label>
                  <select
                    value={selectedClientFilter}
                    onChange={(e) => setSelectedClientFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="All">All Clients</option>
                    {usedClientNames.map((c, idx) => (
                      <option key={idx} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Vehicle No Filter - merges Vehicle # and Vendor Vehicle #
                    from the ledger into one searchable list. */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Vehicle No</label>
                  <input
                    type="text"
                    list="petty-cash-vehicle-filter-options"
                    placeholder="All Vehicles"
                    value={selectedVehicleFilter === 'All' ? '' : selectedVehicleFilter}
                    onChange={(e) => setSelectedVehicleFilter(e.target.value.trim() ? e.target.value.toUpperCase() : 'All')}
                    onKeyDown={(e) => handleVehicleNumberEnterKey(e, selectedVehicleFilter === 'All' ? '' : selectedVehicleFilter, usedVehicleNumbers, (v) => setSelectedVehicleFilter(v || 'All'))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700 uppercase"
                  />
                  <datalist id="petty-cash-vehicle-filter-options">
                    {usedVehicleNumbers.map((n, idx) => <option key={idx} value={n} />)}
                  </datalist>
                </div>

                {/* Receiver Filter - dynamic from the ledger, same rule as
                    Client, now searchable (type to filter) like Vehicle No. */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Receiver</label>
                  <input
                    type="text"
                    list="petty-cash-receiver-filter-options"
                    placeholder="All Receivers"
                    value={selectedReceiverFilter === 'All' ? '' : selectedReceiverFilter}
                    onChange={(e) => setSelectedReceiverFilter(e.target.value.trim() ? e.target.value : 'All')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  />
                  <datalist id="petty-cash-receiver-filter-options">
                    {usedReceivers.map((r, idx) => <option key={idx} value={r} />)}
                  </datalist>
                </div>

                {/* Live search input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Keyword Search</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. entry, receiver"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400">
                      <Search className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vouchers Table Ledger View */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs flex-1 min-h-[350px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5"><SortHeader label="Entry No" sortKey="entryNo" sort={sort} onSort={handleSort} type="numeric" /></th>
                    <th className="px-3 py-2.5">Expense Category</th>
                    <th className="px-3 py-2.5">Location</th>
                    <th className="px-3 py-2.5">Client</th>
                    <th className="px-3 py-2.5">Vendor</th>
                    <th className="px-3 py-2.5"><SortHeader label="Vehicle #" sortKey="vehicleNumber" sort={sort} onSort={handleSort} type="numeric" /></th>
                    <th className="px-3 py-2.5">Vendor Vehicle #</th>
                    <th className="px-3 py-2.5">Receiver</th>
                    <th className="px-3 py-2.5">Vendor ID</th>
                    <th className="px-3 py-2.5"><SortHeader label="Type" sortKey="type" sort={sort} onSort={handleSort} labels={{ asc: 'Credit First', desc: 'Debit First' }} /></th>
                    <th className="px-3 py-2.5">Source</th>
                    <th className="px-3 py-2.5 text-right">Amt Rec</th>
                    <th className="px-3 py-2.5 text-right">Cash Paid</th>
                    <th className="px-3 py-2.5 text-right">Balance Net</th>
                    <th className="px-3 py-2.5">Trip Sheet</th>
                    <th className="px-3 py-2.5">Remarks</th>
                    {isSuperAdmin && <th className="px-3 py-2.5">Entered By</th>}
                    <th className="px-3 py-2.5">Origin</th>
                    <th className="px-3 py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                  {mergedLedgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={19 + (isSuperAdmin ? 1 : 0)} className="text-center py-16 text-slate-400 font-mono text-xs">
                        NO RECORDED PETTY CASH VOUCHERS MATCH THE SELECTION.
                        <div className="text-[10px] text-slate-400 font-sans mt-1">Use "Add Petty Cash Entry" above to authorize new cash disbursements.</div>
                      </td>
                    </tr>
                  ) : (
                    mergedLedgerRows.map((row) => row.source === 'market-trip' ? (
                      <MarketTripCreditRow key={row.key} trip={row.trip} date={row.date} amount={row.amount} isSuperAdmin={isSuperAdmin} balanceNet={row.balanceNet} onViewInMarketTrip={() => { setActiveTab('marketpod'); handleStartEditMarketPod(row.trip); }} />
                    ) : row.source === 'amount-received' ? (
                      <AmountReceivedCreditRow key={row.key} advance={row.advance} isSuperAdmin={isSuperAdmin} balanceNet={row.balanceNet} onDelete={() => onDeletePettyCashAdvance(row.advance.id)} />
                    ) : (() => { const v = row.voucher;
                      return (
                      <tr key={v.id} className="hover:bg-slate-50/70 transition-colors text-[11px]">
                        <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{v.date}</td>
                        <td className="px-3 py-2 font-bold font-mono text-slate-900 whitespace-nowrap">{v.entryNo}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                            {v.category}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[100px] truncate" title={v.location}>{v.location || '-'}</td>
                        <td className="px-3 py-2 text-slate-800 font-semibold whitespace-nowrap">{v.clientName}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            v.vendor === 'kcm insta' ? 'bg-pink-50 text-pink-700 border border-pink-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}>
                            {v.vendor}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-800 whitespace-nowrap">{v.vehicleNumber || '-'}</td>
                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{v.vendorVehicleNumber || '-'}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{v.receiver}</td>
                        <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{v.vendorId || '-'}</td>
                        {/* Type is fully determined by Source now - every
                            Petty Cash-sourced row is a Debit (money paid
                            out), full stop. Market Trip rows are always
                            Credit (see MarketTripCreditRow) - the old
                            per-voucher transactionType toggle no longer
                            drives this. */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-rose-50 text-rose-700 border-rose-200">
                            Debit
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-400">Petty cash</td>
                        {/* Amt Rec shows whichever credit is currently
                            "active" as of this row (see amtRecAt/
                            balanceNetMapFor) - it carries forward unchanged
                            across every Debit row until the next credit
                            event, so it's never blank once this holder has
                            received anything, but a brand-new credit today
                            still can't retroactively change what an earlier
                            row already displayed (only rows from its own
                            date onward pick it up). */}
                        <td className="px-3 py-2 text-right font-mono text-slate-600" title="The credit (Amount Received or Market Trip) currently active as of this entry - carries forward unchanged until the next credit lands">
                          {amtRecAt(v) > 0 ? `₹${amtRecAt(v).toLocaleString('en-IN')}` : <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-red-700 bg-red-50/20">₹{(v.cashPaid || 0).toLocaleString('en-IN')}</td>
                        {(() => {
                          const net = balanceNetAt(v);
                          return (
                            <td className={`px-3 py-2 text-right font-mono font-black ${net < 0 ? 'text-rose-600 bg-rose-50/30' : 'text-emerald-700 bg-emerald-50/30'}`} title="This holder's running balance across the merged, date-sorted Petty Cash + Market Trip credit list: Total Received Float minus cash paid up to and including this entry">
                              {net < 0 && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
                              ₹{net.toLocaleString('en-IN')}
                            </td>
                          );
                        })()}
                        <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{v.tripSheet || '-'}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate" title={v.remarks}>{v.remarks || '-'}</td>
                        {isSuperAdmin && (
                          <td className="px-3 py-2 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                            {v.enteredBy || '-'}
                          </td>
                        )}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {v.source === 'fuel-management' ? (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200"
                              title={`Auto-generated from Fuel Management's Extra Fuel${v.mileageReportId ? ` (Mileage Report ${v.mileageReportId})` : ''} - edit/delete via the linked Fuel Entry.`}
                            >
                              Fuel Management
                            </span>
                          ) : (
                            <span className="text-slate-400">Petty Cash</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenDocModal(v)}
                              className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer flex items-center gap-1"
                              title="Manage Attachments"
                            >
                              <Paperclip className="w-3 h-3" />
                              {v.documents && v.documents.length > 0 ? `Docs (${v.documents.length})` : 'Docs'}
                            </button>
                            {v.source === 'fuel-management' ? (
                              <span
                                className="text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md font-bold text-[10px] cursor-not-allowed"
                                title="This entry was generated from Fuel Management. To edit or remove it, update the linked Fuel Entry instead."
                              >
                                Locked
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleStartEdit(v)}
                                  className="text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                                  title="Edit this entry"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete entry ${v.entryNo}?`)) {
                                      onDeleteVoucher(v.id);
                                      setDeleteConfirmation({ label: 'Entry', identifier: `Entry no. ${v.entryNo}`, key: Date.now() });
                                    }
                                  }}
                                  className="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                                  title="Delete this entry"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })())
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'summary' ? (
        /* Section 2 Summary: Monthly reporting matrix layout with download option */
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 text-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Monthly Petty Cash Summary Report
              </h2>
              <p className="text-slate-500 font-mono text-[10px] mt-0.5">
                Multi-vendor monthly matrix. Automatically groups expenses by category and calculates math totals.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-600 uppercase text-[9px] font-mono">Select Reporting Year</span>
                <select
                  value={summaryYear}
                  onChange={(e) => setSummaryYear(e.target.value)}
                  className="bg-white border border-slate-200 rounded-md px-2 py-0.5 font-bold text-slate-800"
                >
                  <option value="All">All Years</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                </select>
              </div>

              <button
                onClick={handleExportSummaryCSV}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                Download Report (Excel)
              </button>
            </div>
          </div>

          {/* Matrix table with horizontal scroll */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#0f172a] text-slate-200 text-[9px] uppercase tracking-wider sticky top-0 z-15 divide-x divide-slate-800">
                <tr>
                  <th rowSpan={2} className="px-3 py-3 text-slate-200 font-sans uppercase tracking-widest min-w-[200px] align-middle sticky left-0 bg-[#0f172a] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                    Expense Category
                  </th>
                  {MONTHS.map((m, idx) => (
                    <th key={idx} colSpan={3} className="px-3 py-1.5 text-center bg-slate-800/80 font-bold border-b border-slate-700 text-teal-400">
                      {m.label} ({summaryYear})
                    </th>
                  ))}
                </tr>
                <tr className="bg-[#1e293b] text-slate-300 divide-x divide-slate-700">
                  {MONTHS.map((m, idx) => (
                    <React.Fragment key={idx}>
                      <th className="px-2 py-1 text-center font-bold text-[8px] min-w-[70px] text-pink-400 font-mono uppercase">KCM INSTA</th>
                      <th className="px-2 py-1 text-center font-bold text-[8px] min-w-[75px] text-sky-400 font-mono uppercase">KCM SUPPLY</th>
                      <th className="px-2 py-1 text-center font-bold text-[8px] min-w-[80px] bg-slate-900 text-emerald-400">Total Exp</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                {reportData.map((row, idx) => {
                  // Determine if category has any actual non-zero data
                  const hasData = Object.values(row.months).some(m => m.total > 0);
                  return (
                    <tr key={idx} className={`hover:bg-slate-50/50 transition-colors divide-x divide-slate-100 text-[10px] ${!hasData ? 'opacity-45' : ''}`}>
                      <td className="px-3 py-2 font-bold text-slate-900 bg-slate-50 sticky left-0 z-10 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {row.category}
                      </td>
                      {MONTHS.map((m, mIdx) => {
                        const cell = row.months[m.value];
                        return (
                          <React.Fragment key={mIdx}>
                            <td 
                              onClick={() => cell.kcmInsta > 0 && setSelectedCellFilter({ category: row.category, month: m.value, vendor: 'kcm insta' })}
                              className={`px-2 py-2 text-right font-mono text-slate-500 ${cell.kcmInsta > 0 ? 'hover:bg-teal-50 hover:text-teal-900 hover:underline cursor-pointer transition-colors' : ''}`}
                              title={cell.kcmInsta > 0 ? "Click to view, edit or delete KCM Insta entries" : undefined}
                            >
                              {cell.kcmInsta > 0 ? `₹${cell.kcmInsta.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td 
                              onClick={() => cell.kcmSupply > 0 && setSelectedCellFilter({ category: row.category, month: m.value, vendor: 'kcm supply' })}
                              className={`px-2 py-2 text-right font-mono text-slate-500 ${cell.kcmSupply > 0 ? 'hover:bg-teal-50 hover:text-teal-900 hover:underline cursor-pointer transition-colors' : ''}`}
                              title={cell.kcmSupply > 0 ? "Click to view, edit or delete KCM Supply entries" : undefined}
                            >
                              {cell.kcmSupply > 0 ? `₹${cell.kcmSupply.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td 
                              onClick={() => cell.total > 0 && setSelectedCellFilter({ category: row.category, month: m.value, vendor: 'all' })}
                              className={`px-2 py-2 text-right font-mono font-bold bg-emerald-50/20 text-emerald-800 ${cell.total > 0 ? 'hover:bg-emerald-100 hover:text-emerald-950 hover:underline cursor-pointer transition-colors' : ''}`}
                              title={cell.total > 0 ? "Click to view, edit or delete all entries" : undefined}
                            >
                              {cell.total > 0 ? `₹${cell.total.toLocaleString('en-IN')}` : '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* GRAND TOTAL ROW */}
                <tr className="bg-slate-900 text-white font-sans tracking-wide uppercase text-[10px] divide-x divide-slate-800 sticky bottom-0 z-10 font-bold border-t-2 border-slate-700 shadow-[0_-2px_5px_-1px_rgba(0,0,0,0.15)]">
                  <td className="px-3 py-3 font-black bg-slate-950 sticky left-0 z-25 text-teal-400 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                    GRAND TOTALS
                  </td>
                  {MONTHS.map((m, idx) => {
                    const gt = grandTotals[m.value];
                    return (
                      <React.Fragment key={idx}>
                        <td className="px-2 py-3 text-right font-mono text-pink-300">
                          {gt.kcmInsta > 0 ? `₹${gt.kcmInsta.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-sky-300">
                          {gt.kcmSupply > 0 ? `₹${gt.kcmSupply.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                        <td className="px-2 py-3 text-right font-mono font-black text-emerald-400 bg-slate-950">
                          {gt.total > 0 ? `₹${gt.total.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 font-mono flex items-start gap-2.5">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-700">Audit Calculation Note:</span> Under each reporting month, the columns represent:
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li><span className="font-bold text-slate-700">KCM INSTA</span>: Expenditures marked for KCM INSTA vendor.</li>
                <li><span className="font-bold text-slate-700">KCM SUPPLY</span>: Expenditures marked for KCM SUPPLY vendor.</li>
                <li><span className="font-bold text-teal-700">Total Expenses</span>: Dynamically calculated mathematically as <code className="bg-slate-100 px-1 rounded">KCM INSTA + KCM SUPPLY</code> expenses for that category.</li>
              </ul>
            </div>
          </div>

          {/* Per-Handler Breakdown (Super Admin/Principal only) - Petty Cash
              change request part 2, point 4. Everyone else's own figures are
              already the single row they'd see anyway (row-level filtering
              means they only ever have one handler's worth of data), so this
              section only earns its place for admins comparing across all 3. */}
          {isSuperAdmin && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-indigo-600" /> Per-Handler Breakdown
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0f172a] text-slate-200 uppercase text-[9px] tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Handler</th>
                      <th className="px-3 py-2 text-right">Float (Total Received)</th>
                      <th className="px-3 py-2 text-right">Disbursed</th>
                      <th className="px-3 py-2 text-right">Balance Received</th>
                      <th className="px-3 py-2 text-right">Net Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {handlerBreakdown.map(h => (
                      <tr key={h.username} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-semibold text-slate-700">{h.label}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">₹{h.float.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right font-mono text-rose-600">₹{h.disbursed.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right font-mono text-indigo-600">₹{h.balanceReceived.toLocaleString('en-IN')}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${h.net < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>₹{h.net.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-900 text-white font-bold">
                      <td className="px-3 py-2 uppercase text-[10px] tracking-wide">Combined Total</td>
                      <td className="px-3 py-2 text-right font-mono">₹{handlerBreakdownTotal.float.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right font-mono text-rose-300">₹{handlerBreakdownTotal.disbursed.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right font-mono text-indigo-300">₹{handlerBreakdownTotal.balanceReceived.toLocaleString('en-IN')}</td>
                      <td className={`px-3 py-2 text-right font-mono ${handlerBreakdownTotal.net < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>₹{handlerBreakdownTotal.net.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Combined Report - Petty Cash + Market POD merged into one list,
              newest first (Petty Cash change request part 2, point 1). */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" /> Combined Report ({combinedReportRows.length} entries)
              </span>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <DateInput value={combinedFrom} onChange={(e) => setCombinedFrom(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-slate-700" />
                <span className="text-slate-400">to</span>
                <DateInput value={combinedTo} onChange={(e) => setCombinedTo(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-slate-700" />
                {(combinedFrom || combinedTo) && (
                  <button type="button" onClick={() => { setCombinedFrom(''); setCombinedTo(''); }} title="Clear date filter" className="text-slate-400 hover:text-rose-500 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={handleDownloadCombinedReportExcel}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" /> Excel
                </button>
                <button
                  onClick={handleDownloadCombinedReportPdf}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0f172a] text-slate-200 uppercase text-[9px] tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Entry No</th>
                    <th className="px-3 py-2">Handler</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {combinedReportRows.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">No entries in this range.</td></tr>
                  ) : combinedReportRows.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
                          r.source === 'Petty Cash' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {r.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-slate-800 whitespace-nowrap">{r.entryNo}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.handler}</td>
                      <td className="px-3 py-2 text-slate-600">{r.description}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">₹{r.amount.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
                {combinedReportRows.length > 0 && (
                  <tfoot className="sticky bottom-0">
                    <tr className="bg-slate-900 text-white font-bold">
                      <td colSpan={5} className="px-3 py-2.5 uppercase text-[10px] tracking-wide text-right">Total</td>
                      <td className="px-3 py-2.5 text-right font-mono">₹{combinedReportTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Section 3 Market POD: freight trip ledger */
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 flex flex-col space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
            <div className="font-semibold text-slate-800 flex items-center gap-1">
              <Truck className="w-4 h-4 text-emerald-600" />
              Market Trip Ledger:
            </div>
            <button
              type="button"
              onClick={() => { resetMarketPodForm(); setShowMarketPodSidebar(true); }}
              className="bg-gradient-to-r from-teal-600 to-emerald-700 hover:shadow-md text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Trip Entry
            </button>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs text-xs space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 font-bold text-slate-700 text-[10px] uppercase tracking-wider">
              <span className="flex items-center gap-1"><Filter className="w-3 h-3 text-teal-600" /> Search</span>
              <span>Matches: {filteredMarketPod.length} entries</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="e.g. entry no, vehicle, customer, coordinator"
                  value={mpSearchTerm}
                  onChange={(e) => setMpSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400">
                  <Search className="w-3 h-3" />
                </span>
              </div>
              {/* Sort By - same Newest/Oldest First convention as the
                  Petty Cash Ledger, reusing mpSort so it's always exactly
                  what's currently applied. */}
              <select
                value={mpSort?.key === 'date' && mpSort.direction === 'asc' ? 'oldest' : 'newest'}
                onChange={(e) => setMpSort({ key: 'date', direction: e.target.value === 'oldest' ? 'asc' : 'desc' })}
                className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700 sm:w-44"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs flex-1 min-h-[300px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px] sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5"><SortHeader label="Entry No" sortKey="entryNo" sort={mpSort} onSort={handleMpSort} type="numeric" /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Vehicle Number" sortKey="vehicleNumber" sort={mpSort} onSort={handleMpSort} type="numeric" /></th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">From</th>
                  <th className="px-3 py-2.5">To</th>
                  <th className="px-3 py-2.5"><SortHeader label="Customer" sortKey="customer" sort={mpSort} onSort={handleMpSort} /></th>
                  <th className="px-3 py-2.5 text-right">Total Freight</th>
                  <th className="px-3 py-2.5 text-right">Received Advance</th>
                  <th className="px-3 py-2.5 text-right">Other Expenses</th>
                  <th className="px-3 py-2.5 text-right">Received</th>
                  <th className="px-3 py-2.5 text-right">Balance</th>
                  <th className="px-3 py-2.5">Payment Mode</th>
                  <th className="px-3 py-2.5 text-right">Extra Trip</th>
                  <th className="px-3 py-2.5">Co-Ordinator</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Remarks</th>
                  <th className="px-3 py-2.5">Driver</th>
                  {isSuperAdmin && <th className="px-3 py-2.5">Entered By</th>}
                  <th className="px-3 py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                {filteredMarketPod.length === 0 ? (
                  <tr>
                    <td colSpan={18 + (isSuperAdmin ? 1 : 0)} className="text-center py-16 text-slate-400 font-mono text-xs">
                      NO MARKET TRIP ENTRIES MATCH THE SELECTION.
                      <div className="text-[10px] text-slate-400 font-sans mt-1">Use "Add Trip Entry" above to log a new freight trip.</div>
                    </td>
                  </tr>
                ) : (
                  filteredMarketPod.map((entry) => {
                    // Balance Settlement can receive the outstanding Balance
                    // in more than one payment (see MarketPodEntry.balanceReceipts)
                    // - the Received column is the running total of those
                    // receipts, and Balance here always shows what's actually
                    // still pending (never below zero), not the static
                    // Freight-Advance-Expenses figure frozen at trip entry.
                    // Same math as the edit sidebar's Balance Settlement panel
                    // (mpBalanceReceivedTotal/mpBalancePending) so the two
                    // views can never disagree.
                    const receivedTotal = (entry.balanceReceipts || []).reduce((s, r) => s + (r.amount || 0), 0);
                    const pendingBalance = Math.max(0, (entry.balance || 0) - receivedTotal);
                    return (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors text-[11px]">
                      <td className="px-3 py-2 font-bold font-mono text-slate-900 whitespace-nowrap">{entry.entryNo}</td>
                      <td className="px-3 py-2 font-mono font-bold text-slate-800 whitespace-nowrap">{entry.vehicleNumber}</td>
                      <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{entry.date}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[100px] truncate" title={entry.from}>{entry.from || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[100px] truncate" title={entry.to}>{entry.to || '-'}</td>
                      <td className="px-3 py-2 text-slate-800 font-semibold whitespace-nowrap">{entry.customer || '-'}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">₹{(entry.totalFreight || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">₹{(entry.receivedAdvance || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">₹{(entry.otherExpenses || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-teal-700" title={receivedTotal > 0 ? `${entry.balanceReceipts?.length} receipt(s) recorded` : 'No balance receipts recorded yet'}>
                        {receivedTotal > 0 ? `₹${receivedTotal.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${pendingBalance <= 0 ? 'text-emerald-700 bg-emerald-50/30' : 'text-rose-600 bg-rose-50/30'}`} title={receivedTotal > 0 ? `Original balance ₹${(entry.balance || 0).toLocaleString('en-IN')} minus ₹${receivedTotal.toLocaleString('en-IN')} received` : undefined}>
                        ₹{pendingBalance.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                          (entry.paymentMode || 'Petty Cash') === 'Cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}>
                          {PAYMENT_MODE_LABELS[entry.paymentMode || 'Petty Cash']}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{entry.extraTripAmount ? `₹${entry.extraTripAmount.toLocaleString('en-IN')}` : '-'}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{entry.coordinator || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                          entry.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          entry.status === 'Closed' ? 'bg-slate-100 text-slate-600 border-slate-300' :
                          'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate" title={entry.remarks}>{entry.remarks || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {entry.driverId ? (
                          <span className="font-mono font-bold text-slate-700">
                            {entry.driverId}
                            {(() => {
                              const d = driverVehicleLookup.find(dr => dr.id === entry.driverId);
                              return d ? <span className="text-slate-400 font-sans font-normal"> ({d.name})</span> : null;
                            })()}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">No driver mapped</span>
                        )}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                          {entry.enteredBy || '-'}
                        </td>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleStartEditMarketPod(entry)}
                            className="text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                            title="Edit this entry"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete trip entry ${entry.entryNo}?`)) {
                                onDeleteMarketPodEntry(entry.id);
                                setDeleteConfirmation({ label: 'Market trip', identifier: `Entry no. ${entry.entryNo}`, key: Date.now() });
                              }
                            }}
                            className="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                            title="Delete this entry"
                          >
                            Delete
                          </button>
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
      )}

      {/* Share clipboard fallback modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-xl space-y-4 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase">Share Petty Cash Report</h3>
              <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-base cursor-pointer">×</button>
            </div>
            <p className="text-slate-600">Choose how you'd like to share this ledger summary:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { handleShareWhatsApp(); setShowShareModal(false); }}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 font-semibold cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" /> WhatsApp
              </button>
              <button
                onClick={() => { handleShareEmail(); setShowShareModal(false); }}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 font-semibold cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" /> Email
              </button>
            </div>
            <textarea
              readOnly
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="w-full h-40 bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-[10px] text-slate-700 focus:outline-none"
              value={buildShareSummaryText()}
            />
            <button
              onClick={() => { handleCopySummary(); setShowShareModal(false); }}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2 font-semibold cursor-pointer text-center"
            >
              Copy to Clipboard
            </button>
          </div>
        </div>
      )}

      {/* Drill-down modal for Consolidated Summary cell entries */}
      {selectedCellFilter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans text-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-pink-400" />
                  Consolidated Entries: {selectedCellFilter.category} ({MONTHS.find(m => m.value === selectedCellFilter.month)?.label} {summaryYear})
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-widest">
                  Source filter: {selectedCellFilter.vendor === 'all' ? 'All Vendors' : selectedCellFilter.vendor}
                </p>
              </div>
              <button 
                onClick={() => setSelectedCellFilter(null)} 
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Entry No</th>
                      <th className="px-4 py-2.5">Vendor</th>
                      <th className="px-4 py-2.5">Client & Vehicle</th>
                      <th className="px-4 py-2.5">Receiver</th>
                      <th className="px-4 py-2.5">Remarks / Particulars</th>
                      <th className="px-4 py-2.5 text-right">Cash Paid</th>
                      <th className="px-4 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {vouchers.filter(v => {
                      if (!v.date) return false;
                      const yr = getYearFromDate(v.date);
                      const mn = getMonthFromDate(v.date);
                      const matchesCat = v.category === selectedCellFilter.category;
                      const matchesYr = summaryYear === 'All' ? true : yr === summaryYear;
                      const matchesMn = mn === selectedCellFilter.month;
                      const matchesVendor = selectedCellFilter.vendor === 'all' || v.vendor === selectedCellFilter.vendor;
                      return matchesCat && matchesYr && matchesMn && matchesVendor;
                    }).length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-400 font-mono">
                          No contributing entries found for this cell.
                        </td>
                      </tr>
                    ) : (
                      vouchers.filter(v => {
                        if (!v.date) return false;
                        const yr = getYearFromDate(v.date);
                        const mn = getMonthFromDate(v.date);
                        const matchesCat = v.category === selectedCellFilter.category;
                        const matchesYr = summaryYear === 'All' ? true : yr === summaryYear;
                        const matchesMn = mn === selectedCellFilter.month;
                        const matchesVendor = selectedCellFilter.vendor === 'all' || v.vendor === selectedCellFilter.vendor;
                        return matchesCat && matchesYr && matchesMn && matchesVendor;
                      }).map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50 transition-colors text-[11px]">
                          <td className="px-4 py-2.5 font-mono whitespace-nowrap">{v.date}</td>
                          <td className="px-4 py-2.5 font-mono font-bold whitespace-nowrap">{v.entryNo || '-'}</td>
                          <td className="px-4 py-2.5 capitalize font-semibold whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              v.vendor === 'kcm insta' ? 'bg-pink-50 text-pink-700 border border-pink-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                            }`}>
                              {v.vendor}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="font-bold text-slate-800">{v.clientName}</div>
                            {v.vehicleNumber && <div className="text-[9px] text-slate-500 font-mono">{v.vehicleNumber}</div>}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{v.receiver}</td>
                          <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate" title={v.remarks}>{v.remarks || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-rose-700 bg-rose-50/20 whitespace-nowrap">₹{(v.cashPaid || 0).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenDocModal(v)}
                                className="px-2 py-1 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors font-bold text-[10px] cursor-pointer flex items-center gap-1"
                                title="Manage Attachments"
                              >
                                <Paperclip className="w-3 h-3" />
                                {v.documents && v.documents.length > 0 ? `Docs (${v.documents.length})` : 'Docs'}
                              </button>
                              {v.source === 'fuel-management' ? (
                                <span
                                  className="text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md font-bold text-[10px] cursor-not-allowed"
                                  title="This entry was generated from Fuel Management. To edit or remove it, update the linked Fuel Entry instead."
                                >
                                  Locked (Fuel Mgmt)
                                </span>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      handleStartEdit(v);
                                      setSelectedCellFilter(null);
                                    }}
                                    className="px-2 py-1 text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                                    title="Edit Entry"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (confirm(`Are you sure you want to delete entry ${v.entryNo}?`)) {
                                        try {
                                          await onDeleteVoucher(v.id!);
                                          setDeleteConfirmation({ label: 'Entry', identifier: `Entry no. ${v.entryNo}`, key: Date.now() });
                                        } catch (err) {
                                          console.error(err);
                                          triggerNotif('Failed to delete voucher.', 'error');
                                        }
                                      }
                                    }}
                                    className="px-2 py-1 text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                                    title="Delete Entry"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-100 p-3 flex justify-end">
              <button
                onClick={() => setSelectedCellFilter(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document management modal */}
      {selectedVoucherForDocs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full flex flex-col overflow-hidden text-xs">
            {/* Header */}
            <div className="bg-[#0f172a] text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-teal-400" />
                  Voucher Documents: {selectedVoucherForDocs.entryNo}
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
                  Category: {selectedVoucherForDocs.category} • Receiver: {selectedVoucherForDocs.receiver}
                </p>
              </div>
              <button 
                onClick={() => setSelectedVoucherForDocs(null)} 
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              <DocumentAttachment
                documents={selectedVoucherForDocs.documents || []}
                onChange={async (updatedDocs) => {
                  try {
                    await onUpdateVoucher(selectedVoucherForDocs.id, { documents: updatedDocs });
                    setSelectedVoucherForDocs({
                      ...selectedVoucherForDocs,
                      documents: updatedDocs
                    });
                    triggerNotif('📎 Documents updated successfully.', 'success');
                  } catch (err) {
                    console.error(err);
                    triggerNotif('Failed to update documents.', 'error');
                  }
                }}
                label="Attached Voucher Receipts & Invoices"
              />
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-100 p-3 flex justify-end">
              <button
                onClick={() => setSelectedVoucherForDocs(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Amount Received modal - opening/top-up entries for a Petty Cash
          user's Balance Net ledger. Regular users only ever log their own;
          Super Admin/Principal picks which of the 3 logins it's for. */}
      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans text-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-slate-900 to-amber-950 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-amber-400" /> Amount Received
              </h3>
              <button onClick={() => setShowAdvanceModal(false)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {isSuperAdmin && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Petty Cash User</label>
                  <select
                    value={balanceUserFilter}
                    onChange={(e) => setBalanceUserFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold text-slate-800"
                  >
                    {PETTY_CASH_USERS.map(u => <option key={u.username} value={u.username}>{u.label}</option>)}
                  </select>
                </div>
              )}

              <form onSubmit={handleAddAdvance} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Amount *</label>
                    <input
                      type="number" step="0.01" required min="0.01"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      placeholder="₹ Received"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Account *</label>
                    <select
                      value={advanceAccount}
                      onChange={(e) => setAdvanceAccount(e.target.value as 'kcm insta' | 'kcm supply')}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold text-slate-800 capitalize"
                    >
                      <option value="kcm insta">KCM Insta</option>
                      <option value="kcm supply">KCM Supply</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date *</label>
                  <DateInput required value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Remarks</label>
                  <input
                    type="text"
                    value={advanceRemarks}
                    onChange={(e) => setAdvanceRemarks(e.target.value)}
                    placeholder="e.g. Advance for August"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                  />
                </div>
                <button
                  type="submit"
                  disabled={advanceIsSubmitting}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer"
                >
                  {advanceIsSubmitting ? 'Saving...' : 'Log Amount Received'}
                </button>
              </form>

              {/* History for whichever user is selected above */}
              <div className="pt-3 border-t border-slate-100 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Amount Received History</span>
                {advancesFor(isSuperAdmin ? balanceUserFilter : user.username).length === 0 ? (
                  <p className="text-slate-400 text-[11px] py-2">No Amount Received entries logged yet.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {advancesFor(isSuperAdmin ? balanceUserFilter : user.username)
                      .slice().sort((a, b) => (a.date < b.date ? 1 : -1))
                      .map(a => (
                        <div key={a.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-slate-800">₹{a.amount.toLocaleString('en-IN')}</span>
                            <span className="text-slate-400 font-mono ml-1.5">{a.date}</span>
                            {a.account && (
                              <span className="ml-1.5 px-1 py-0.5 rounded text-[8px] font-black uppercase bg-slate-200 text-slate-600 border border-slate-300 align-middle">{a.account}</span>
                            )}
                            {a.source && (
                              <span className="ml-1.5 px-1 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-100 text-indigo-700 border border-indigo-200 align-middle">Auto</span>
                            )}
                            {a.remarks && <p className="text-slate-500 truncate">{a.remarks}</p>}
                          </div>
                          {a.source ? (
                            <span title="Auto-generated from a Market Trip - manage it there (Payment Mode) instead of deleting it directly, or it'll just reappear the next time that trip is saved" className="text-slate-300 shrink-0">
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onDeletePettyCashAdvance(a.id)}
                              title="Delete this entry"
                              className="text-rose-400 hover:text-rose-600 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-100 p-3 flex justify-end">
              <button
                onClick={() => setShowAdvanceModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Petty Cash Entry slide-out sidebar */}
      <AnimatePresence>
        {showSidebar && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end z-50">
            <div className="absolute inset-0" onClick={handleCancelEdit} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-teal-100"
            >
              <div className="p-4 bg-gradient-to-r from-slate-900 to-teal-950 text-white flex items-center justify-between">
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  {editingId ? <CheckCircle2 className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-teal-400" />}
                  {editingId ? 'Edit Petty Cash Entry' : 'Add Petty Cash Entry'}
                </h3>
                <button onClick={handleCancelEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 text-xs">
                <form id="petty-cash-entry-form" onSubmit={handleSubmit} className="space-y-3">
                  {/* Date Input with helper text */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Date *</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                        <Calendar className="w-3.5 h-3.5" />
                      </span>
                      <DateInput
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">Select year, month & day calendar</p>
                  </div>

                  {/* Entry Number - auto-generated, not editable (same
                      convention as Market POD's Entry No) - except Vinod/
                      Saneel's very first entry of a new month, which they
                      type themselves to continue their own physical
                      cash-book numbering (see canManualFirstEntryNo). */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Entry Number</label>
                    {canManualFirstEntryNo ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono font-bold text-slate-500 uppercase shrink-0">{pettyCashMonthlyPrefix().prefix}</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={manualEntryNoSeq}
                            onChange={(e) => setManualEntryNoSeq(e.target.value.replace(/\D/g, '').slice(0, 2))}
                            placeholder="01"
                            required
                            className="w-full bg-amber-50 border border-amber-300 rounded-lg p-2 font-mono font-bold tracking-wider text-amber-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <p className="text-[9px] text-amber-700 font-mono mt-0.5">This month's first entry - type its sequence number (e.g. 01). Every entry after this one auto-continues and locks again.</p>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          readOnly
                          disabled
                          value={editingId ? entryNo : nextPettyCashEntryNo()}
                          className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider text-slate-500 uppercase cursor-not-allowed"
                        />
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-generated, not editable</p>
                      </>
                    )}
                  </div>

                  {/* Searchable Expense Category Dropdown */}
                  <div className="relative" ref={categoryDropdownRef}>
                    <label className="block font-semibold text-slate-700 mb-1">Expense Category *</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="Type to search and select category..."
                        value={categoryInput}
                        onChange={(e) => {
                          setCategoryInput(e.target.value);
                          setShowCategoryDropdown(true);
                        }}
                        onFocus={() => setShowCategoryDropdown(true)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                      />
                      <span className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 pointer-events-none">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    {showCategoryDropdown && suggestedCategories.length > 0 && (
                      <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-50">
                        {suggestedCategories.map((cat, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setCategoryInput(cat);
                              setShowCategoryDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-teal-600 font-medium transition-colors text-xs flex items-center justify-between"
                          >
                            <span>{cat}</span>
                            {categoryInput === cat && <Check className="w-3 h-3 text-teal-600" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Vehicle Number & Receiver - placed above Location since
                      selecting a Vehicle Number can auto-fill Location (see
                      the auto-fill effect above: dedicated fleet vehicles /
                      TN-registered vehicles). */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Vehicle Number</label>
                      <input
                        type="text"
                        list="petty-cash-vehicles-datalist"
                        placeholder="Search or select a vehicle"
                        value={vehicleNumber}
                        onChange={(e) => handleVehicleNumberChange(e.target.value)}
                        onKeyDown={(e) => handleVehicleNumberEnterKey(e, vehicleNumber, mpVehicleList, handleVehicleNumberChange)}
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 uppercase font-bold"
                      />
                      <datalist id="petty-cash-vehicles-datalist">
                        {mpVehicleList.map(v => <option key={v} value={v} />)}
                      </datalist>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">Live from Fleet &amp; Vehicles - type to search.</p>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Receiver Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="Cash recipient"
                        value={receiver}
                        onChange={(e) => setReceiver(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-fetched from Driver Details by Vehicle Number - editable.</p>
                    </div>
                  </div>

                  {/* Location - a fixed dropdown/type-to-search of
                      Nelamangala / Nidagatta / DHL Attibele / Chennai for
                      Ramesh's login only; every other login keeps the
                      free-text field. May be auto-filled by Vehicle Number
                      above. */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Location *</label>
                    {user.username === 'ramesh' ? (
                      <>
                        <input
                          type="text"
                          required
                          list="petty-cash-ramesh-locations-datalist"
                          placeholder="Search or select a location"
                          value={location}
                          onChange={(e) => handleLocationChange(e.target.value)}
                          autoComplete="off"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                        <datalist id="petty-cash-ramesh-locations-datalist">
                          {RAMESH_LOCATIONS.map(loc => <option key={loc} value={loc} />)}
                        </datalist>
                      </>
                    ) : (
                      <input
                        type="text"
                        required
                        placeholder="Manual branch or location"
                        value={location}
                        onChange={(e) => handleLocationChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    )}
                  </div>

                  {/* Client Name (Swiggy, Reliance F&V, Market Load, KCM, Other) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Client Name *</label>
                      <select
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                      >
                        {CLIENT_NAMES.map((client, idx) => (
                          <option key={idx} value={client}>{client}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Vendor Entity *</label>
                      <select
                        value={vendor}
                        onChange={(e) => setVendor(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 font-bold uppercase text-[10px]"
                      >
                        <option value="kcm supply">KCM SUPPLY</option>
                        <option value="kcm insta">KCM INSTA</option>
                      </select>
                    </div>
                  </div>

                  {clientName === 'Other' && (
                    <div>
                      <label className="block font-semibold text-teal-700 mb-1">Specify Other Client Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="Enter custom client"
                        value={customClientName}
                        onChange={(e) => setCustomClientName(e.target.value)}
                        className="w-full bg-teal-50/50 border border-teal-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                      />
                    </div>
                  )}

                  {/* Vendor Vehicle Number - separate from Vehicle Number
                      above: this one is vendor-owned vehicles, sourced from
                      Vendor Management's registered vehicleNumbers rather
                      than Fleet & Vehicles. */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Vendor Vehicle Number</label>
                    <input
                      type="text"
                      list="petty-cash-vendor-vehicles-datalist"
                      placeholder="Search or select a vendor-owned vehicle"
                      value={vendorVehicleNumber}
                      onChange={(e) => setVendorVehicleNumber(e.target.value.toUpperCase())}
                      onKeyDown={(e) => handleVehicleNumberEnterKey(e, vendorVehicleNumber, vendorVehicleList, setVendorVehicleNumber)}
                      autoComplete="off"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 uppercase font-bold"
                    />
                    <datalist id="petty-cash-vendor-vehicles-datalist">
                      {vendorVehicleList.map(v => <option key={v} value={v} />)}
                    </datalist>
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">Live from Vendor Management&apos;s registered vehicles - type to search.</p>
                  </div>

                  {/* Vendor ID / Driver ID & Trip Sheet */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Vendor ID / Driver ID</label>
                      <input
                        type="text"
                        placeholder="Vendor Identification"
                        value={vendorId}
                        onChange={(e) => setVendorId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-fetched from Vendor Management or Driver Details by Vehicle Number - editable if neither matches.</p>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Trip Sheet #</label>
                      <input
                        type="text"
                        placeholder="e.g. TRIP-9121"
                        value={tripSheet}
                        onChange={(e) => setTripSheet(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  {/* Cash Paid (Amount Received/Balance were removed - that
                      information now only lives on the module dashboard).
                      No Transaction Type selector here anymore - Type is now
                      fully determined by Source (every Petty Cash entry is a
                      Debit, every Market Trip credit row is a Credit), not a
                      per-voucher choice. */}
                  <div className="pt-1.5 border-t border-slate-100">
                    <label className="block font-bold text-teal-700 mb-0.5 text-[9px] uppercase">Cash Paid (Exp)</label>
                    <input
                      type="number"
                      placeholder="₹ Paid"
                      value={cashPaid}
                      onChange={(e) => setCashPaid(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-mono font-bold text-teal-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Remarks & Descriptions</label>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Specify brief notes or details for ledger auditing..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-14 focus:outline-none text-slate-800"
                    />
                  </div>
                </form>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="petty-cash-entry-form"
                  disabled={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-teal-600 to-emerald-700 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : editingId ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Update Voucher
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      Commit Voucher Entry
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Market POD Trip Entry slide-out sidebar */}
      <AnimatePresence>
        {showMarketPodSidebar && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end z-50">
            <div className="absolute inset-0" onClick={resetMarketPodForm} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-teal-100"
            >
              <div className="p-4 bg-gradient-to-r from-slate-900 to-teal-950 text-white flex items-center justify-between">
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  {mpEditingId ? <CheckCircle2 className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-teal-400" />}
                  {mpEditingId ? 'Edit Market Trip' : 'Add Market Trip'}
                </h3>
                <button onClick={resetMarketPodForm} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 text-xs">
                <form id="market-pod-entry-form" onSubmit={handleMarketPodSubmit} className="space-y-3">
                  {/* Entry No - auto-generated, not editable */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Entry No</label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={mpEditingId ? marketPodEntries.find(e => e.id === mpEditingId)?.entryNo || '' : nextMarketPodEntryNo()}
                      className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider text-slate-500 cursor-not-allowed"
                    />
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-generated, not editable</p>
                  </div>

                  {/* Vehicle Number - autocomplete against Fleet & Vehicles,
                      but free-text entry is allowed for a number Fleet &
                      Vehicles doesn't have yet. It is NOT auto-registered
                      there on save - Fleet & Vehicles is the sole source of
                      truth for registered vehicles, only ever added to
                      directly in that module. */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-teal-600" /> Vehicle Number *
                    </label>
                    <input
                      type="text"
                      required
                      list="market-pod-vehicles-datalist"
                      placeholder="e.g. KA53AA0069"
                      value={mpVehicleNumber}
                      onChange={(e) => setMpVehicleNumber(e.target.value.toUpperCase())}
                      onKeyDown={(e) => handleVehicleNumberEnterKey(e, mpVehicleNumber, mpVehicleList, setMpVehicleNumber)}
                      autoComplete="off"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 uppercase focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <datalist id="market-pod-vehicles-datalist">
                      {mpVehicleList.map(v => <option key={v} value={v} />)}
                    </datalist>
                    {mpVehicleNumber.trim() && !vehicleByRegNo(mpVehicleNumber) && (
                      <p className="text-[9px] text-amber-600 font-semibold mt-1">Not in Fleet &amp; Vehicles yet - this entry will save, but add it there directly to have it show up as a registered vehicle elsewhere.</p>
                    )}
                  </div>

                  {/* Vendor / Driver ID - auto-fetched from Driver Details by
                      matching Vehicle Number, read-only to prevent mismatches;
                      only a super admin can override it. */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Vendor / Driver ID (auto)</span>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setMpDriverOverride(o => !o)}
                          className="text-[9px] font-bold text-teal-600 hover:text-teal-800 cursor-pointer flex items-center gap-1"
                          title={mpDriverOverride ? 'Lock back to auto-fetched value' : 'Override auto-fetched value'}
                        >
                          {mpDriverOverride ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {mpDriverOverride ? 'Overriding' : 'Override'}
                        </button>
                      )}
                    </label>
                    {!mpDriverOverride && matchingDrivers.length > 1 ? (
                      // This vehicle is assigned to more than one driver
                      // (e.g. shift-based) - pick which one, rather than
                      // silently guessing.
                      <select
                        value={mpDriverId}
                        onChange={(e) => setMpDriverId(e.target.value)}
                        className="w-full border border-amber-300 bg-amber-50 rounded-lg p-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      >
                        <option value="">Select driver...</option>
                        {matchingDrivers.map(d => <option key={d.id} value={d.id}>{d.id} - {d.name}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        readOnly={!mpDriverOverride}
                        disabled={!mpDriverOverride}
                        value={mpDriverId}
                        onChange={(e) => setMpDriverId(e.target.value)}
                        placeholder={matchedDriver ? undefined : 'No driver mapped'}
                        className={`w-full border rounded-lg p-2 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                          mpDriverOverride ? 'bg-white border-teal-300 text-slate-800' : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                        }`}
                      />
                    )}
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                      {matchingDrivers.length > 1
                        ? `${matchingDrivers.length} drivers are assigned to this vehicle - pick which one.`
                        : matchedDriver ? `Matched: ${matchedDriver.name}` : 'No driver mapped to this vehicle in Driver Details.'}
                    </p>
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Date *</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                        <Calendar className="w-3.5 h-3.5" />
                      </span>
                      <DateInput
                        required
                        value={mpDate}
                        onChange={(e) => setMpDate(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  {/* From / To */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">From</label>
                      <input
                        type="text"
                        placeholder="Origin location"
                        value={mpFrom}
                        onChange={(e) => setMpFrom(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">To</label>
                      <input
                        type="text"
                        placeholder="Destination location"
                        value={mpTo}
                        onChange={(e) => setMpTo(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  {/* Customer */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Customer</label>
                    <input
                      type="text"
                      placeholder="Customer / client name"
                      value={mpCustomer}
                      onChange={(e) => setMpCustomer(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  {/* Financials */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-100">
                    <div>
                      <label className="block font-bold text-slate-600 mb-0.5 text-[9px] uppercase">Total Freight</label>
                      <input
                        type="number"
                        placeholder="₹"
                        value={mpTotalFreight}
                        onChange={(e) => setMpTotalFreight(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-mono font-bold text-slate-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-teal-700 mb-0.5 text-[9px] uppercase">Received Advance</label>
                      <input
                        type="number"
                        placeholder="₹"
                        value={mpReceivedAdvance}
                        onChange={(e) => setMpReceivedAdvance(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-mono font-bold text-teal-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-rose-700 mb-0.5 text-[9px] uppercase">Other Expenses</label>
                      <input
                        type="number"
                        placeholder="₹"
                        value={mpOtherExpenses}
                        onChange={(e) => setMpOtherExpenses(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-mono font-bold text-rose-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  {/* Balance - auto computed. Never touched by Balance
                      Settlement below - that section only reads this figure,
                      it doesn't feed back into it. */}
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg flex items-center justify-between">
                    <span className="text-amber-600 uppercase text-[9px] font-bold">Balance (auto = Freight - Advance - Expenses)</span>
                    <span className="font-black text-amber-800 font-mono">₹{mpBalance.toLocaleString('en-IN')}</span>
                  </div>

                  {/* Balance Settlement - the outstanding Balance above is
                      settled (possibly in more than one partial receipt)
                      after the trip completes. Only actionable once the trip
                      itself has been saved (a real id is required by the
                      dedicated balance-receipt endpoint). */}
                  {mpEditingId && mpBalance > 0 && (
                    <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-lg space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-indigo-600 uppercase text-[9px] font-bold">Balance Settlement</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1 ${
                          mpSettlementStatus === 'Received' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' :
                          mpSettlementStatus === 'Partially Received' ? 'bg-amber-100 text-amber-700 border border-amber-300' :
                          'bg-slate-100 text-slate-500 border border-slate-300'
                        }`}>
                          {mpSettlementStatus === 'Received' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {mpSettlementStatus}
                        </span>
                      </div>

                      {mpSettlementMismatch && (
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[10px] font-semibold flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            Freight/Advance was edited after part of the balance was already recorded as received on{' '}
                            {editingMpEntry?.balanceSettledSnapshot && `₹${editingMpEntry.balanceSettledSnapshot.balance.toLocaleString('en-IN')}`}.
                            The settled amount was NOT recalculated - please reconcile manually.
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-white border border-indigo-100 rounded-lg p-1.5">
                          <p className="text-slate-400 uppercase text-[8px] font-bold">Received So Far</p>
                          <p className="font-black text-emerald-700 font-mono">₹{mpBalanceReceivedTotal.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-white border border-indigo-100 rounded-lg p-1.5">
                          <p className="text-slate-400 uppercase text-[8px] font-bold">Still Pending</p>
                          <p className="font-black text-amber-700 font-mono">₹{mpBalancePending.toLocaleString('en-IN')}</p>
                        </div>
                      </div>

                      {mpBalanceReceipts.length > 0 && (
                        <div className="space-y-1 pt-1.5 border-t border-indigo-100">
                          {mpBalanceReceipts.map(r => (
                            <div key={r.id} className="flex items-center justify-between text-[9.5px] font-mono text-indigo-700">
                              <span>{r.date}</span>
                              <span className="font-bold">₹{r.amount.toLocaleString('en-IN')}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {mpBalancePending > 0 && (
                        <div className="flex items-end gap-1.5 pt-1.5 border-t border-indigo-100">
                          <div className="flex-1">
                            <label className="block text-slate-400 mb-0.5 text-[9px] uppercase font-bold">Amount Received</label>
                            <input
                              type="number" placeholder="₹" value={mpBalanceReceiptAmount}
                              onChange={(e) => setMpBalanceReceiptAmount(e.target.value)}
                              className="w-full bg-white border border-indigo-200 rounded-lg p-1.5 font-mono font-bold text-indigo-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-slate-400 mb-0.5 text-[9px] uppercase font-bold">Date Received</label>
                            <DateInput value={mpBalanceReceiptDate} onChange={(e) => setMpBalanceReceiptDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full bg-white border border-indigo-200 rounded-lg p-1.5 font-mono text-indigo-800 text-[11px]" />
                          </div>
                          <button
                            type="button" onClick={handleRecordBalanceReceipt} disabled={mpBalanceReceiptSubmitting}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            {mpBalanceReceiptSubmitting ? '...' : 'Mark Received'}
                          </button>
                        </div>
                      )}

                      {mpPaymentMode !== 'Petty Cash' && (
                        <p className="text-[9px] text-slate-400 font-mono">
                          Payment Mode is Company Account - settlement is tracked here but won't affect the Petty Cash float.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Payment Mode - "Cash" stores/compares as 'Cash' exactly as
                      before (old records and reports keep working), only the
                      displayed label changed to "Company Account" (see
                      PAYMENT_MODE_LABELS). Extra Trip amount used to live here
                      too, routing into the Petty Cash Dashboard's Cash tab -
                      that tab no longer exists, so the field was removed from
                      this form; its stored value on existing entries is left
                      untouched (still round-trips on edit, just not shown or
                      editable here anymore). */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block font-semibold text-slate-700 mb-1">Payment Mode</label>
                    <select
                      value={mpPaymentMode}
                      onChange={(e) => setMpPaymentMode(e.target.value as MarketPodPaymentMode)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="Petty Cash">{PAYMENT_MODE_LABELS['Petty Cash']}</option>
                      <option value="Cash">{PAYMENT_MODE_LABELS['Cash']}</option>
                    </select>
                  </div>

                  {/* Co-Ordinator - manual text entry */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Co-Ordinator</label>
                    <input
                      type="text"
                      placeholder="Employee managing this trip"
                      value={mpCoordinator}
                      onChange={(e) => setMpCoordinator(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Status</label>
                    <select
                      value={mpStatus}
                      onChange={(e) => setMpStatus(e.target.value as MarketPodStatus)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 font-semibold"
                    >
                      {MARKET_POD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Remarks</label>
                    <textarea
                      value={mpRemarks}
                      onChange={(e) => setMpRemarks(e.target.value)}
                      placeholder="Additional notes or comments about the trip..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-14 focus:outline-none text-slate-800"
                    />
                  </div>
                </form>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button
                  type="button"
                  onClick={resetMarketPodForm}
                  className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="market-pod-entry-form"
                  disabled={mpIsSubmitting}
                  className="flex-1 bg-gradient-to-r from-teal-600 to-emerald-700 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {mpIsSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : mpEditingId ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Update Trip
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      Commit Trip Entry
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Big, centered save/delete confirmation (see ConfirmationModal.tsx),
          shared by every Petty Cash sub-module (Ledger vouchers, Market POD
          trips, Amount Received, Balance receipts) - keyed by .key so each
          fully remounts (fresh confetti/shake) on every save/delete. */}
      <SaveConfirmationModal
        key={saveConfirmation?.key}
        open={!!saveConfirmation}
        label={saveConfirmation?.label || 'Entry'}
        identifier={saveConfirmation?.identifier}
        onDone={() => setSaveConfirmation(null)}
      />
      <DeleteConfirmationModal
        key={deleteConfirmation?.key}
        open={!!deleteConfirmation}
        label={deleteConfirmation?.label || 'Entry'}
        identifier={deleteConfirmation?.identifier}
        onDone={() => setDeleteConfirmation(null)}
      />
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto font-sans text-slate-900 shadow-2xl flex flex-col">
        <div className="flex-1 w-full">
          {mainContent}
        </div>
      </div>
    );
  }

  return mainContent;
}
