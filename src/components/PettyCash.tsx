import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { PettyCashVoucher, VehicleDocument, Vehicle, MarketPodEntry, MarketPodStatus, MarketPodPaymentMode, User, DriverEmployee, Vendor, PettyCashAdvance } from '../types';
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
  Banknote
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';
import DateInput from './DateInput';
import SortHeader from './SortHeader';
import { SortState, SortDirection, extractLeadingNumber, extractTrailingNumber, compareText } from '../utils/sort';

interface PettyCashProps {
  user: User;
  vouchers: PettyCashVoucher[];
  onAddVoucher: (voucher: Omit<PettyCashVoucher, 'id'>) => Promise<void>;
  onUpdateVoucher: (id: string, voucher: Partial<PettyCashVoucher>) => Promise<void>;
  onDeleteVoucher: (id: string) => Promise<void>;
  vehicles: Vehicle[];
  onUpdateVehicle: (vehicle: Vehicle) => Promise<void>;
  drivers: DriverEmployee[];
  vendors: Vendor[];
  marketPodEntries: MarketPodEntry[];
  onAddMarketPodEntry: (entry: Omit<MarketPodEntry, 'id'>) => Promise<void>;
  onUpdateMarketPodEntry: (id: string, entry: Partial<MarketPodEntry>) => Promise<void>;
  onDeleteMarketPodEntry: (id: string) => Promise<void>;
  // Amount Received / Balance Net tracking was removed from the UI (see
  // handleSubmit et al below) but these stay in the prop contract so
  // Administration.tsx doesn't need to change what it passes down.
  pettyCashAdvances: PettyCashAdvance[];
  onAddPettyCashAdvance: (advance: Omit<PettyCashAdvance, 'id'>) => Promise<void>;
  onDeletePettyCashAdvance: (id: string) => Promise<void>;
}

const MARKET_POD_STATUSES: MarketPodStatus[] = ['Pending', 'Closed'];

// The 3 Petty Cash logins - mirrors PETTY_CASH_ACCESS_EMAILS in
// Administration.tsx/server.ts. Used to label/select whose ledger a Super
// Admin/Principal is viewing, since vouchers/advances arrive unfiltered (with
// `enteredBy`/`username` intact) for them but per-user-filtered for everyone
// else.
const PETTY_CASH_USERS: { username: string; label: string }[] = [
  { username: 'vinoda', label: 'Vinod' },
  { username: 'ramesh', label: 'Ramesh' },
  { username: 'saneel', label: 'Saneel' }
];

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
  "LOADING AND UNLOADING EXPENSE",
  "MISC EXPENSES",
  "NP SP FC TAX RENEWALS",
  "OFFICE MAINTENANCE",
  "OTHER EXPENSES",
  "PARKING EXPENSES",
  "POLICE EXPENSES",
  "POOJA EXPENSES",
  "PRINTING & STATIONERY",
  "STAFF WELFARE EXPENSES",
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
const VENDORS = ["kcm insta", "kcm supply"];

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

