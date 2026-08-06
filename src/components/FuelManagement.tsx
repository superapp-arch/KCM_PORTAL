import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { FuelLog, MileageReport, Vehicle, VehicleDocument, User, VehicleMileage, Vendor, StaffEmployee } from '../types';
import SortHeader from './SortHeader';
import { SortState, SortDirection, extractLeadingNumber } from '../utils/sort';
import {
  Fuel,
  Plus,
  Search,
  Landmark,
  CheckCircle2,
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
  User as UserIcon
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';
import DateInput from './DateInput';

const LOCATIONS = [
  'AP', 'Nelmangala', 'Belagaum', 'BLR', 'Chennai', 'Goa', 'Hyderabad', 'Hassan',
  'Hoskote', 'Kandlakoya', 'Mysore', 'Manoharabad', 'Vijayawada', 'Vizag'
];

const BUNK_NAMES = [
  'Atharv', 'Kamala', 'H V Subbaya', 'HPCL', 'Isnapur', 'Lakshmi',
  'OM Petroleum', 'Simhadhri', 'Sri Sai Baba', 'Sri Venkateshwara',
  'Tejashri', 'Vayuputra', 'Visalakshi'
];

const CLIENTS = ['KCM', 'Swiggy', 'Reliance', 'Market Vehicle', 'Shadowfax'];

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
  vehicles: Vehicle[];
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

export default function FuelManagement({
  user,
  logs,
  onAddLog,
  onUpdateLog,
  onDeleteLog,
  vehicles,
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
  const [searchTerm, setSearchTerm] = useState('');
  const [bunkFilter, setBunkFilter] = useState('All');
  const [sort, setSort] = useState<SortState | null>(null);
  const handleSort = (key: string, direction: SortDirection) => setSort({ key, direction });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<string | null>(null);

  // Period-based report download - reference date + day/month/year-till-date dropdown.
  const [downloadDate, setDownloadDate] = useState(new Date().toISOString().slice(0, 10));
  const [downloadPeriod, setDownloadPeriod] = useState<'day' | 'month' | 'year'>('day');

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
  const [bunkName, setBunkName] = useState('');
  const [bunkOrCard, setBunkOrCard] = useState<'Bunk' | 'Card'>('Bunk');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [indentNumber, setIndentNumber] = useState('');
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
  const [mMileage, setMMileage] = useState('');
  const [mCostPerKm, setMCostPerKm] = useState('');
  const [mActualMileage, setMActualMileage] = useState('');
  const [mDriverName, setMDriverName] = useState('');
  const [mRemarks, setMRemarks] = useState('');
  const [mExtraFuel, setMExtraFuel] = useState('');
  const [mRatePerLitreNew, setMRatePerLitreNew] = useState('');
  const [mTotalAmount, setMTotalAmount] = useState('');
  const [showMileageManager, setShowMileageManager] = useState(false);
  const [mileageFormVehicleNo, setMileageFormVehicleNo] = useState('');
  const [mileageFormValue, setMileageFormValue] = useState('');

  // Bunk Summary panel (below the Fuel Entry ledger): Till Date vs This Month
  const [bunkSummaryPeriod, setBunkSummaryPeriod] = useState<'all' | 'month'>('all');

  const triggerNotif = (msg: string) => {
    setNotif(msg);
    setTimeout(() => setNotif(null), 4000);
  };

  // Vehicle Number autofetch list: registered fleet + previously entered numbers
  const vehicleList = Array.from(
    new Set([
      ...vehicles.map(v => v.regNo || v['Reg. No.'] || '').filter(Boolean),
      ...logs.map(l => l.vehicleNumber).filter(Boolean)
    ])
  ).sort();

  // Bunks actually used in the ledger so far, for the bunk-wise download filter
  const usedBunks = Array.from(new Set(logs.map(l => l.bunkName).filter(Boolean))).sort();

  // Amount auto-calc = Ltrs * Rate (editable override afterward)
  useEffect(() => {
    const l = parseFloat(ltrs) || 0;
    const r = parseFloat(rate) || 0;
    setAmount(String(parseFloat((l * r).toFixed(2))));
  }, [ltrs, rate]);

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
  useEffect(() => {
    if (!vehicleNumber) return;
    const vehicleReports = mileageReports
      .filter(r => (r.vehicleNo || '').trim().toUpperCase() === vehicleNumber.trim().toUpperCase())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (vehicleReports.length > 0) {
      const lastReport = vehicleReports[vehicleReports.length - 1];
      if (!editingId || (editingId && logs.find(l => l.id === editingId)?.vehicleNumber !== vehicleNumber)) {
        setMOpeningKm(String(lastReport.closingKm));
      }
    } else if (!editingId) {
      setMOpeningKm('');
    }
  }, [vehicleNumber, mileageReports, editingId, logs]);

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

  // Mileage (this trip, real achieved efficiency) = Total KM / Ltrs (from
  // the Fuel Entry section above, not re-entered here).
  useEffect(() => {
    const tKm = parseFloat(mTotalKm) || 0;
    const l = parseFloat(ltrs) || 0;
    setMMileage(l > 0 ? String(parseFloat((tKm / l).toFixed(2))) : '0');
  }, [mTotalKm, ltrs]);

  // Cost per KM = Rate per Litre (from Fuel Entry) / Mileage (this trip)
  useEffect(() => {
    const r = parseFloat(rate) || 0;
    const m = parseFloat(mMileage) || 0;
    setMCostPerKm(m > 0 ? String(parseFloat((r / m).toFixed(2))) : '0');
  }, [rate, mMileage]);

  // Total Amount = Diesel Amount (from Fuel Entry) + (Extra Fuel * new Rate)
  useEffect(() => {
    const diesel = parseFloat(amount) || 0;
    const extra = parseFloat(mExtraFuel) || 0;
    const rateNew = parseFloat(mRatePerLitreNew) || 0;
    setMTotalAmount(String(parseFloat((diesel + extra * rateNew).toFixed(2))));
  }, [amount, mExtraFuel, mRatePerLitreNew]);

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
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setPeriod(new Date().toISOString().slice(0, 7));
    setDate(new Date().toISOString().slice(0, 10));
    setLocation('');
    setBunkName('');
    setBunkOrCard('Bunk');
    setVehicleNumber('');
    setIndentNumber('');
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
    setMRemarks('');
    setMExtraFuel('');
    setMRatePerLitreNew('');
    setShowMileageManager(false);
    setMileageFormVehicleNo('');
    setMileageFormValue('');
    setEntrySection('details');
    setShowSidebar(false);
  };

  const startEdit = (log: FuelLog) => {
    setEditingId(log.id);
    setPeriod(log.period);
    setDate(log.date);
    setLocation(log.location);
    setBunkName(log.bunkName);
    setBunkOrCard(log.bunkOrCard);
    setVehicleNumber(log.vehicleNumber);
    setIndentNumber(log.indentNumber);
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
      setMRemarks(stripPreviousAuditNote(linkedReport.remarks || ''));
      setMExtraFuel(String(linkedReport.extraFuel || ''));
      setMRatePerLitreNew(String(linkedReport.ratePerLitreNew || ''));
    } else {
      setLinkedMileageReportId(null);
      setMOpeningKm('');
      setMClosingKm('');
      setMDriverName('');
      setMRemarks('');
      setMExtraFuel('');
      setMRatePerLitreNew('');
    }

    setEntrySection('details');
    setShowSidebar(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!period || !date || !location || !bunkName || !vehicleNumber || !ltrs || !rate || !client) {
      triggerNotif('Please complete all required fields (*)');
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
        const calculatedMileage = l > 0 ? parseFloat((calculatedTotalKm / l).toFixed(2)) : 0;
        const calculatedCostPerKm = calculatedMileage > 0 ? parseFloat((r / calculatedMileage).toFixed(2)) : 0;
        const calculatedActualMileage = fixedMileageForVehicle || 0;
        const { difference, note } = computeFuelAudit(calculatedTotalKm, l, r, calculatedActualMileage, mDriverName);
        const baseMileageRemarks = stripPreviousAuditNote(mRemarks);
        const finalMileageRemarks = note ? `${baseMileageRemarks}${baseMileageRemarks ? ' ' : ''}(Fuel Audit: ${note})` : baseMileageRemarks;
        const extra = parseFloat(mExtraFuel) || 0;
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
          dieselAmount: a,
          mileage: calculatedMileage,
          costPerKm: calculatedCostPerKm,
          driverName: mDriverName.trim(),
          location: location.trim(),
          remarks: finalMileageRemarks,
          actualMileage: calculatedActualMileage,
          difference,
          fuelAuditNote: note,
          extraFuel: extra,
          ratePerLitreNew: rateNew,
          totalAmount: calculatedTotalAmount
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
      resetForm();
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to save fuel entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLog = async (log: FuelLog) => {
    if (!confirm('Are you sure you want to delete this fuel entry? This also removes its linked mileage report entry. This action is irreversible.')) return;
    try {
      await onDeleteLog(log.id);
      if (log.mileageReportId) {
        await onDeleteMileageReport(log.mileageReportId);
      }
      triggerNotif('Fuel entry deleted successfully.');
    } catch (err) {
      console.error(err);
    }
  };


  const filteredLogsUnsorted = logs.filter(log =>
    (
      (log?.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log?.vendorName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log?.rqId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log?.indentNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const filteredLogs = sort
    ? [...filteredLogsUnsorted].sort((a, b) => {
        const cmp = sort.key === 'indentNumber'
          ? extractLeadingNumber(a.indentNumber) - extractLeadingNumber(b.indentNumber)
          : extractLeadingNumber(a.vehicleNumber) - extractLeadingNumber(b.vehicleNumber);
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : filteredLogsUnsorted;

  const isSuperAdmin = user.department === 'super_admin';

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

  // Resolves the [start, end] date-string window (inclusive) for the
  // dashboard's "For the Day / Monthly Till Date / Year Till Date" download.
  const getDownloadDateRange = (period: 'day' | 'month' | 'year', refDate: string): { start: string; end: string } => {
    if (period === 'day') return { start: refDate, end: refDate };
    if (period === 'month') return { start: `${refDate.slice(0, 7)}-01`, end: refDate };
    return { start: `${refDate.slice(0, 4)}-01-01`, end: refDate };
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
    const { start, end } = getDownloadDateRange(downloadPeriod, downloadDate);
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

  // Bunk Summary panel download: every entry for one (Location, Bunk Name)
  // pair, scoped to "Till Date" (all-time) or "This Month", with a TOTAL row.
  const handleDownloadBunkSummary = (location: string, bunkNameVal: string) => {
    const nowMonth = new Date().toISOString().slice(0, 7);
    const groupLogs = logs.filter(l =>
      l.location === location && l.bunkName === bunkNameVal &&
      (bunkSummaryPeriod === 'all' || l.date.slice(0, 7) === nowMonth)
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
    const periodLabel = bunkSummaryPeriod === 'all' ? 'TillDate' : 'ThisMonth';
    XLSX.writeFile(workbook, `KCM_Bunk_Summary_${sheetName}_${periodLabel}.xlsx`);
    triggerNotif('Bunk summary downloaded successfully!');
  };

  // Bunk Summary panel data: grouped by (Location, Bunk Name), cumulative
  // Litres/Amount either Till Date (all-time) or This Month.
  const bunkSummaryRows = (() => {
    const nowMonth = new Date().toISOString().slice(0, 7);
    const scopedLogs = bunkSummaryPeriod === 'all' ? logs : logs.filter(l => l.date.slice(0, 7) === nowMonth);
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
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {notif}
        </div>
      )}

      {/* KPI Cards - unchanged */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average Rate / Litre</p>
            <h3 className="text-xl font-bold text-slate-800 mt-1">₹{avgRate.toFixed(2)}</h3>
            <p className="text-xs text-slate-400 mt-0.5">National Fuel Index Linked</p>
          </div>
          <div className="p-3 bg-slate-50 text-slate-500 rounded-lg">
            <Landmark className="w-5 h-5" />
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
              <button
                onClick={() => { resetForm(); setShowSidebar(true); }}
                className="bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-xs text-white font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> Add Entry
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                <tr>
                  <th className="px-3 py-2.5">Entry #</th>
                  <th className="px-3 py-2.5">Period</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Location</th>
                  <th className="px-3 py-2.5">Bunk Name</th>
                  <th className="px-3 py-2.5">Bunk/Card</th>
                  <th className="px-3 py-2.5"><SortHeader label="Vehicle No" sortKey="vehicleNumber" sort={sort} onSort={handleSort} type="numeric" /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Indent No" sortKey="indentNumber" sort={sort} onSort={handleSort} type="numeric" /></th>
                  <th className="px-3 py-2.5 text-right">Ltrs</th>
                  <th className="px-3 py-2.5 text-right">Rate</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Vendor Name</th>
                  <th className="px-3 py-2.5">Vendor Code</th>
                  <th className="px-3 py-2.5">Requested By</th>
                  <th className="px-3 py-2.5">RQ ID</th>
                  <th className="px-3 py-2.5 max-w-xs">Remarks</th>
                  <th className="px-3 py-2.5 text-center">Docs</th>
                  {isSuperAdmin && <th className="px-3 py-2.5">Entered By</th>}
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={20 + (isSuperAdmin ? 1 : 0)} className="text-center py-10 text-slate-400 font-mono">
                      NO FUEL ENTRIES FOUND IN CURRENT LEDGER.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, i) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{i + 1}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{log.period}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{log.date}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.location}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.bunkName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{log.bunkOrCard}</td>
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
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">{log.rqId || '-'}</td>
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
                      {isSuperAdmin && (
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                          {log.enteredBy || '-'}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => startEdit(log)}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                            title="Edit entry"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log)}
                            className="p-1 text-slate-400 hover:text-pink-600 hover:bg-slate-100 rounded cursor-pointer"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex justify-end">
            <div className="w-full sm:w-96 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  Bunk-wise Summary
                </h3>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                  <button
                    onClick={() => setBunkSummaryPeriod('all')}
                    className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${bunkSummaryPeriod === 'all' ? 'bg-white shadow-xs text-blue-700' : 'text-slate-500'}`}
                  >
                    Till Date
                  </button>
                  <button
                    onClick={() => setBunkSummaryPeriod('month')}
                    className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${bunkSummaryPeriod === 'month' ? 'bg-white shadow-xs text-blue-700' : 'text-slate-500'}`}
                  >
                    This Month
                  </button>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {bunkSummaryRows.length === 0 ? (
                  <p className="text-center text-slate-400 text-[11px] py-4">No fuel entries recorded yet.</p>
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
        </div>

      {/* Slide-out Sidebar for Add/Edit Fuel Entry */}
      <AnimatePresence>
        {showSidebar && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end z-50">
            <div className="absolute inset-0" onClick={resetForm} />
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
                <button onClick={resetForm} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer">
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

                    {/* Diesel Amount / Mileage / Cost per KM / Fixed Mileage - all
                        auto, Diesel Amount mirrors the Amount entered below */}
                    <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-lg border border-pink-100 font-mono">
                      <div>
                        <span className="text-[8.5px] text-slate-400 font-bold uppercase block">Diesel Amount</span>
                        <span className="text-xs font-black text-teal-700">₹{amount || 0}</span>
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
                        const litresVal = parseFloat(ltrs) || 0;
                        const actualMileageVal = parseFloat(mActualMileage) || 0;
                        const { difference } = computeFuelAudit(totalKmVal, litresVal, 0, actualMileageVal, mDriverName);
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
                      const litresVal = parseFloat(ltrs) || 0;
                      const rateVal = parseFloat(rate) || 0;
                      const actualMileageVal = parseFloat(mActualMileage) || 0;
                      const { note } = computeFuelAudit(totalKmVal, litresVal, rateVal, actualMileageVal, mDriverName);
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
                        <label className="block font-semibold text-slate-600 mb-1">Extra Fuel</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 5"
                          value={mExtraFuel}
                          onChange={(e) => setMExtraFuel(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Rate per Ltr (new)</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 96.50"
                          value={mRatePerLitreNew}
                          onChange={(e) => setMRatePerLitreNew(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Total Amount - only meaningfully different from Diesel
                        Amount once Extra Fuel is added */}
                    <div className="p-2.5 bg-white rounded-lg border border-pink-100 flex items-center justify-between font-mono">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">
                          Total Amount {parseFloat(mExtraFuel) > 0 ? '(Diesel + Extra Fuel)' : '(auto)'}
                        </span>
                        <span className="text-xs font-black text-pink-700">₹{mTotalAmount || 0}</span>
                      </div>
                      <DollarSign className="w-4 h-4 text-pink-300" />
                    </div>

                    {/* Authorized Driver */}
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1 flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5 text-pink-600" />
                        Authorized Driver
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Suresh / Adhithya"
                        value={mDriverName}
                        onChange={(e) => setMDriverName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold"
                      />
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        Multiple drivers can be entered in one field, separated by "/". Fill in Opening/Closing KM + Authorized Driver together to also log a Mileage entry - otherwise this fuel entry commits on its own.
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
                  </div>
                  )}

                  {/* Fuel Entry Details tab - everything except the Mileage
                      sub-module above. */}
                  {entrySection === 'details' && (
                  <div className="space-y-3.5">
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
                      <DateInput required value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Location *</label>
                      <input
                        type="text"
                        required
                        list="fuel-locations-datalist"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Search location"
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                      <datalist id="fuel-locations-datalist">
                        {LOCATIONS.map((l, i) => <option key={i} value={l} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Bunk Name *</label>
                      <input
                        type="text"
                        required
                        list="fuel-bunks-datalist"
                        value={bunkName}
                        onChange={(e) => setBunkName(e.target.value)}
                        placeholder="Search bunk"
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
                        placeholder="e.g. KA53AA0069"
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

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Indent Number</label>
                    <input
                      type="text"
                      value={indentNumber}
                      onChange={(e) => setIndentNumber(e.target.value)}
                      autoComplete="off"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                    />
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
                        {vendorProfiles.map((v) => <option key={v.id} value={v.name} />)}
                      </datalist>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        Type a name registered in Vendor Management, or enter one manually if not found.
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
                        value={requestedBy}
                        onChange={(e) => setRequestedBy(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">RQ ID</label>
                      <input
                        type="text"
                        value={rqId}
                        onChange={(e) => setRqId(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                  </div>

                  <DocumentAttachment documents={entryDocs} onChange={setEntryDocs} label="Attach Fuel Receipt / Invoice" />
                  </div>
                  )}
                </form>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button type="button" onClick={resetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">
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

    </div>
  );
}
