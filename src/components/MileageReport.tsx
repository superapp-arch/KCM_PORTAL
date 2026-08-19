import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { MileageReport, Vehicle, User, VehicleMileage, StaffEmployee } from '../types';
import {
  Gauge,
  Plus,
  Search,
  Filter,
  FileSpreadsheet,
  Download,
  X,
  Calendar,
  Car,
  MapPin,
  FileText,
  DollarSign,
  User as UserIcon,
  HelpCircle,
  Clock,
  CheckCircle,
  ArrowRightLeft,
  Trash2,
  Edit2
} from 'lucide-react';
import DateInput from './DateInput';
import SortHeader from './SortHeader';
import { SortState, SortDirection, compareText, compareNumber, extractLeadingNumber } from '../utils/sort';
import { handleVehicleNumberEnterKey } from '../utils/vehicleNumberSearch';

// Extra Fuel accepts a sum-of-numbers expression typed directly into the
// field (e.g. "30+40" for two separate top-ups during one trip - say
// Bangalore->Mysore, one top-up mid-route and another near the destination)
// instead of requiring the office to add them up by hand first; a single
// plain number still works exactly as before. Mirrors FuelManagement.tsx's
// own sumExtraFuelExpression.
const sumExtraFuelExpression = (raw: string): number =>
  raw.split('+').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)).reduce((sum, n) => sum + n, 0);

// Resolves the [start, end] date-string window (inclusive) for a "Day /
// Monthly Till Date / Year Till Date" period relative to a reference date -
// drives the ledger's view-scope tabs below. Mirrors FuelManagement.tsx's
// own getPeriodDateRange (same math, kept local since neither module shares
// a common home for it).
const getPeriodDateRange = (period: 'day' | 'month' | 'year', refDate: string): { start: string; end: string } => {
  if (period === 'day') return { start: refDate, end: refDate };
  if (period === 'month') return { start: `${refDate.slice(0, 7)}-01`, end: refDate };
  return { start: `${refDate.slice(0, 4)}-01-01`, end: refDate };
};

interface MileageReportModuleProps {
  user: User;
  reports: MileageReport[];
  vehicles: Vehicle[];
  onAddReport: (report: Omit<MileageReport, 'id'>) => Promise<string | undefined>;
  onUpdateReport: (id: string, report: Partial<MileageReport>) => Promise<void>;
  onDeleteReport: (id: string) => Promise<void>;
  vehicleMileages?: VehicleMileage[];
  onAddVehicleMileage?: (entry: Omit<VehicleMileage, 'id'>) => Promise<void>;
  onUpdateVehicleMileage?: (id: string, entry: Partial<VehicleMileage>) => Promise<void>;
  onDeleteVehicleMileage?: (id: string) => Promise<void>;
  readOnly?: boolean;
  // Used only to word the fuel-audit note when Authorized Driver contains a
  // single name that exactly matches exactly one employee - informational
  // only, no payroll record is created (that's a future Driver Salary module).
  employees?: StaffEmployee[];
}