export default function PettyCash({
  user,
  vouchers,
  onAddVoucher,
  onUpdateVoucher,
  onDeleteVoucher,
  vehicles,
  onUpdateVehicle,
  drivers,
  vendors,
  marketPodEntries,
  onAddMarketPodEntry,
  onUpdateMarketPodEntry,
  onDeleteMarketPodEntry,
  pettyCashAdvances,
  onAddPettyCashAdvance,
  onDeletePettyCashAdvance
}: PettyCashProps) {
  const isSuperAdmin = user.department === 'super_admin';
  const [activeTab, setActiveTab] = useState<'ledger' | 'summary' | 'marketpod'>('ledger');
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

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
  const [selectedVendorFilter, setSelectedVendorFilter] = useState('All');
  // Defaults to Entry No ascending (by trailing digits, e.g. ENT-2026-2525)
  // rather than raw/insertion order, so the ledger's order stays consistent
  // and predictable on every page load/refresh instead of appearing to
  // shuffle - still fully overridable via the column sort dropdowns.
  const [sort, setSort] = useState<SortState | null>({ key: 'entryNo', direction: 'asc' });
  const handleSort = (key: string, direction: SortDirection) => setSort({ key, direction });

  // Date range filter for staff to access historical data
  const [filterYear, setFilterYear] = useState('2026');
  const [filterMonth, setFilterMonth] = useState('All'); // All, 01, 02... 12

  // Summary Report year state
  const [summaryYear, setSummaryYear] = useState('2026');

  // Form State
  const [date, setDate] = useState('2026-07-09');
  const [entryNo, setEntryNo] = useState('');
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
  const [mpSearchTerm, setMpSearchTerm] = useState('');
  // Same rationale as the Ledger's `sort` default above - Entry No ascending
  // by default so the table doesn't appear to reshuffle on every refresh.
  const [mpSort, setMpSort] = useState<SortState | null>({ key: 'entryNo', direction: 'asc' });
  const handleMpSort = (key: string, direction: SortDirection) => setMpSort({ key, direction });

  // --- Petty Cash Balance Net / Amount Received state ---
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [advanceRemarks, setAdvanceRemarks] = useState('');
  const [advanceIsSubmitting, setAdvanceIsSubmitting] = useState(false);
  // Which user's ledger the balance card/modal is scoped to - only meaningful
  // for a Super Admin/Principal (everyone else only ever sees their own rows,
  // so there's nothing to pick).
  const [balanceUserFilter, setBalanceUserFilter] = useState<string>(user.username);
  // Cash tab date filter - '' shows the all-time cumulative total; picking a
  // date narrows the breakdown to that day's Cash-mode Market POD entries.
  const [cashDateFilter, setCashDateFilter] = useState('');

  const mpBalance = (parseFloat(mpTotalFreight) || 0) - (parseFloat(mpReceivedAdvance) || 0) - (parseFloat(mpOtherExpenses) || 0);

  const mpVehicleList = Array.from(new Set(vehicles.map(v => v.regNo || v['Reg. No.'] || '').filter(Boolean))).sort();

  // Vendor Vehicle Number autofetch list - Vendor Management's registered
  // vehicles, not Fleet & Vehicles (separate source, for vendor-owned
  // vehicles vs. own fleet).
  const vendorVehicleList = Array.from(new Set(vendors.flatMap(v => v.vehicleNumbers || []).filter(Boolean))).sort();

  const vehicleByRegNo = (regNo: string): Vehicle | undefined =>
    vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo.trim().toUpperCase());

  // Auto-fetch Driver ID: matches Market POD's Vehicle Number against Driver
  // Details (DriverEmployee.vehicleNo), same source Fuel Entry/Mileage Report
  // read their own vehicle lists from. Read-only unless a super admin flips
  // the override toggle.
  const matchedDriver = mpVehicleNumber.trim()
    ? drivers.find(d => (d.vehicleNo || '').trim().toUpperCase() === mpVehicleNumber.trim().toUpperCase())
    : undefined;

  useEffect(() => {
    if (mpDriverOverride) return;
    setMpDriverId(matchedDriver ? matchedDriver.id : '');
  }, [matchedDriver, mpDriverOverride]);

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

  // Ledger Entry No is likewise auto-generated and never user-editable, e.g.
  // "ENT-2026-2525" - continues from that year's highest existing trailing
  // 4-digit sequence (never resets/skips within a year), same live-max-plus-
  // one convention as nextMarketPodEntryNo above.
  const nextPettyCashEntryNo = () => {
    const currentYear = new Date().getFullYear();
    const prefix = `ENT-${currentYear}-`;
    const maxNum = vouchers.reduce((max, v) => {
      if (!(v.entryNo || '').toUpperCase().startsWith(prefix)) return max;
      const match = (v.entryNo || '').match(/(\d+)$/);
      const n = match ? parseInt(match[1], 10) : 0;
      return n > max ? n : max;
    }, 0);
    return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
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
    // If the saved driverId doesn't match what auto-fetch would now produce,
    // treat it as a standing override so re-opening this entry doesn't
    // silently discard it.
    const autoMatch = drivers.find(d => (d.vehicleNo || '').trim().toUpperCase() === entry.vehicleNumber.trim().toUpperCase());
    setMpDriverOverride(!!entry.driverId && entry.driverId !== (autoMatch?.id || ''));
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
      const regNo = mpVehicleNumber.toUpperCase().trim();
      // Vehicle Number auto-register: if this vehicle isn't in Fleet &
      // Vehicles yet, register it now so it appears in every vehicle
      // dropdown/datalist across the portal from here on.
      if (!vehicleByRegNo(regNo)) {
        await onUpdateVehicle({ id: regNo, regNo, 'Reg. No.': regNo } as Vehicle);
      }
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
        triggerNotif('Market POD trip entry updated successfully!', 'success');
      } else {
        await onAddMarketPodEntry(payload);
        triggerNotif('Market POD trip entry logged successfully!', 'success');
      }
      resetMarketPodForm();
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to save Market POD entry.', 'error');
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
      const matchedDriverRecord = drivers.find(d => (d.vehicleNo || '').trim().toUpperCase() === regNo);
      return matchedDriverRecord ? matchedDriverRecord.id : undefined;
    };

    setVendorId(matchFor(vNo) || matchFor(vvNo) || '');
  }, [vehicleNumber, vendorVehicleNumber, vendors, drivers]);

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
  // (assumed Chennai), which in turn cascades into the Client Name auto-fill.
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

    setIsSubmitting(true);
    try {
      const finalClient = clientName === 'Other' ? customClientName || 'Other' : clientName;
      const voucherData = {
        date,
        entryNo: editingId ? entryNo : nextPettyCashEntryNo(),
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
        tripSheet: tripSheet.trim(),
        remarks: remarks.trim()
      };

      if (editingId) {
        await onUpdateVoucher(editingId, voucherData);
        setEditingId(null);
        triggerNotif('💸 Petty cash voucher successfully updated and synced with Cloud DB!', 'success');
      } else {
        await onAddVoucher(voucherData);
        triggerNotif('💸 Petty cash voucher successfully logged and synced with Cloud DB!', 'success');
      }

      resetVoucherForm();
      setShowSidebar(false);
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to write voucher to ledger.', 'error');
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

  // Cash tab (Market POD's Payment Mode = Cash auto-routing) - same
  // isSuperAdmin-scoping pattern as vouchersFor/advancesFor above, since
  // marketPodEntries is likewise already server-filtered per viewer.
  const marketPodEntriesFor = (username: string): MarketPodEntry[] =>
    isSuperAdmin ? marketPodEntries.filter(e => e.enteredBy === username) : marketPodEntries;
  const cashEntriesFor = (username: string): MarketPodEntry[] =>
    marketPodEntriesFor(username).filter(e => e.paymentMode === 'Cash');
  const cashFor = (username: string): number => cashEntriesFor(username).reduce((s, e) => s + (e.extraTripAmount || 0), 0);
  const cashOnDateFor = (username: string, date: string): number =>
    cashEntriesFor(username).filter(e => e.date === date).reduce((s, e) => s + (e.extraTripAmount || 0), 0);

  // Balance Net as of one specific voucher (for the table's "Balance Net"
  // column) - same formula, but only summing that user's cash paid up to and
  // including this entry, in chronological order.
  // Ordered by Entry No (the sequence entries were actually created in, see
  // nextPettyCashEntryNo) rather than the user-editable Date field - Date can
  // be backdated independently of when an entry was actually logged, which
  // made this column look like it was jumping around at random whenever the
  // ledger (now sorted by Entry No by default) didn't happen to match Date
  // order too. Entry No order always matches the ledger's default sort, so
  // Balance Net now reads as a clean, steadily-moving running total.
  const balanceNetAt = (voucher: PettyCashVoucher): number => {
    const owner = voucher.enteredBy || user.username;
    const totalAdvances = advancesFor(owner).reduce((s, a) => s + (a.amount || 0), 0);
    const ordered = [...vouchersFor(owner)].sort((a, b) => extractTrailingNumber(a.entryNo) - extractTrailingNumber(b.entryNo));
    let spent = 0;
    for (const v of ordered) {
      spent += v.cashPaid || 0;
      if (v.id === voucher.id) break;
    }
    return totalAdvances - spent;
  };

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
        remarks: advanceRemarks.trim()
      });
      setAdvanceAmount('');
      setAdvanceRemarks('');
      triggerNotif('Amount Received logged successfully!', 'success');
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to log Amount Received.', 'error');
    } finally {
      setAdvanceIsSubmitting(false);
    }
  };

  // Filter vouchers based on search, vendor, category, year and month
  const filteredVouchersUnsorted = vouchers.filter(v => {
    // Search Term matching (EntryNo, Category, Location, Receiver, VehicleNumber, ClientName)
    const matchesSearch =
      (v.entryNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.location || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.receiver || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.clientName || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesVendor = selectedVendorFilter === 'All' || v.vendor === selectedVendorFilter;
    const matchesCategory = selectedCategoryFilter === 'All' || v.category === selectedCategoryFilter;

    // Date filtering (Date structure is YYYY-MM-DD or DD-MM-YYYY)
    if (!v.date) return false;
    const year = getYearFromDate(v.date);
    const month = getMonthFromDate(v.date);
    const matchesYear = filterYear === 'All' || year === filterYear;
    const matchesMonth = filterMonth === 'All' || month === filterMonth;

    return matchesSearch && matchesVendor && matchesCategory && matchesYear && matchesMonth;
  });

  const filteredVouchers = sort
    ? [...filteredVouchersUnsorted].sort((a, b) => {
        const cmp = sort.key === 'entryNo'
          ? extractTrailingNumber(a.entryNo) - extractTrailingNumber(b.entryNo)
          : extractLeadingNumber(a.vehicleNumber) - extractLeadingNumber(b.vehicleNumber);
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredVouchersUnsorted;

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

  const handleDownload = () => {
    const { start, end } = getDownloadDateRange(downloadPeriod, downloadDate);
    const rangeFiltered = filteredVouchersUnsorted.filter(v => v.date >= start && v.date <= end);
    if (rangeFiltered.length === 0) {
      triggerNotif('No data available to download for the selected period.', 'info');
      return;
    }

    const data = rangeFiltered.map(v => ({
      'Date': v.date,
      'Entry No': v.entryNo,
      'Category': v.category,
      'Location': v.location,
      'Client Name': v.clientName,
      'Vendor': v.vendor,
      'Vehicle Number': v.vehicleNumber,
      'Receiver': v.receiver,
      'Vendor ID': v.vendorId,
      'Amount Received': receivedFor(v.enteredBy || user.username), // that holder's current Total Received Float, not a stored per-entry figure
      'Cash Paid': v.cashPaid,
      'Balance': v.balance,
      'Trip Sheet': v.tripSheet,
      'Remarks': v.remarks
    }));

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
              Market POD
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
        const totalCash = dashboardSummaryUsers.reduce((s, u) => s + cashFor(u.username), 0);
        const totalCashOnDate = cashDateFilter ? dashboardSummaryUsers.reduce((s, u) => s + cashOnDateFor(u.username, cashDateFilter), 0) : null;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1"><Wallet className="w-3 h-3" /> Total Received Float</span>
              <div className="text-sm font-black text-slate-800 font-mono mt-0.5">₹{totalReceived.toLocaleString('en-IN')}</div>
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

            {/* Cash - Market POD entries with Payment Mode = Cash, tagged by
                that entry's date. Shows the all-time cumulative total plus a
                date filter to drill into any specific day. */}
            <div className="bg-teal-50/30 p-3 rounded-xl border border-teal-100">
              <span className="text-[10px] text-teal-600 font-bold uppercase flex items-center gap-1"><Banknote className="w-3 h-3" /> Cash</span>
              <div className="text-sm font-black text-teal-700 font-mono mt-0.5">₹{totalCash.toLocaleString('en-IN')}</div>
              <p className="text-[9px] text-teal-500/80 font-mono mt-0.5">All-time, from Market POD</p>
              <div className="mt-2 pt-2 border-t border-teal-100 space-y-1.5">
                <div className="flex items-center gap-1">
                  <DateInput value={cashDateFilter} onChange={(e) => setCashDateFilter(e.target.value)} className="flex-1 min-w-0 bg-white border border-teal-200 rounded px-1.5 py-1 text-[10px] font-mono text-teal-800" />
                  {cashDateFilter && (
                    <button type="button" onClick={() => setCashDateFilter('')} title="Clear date filter" className="text-teal-400 hover:text-rose-500 cursor-pointer shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {cashDateFilter && (
                  <div className="text-[10px] font-mono text-teal-700 font-bold flex items-center justify-between">
                    <span className="font-sans font-semibold">On {cashDateFilter}</span>
                    <span>₹{(totalCashOnDate || 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {isSuperAdmin && (
                  <div className="pt-1.5 border-t border-teal-100 space-y-0.5">
                    {dashboardSummaryUsers.map(u => (
                      <div key={u.username} className="flex items-center justify-between text-[10px] font-mono text-teal-600">
                        <span className="font-sans font-semibold">{u.label}</span>
                        <span>₹{(cashDateFilter ? cashOnDateFor(u.username, cashDateFilter) : cashFor(u.username)).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
                <span>Matches: {filteredVouchers.length} entries</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
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

                {/* Vendor Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Vendor filter</label>
                  <select
                    value={selectedVendorFilter}
                    onChange={(e) => setSelectedVendorFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold uppercase text-[9px] text-slate-700"
                  >
                    <option value="All">All Vendors</option>
                    {VENDORS.map((v, idx) => (
                      <option key={idx} value={v}>{v}</option>
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
                    <th className="px-3 py-2.5 text-right">Amt Rec</th>
                    <th className="px-3 py-2.5 text-right">Cash Paid</th>
                    <th className="px-3 py-2.5 text-right">Balance Net</th>
                    <th className="px-3 py-2.5">Trip Sheet</th>
                    <th className="px-3 py-2.5">Remarks</th>
                    {isSuperAdmin && <th className="px-3 py-2.5">Entered By</th>}
                    <th className="px-3 py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                  {filteredVouchers.length === 0 ? (
                    <tr>
                      <td colSpan={16 + (isSuperAdmin ? 1 : 0)} className="text-center py-16 text-slate-400 font-mono text-xs">
                        NO RECORDED PETTY CASH VOUCHERS MATCH THE SELECTION.
                        <div className="text-[10px] text-slate-400 font-sans mt-1">Use "Add Petty Cash Entry" above to authorize new cash disbursements.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredVouchers.map((v) => (
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
                        <td className="px-3 py-2 text-right font-mono text-slate-600" title="This holder's current Total Received Float (from the Dashboard's Amount Received ledger), not a per-entry figure">
                          ₹{receivedFor(v.enteredBy || user.username).toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-red-700 bg-red-50/20">₹{(v.cashPaid || 0).toLocaleString('en-IN')}</td>
                        {(() => {
                          const net = balanceNetAt(v);
                          return (
                            <td className={`px-3 py-2 text-right font-mono font-black ${net < 0 ? 'text-rose-600 bg-rose-50/30' : 'text-emerald-700 bg-emerald-50/30'}`} title="This holder's running balance in Entry No order: Total Received Float minus cash paid up to and including this entry">
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
                                  triggerNotif(`Deleted entry ${v.entryNo} successfully!`, 'success');
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
                    ))
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
        </div>
      ) : (
        /* Section 3 Market POD: freight trip ledger */
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 flex flex-col space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
            <div className="font-semibold text-slate-800 flex items-center gap-1">
              <Truck className="w-4 h-4 text-emerald-600" />
              Market POD Trip Ledger:
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
            <div className="relative">
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
                    <td colSpan={17 + (isSuperAdmin ? 1 : 0)} className="text-center py-16 text-slate-400 font-mono text-xs">
                      NO MARKET POD TRIP ENTRIES MATCH THE SELECTION.
                      <div className="text-[10px] text-slate-400 font-sans mt-1">Use "Add Trip Entry" above to log a new freight trip.</div>
                    </td>
                  </tr>
                ) : (
                  filteredMarketPod.map((entry) => (
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
                      <td className={`px-3 py-2 text-right font-mono font-bold ${entry.balance < 0 ? 'text-rose-600 bg-rose-50/30' : 'text-emerald-700 bg-emerald-50/30'}`}>
                        ₹{(entry.balance || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                          (entry.paymentMode || 'Petty Cash') === 'Cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}>
                          {entry.paymentMode || 'Petty Cash'}
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
                              const d = drivers.find(dr => dr.id === entry.driverId);
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
                                triggerNotif(`Deleted trip entry ${entry.entryNo} successfully!`, 'success');
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
                  ))
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
                                      triggerNotif(`Deleted entry ${v.entryNo} successfully!`, 'success');
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
                    <label className="block font-semibold text-slate-700 mb-1">Date *</label>
                    <DateInput required value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
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
                            {a.remarks && <p className="text-slate-500 truncate">{a.remarks}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => onDeletePettyCashAdvance(a.id)}
                            title="Delete this entry"
                            className="text-rose-400 hover:text-rose-600 cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">Select year, month & day calendar</p>
                  </div>

                  {/* Entry Number - auto-generated, not editable (same
                      convention as Market POD's Entry No) */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Entry Number</label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={editingId ? entryNo : nextPettyCashEntryNo()}
                      className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider text-slate-500 uppercase cursor-not-allowed"
                    />
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">Auto-generated, not editable</p>
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
                      information now only lives on the module dashboard) */}
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
                  {mpEditingId ? 'Edit Market POD Trip' : 'Add Market POD Trip'}
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
                      but free-text entry is allowed; an unmatched number gets
                      auto-registered into Fleet & Vehicles on save (see
                      handleMarketPodSubmit) so it's available everywhere
                      afterward. */}
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
                      autoComplete="off"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 uppercase focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <datalist id="market-pod-vehicles-datalist">
                      {mpVehicleList.map(v => <option key={v} value={v} />)}
                    </datalist>
                    {mpVehicleNumber.trim() && !vehicleByRegNo(mpVehicleNumber) && (
                      <p className="text-[9px] text-amber-600 font-semibold mt-1">Not in Fleet &amp; Vehicles yet - saving will auto-register it.</p>
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
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                      {matchedDriver ? `Matched: ${matchedDriver.name}` : 'No driver mapped to this vehicle in Driver Details.'}
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

                  {/* Balance - auto computed */}
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg flex items-center justify-between">
                    <span className="text-amber-600 uppercase text-[9px] font-bold">Balance (auto = Freight - Advance - Expenses)</span>
                    <span className="font-black text-amber-800 font-mono">₹{mpBalance.toLocaleString('en-IN')}</span>
                  </div>

                  {/* Payment Mode + Extra Trip - Cash auto-routes the Extra
                      Trip amount into the Petty Cash Dashboard's Cash tab,
                      tagged with this entry's date; Petty Cash needs no
                      extra routing (accounted normally). */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Payment Mode</label>
                      <select
                        value={mpPaymentMode}
                        onChange={(e) => setMpPaymentMode(e.target.value as MarketPodPaymentMode)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500"
                      >
                        <option value="Petty Cash">Petty Cash</option>
                        <option value="Cash">Cash</option>
                      </select>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        {mpPaymentMode === 'Cash'
                          ? 'Extra Trip amount below flows into the Petty Cash Dashboard\'s Cash tab, dated to this entry.'
                          : 'Accounted as petty cash normally - no extra routing.'}
                      </p>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-0.5 text-[9px] uppercase">Extra Trip</label>
                      <input
                        type="number"
                        placeholder="₹"
                        value={mpExtraTripAmount}
                        onChange={(e) => setMpExtraTripAmount(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-mono font-bold text-slate-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
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