export default function MileageReportModule({
  user,
  reports = [],
  vehicles = [],
  onAddReport,
  onUpdateReport,
  onDeleteReport,
  vehicleMileages = [],
  onAddVehicleMileage,
  onUpdateVehicleMileage,
  onDeleteVehicleMileage,
  readOnly = false,
  employees = []
}: MileageReportModuleProps) {
  // UI Panels
  const [showSidebar, setShowSidebar] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Filter conditions
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('All');
  // Ledger view scope - All (default, today's existing behavior) / Day /
  // Month Till Date / Year Till Date. See getPeriodDateRange above.
  const [viewPeriod, setViewPeriod] = useState<'all' | 'day' | 'month' | 'year'>('all');
  const [viewDate, setViewDate] = useState(new Date().toISOString().slice(0, 10));
  // Searchable Vehicle Number filter for Export Excel (and the on-screen
  // ledger, since both read from the same filteredReports) - '' = All
  // Vehicles. Sourced from vehicleList below, which is itself built off the
  // live `vehicles` prop (Fleet & Vehicles), so it's never a separate list
  // to keep in sync.
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // Defaults to oldest-first by Date (Mileage Report-specific - unlike the
  // Petty Cash Ledger/Market POD tables, which default newest-first) - still
  // fully overridable via the column sort headers or the dropdown, and
  // resets to this default every time the module is opened fresh (plain
  // component state, not persisted).
  const [sort, setSort] = useState<SortState | null>({ key: 'date', direction: 'asc' });
  const handleSort = (key: string, direction: SortDirection) => setSort({ key, direction });

  // Form inputs
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vehicleNo, setVehicleNo] = useState('');
  const [openingKm, setOpeningKm] = useState('');
  const [closingKm, setClosingKm] = useState('');
  const [totalKm, setTotalKm] = useState('');
  const [ratePerLitre, setRatePerLitre] = useState('');
  const [litres, setLitres] = useState('');
  const [totalLitres, setTotalLitres] = useState(''); // Litres + Extra Fuel - see sumExtraFuelExpression
  const [dieselAmount, setDieselAmount] = useState('');
  const [mileage, setMileage] = useState('');
  const [driverName, setDriverName] = useState('');
  const [location, setLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [actualMileage, setActualMileage] = useState('');
  const [extraFuel, setExtraFuel] = useState('');
  const [ratePerLitreNew, setRatePerLitreNew] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [costPerKm, setCostPerKm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Vehicle Mileage Master mini-management (fixed KM/L per vehicle)
  const [showMileageManager, setShowMileageManager] = useState(false);
  const [mileageFormVehicleNo, setMileageFormVehicleNo] = useState('');
  const [mileageFormValue, setMileageFormValue] = useState('');

  // The selected vehicle's fixed Actual Mileage reference, looked up from the
  // Vehicle Mileage Master (same value editable from Fleet & Vehicles).
  const fixedMileageForVehicle = vehicleMileages.find(
    v => (v.vehicleNo || '').trim().toUpperCase() === vehicleNo.trim().toUpperCase()
  )?.mileage;

  // Unique list of vehicle numbers from existing reports and fleet
  const vehicleList = Array.from(
    new Set([
      ...vehicles.map(v => v.regNo || v["Reg. No."] || '').filter(Boolean),
      ...reports.map(r => r.vehicleNo).filter(Boolean)
    ])
  ).sort();

  // Unique list of locations from existing reports and warehouse entries
  const locationList = Array.from(
    new Set(reports.map(r => r.location).filter(Boolean))
  ).sort();

  // Notification helper
  const triggerNotif = (msg: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotif({ message: msg, type });
    setTimeout(() => setNotif(null), 4000);
  };

  const isSuperAdmin = user.department === 'super_admin';

  // Auto Calculations
  // 1. Fetch Previous Entry Closing KM for selected vehicle
  useEffect(() => {
    if (!vehicleNo) return;

    // Find all reports for this vehicle, sort chronologically
    const vehicleReports = reports
      .filter(r => (r.vehicleNo || '').trim().toUpperCase() === vehicleNo.trim().toUpperCase())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (vehicleReports.length > 0) {
      const lastReport = vehicleReports[vehicleReports.length - 1];
      // Only auto-fill if not currently editing (or editing a different entry)
      if (!editingId || (editingId && reports.find(r => r.id === editingId)?.vehicleNo !== vehicleNo)) {
        setOpeningKm(String(lastReport.closingKm));
      }
    } else {
      // No previous entry, let the user enter opening KM manually
      if (!editingId) {
        setOpeningKm('');
      }
    }
  }, [vehicleNo, reports, editingId]);

  // 2. Actual Mileage = the vehicle's FIXED reference rating from the Vehicle
  // Mileage Master / Fleet & Vehicles (same shared value) - a per-vehicle
  // constant, not computed per trip.
  useEffect(() => {
    setActualMileage(fixedMileageForVehicle != null ? String(fixedMileageForVehicle) : '0');
  }, [fixedMileageForVehicle]);

  // 3. Distance Covered (Total KM) = Closing KM - Opening KM (real odometer).
  useEffect(() => {
    const o = parseFloat(openingKm) || 0;
    const c = parseFloat(closingKm) || 0;
    if (c >= o) {
      setTotalKm(String(c - o));
    } else {
      setTotalKm('0');
    }
  }, [openingKm, closingKm]);

  // 4. Calculate Diesel Amount = Rate per Litre * Litres
  useEffect(() => {
    const rate = parseFloat(ratePerLitre) || 0;
    const l = parseFloat(litres) || 0;
    setDieselAmount(String(parseFloat((rate * l).toFixed(2))));
  }, [ratePerLitre, litres]);

  // 5. Total Litres = Litres + Extra Fuel - the actual total fuel consumed
  // this trip, including any mid-trip top-up(s). Extra Fuel accepts a sum
  // expression like "30+40" - see sumExtraFuelExpression.
  useEffect(() => {
    const l = parseFloat(litres) || 0;
    const extra = sumExtraFuelExpression(extraFuel);
    setTotalLitres(String(parseFloat((l + extra).toFixed(2))));
  }, [litres, extraFuel]);

  // 6. Mileage = the REAL, achieved-this-trip efficiency = Total KM / Total
  // Litres - NOT the bare Litres field, since fuel topped up mid-trip is
  // fuel that trip actually used - compared against the fixed Actual
  // Mileage above to catch fuel theft, misuse, or meter tampering (see
  // Difference below).
  useEffect(() => {
    const tKm = parseFloat(totalKm) || 0;
    const tL = parseFloat(totalLitres) || 0;
    setMileage(tL > 0 ? String(parseFloat((tKm / tL).toFixed(2))) : '0');
  }, [totalKm, totalLitres]);

  // 6. Cost per KM = Rate per Litre / Mileage (this trip's real efficiency)
  useEffect(() => {
    const rate = parseFloat(ratePerLitre) || 0;
    const m = parseFloat(mileage) || 0;
    setCostPerKm(m > 0 ? String(parseFloat((rate / m).toFixed(2))) : '0');
  }, [ratePerLitre, mileage]);

  // 7. Same-day Rate per Litre carry-forward: once any vehicle's entry sets a
  // rate for a given date, subsequent entries that same date default to it.
  // A new date requires fresh manual entry (then repeats for that new date).
  useEffect(() => {
    if (!date || editingId) return;
    const sameDayReports = reports.filter(r => r.date === date);
    if (sameDayReports.length > 0) {
      setRatePerLitre(String(sameDayReports[sameDayReports.length - 1].ratePerLitre));
    }
  }, [date, reports, editingId]);

  // 8. Total Amount = Diesel Amount + (Extra Fuel * Rate per Ltr (new))
  useEffect(() => {
    const diesel = parseFloat(dieselAmount) || 0;
    const extra = sumExtraFuelExpression(extraFuel);
    const rateNew = parseFloat(ratePerLitreNew) || 0;
    setTotalAmount(String(parseFloat((diesel + extra * rateNew).toFixed(2))));
  }, [dieselAmount, extraFuel, ratePerLitreNew]);

  // The fuel-audit note is appended to Remarks in a recognizable, strippable
  // format so re-submitting/editing an entry replaces it instead of piling up
  // duplicate notes each time.
  const AUDIT_NOTE_PATTERN = /\s*\(Fuel Audit:[^)]*\)\s*$/;
  const stripPreviousAuditNote = (text: string) => text.replace(AUDIT_NOTE_PATTERN, '').trim();

  // Resolves "the driver" wording for the audit note: only names a specific
  // employee when Authorized Driver contains exactly one name that exactly
  // matches exactly one Staff Employee - otherwise stays generic. No employee
  // record is looked up or modified; this is wording only.
  const resolveDriverWord = (driverNameValue: string): string => {
    const names = driverNameValue.split('/').map(n => n.trim()).filter(Boolean);
    if (names.length !== 1) return 'the driver';
    const matches = employees.filter(e => (e.name || '').trim().toLowerCase() === names[0].toLowerCase());
    return matches.length === 1 ? matches[0].name : 'the driver';
  };

  // Computes the Difference in LITRES: how much fuel was wasted or saved this
  // trip, comparing what the vehicle's fixed Actual Mileage reference says it
  // should have needed against what was actually filled. Negative (red, -) =
  // wasted (wcaught fuel theft/misuse/meter tampering); positive (green, +) =
  // saved (this is what catches fuel theft/misuse/meter tampering). Example:
  // Total KM 111, Actual Mileage 10.14 KM/L -> Expected Litres 10.95; 20
  // Litres filled -> Difference = 10.95 - 20 = -9.05 (wasted).
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

  // Handle Create / Update Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !vehicleNo || !openingKm || !closingKm || !ratePerLitre || !litres || !driverName || !location) {
      triggerNotif('Please complete all required fields (*)', 'error');
      return;
    }

    const o = parseFloat(openingKm);
    const c = parseFloat(closingKm);
    if (c < o) {
      triggerNotif('Closing KM cannot be less than Opening KM', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const rate = parseFloat(ratePerLitre);
      const l = parseFloat(litres);
      const calculatedDieselAmount = parseFloat((rate * l).toFixed(2));
      const calculatedTotalKm = c - o;
      // Total Litres (Litres + Extra Fuel, e.g. "30+40" for two top-ups
      // during one trip) is what actually got consumed, not just the main
      // fill-up - Mileage/Cost-per-KM/the fuel-theft audit all key off it.
      const extra = sumExtraFuelExpression(extraFuel);
      const calculatedTotalLitres = parseFloat((l + extra).toFixed(2));
      const calculatedMileage = calculatedTotalLitres > 0 ? parseFloat((calculatedTotalKm / calculatedTotalLitres).toFixed(2)) : 0;
      const calculatedCostPerKm = calculatedMileage > 0 ? parseFloat((rate / calculatedMileage).toFixed(2)) : 0;
      // Snapshot the vehicle's current fixed Actual Mileage reference at entry
      // time, so later edits to the Vehicle Mileage Master don't retroactively
      // change historical entries.
      const calculatedActualMileage = fixedMileageForVehicle || 0;
      const { difference, note } = computeFuelAudit(calculatedTotalKm, calculatedTotalLitres, rate, calculatedActualMileage, driverName);
      const baseRemarks = stripPreviousAuditNote(remarks);
      const finalRemarks = note ? `${baseRemarks}${baseRemarks ? ' ' : ''}(Fuel Audit: ${note})` : baseRemarks;
      const rateNew = parseFloat(ratePerLitreNew) || 0;
      const calculatedTotalAmount = parseFloat((calculatedDieselAmount + extra * rateNew).toFixed(2));

      // Determine next Sl No if adding new
      const nextSlNo = reports.length > 0 ? Math.max(...reports.map(r => r.slNo || 0)) + 1 : 1;

      const payload = {
        slNo: editingId ? reports.find(r => r.id === editingId)?.slNo || nextSlNo : nextSlNo,
        date,
        vehicleNo: vehicleNo.trim().toUpperCase(),
        openingKm: o,
        closingKm: c,
        totalKm: calculatedTotalKm,
        ratePerLitre: rate,
        litres: l,
        totalLitres: calculatedTotalLitres,
        dieselAmount: calculatedDieselAmount,
        mileage: calculatedMileage,
        costPerKm: calculatedCostPerKm,
        driverName: driverName.trim(),
        location: location.trim(),
        remarks: finalRemarks,
        actualMileage: calculatedActualMileage,
        difference,
        fuelAuditNote: note,
        extraFuel: extra,
        ratePerLitreNew: rateNew,
        totalAmount: calculatedTotalAmount
      };

      if (editingId) {
        await onUpdateReport(editingId, payload);
        triggerNotif('Mileage report successfully updated!', 'success');
      } else {
        await onAddReport(payload);
        triggerNotif('Mileage report successfully created!', 'success');
      }

      resetForm();
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to write mileage report.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (report: MileageReport) => {
    setEditingId(report.id);
    setDate(report.date);
    setVehicleNo(report.vehicleNo);
    setOpeningKm(report.openingKm != null ? String(report.openingKm) : '');
    setClosingKm(report.closingKm != null ? String(report.closingKm) : '');
    setRatePerLitre(String(report.ratePerLitre));
    setLitres(String(report.litres));
    setDriverName(report.driverName);
    setLocation(report.location);
    setRemarks(stripPreviousAuditNote(report.remarks || ''));
    setExtraFuel(String(report.extraFuel || ''));
    setRatePerLitreNew(String(report.ratePerLitreNew || ''));
    setShowSidebar(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setDate(new Date().toISOString().split('T')[0]);
    setVehicleNo('');
    setOpeningKm('');
    setClosingKm('');
    setTotalKm('');
    setRatePerLitre('');
    setLitres('');
    setDieselAmount('');
    setMileage('');
    setDriverName('');
    setLocation('');
    setRemarks('');
    setActualMileage('');
    setExtraFuel('');
    setRatePerLitreNew('');
    setTotalAmount('');
    setCostPerKm('');
    setShowSidebar(false);
  };

  const handleAddVehicleMileage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mileageFormVehicleNo.trim() || !mileageFormValue.trim() || !onAddVehicleMileage) return;
    try {
      const vNo = mileageFormVehicleNo.trim().toUpperCase();
      const mileageValue = parseFloat(mileageFormValue);
      // Find-existing-or-create: this is the SAME underlying value the
      // Actual Mileage field in Fleet & Vehicles edits, so re-saving here
      // updates that row in place instead of creating a duplicate.
      const existing = vehicleMileages.find(v => (v.vehicleNo || '').trim().toUpperCase() === vNo);
      if (existing && onUpdateVehicleMileage) {
        await onUpdateVehicleMileage(existing.id, { mileage: mileageValue });
      } else {
        await onAddVehicleMileage({ vehicleNo: vNo, mileage: mileageValue });
      }
      setMileageFormVehicleNo('');
      setMileageFormValue('');
      triggerNotif('Vehicle mileage rating saved.', 'success');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save vehicle mileage rating.', 'error');
    }
  };

  // Excel Export Routine
  const handleCSVExport = () => {
    if (filteredReports.length === 0) {
      triggerNotif('No data available to export.', 'info');
      return;
    }

    const data = filteredReports.map((r, i) => ({
      'Sl. No': i + 1,
      'Date': r.date,
      'Vehicle No': r.vehicleNo,
      'Opening KM': r.openingKm ?? '',
      'Closing KM': r.closingKm ?? '',
      'Total KM': r.totalKm,
      'Rate Per Litre': r.ratePerLitre,
      'Litres': r.litres,
      'Total Litres': r.totalLitres ?? r.litres,
      'Diesel Amount': r.dieselAmount,
      'Mileage': r.mileage,
      'Cost per KM': r.costPerKm || 0,
      'Fixed Mileage': r.actualMileage || 0,
      'Difference (Litres)': r.difference ?? '',
      'Extra Fuel': r.extraFuel || 0,
      'Rate per Ltr (new)': r.ratePerLitreNew || 0,
      'Total Amount': r.totalAmount || 0,
      'Authorized Driver': r.driverName,
      'Location': r.location,
      'Remarks': r.remarks || '',
      ...(isSuperAdmin ? { 'Entered By': r.enteredBy || '' } : {})
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Mileage Reports");
    XLSX.writeFile(workbook, `KCM_Mileage_Reports_${selectedLocationFilter}${selectedVehicleFilter ? `_${selectedVehicleFilter}` : ''}.xlsx`);
    triggerNotif('Mileage reports Excel exported and downloaded!', 'success');
  };

  // View-scope range for the ledger below (Day / Month Till Date / Year
  // Till Date tabs) - 'all' skips the date check entirely.
  const { start: viewStart, end: viewEnd } = viewPeriod === 'all' ? { start: '', end: '' } : getPeriodDateRange(viewPeriod, viewDate);

  // Filtering: by view scope, location, vehicle number, and keyword search.
  const filteredReports = reports.filter(r => {
    const matchesView = viewPeriod === 'all' || (r.date >= viewStart && r.date <= viewEnd);
    const matchesLocation = selectedLocationFilter === 'All' || (r.location || '').toUpperCase() === selectedLocationFilter.toUpperCase();
    const matchesVehicle = !selectedVehicleFilter || (r.vehicleNo || '').trim().toUpperCase() === selectedVehicleFilter.trim().toUpperCase();
    const matchesKeyword =
      searchTerm === '' ||
      (r.driverName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.remarks || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.vehicleNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.location || '').toLowerCase().includes(searchTerm.toLowerCase());

    return matchesView && matchesLocation && matchesVehicle && matchesKeyword;
  });

  const sortedReports = sort
    ? [...filteredReports].sort((a, b) => {
        let cmp = 0;
        switch (sort.key) {
          case 'driverName': cmp = compareText(a.driverName, b.driverName); break;
          case 'difference': cmp = compareNumber(a.difference, b.difference); break;
          case 'openingKm': cmp = compareNumber(a.openingKm, b.openingKm); break;
          case 'closingKm': cmp = compareNumber(a.closingKm, b.closingKm); break;
          case 'totalKm': cmp = compareNumber(a.totalKm, b.totalKm); break;
          case 'ratePerLitre': cmp = compareNumber(a.ratePerLitre, b.ratePerLitre); break;
          case 'litres': cmp = compareNumber(a.litres, b.litres); break;
          case 'totalLitres': cmp = compareNumber(a.totalLitres ?? a.litres, b.totalLitres ?? b.litres); break;
          case 'dieselAmount': cmp = compareNumber(a.dieselAmount, b.dieselAmount); break;
          case 'mileage': cmp = compareNumber(a.mileage, b.mileage); break;
          case 'costPerKm': cmp = compareNumber(a.costPerKm, b.costPerKm); break;
          case 'actualMileage': cmp = compareNumber(a.actualMileage, b.actualMileage); break;
          case 'extraFuel': cmp = compareNumber(a.extraFuel, b.extraFuel); break;
          case 'ratePerLitreNew': cmp = compareNumber(a.ratePerLitreNew, b.ratePerLitreNew); break;
          case 'totalAmount': cmp = compareNumber(a.totalAmount, b.totalAmount); break;
          case 'location': cmp = compareText(a.location, b.location); break;
          case 'vehicleNo': cmp = extractLeadingNumber(a.vehicleNo) - extractLeadingNumber(b.vehicleNo); break;
          // Ties (same date) break on Vehicle No so the order stays stable.
          case 'date': cmp = a.date === b.date ? extractLeadingNumber(a.vehicleNo) - extractLeadingNumber(b.vehicleNo) : (a.date < b.date ? -1 : 1); break;
          default: cmp = extractLeadingNumber(a.vehicleNo) - extractLeadingNumber(b.vehicleNo);
        }
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredReports;

  return (
    <div className="space-y-6 text-xs text-slate-800 relative min-h-screen">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-pink-100">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2.5 tracking-tight">
            <Gauge className="text-pink-600 w-6 h-6" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-purple-800">
              Fleet Mileage Tracker
            </span>
          </h1>
          <p className="text-[11px] text-slate-500 mt-1 font-semibold">
            Track and log opening/closing kilometers, fuel rates, amount calculations, and driver metrics segmented by location and vehicle.
          </p>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            {/* Add New Details Sidebar Trigger */}
            <button
              onClick={() => {
                resetForm();
                setShowSidebar(true);
              }}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-xs text-white font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-pink-500/10"
            >
              <Plus className="w-4 h-4" />
              Add Details
            </button>
          </div>
        )}
      </div>

      {/* Notifications banner */}
      {notif && (
        <div
          className={`p-3 border rounded-xl font-medium flex items-center gap-2.5 shadow-xs transition-all animate-fade-in ${
            notif.type === 'success'
              ? 'bg-teal-50 border-teal-200 text-teal-800'
              : notif.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <CheckCircle className={`w-4 h-4 ${notif.type === 'success' ? 'text-teal-600' : notif.type === 'error' ? 'text-red-500' : 'text-blue-500'} shrink-0`} />
          <span className="font-sans leading-relaxed">{notif.message}</span>
        </div>
      )}

      {/* Main Workspace split: Filters + Action Bar + Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 flex flex-col space-y-4">
        {/* Ledger CSV/Excel Operations */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
          <div className="font-semibold text-slate-800 flex items-center gap-1">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Operations Console:
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Export CSV */}
            <button
              type="button"
              onClick={handleCSVExport}
              className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
              title="Export reports as Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              Export Excel
            </button>
          </div>
        </div>

        {/* Ledger view scope - All (default) / Day / Month Till Date / Year
            Till Date. Picking a date only matters for Day/Month/Year. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
            {([['all', 'All'], ['day', 'Day'], ['month', 'Month Till Date'], ['year', 'Year Till Date']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewPeriod(key)}
                className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${viewPeriod === key ? 'bg-white shadow-xs text-pink-700' : 'text-slate-500'}`}
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
        </div>

        {/* Filter Console */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100 font-bold text-slate-700 text-[10px] uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Filter className="w-3 h-3 text-pink-600" /> Segmented Location Filter
            </span>
            <span>Matches: {filteredReports.length} entries</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Sort By - Oldest First (default) / Newest First. Reuses the
                same `sort` state the column headers drive. */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Sort By</label>
              <select
                value={sort?.key === 'date' && sort.direction === 'asc' ? 'oldest' : 'newest'}
                onChange={(e) => setSort({ key: 'date', direction: e.target.value === 'oldest' ? 'asc' : 'desc' })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold text-slate-700 text-[11px]"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>

            {/* Location Selector */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Filter by Location</label>
              <select
                value={selectedLocationFilter}
                onChange={(e) => setSelectedLocationFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold text-slate-700 text-[11px]"
              >
                <option value="All">All Locations</option>
                {locationList.map((l, idx) => (
                  <option key={idx} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Vehicle Number - searchable (type to filter), sourced live
                from Fleet & Vehicles via vehicleList above. Scopes both the
                on-screen ledger and Export Excel to just this vehicle;
                leaving it blank keeps "All Vehicles" for both. */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Vehicle Number</label>
              <input
                type="text"
                list="mileage-export-vehicle-datalist"
                value={selectedVehicleFilter}
                onChange={(e) => setSelectedVehicleFilter(e.target.value.toUpperCase())}
                onKeyDown={(e) => handleVehicleNumberEnterKey(e, selectedVehicleFilter, vehicleList, setSelectedVehicleFilter)}
                placeholder="All Vehicles"
                autoComplete="off"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold text-slate-700 text-[11px] uppercase"
              />
              <datalist id="mileage-export-vehicle-datalist">
                {vehicleList.map((v, idx) => <option key={idx} value={v} />)}
              </datalist>
            </div>

            {/* General Search */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Keyword Search</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. driver name, remarks"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
                <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Data Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs flex-1 min-h-[350px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900 text-slate-200 font-sans tracking-wide uppercase text-[9px] sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5">Sl. No</th>
                <th className="px-3 py-2.5"><SortHeader label="Date" sortKey="date" sort={sort} onSort={handleSort} type="numeric" /></th>
                <th className="px-3 py-2.5"><SortHeader label="Vehicle No" sortKey="vehicleNo" sort={sort} onSort={handleSort} type="numeric" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Opening KM" sortKey="openingKm" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Closing KM" sortKey="closingKm" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right bg-slate-800"><SortHeader label="Total KM" sortKey="totalKm" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Rate / Litre" sortKey="ratePerLitre" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Litres" sortKey="litres" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right text-teal-400"><SortHeader label="Diesel Amount" sortKey="dieselAmount" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right text-pink-400"><SortHeader label="Mileage" sortKey="mileage" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right text-amber-400"><SortHeader label="Cost/KM" sortKey="costPerKm" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right text-purple-400"><SortHeader label="Fixed Mileage" sortKey="actualMileage" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Difference (L)" sortKey="difference" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Extra Fuel" sortKey="extraFuel" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Rate/Ltr (new)" sortKey="ratePerLitreNew" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Total Litres" sortKey="totalLitres" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5 text-right text-teal-400"><SortHeader label="Total Amount" sortKey="totalAmount" sort={sort} onSort={handleSort} type="numeric" align="right" /></th>
                <th className="px-3 py-2.5"><SortHeader label="Authorized Driver" sortKey="driverName" sort={sort} onSort={handleSort} /></th>
                <th className="px-3 py-2.5"><SortHeader label="Location" sortKey="location" sort={sort} onSort={handleSort} /></th>
                <th className="px-3 py-2.5 max-w-xs">Remarks</th>
                {isSuperAdmin && <th className="px-3 py-2.5">Entered By</th>}
                {!readOnly && <th className="px-3 py-2.5 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={21 + (isSuperAdmin ? 1 : 0) + (readOnly ? 0 : 1)} className="text-center py-20 text-slate-400 font-mono text-xs">
                    🚫 NO REGISTERED MILEAGE ENTRIES DISCOVERED FOR THIS SEGMENT.
                    <div className="text-[10px] text-slate-400 font-sans mt-1">
                      {readOnly ? 'Entries are logged from the Mileage section of the Fuel Entry form in Fuel Management.' : 'Use the "Add Details" sidebar button to authorize new mileage and fuel log books.'}
                    </div>
                  </td>
                </tr>
              ) : (
                sortedReports.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors text-[11px]">
                    <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2 font-bold font-mono text-slate-900 whitespace-nowrap">{r.vehicleNo}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{r.openingKm != null ? `${r.openingKm.toLocaleString('en-IN')} KM` : '-'}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{r.closingKm != null ? `${r.closingKm.toLocaleString('en-IN')} KM` : '-'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold bg-slate-50 text-slate-900">{(r.totalKm || 0).toLocaleString('en-IN')} KM</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">₹{(r.ratePerLitre || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{(r.litres || 0).toFixed(2)} L</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-teal-700 bg-teal-50/20">₹{(r.dieselAmount || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-pink-700 bg-pink-50/20">{(r.mileage || 0).toFixed(2)} KM/L</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-amber-700 bg-amber-50/20">{r.costPerKm ? `₹${r.costPerKm.toFixed(2)}` : '-'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-purple-700 bg-purple-50/20">{r.actualMileage ? `${r.actualMileage.toFixed(2)} KM/L` : '-'}</td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${r.difference == null ? 'text-slate-400' : r.difference > 0 ? 'text-emerald-600' : r.difference < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                      {r.difference == null ? '-' : `${r.difference > 0 ? '+' : ''}${r.difference.toFixed(2)} L`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{r.extraFuel ? r.extraFuel.toFixed(2) : '-'}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{r.ratePerLitreNew ? `₹${r.ratePerLitreNew.toFixed(2)}` : '-'}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{(r.totalLitres ?? r.litres ?? 0).toFixed(2)} L</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-teal-700 bg-teal-50/20">{r.totalAmount ? `₹${r.totalAmount.toLocaleString('en-IN')}` : '-'}</td>
                    <td className="px-3 py-2 text-slate-800 whitespace-nowrap font-semibold">{r.driverName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[9.5px] font-bold">
                        {r.location}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 max-w-xs truncate" title={r.remarks}>{r.remarks || '-'}</td>
                    {isSuperAdmin && (
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                        {r.enteredBy || '-'}
                      </td>
                    )}
                    {!readOnly && (
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => startEdit(r)}
                            className="text-pink-600 hover:text-pink-800 bg-pink-50 hover:bg-pink-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                            title="Edit this entry"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Are you sure you want to delete mileage report entry sl.no ${i + 1}?`)) return;
                              try {
                                await onDeleteReport(r.id);
                                triggerNotif('Entry deleted successfully!', 'success');
                              } catch (err) {
                                console.error(err);
                                triggerNotif(err instanceof Error ? err.message : 'Failed to delete mileage report entry.', 'error');
                              }
                            }}
                            className="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                            title="Delete this entry"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Calculated Totals Mini Grid - deliberately compact (small
            padding/text) since these get screenshotted on their own a lot -
            the old size ran off a typical phone screenshot. */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-2 text-xs">
          <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Total KM Accumulated</span>
            <div className="text-[11px] font-black text-slate-800 font-mono mt-0.5">
              {filteredReports.reduce((s, r) => s + (r.totalKm || 0), 0).toLocaleString('en-IN')} KM
            </div>
          </div>
          {/* Total Litres - sums the Total Litres column (Litres + Extra
              Fuel), same value the table's own column shows, not the bare
              Litres field. */}
          <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Total Litres</span>
            <div className="text-[11px] font-black text-slate-800 font-mono mt-0.5">
              {filteredReports.reduce((s, r) => s + (r.totalLitres ?? r.litres ?? 0), 0).toLocaleString('en-IN')} L
            </div>
          </div>
          {/* Total Amount - sums the Total Amount column (Diesel Amount +
              Extra Fuel*new rate), falling back to Diesel Amount only for
              any row that never had Extra Fuel/a new rate. */}
          <div className="bg-teal-50/40 p-1.5 rounded-lg border border-teal-100">
            <span className="text-[8.5px] text-teal-600 font-bold uppercase block">Total Amount</span>
            <div className="text-[11px] font-black text-teal-800 font-mono mt-0.5">
              ₹{filteredReports.reduce((s, r) => s + (r.totalAmount ?? r.dieselAmount ?? 0), 0).toLocaleString('en-IN')}
            </div>
          </div>
          <div className="bg-pink-50/40 p-1.5 rounded-lg border border-pink-100">
            <span className="text-[8.5px] text-pink-600 font-bold uppercase block">Avg Segmented Mileage</span>
            <div className="text-[11px] font-black text-pink-700 font-mono mt-0.5">
              {filteredReports.length > 0
                ? (filteredReports.reduce((s, r) => s + (r.mileage || 0), 0) / filteredReports.length).toFixed(2)
                : '0.00'} KM/L
            </div>
          </div>
          {/* Difference Mileage Amount - cumulative rupee value of the
              Difference (L) column: each row's difference (litres, +saved/
              -wasted) x its own Rate/Litre, summed across every filtered
              row. Green when the total is fuel saved (>= 0), red when it's
              net wasted (< 0) - same sign convention the Difference (L)
              column itself already uses. */}
          {(() => {
            const differenceAmount = filteredReports.reduce((s, r) => s + (r.difference ?? 0) * (r.ratePerLitre || 0), 0);
            return (
              <div className={`p-1.5 rounded-lg border ${differenceAmount >= 0 ? 'bg-emerald-50/40 border-emerald-100' : 'bg-rose-50/40 border-rose-100'}`}>
                <span className={`text-[8.5px] font-bold uppercase block ${differenceAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Difference Mileage Amount</span>
                <div className={`text-[11px] font-black font-mono mt-0.5 ${differenceAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {differenceAmount >= 0 ? '+' : '-'}₹{Math.abs(differenceAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Slide-out Sidebar Modal Overlay for adding/editing details */}
      <AnimatePresence>
        {showSidebar && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end z-50">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={resetForm} />

            {/* Sidebar Stage */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-pink-100"
            >
              {/* Header */}
              <div className="p-4 bg-gradient-to-r from-purple-950 to-pink-950 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-pink-400" />
                    {editingId ? 'Edit Mileage Entry' : 'Add Mileage Entry'}
                  </h3>
                  <span className="text-[9px] text-pink-300 font-bold uppercase tracking-widest block mt-0.5">
                    KCM Logistics Log Book
                  </span>
                </div>
                <button
                  onClick={resetForm}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <form id="mileage-details-form" onSubmit={handleSubmit} className="space-y-3">
                  {/* Date Input */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-pink-600" />
                      Reporting Date *
                    </label>
                    <DateInput
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500 font-semibold"
                    />
                  </div>

                  {/* Vehicle No Selector with dynamic lookup list */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Car className="w-3.5 h-3.5 text-pink-600" />
                      Vehicle Number *
                    </label>
                    <input
                      type="text"
                      required
                      list="fleet-vehicles-datalist"
                      placeholder="e.g. KA53AA0069"
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                      onKeyDown={(e) => handleVehicleNumberEnterKey(e, vehicleNo, vehicleList, setVehicleNo)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 uppercase focus:outline-none focus:ring-1 focus:ring-pink-500 tracking-wider"
                    />
                    <datalist id="fleet-vehicles-datalist">
                      {vehicleList.map((v, idx) => (
                        <option key={idx} value={v} />
                      ))}
                    </datalist>
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                      Type and select from registered fleet or insert standard ad-hoc vehicles.
                    </p>
                  </div>

                  {/* Vehicle Mileage Master mini-manager */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Gauge className="w-3 h-3" /> Vehicle Mileage Master
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          // Opening the manager defaults the rating form to
                          // whichever vehicle is selected for this trip, since
                          // that's the one the list below is now scoped to.
                          if (!showMileageManager && vehicleNo) setMileageFormVehicleNo(vehicleNo);
                          setShowMileageManager(!showMileageManager);
                        }}
                        className="text-[10px] font-bold text-pink-600 hover:text-pink-800 cursor-pointer"
                      >
                        {showMileageManager ? 'Hide' : 'Manage Ratings'}
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-slate-500">
                      {vehicleNo
                        ? fixedMileageForVehicle != null
                          ? `Fixed rating for ${vehicleNo}: ${fixedMileageForVehicle} KM/L`
                          : `No fixed mileage set yet for ${vehicleNo} - add one below.`
                        : 'Select a vehicle above to see its fixed mileage rating.'}
                    </p>

                    {showMileageManager && (
                      <div className="pt-2 border-t border-slate-200 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Vehicle No"
                            value={mileageFormVehicleNo}
                            onChange={(e) => setMileageFormVehicleNo(e.target.value.toUpperCase())}
                            autoComplete="off"
                            className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-slate-800 text-[11px] font-mono"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Mileage (KM/L)"
                            value={mileageFormValue}
                            onChange={(e) => setMileageFormValue(e.target.value)}
                            autoComplete="off"
                            className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-slate-800 text-[11px] font-mono"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddVehicleMileage}
                          className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-lg py-1.5 font-semibold text-[10px] uppercase cursor-pointer"
                        >
                          Save Rating
                        </button>
                        {/* Scoped to the vehicle selected for this trip only -
                            other vehicles' saved ratings are never shown here,
                            they'd only cause confusion about which one applies. */}
                        {(() => {
                          const visibleMileages = vehicleNo
                            ? vehicleMileages.filter(v => (v.vehicleNo || '').trim().toUpperCase() === vehicleNo.trim().toUpperCase())
                            : [];
                          return visibleMileages.length > 0 && (
                          <div className="max-h-28 overflow-y-auto space-y-1 pt-1">
                            {visibleMileages.map(v => (
                              <div key={v.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-md px-2 py-1">
                                <span className="text-[10px] font-semibold text-slate-700">{v.vehicleNo} <span className="text-slate-400 font-mono">({v.mileage} KM/L)</span></span>
                                <button type="button" onClick={() => onDeleteVehicleMileage?.(v.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer">
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

                  {/* Opening and Closing KM - required, real odometer readings */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Opening KM *
                      </label>
                      <input
                        type="number"
                        required
                        placeholder="Automatic/Manual"
                        value={openingKm}
                        onChange={(e) => setOpeningKm(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      />
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        {openingKm ? '✓ Autoloaded previous' : 'Enter manually first time'}
                      </p>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Closing KM *
                      </label>
                      <input
                        type="number"
                        required
                        placeholder="Current reading"
                        value={closingKm}
                        onChange={(e) => setClosingKm(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  {/* Calculations Info Card */}
                  <div className="p-3 bg-gradient-to-r from-pink-50/50 to-purple-50/50 rounded-xl border border-pink-100 flex items-center justify-between font-mono">
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Distance Covered (auto)</span>
                      <span className="text-xs font-black text-pink-700">{totalKm} Kilometers</span>
                    </div>
                    <ArrowRightLeft className="w-5 h-5 text-pink-300" />
                  </div>

                  {/* Rate per Litre and Litres */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Rate per Litre (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="e.g. 96.50"
                        value={ratePerLitre}
                        onChange={(e) => setRatePerLitre(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Litres Filled *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="e.g. 45.50"
                        value={litres}
                        onChange={(e) => setLitres(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  {/* Mileage (this trip, computed) vs Actual Mileage (fixed
                      reference) and the Difference between them - all auto */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
                    <div>
                      <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Diesel cost</span>
                      <span className="text-xs font-black text-teal-700">₹{dieselAmount}</span>
                    </div>
                    <div>
                      <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Total Litres</span>
                      <span className="text-xs font-black text-teal-700">{totalLitres || 0} L</span>
                    </div>
                    <div>
                      <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Cost/KM</span>
                      <span className="text-xs font-black text-amber-700">₹{costPerKm}</span>
                    </div>
                    <div>
                      <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Mileage (this trip)</span>
                      <span className="text-xs font-black text-pink-700">{mileage} KM/L</span>
                    </div>
                    <div>
                      <span className="text-[8.5px] text-slate-400 font-bold uppercase flex items-center gap-1">
                        <HelpCircle className="w-2.5 h-2.5 text-purple-500" /> Fixed Mileage
                      </span>
                      <span className="text-xs font-black text-purple-700">{actualMileage} KM/L</span>
                    </div>
                    {(() => {
                      const totalKmVal = parseFloat(totalKm) || 0;
                      const totalLitresVal = parseFloat(totalLitres) || 0;
                      const actualMileageVal = parseFloat(actualMileage) || 0;
                      const { difference } = computeFuelAudit(totalKmVal, totalLitresVal, 0, actualMileageVal, driverName);
                      return (
                        <div className="col-span-2 pt-2 border-t border-slate-200">
                          <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Difference (Litres wasted/saved)</span>
                          <span className={`text-xs font-black ${difference == null ? 'text-slate-400' : difference > 0 ? 'text-emerald-600' : difference < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                            {difference == null ? '-' : `${difference > 0 ? '+' : ''}${difference} L`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {(() => {
                    const totalKmVal = parseFloat(totalKm) || 0;
                    const totalLitresVal = parseFloat(totalLitres) || 0;
                    const rateVal = parseFloat(ratePerLitre) || 0;
                    const actualMileageVal = parseFloat(actualMileage) || 0;
                    const { note } = computeFuelAudit(totalKmVal, totalLitresVal, rateVal, actualMileageVal, driverName);
                    if (!note) return null;
                    return (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <span className="text-[9px] text-amber-600 font-bold uppercase block mb-0.5">Fuel Audit (auto-added to Remarks)</span>
                        <p className="text-xs font-semibold text-amber-800">{note}</p>
                      </div>
                    );
                  })()}

                  {/* Extra Fuel and Rate per Ltr (new) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Extra Fuel
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 5, or 30+40 for two top-ups"
                        value={extraFuel}
                        onChange={(e) => setExtraFuel(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      />
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        Multiple top-ups this trip? Type them as e.g. "30+40" - added up automatically into Total Ltrs.
                      </p>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Rate per Ltr (new)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 96.50"
                        value={ratePerLitreNew}
                        onChange={(e) => setRatePerLitreNew(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  {/* Total Amount (auto) */}
                  <div className="p-3 bg-gradient-to-r from-pink-50/50 to-purple-50/50 rounded-xl border border-pink-100 flex items-center justify-between font-mono">
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Total Amount</span>
                      <span className="text-xs font-black text-pink-700">₹{totalAmount}</span>
                    </div>
                    <DollarSign className="w-5 h-5 text-pink-300" />
                  </div>

                  {/* Authorized Driver */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5 text-pink-600" />
                      Authorized Driver *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Suresh / Adhithya"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500 font-semibold"
                    />
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                      Multiple drivers can be entered in one field, separated by "/".
                    </p>
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-pink-600" />
                      Operational Location *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Bangalore, Nelamangala"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500 font-semibold"
                    />
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Remarks
                    </label>
                    <textarea
                      placeholder="Enter additional remarks or trip logs..."
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500"
                    />
                  </div>
                </form>
              </div>

              {/* Sidebar Footer Actions */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="mileage-details-form"
                  disabled={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : editingId ? (
                    'Update Record'
                  ) : (
                    'Commit Entry'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
