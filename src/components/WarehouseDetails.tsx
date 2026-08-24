import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { WarehouseEntry, VehicleDocument, Vehicle, User, Vendor } from '../types';
import { VEHICLE_CATEGORIES } from '../utils/vehicleCycleDefaults';
import { 
  Warehouse, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Paperclip, 
  X, 
  Upload, 
  Download, 
  Printer,
  Calculator,
  Calendar,
  Truck,
  Filter,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';
import DateInput from './DateInput';
import {
  FUEL_COST_PERCENT, KM_SLAB_SUGGESTIONS, formatINR, round2, daysInMonth, countSundaysInMonth,
  computeAutoWorkingDays, resolveWorkingDays, computeWarehouseRates
} from '../utils/warehouseRates';
import { lookupScheduledRate, rateGroupForWarehouseName } from '../utils/warehouseRateMatrix';
import {
  lookup24hrDedicatedRate, lookupReeferWalkesRate, lookupAdHocRouteRate,
  adHocFromCities, adHocToCities
} from '../utils/warehouseRateMatrix24hr';
import { WAREHOUSE_LOCATIONS, WAREHOUSE_CITIES, cityForWarehouseName } from '../utils/warehouseLocations';
import CloseMonthKmSlab from './warehouse/CloseMonthKmSlab';
import RatesSummary from './warehouse/RatesSummary';
import { handleVehicleNumberEnterKey } from '../utils/vehicleNumberSearch';

// Suggestions only (not a locked list) for a vendor vehicle's Type field,
// mirroring FleetSheet.tsx's own VEHICLE_TYPES - Vehicle Category instead
// reuses the real shared VEHICLE_CATEGORIES (Dry/Hybrid/Walkes/Reefer) above.
const VEHICLE_TYPE_SUGGESTIONS = ['Tata Ace', '207', '407', '14 FT', '17 FT', '20 FT', '32 FT'];

interface WarehouseDetailsProps {
  user: User;
  entries: WarehouseEntry[];
  vehicles: Vehicle[];
  // Vendor Management registry - Vehicle Number below also offers vendor
  // (non-Fleet) vehicles, since plenty of warehouse deployments run on
  // vendor-owned trucks that never get a Fleet & Vehicles record.
  vendors: Vendor[];
  onAddEntry: (entry: Omit<WarehouseEntry, 'id'>) => Promise<void>;
  onUpdateEntry: (id: string, entry: Partial<WarehouseEntry>) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
}

export default function WarehouseDetails({
  user,
  entries,
  vehicles,
  vendors,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry
}: WarehouseDetailsProps) {
  
  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterVehicleType, setFilterVehicleType] = useState('');
  const [filterVehicleCategory, setFilterVehicleCategory] = useState('');
  const [filterDeploymentType, setFilterDeploymentType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<string | null>(null);
  // "Log New Warehouse Deployment" is a slide-out sidebar now (matching Fuel
  // Management/Mileage Report's own +Add Entry pattern), closed by default,
  // instead of sitting permanently open as a left-hand panel.
  const [showAddSidebar, setShowAddSidebar] = useState(false);
  // 12Hr Km Slab is a whole-month budget, not per-entry - see
  // components/warehouse/CloseMonthKmSlab.tsx.
  const [showCloseMonthTool, setShowCloseMonthTool] = useState(false);
  // 'deployments' = the existing ledger/log view below, untouched. 'rates' =
  // the new read-only Rate Card summary (components/warehouse/RatesSummary.tsx).
  const [moduleTab, setModuleTab] = useState<'deployments' | 'rates'>('deployments');

  // Form State for Adding New Entry
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseCity, setWarehouseCity] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  // No default value - a Fleet-registered vehicle auto-fills these, a
  // vendor/ad-hoc one either reuses its last entry's values or starts blank
  // for manual entry (see handleVehicleChange) - never silently assumed.
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleCategory, setVehicleCategory] = useState('');
  const [deploymentType, setDeploymentType] = useState('regular');
  const [pod, setPod] = useState('');
  const [podCity, setPodCity] = useState('');
  const [fixedHours, setFixedHours] = useState<number>(12);
  const [kmSlab, setKmSlab] = useState('');
  const [openingKm, setOpeningKm] = useState<number>(0);
  const [closingKm, setClosingKm] = useState<number>(0);
  const [inTime, setInTime] = useState('08:00');
  const [closureTime, setClosureTime] = useState('20:00');
  const [hoursDaysAsPerContract, setHoursDaysAsPerContract] = useState<number>(1);
  // Retired - overtime is now captured via addHour below instead of a
  // separate Yes/No field (see WarehouseEntry.overtimeVehicle).
  const [overtimeVehicle] = useState('');
  const [extraKm, setExtraKm] = useState<number>(0); // "Add KM" - km beyond kmSlab
  const [addHour, setAddHour] = useState<number>(0); // "Add Hour" - hours beyond fixedHours
  // Rate Configuration - Base Rate/Fuel Cost/Extra KM & Hour Amounts are all
  // auto-computed from these (see computeWarehouseRates), no longer typed
  // directly.
  const [scheduledRate, setScheduledRate] = useState<number>(0);
  const [ratePerExtraKm, setRatePerExtraKm] = useState<number>(0);
  const [ratePerExtraHour, setRatePerExtraHour] = useState<number>(0);
  const [variableCostPerKm, setVariableCostPerKm] = useState<number>(0); // 24 Hrs only
  const [workingMonth, setWorkingMonth] = useState(new Date().toISOString().slice(0, 7));
  const [deductSundays, setDeductSundays] = useState(false);
  const [holidaysCount, setHolidaysCount] = useState<number>(0);
  const [workingDaysOverride, setWorkingDaysOverride] = useState<number | null>(null);
  const [tollCharges, setTollCharges] = useState<number>(0);
  const [parkingCost, setParkingCost] = useState<number>(0);
  const [hybridReeferCost, setHybridReeferCost] = useState<number>(0);
  const [vendorRemarks, setVendorRemarks] = useState('');
  const [newEntryDocs, setNewEntryDocs] = useState<VehicleDocument[]>([]);
  // Ad-hoc 24Hr only - From/To City feeding the flat round-trip route-table
  // lookup (see utils/warehouseRateMatrix24hr.ts) that replaces KM Slab/
  // Working Days for this Deployment Type.
  const [adHocFromCity, setAdHocFromCity] = useState('');
  const [adHocToCity, setAdHocToCity] = useState('');

  // Modal State for Managing/Editing Entry
  const [selectedEntry, setSelectedEntry] = useState<WarehouseEntry | null>(null);
  
  // Modal Edit Fields
  const [editDate, setEditDate] = useState('');
  const [editWarehouseName, setEditWarehouseName] = useState('');
  const [editWarehouseCity, setEditWarehouseCity] = useState('');
  const [editVehicleNumber, setEditVehicleNumber] = useState('');
  const [editVehicleType, setEditVehicleType] = useState('');
  const [editVehicleCategory, setEditVehicleCategory] = useState('');
  const [editDeploymentType, setEditDeploymentType] = useState('');
  const [editPod, setEditPod] = useState('');
  const [editPodCity, setEditPodCity] = useState('');
  const [editFixedHours, setEditFixedHours] = useState<number>(12);
  const [editKmSlab, setEditKmSlab] = useState('');
  const [editOpeningKm, setEditOpeningKm] = useState<number>(0);
  const [editClosingKm, setEditClosingKm] = useState<number>(0);
  const [editInTime, setEditInTime] = useState('');
  const [editClosureTime, setEditClosureTime] = useState('');
  const [editHoursDaysAsPerContract, setEditHoursDaysAsPerContract] = useState<number>(1);
  // Retired - see overtimeVehicle above.
  const [editOvertimeVehicle] = useState('');
  const [editExtraKm, setEditExtraKm] = useState<number>(0); // "Add KM"
  const [editAddHour, setEditAddHour] = useState<number>(0); // "Add Hour"
  const [editScheduledRate, setEditScheduledRate] = useState<number>(0);
  const [editRatePerExtraKm, setEditRatePerExtraKm] = useState<number>(0);
  const [editRatePerExtraHour, setEditRatePerExtraHour] = useState<number>(0);
  const [editVariableCostPerKm, setEditVariableCostPerKm] = useState<number>(0);
  const [editWorkingMonth, setEditWorkingMonth] = useState(new Date().toISOString().slice(0, 7));
  const [editDeductSundays, setEditDeductSundays] = useState(false);
  const [editHolidaysCount, setEditHolidaysCount] = useState<number>(0);
  const [editWorkingDaysOverride, setEditWorkingDaysOverride] = useState<number | null>(null);
  const [editTollCharges, setEditTollCharges] = useState<number>(0);
  const [editParkingCost, setEditParkingCost] = useState<number>(0);
  const [editHybridReeferCost, setEditHybridReeferCost] = useState<number>(0);
  const [editVendorRemarks, setEditVendorRemarks] = useState('');
  const [editAdHocFromCity, setEditAdHocFromCity] = useState('');
  const [editAdHocToCity, setEditAdHocToCity] = useState('');

  // Auto-calculated fields for new entry form
  const kmUtilised = Math.max(0, closingKm - openingKm);
  const workingDaysAuto = computeAutoWorkingDays(workingMonth, deductSundays, holidaysCount);
  const workingDays = resolveWorkingDays(workingDaysAuto, workingDaysOverride);
  const kmSlabNumber = parseFloat(kmSlab) || 0;
  const isAdHoc24 = fixedHours === 24 && deploymentType === 'ad-hoc';
  // Ad-hoc 24Hr: flat round-trip rate from the route table, by From/To City +
  // Vehicle Type/Category ("Hybrid Vehicle" <- Vehicle Category = Hybrid).
  // No match (missing selection, or a genuinely unconfigured combination)
  // means Base Rate is 0, not a leftover formula-based number.
  const matchedAdHocRate = isAdHoc24 ? lookupAdHocRouteRate(adHocFromCity, adHocToCity, vehicleType, vehicleCategory) : null;
  const rates = computeWarehouseRates({
    fixedHours, scheduledRate, workingDays, kmSlab: kmSlabNumber, variableCostPerKm, kmUtilised,
    addKm: extraKm, ratePerExtraKm, addHour, ratePerExtraHour,
    tollCharges, parkingCost, hybridReeferCost,
    flatBaseRateOverride: isAdHoc24 ? (matchedAdHocRate ?? 0) : null
  });
  const { baseRate, fuelCost, extraKmAmount: additionalKmCost, extraHourAmount: additionalHourCost, grandTotal } = rates;
  const finalBaseRate = Math.max(0, baseRate + fuelCost);

  // 12Hr Dedicated fixed Scheduled Rate lookup (see utils/warehouseRateMatrix.ts)
  // - the Warehouse Group is no longer a separate field the user picks; it's
  // derived straight from the selected Warehouse Name (rateGroupForWarehouseName).
  // matchedScheduledRate is null (no auto-fill, Scheduled Rate stays manual)
  // unless fixedHours is 12 and the derived Warehouse Group + Vehicle Type +
  // KM Slab resolve to a configured rate. Re-syncs scheduledRate whenever the
  // match changes, so switching Warehouse Name/Vehicle Type/KM Slab always
  // reflects the right rate.
  const warehouseGroup = rateGroupForWarehouseName(warehouseName) || '';
  const matchedScheduledRate = fixedHours === 12 ? lookupScheduledRate(warehouseGroup, vehicleType, kmSlabNumber) : null;
  // 24Hr Dedicated (Regular, Dry vehicles, BLR only for now) and 24Hr Reefer
  // & Walkes (Regular, by Location + Vehicle) - same auto-fill pattern as
  // the 12Hr lookup above, see utils/warehouseRateMatrix24hr.ts. Neither
  // applies to Ad-hoc (flat route lookup instead, see matchedAdHocRate).
  const isRegular24 = fixedHours === 24 && deploymentType === 'regular';
  const matched24hrDedicatedRate = isRegular24 ? lookup24hrDedicatedRate(warehouseName, vehicleType) : null;
  const matchedReeferWalkesRate = (isRegular24 && !matched24hrDedicatedRate) ? lookupReeferWalkesRate(warehouseName, vehicleType, vehicleCategory) : null;
  useEffect(() => {
    if (matchedScheduledRate != null) setScheduledRate(matchedScheduledRate);
  }, [matchedScheduledRate]);
  useEffect(() => {
    if (matched24hrDedicatedRate) {
      setScheduledRate(matched24hrDedicatedRate.fixed);
      setVariableCostPerKm(matched24hrDedicatedRate.variable);
    } else if (matchedReeferWalkesRate) {
      setScheduledRate(matchedReeferWalkesRate.fc);
      setVariableCostPerKm(matchedReeferWalkesRate.vc);
    }
  }, [matched24hrDedicatedRate, matchedReeferWalkesRate]);

  // Auto-calculated fields for edit modal
  const editKmUtilised = Math.max(0, editClosingKm - editOpeningKm);
  const editWorkingDaysAuto = computeAutoWorkingDays(editWorkingMonth, editDeductSundays, editHolidaysCount);
  const editWorkingDays = resolveWorkingDays(editWorkingDaysAuto, editWorkingDaysOverride);
  const editKmSlabNumber = parseFloat(editKmSlab) || 0;
  const editIsAdHoc24 = editFixedHours === 24 && editDeploymentType === 'ad-hoc';
  const editMatchedAdHocRate = editIsAdHoc24 ? lookupAdHocRouteRate(editAdHocFromCity, editAdHocToCity, editVehicleType, editVehicleCategory) : null;
  const editRates = computeWarehouseRates({
    fixedHours: editFixedHours, scheduledRate: editScheduledRate, workingDays: editWorkingDays, kmSlab: editKmSlabNumber,
    variableCostPerKm: editVariableCostPerKm, kmUtilised: editKmUtilised,
    addKm: editExtraKm, ratePerExtraKm: editRatePerExtraKm, addHour: editAddHour, ratePerExtraHour: editRatePerExtraHour,
    tollCharges: editTollCharges, parkingCost: editParkingCost, hybridReeferCost: editHybridReeferCost,
    flatBaseRateOverride: editIsAdHoc24 ? (editMatchedAdHocRate ?? 0) : null
  });
  const { baseRate: editBaseRate, fuelCost: editFuelCost, extraKmAmount: editAdditionalKmCost, extraHourAmount: editAdditionalHourCost, grandTotal: editGrandTotal } = editRates;
  const editWarehouseGroup = rateGroupForWarehouseName(editWarehouseName) || '';
  const editMatchedScheduledRate = editFixedHours === 12 ? lookupScheduledRate(editWarehouseGroup, editVehicleType, editKmSlabNumber) : null;
  const editIsRegular24 = editFixedHours === 24 && editDeploymentType === 'regular';
  const editMatched24hrDedicatedRate = editIsRegular24 ? lookup24hrDedicatedRate(editWarehouseName, editVehicleType) : null;
  const editMatchedReeferWalkesRate = (editIsRegular24 && !editMatched24hrDedicatedRate) ? lookupReeferWalkesRate(editWarehouseName, editVehicleType, editVehicleCategory) : null;
  useEffect(() => {
    if (editMatchedScheduledRate != null) setEditScheduledRate(editMatchedScheduledRate);
  }, [editMatchedScheduledRate]);
  useEffect(() => {
    if (editMatched24hrDedicatedRate) {
      setEditScheduledRate(editMatched24hrDedicatedRate.fixed);
      setEditVariableCostPerKm(editMatched24hrDedicatedRate.variable);
    } else if (editMatchedReeferWalkesRate) {
      setEditScheduledRate(editMatchedReeferWalkesRate.fc);
      setEditVariableCostPerKm(editMatchedReeferWalkesRate.vc);
    }
  }, [editMatched24hrDedicatedRate, editMatchedReeferWalkesRate]);
  const editFinalBaseRate = Math.max(0, editBaseRate + editFuelCost);

  // 24Hr dedicated vehicles don't have a shift start/end - In Time/Closure
  // Time are forced to "0" and locked read-only while Fixed Hrs is 24; going
  // back to 12Hr restores the normal editable defaults instead of leaving
  // the auto-set "0" sitting there for the office to clear by hand.
  useEffect(() => {
    if (fixedHours === 24) {
      setInTime('0');
      setClosureTime('0');
    } else if (inTime === '0' && closureTime === '0') {
      setInTime('08:00');
      setClosureTime('20:00');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedHours]);

  useEffect(() => {
    if (editFixedHours === 24) {
      setEditInTime('0');
      setEditClosureTime('0');
    } else if (editInTime === '0' && editClosureTime === '0') {
      setEditInTime('08:00');
      setEditClosureTime('20:00');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editFixedHours]);

  // Trigger temporary toast notification
  const triggerNotif = (msg: string) => {
    setNotif(msg);
    setTimeout(() => setNotif(null), 4000);
  };

  // Helper to determine opening KM from previous entries of the selected vehicle number
  useEffect(() => {
    if (vehicleNumber) {
      // Find latest entry for this vehicle
      const vehicleEntries = [...entries]
        .filter(e => e.vehicleNumber?.trim().toLowerCase() === vehicleNumber.trim().toLowerCase())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.slNo - a.slNo);
      
      if (vehicleEntries.length > 0) {
        setOpeningKm(vehicleEntries[0].closingKm || 0);
      } else {
        // Fallback to vehicle's initial odometer if available, otherwise 0
        const matchedVehicle = vehicles.find(v => (v['Reg. No.'] || v.regNo || '').trim().toLowerCase() === vehicleNumber.trim().toLowerCase());
        setOpeningKm(0);
      }
    }
  }, [vehicleNumber, entries, vehicles]);

  // Vehicle Number datalist: registered Fleet vehicles + every vendor
  // vehicle from Vendor Management (vendorVehicleNumbers below) - plenty of
  // warehouse deployments run on vendor-owned trucks that never get a Fleet
  // & Vehicles record.
  const vendorVehicleNumbers = Array.from(new Set(vendors.flatMap(v => v.vehicleNumbers || []))).sort();
  const knownVehicleNumbers = Array.from(new Set([
    ...vehicles.map(v => (v['Reg. No.'] || v.regNo || '').trim()).filter(Boolean),
    ...vendorVehicleNumbers,
  ]));
  const isFleetVehicleNumber = (num: string) =>
    vehicles.some(v => (v['Reg. No.'] || v.regNo || '').trim().toLowerCase() === num.trim().toLowerCase());

  // Handle vehicle number selection to also autofill Type/Category:
  // - Registered in Fleet & Vehicles -> that record is authoritative, always
  //   wins (existing behavior).
  // - Not in Fleet (a vendor-only or ad-hoc vehicle) -> reuse whatever
  //   Type/Category was saved on this vehicle's most recent Warehouse entry,
  //   so it only ever needs to be typed in once; a genuinely first-time
  //   vehicle number is left blank for manual entry instead.
  const handleVehicleChange = (num: string) => {
    setVehicleNumber(num);
    const trimmed = num.trim();
    if (!trimmed) { setVehicleType(''); setVehicleCategory(''); return; }

    const matchedVehicle = vehicles.find(v => (v['Reg. No.'] || v.regNo || '').trim().toLowerCase() === trimmed.toLowerCase());
    if (matchedVehicle) {
      const vType = matchedVehicle.Type || matchedVehicle.type || '';
      const vCategory = matchedVehicle.Category || matchedVehicle.category || '';
      if (vType) setVehicleType(vType);
      if (vCategory) setVehicleCategory(vCategory);
      return;
    }

    const priorEntry = [...entries]
      .filter(e => (e.vehicleNumber || '').trim().toLowerCase() === trimmed.toLowerCase())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.slNo - a.slNo)[0];
    setVehicleType(priorEntry?.vehicleType || '');
    setVehicleCategory(priorEntry?.vehicleCategory || '');
  };

  // Form Submit (New Warehouse Entry)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !warehouseName || !vehicleNumber || !closingKm) {
      alert('Please fill in Date, Warehouse Name, Vehicle Number, and Closing KM.');
      return;
    }

    if (closingKm < openingKm) {
      alert(`Closing KM (${closingKm}) cannot be less than Opening KM (${openingKm}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      // Find next Serial Number
      const nextSlNo = entries.length > 0 ? Math.max(...entries.map(e => e.slNo || 0)) + 1 : 1;

      await onAddEntry({
        slNo: nextSlNo,
        date,
        warehouseName: warehouseName.trim(),
        warehouseCity: warehouseCity.trim(),
        vehicleNumber: vehicleNumber.toUpperCase().trim(),
        vehicleType,
        vehicleCategory,
        deploymentType,
        pod: pod.trim(),
        podCity: podCity.trim(),
        fixedHours,
        kmSlab: kmSlab.trim(),
        openingKm,
        closingKm,
        inTime,
        closureTime,
        kmUtilised,
        hoursDaysAsPerContract,
        overtimeVehicle: overtimeVehicle.trim(),
        extraKm: Number(extraKm),
        baseRate,
        fuelCost,
        finalBaseRate,
        additionalKmCost,
        additionalHourCost,
        tollCharges: Number(tollCharges),
        parkingCost: Number(parkingCost),
        hybridReeferCost: Number(hybridReeferCost),
        grandTotal,
        vendorRemarks: vendorRemarks.trim(),
        documents: newEntryDocs,
        // Rate-calculation inputs - saved alongside the results above so
        // this record still reconciles even after config changes later.
        scheduledRate,
        warehouseGroup: warehouseGroup || undefined,
        workingMonth,
        workingDaysAuto,
        deductSundays,
        holidaysCount,
        workingDaysOverride: workingDaysOverride ?? undefined,
        workingDays,
        ratePerExtraKm,
        addHour: Number(addHour),
        ratePerExtraHour,
        variableCostPerKm,
        adHocFromCity: isAdHoc24 ? (adHocFromCity || undefined) : undefined,
        adHocToCity: isAdHoc24 ? (adHocToCity || undefined) : undefined
      });

      // Reset
      setWarehouseName('');
      setWarehouseCity('');
      setVehicleNumber('');
      setVehicleType('');
      setVehicleCategory('');
      setPod('');
      setPodCity('');
      setKmSlab('');
      setClosingKm(0);
      setHoursDaysAsPerContract(1);
      setExtraKm(0);
      setAddHour(0);
      setScheduledRate(0);
      setRatePerExtraKm(0);
      setRatePerExtraHour(0);
      setVariableCostPerKm(0);
      setWorkingMonth(new Date().toISOString().slice(0, 7));
      setDeductSundays(false);
      setHolidaysCount(0);
      setWorkingDaysOverride(null);
      setTollCharges(0);
      setParkingCost(0);
      setHybridReeferCost(0);
      setVendorRemarks('');
      setNewEntryDocs([]);
      setAdHocFromCity('');
      setAdHocToCity('');
      setShowAddSidebar(false);

      triggerNotif('🏬 New warehouse details log saved & calculated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save warehouse entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Vehicle Number changed mid-edit - same Fleet-first, then last-entry,
  // then blank-for-manual resolution as handleVehicleChange above (the
  // initial values loaded by handleOpenEdit below are just that entry's own
  // saved Type/Category, untouched unless the vehicle number itself changes).
  const handleEditVehicleChange = (num: string) => {
    setEditVehicleNumber(num);
    const trimmed = num.trim();
    if (!trimmed) { setEditVehicleType(''); setEditVehicleCategory(''); return; }

    const matchedVehicle = vehicles.find(v => (v['Reg. No.'] || v.regNo || '').trim().toLowerCase() === trimmed.toLowerCase());
    if (matchedVehicle) {
      const vType = matchedVehicle.Type || matchedVehicle.type || '';
      const vCategory = matchedVehicle.Category || matchedVehicle.category || '';
      if (vType) setEditVehicleType(vType);
      if (vCategory) setEditVehicleCategory(vCategory);
      return;
    }

    const priorEntry = [...entries]
      .filter(e => e.id !== selectedEntry?.id && (e.vehicleNumber || '').trim().toLowerCase() === trimmed.toLowerCase())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.slNo - a.slNo)[0];
    setEditVehicleType(priorEntry?.vehicleType || '');
    setEditVehicleCategory(priorEntry?.vehicleCategory || '');
  };

  // Open Edit Modal
  const handleOpenEdit = (entry: WarehouseEntry) => {
    setSelectedEntry(entry);
    setEditDate(entry.date);
    setEditWarehouseName(entry.warehouseName);
    setEditWarehouseCity(entry.warehouseCity || '');
    setEditVehicleNumber(entry.vehicleNumber);
    setEditVehicleType(entry.vehicleType);
    setEditVehicleCategory(entry.vehicleCategory);
    setEditDeploymentType(entry.deploymentType);
    setEditPod(entry.pod || '');
    setEditPodCity(entry.podCity || '');
    setEditFixedHours(entry.fixedHours);
    setEditKmSlab(entry.kmSlab || '');
    setEditOpeningKm(entry.openingKm);
    setEditClosingKm(entry.closingKm);
    setEditInTime(entry.inTime);
    setEditClosureTime(entry.closureTime);
    setEditHoursDaysAsPerContract(entry.hoursDaysAsPerContract);
    setEditExtraKm(entry.extraKm || 0);
    setEditAddHour(entry.addHour || 0);
    setEditScheduledRate(entry.scheduledRate || 0);
    setEditRatePerExtraKm(entry.ratePerExtraKm || 0);
    setEditRatePerExtraHour(entry.ratePerExtraHour || 0);
    setEditVariableCostPerKm(entry.variableCostPerKm || 0);
    setEditWorkingMonth(entry.workingMonth || new Date().toISOString().slice(0, 7));
    setEditDeductSundays(entry.deductSundays ?? false);
    setEditHolidaysCount(entry.holidaysCount || 0);
    setEditWorkingDaysOverride(entry.workingDaysOverride ?? null);
    setEditTollCharges(entry.tollCharges || 0);
    setEditParkingCost(entry.parkingCost || 0);
    setEditHybridReeferCost(entry.hybridReeferCost || 0);
    setEditVendorRemarks(entry.vendorRemarks || '');
    setEditAdHocFromCity(entry.adHocFromCity || '');
    setEditAdHocToCity(entry.adHocToCity || '');
  };

  // Save Edits
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;

    if (editClosingKm < editOpeningKm) {
      alert(`Closing KM (${editClosingKm}) cannot be less than Opening KM (${editOpeningKm}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedData: Partial<WarehouseEntry> = {
        date: editDate,
        warehouseName: editWarehouseName.trim(),
        warehouseCity: editWarehouseCity.trim(),
        vehicleNumber: editVehicleNumber.toUpperCase().trim(),
        vehicleType: editVehicleType,
        vehicleCategory: editVehicleCategory,
        deploymentType: editDeploymentType,
        pod: editPod.trim(),
        podCity: editPodCity.trim(),
        fixedHours: editFixedHours,
        kmSlab: editKmSlab.trim(),
        openingKm: Number(editOpeningKm),
        closingKm: Number(editClosingKm),
        inTime: editInTime,
        closureTime: editClosureTime,
        kmUtilised: editKmUtilised,
        hoursDaysAsPerContract: Number(editHoursDaysAsPerContract),
        overtimeVehicle: editOvertimeVehicle.trim(),
        extraKm: Number(editExtraKm),
        baseRate: editBaseRate,
        fuelCost: editFuelCost,
        finalBaseRate: editFinalBaseRate,
        additionalKmCost: editAdditionalKmCost,
        additionalHourCost: editAdditionalHourCost,
        tollCharges: Number(editTollCharges),
        parkingCost: Number(editParkingCost),
        hybridReeferCost: Number(editHybridReeferCost),
        grandTotal: editGrandTotal,
        vendorRemarks: editVendorRemarks.trim(),
        scheduledRate: editScheduledRate,
        warehouseGroup: editWarehouseGroup || undefined,
        workingMonth: editWorkingMonth,
        workingDaysAuto: editWorkingDaysAuto,
        deductSundays: editDeductSundays,
        holidaysCount: editHolidaysCount,
        workingDaysOverride: editWorkingDaysOverride ?? undefined,
        workingDays: editWorkingDays,
        ratePerExtraKm: editRatePerExtraKm,
        addHour: Number(editAddHour),
        ratePerExtraHour: editRatePerExtraHour,
        variableCostPerKm: editVariableCostPerKm,
        adHocFromCity: editIsAdHoc24 ? (editAdHocFromCity || undefined) : undefined,
        adHocToCity: editIsAdHoc24 ? (editAdHocToCity || undefined) : undefined
      };

      await onUpdateEntry(selectedEntry.id, updatedData);
      
      setSelectedEntry({
        ...selectedEntry,
        ...updatedData
      });

      triggerNotif('✏️ Warehouse entry log updated and re-computed successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to update warehouse entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Document Attachment updates inside Edit Modal
  const handleUpdateEntryDocs = async (updatedDocs: VehicleDocument[]) => {
    if (!selectedEntry) return;
    try {
      await onUpdateEntry(selectedEntry.id, { documents: updatedDocs });
      setSelectedEntry({
        ...selectedEntry,
        documents: updatedDocs
      });
      triggerNotif('📎 Warehouse entry documents updated.');
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to update warehouse entry documents.');
    }
  };

  // Delete Entry permission check
  const userEmail = user?.email?.toLowerCase().trim();
  const canDelete = !!userEmail && [
    'superapp@kcmlogistics.in',
    'ln.chandana@kcmlogistics.in',
    'anand.n@kcmlogistics.in',
    'chethan@kcmlogistics.in'
  ].includes(userEmail);

  // Delete Entry
  const handleDelete = async (id: string, slNo: number) => {
    if (!canDelete) {
      alert('You do not have permission to delete warehouse entry logs.');
      return;
    }
    if (!confirm(`Are you sure you want to delete warehouse entry SL No. ${slNo}? This cannot be undone.`)) return;
    try {
      await onDeleteEntry(id);
      triggerNotif('🗑️ Warehouse entry log removed.');
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to delete warehouse entry log.');
    }
  };

  // Filter and Search logic
  const filteredEntries = entries.filter(entry => {
    const matchesSearch = 
      (entry.warehouseName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.pod || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.vendorRemarks || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesWarehouse = filterWarehouse === '' || entry.warehouseName === filterWarehouse;
    const matchesVehicleType = filterVehicleType === '' || entry.vehicleType === filterVehicleType;
    const matchesVehicleCategory = filterVehicleCategory === '' || entry.vehicleCategory === filterVehicleCategory;
    const matchesDeploymentType = filterDeploymentType === '' || entry.deploymentType === filterDeploymentType;

    let matchesDate = true;
    if (filterStartDate) {
      matchesDate = matchesDate && new Date(entry.date) >= new Date(filterStartDate);
    }
    if (filterEndDate) {
      matchesDate = matchesDate && new Date(entry.date) <= new Date(filterEndDate);
    }

    return matchesSearch && matchesWarehouse && matchesVehicleType && matchesVehicleCategory && matchesDeploymentType && matchesDate;
  }).sort((a, b) => b.slNo - a.slNo); // Newest first

  // Unique lists for filters
  const uniqueWarehouses = Array.from(new Set(entries.map(e => e.warehouseName).filter(Boolean)));

  // Simple Excel Export helper
  const handleExportCSV = () => {
    if (filteredEntries.length === 0) {
      alert('No records to export.');
      return;
    }
    const data = filteredEntries.map((e, idx) => ({
      'SL No': idx + 1,
      'Date': e.date,
      'Warehouse Name': e.warehouseName,
      'Warehouse City': e.warehouseCity,
      'Vehicle Number': e.vehicleNumber,
      'Vehicle Type': e.vehicleType,
      'Vehicle Category': e.vehicleCategory,
      'Deployment Type': e.deploymentType,
      'From City (Ad-hoc)': e.adHocFromCity || '',
      'To City (Ad-hoc)': e.adHocToCity || '',
      'POD Name': e.pod,
      'POD City': e.podCity,
      'Fixed Hours': e.fixedHours,
      'KM Slab': e.kmSlab,
      'Opening KM': e.openingKm,
      'Closing KM': e.closingKm,
      'KM Utilised': e.kmUtilised,
      'In Time': e.inTime,
      'Closure Time': e.closureTime,
      'Contract Period (Days/Hrs)': e.hoursDaysAsPerContract,
      'Overtime Vehicle': e.overtimeVehicle,
      'Extra KM': e.extraKm,
      'Base Rate': e.baseRate,
      'Fuel Cost': e.fuelCost,
      'Final Base Rate': e.finalBaseRate,
      'Additional KM Cost': e.additionalKmCost,
      'Additional Hour Cost': e.additionalHourCost,
      'Toll Charges': e.tollCharges,
      'Parking Cost': e.parkingCost,
      'Hybrid Reefer Cost': e.hybridReeferCost,
      'Grand Total': e.grandTotal,
      'Vendor Remarks': e.vendorRemarks || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Warehouse Details");
    XLSX.writeFile(workbook, `KCM_Warehouse_Details_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // --- Import (Excel/CSV) - lets the office bulk-load a past month's data
  // instead of re-typing it entry-by-entry. Column headers are matched
  // case/spacing-insensitively against this alias table, which covers this
  // module's own Export Sheet headers exactly (so an exported sheet always
  // re-imports cleanly) plus a handful of common real-world spreadsheet
  // variations. A row is only skipped if it's missing Date, Warehouse Name,
  // Vehicle Number, or Closing KM - the same minimum this module's own Add
  // Entry form requires; everything else defaults sensibly (blank/0) rather
  // than rejecting the whole row over one missing optional column.
  const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
  const WAREHOUSE_IMPORT_ALIASES: Record<string, keyof WarehouseEntry> = {
    date: 'date', deploymentdate: 'date',
    warehousename: 'warehouseName', warehouse: 'warehouseName',
    warehousecity: 'warehouseCity',
    vehiclenumber: 'vehicleNumber', vehicleno: 'vehicleNumber', vehicle: 'vehicleNumber', regno: 'vehicleNumber',
    vehicletype: 'vehicleType', type: 'vehicleType',
    vehiclecategory: 'vehicleCategory', category: 'vehicleCategory',
    deploymenttype: 'deploymentType', deployment: 'deploymentType',
    fromcityadhoc: 'adHocFromCity', fromcity: 'adHocFromCity',
    tocityadhoc: 'adHocToCity', tocity: 'adHocToCity',
    podname: 'pod', pod: 'pod',
    podcity: 'podCity',
    fixedhours: 'fixedHours', fixedhrs: 'fixedHours',
    kmslab: 'kmSlab',
    openingkm: 'openingKm', opening: 'openingKm',
    closingkm: 'closingKm', closing: 'closingKm',
    intime: 'inTime',
    closuretime: 'closureTime', closure: 'closureTime',
    contractperioddayshrs: 'hoursDaysAsPerContract', contractperiod: 'hoursDaysAsPerContract',
    overtimevehicle: 'overtimeVehicle', ot: 'overtimeVehicle', otvehicle: 'overtimeVehicle',
    extrakm: 'extraKm', addkm: 'extraKm',
    baserate: 'baseRate',
    fuelcost: 'fuelCost',
    finalbaserate: 'finalBaseRate',
    additionalkmcost: 'additionalKmCost',
    additionalhourcost: 'additionalHourCost',
    tollcharges: 'tollCharges', tolls: 'tollCharges',
    parkingcost: 'parkingCost', parking: 'parkingCost',
    hybridreefercost: 'hybridReeferCost', hybridreefer: 'hybridReeferCost',
    grandtotal: 'grandTotal',
    vendorremarks: 'vendorRemarks', remarks: 'vendorRemarks',
    scheduledrate: 'scheduledRate',
    warehousegroup: 'warehouseGroup',
  };

  // Tolerant of an already-ISO date, dd.mm.yyyy/dd-mm-yyyy/dd/mm/yyyy (same
  // formats DateInput.tsx's own normalizer accepts), or an Excel date
  // serial number (sheet_to_json's raw:false + dateNF below normally
  // formats these as text already, this is just a safety net).
  const normalizeImportDate = (raw: string | number): string => {
    if (typeof raw === 'number') {
      const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    const s = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
    if (dmy) { const [, d, m, y] = dmy; return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
    return '';
  };

  const [isImporting, setIsImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file: File) => {
    setIsImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, string | number>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });

      let imported = 0;
      let skipped = 0;
      const startingSlNo = entries.length > 0 ? Math.max(...entries.map(e => e.slNo || 0)) : 0;

      for (const row of rows) {
        const mapped: Partial<Record<keyof WarehouseEntry, string | number>> = {};
        Object.entries(row).forEach(([header, value]) => {
          const key = WAREHOUSE_IMPORT_ALIASES[normalizeHeader(header)];
          if (key && value !== '') mapped[key] = value;
        });

        const dateVal = normalizeImportDate(mapped.date ?? '');
        const whName = String(mapped.warehouseName || '').trim();
        const vehNo = String(mapped.vehicleNumber || '').trim().toUpperCase();
        const closingKmVal = Number(mapped.closingKm) || 0;
        if (!dateVal || !whName || !vehNo || !closingKmVal) { skipped++; continue; }

        const openingKmVal = Number(mapped.openingKm) || 0;
        const baseRateVal = Number(mapped.baseRate) || 0;
        const fuelCostVal = Number(mapped.fuelCost) || 0;
        const additionalKmCostVal = Number(mapped.additionalKmCost) || 0;
        const additionalHourCostVal = Number(mapped.additionalHourCost) || 0;
        const tollChargesVal = Number(mapped.tollCharges) || 0;
        const parkingCostVal = Number(mapped.parkingCost) || 0;
        const hybridReeferCostVal = Number(mapped.hybridReeferCost) || 0;

        try {
          await onAddEntry({
            slNo: startingSlNo + imported + 1,
            date: dateVal,
            warehouseName: whName,
            warehouseCity: String(mapped.warehouseCity || '').trim(),
            vehicleNumber: vehNo,
            vehicleType: String(mapped.vehicleType || '').trim(),
            vehicleCategory: String(mapped.vehicleCategory || '').trim(),
            deploymentType: String(mapped.deploymentType || 'regular').trim(),
            adHocFromCity: String(mapped.adHocFromCity || '').trim() || undefined,
            adHocToCity: String(mapped.adHocToCity || '').trim() || undefined,
            pod: String(mapped.pod || '').trim(),
            podCity: String(mapped.podCity || '').trim(),
            fixedHours: Number(mapped.fixedHours) || 12,
            kmSlab: String(mapped.kmSlab || '').trim(),
            openingKm: openingKmVal,
            closingKm: closingKmVal,
            inTime: String(mapped.inTime || '').trim(),
            closureTime: String(mapped.closureTime || '').trim(),
            kmUtilised: Math.max(0, closingKmVal - openingKmVal),
            hoursDaysAsPerContract: Number(mapped.hoursDaysAsPerContract) || 1,
            overtimeVehicle: String(mapped.overtimeVehicle || '').trim(),
            extraKm: Number(mapped.extraKm) || 0,
            baseRate: baseRateVal,
            fuelCost: fuelCostVal,
            finalBaseRate: Number(mapped.finalBaseRate) || round2(baseRateVal + fuelCostVal),
            additionalKmCost: additionalKmCostVal,
            additionalHourCost: additionalHourCostVal,
            tollCharges: tollChargesVal,
            parkingCost: parkingCostVal,
            hybridReeferCost: hybridReeferCostVal,
            grandTotal: Number(mapped.grandTotal) || round2(
              baseRateVal + fuelCostVal + additionalKmCostVal + additionalHourCostVal + tollChargesVal + parkingCostVal + hybridReeferCostVal
            ),
            vendorRemarks: String(mapped.vendorRemarks || '').trim(),
            scheduledRate: mapped.scheduledRate ? Number(mapped.scheduledRate) : undefined,
            warehouseGroup: mapped.warehouseGroup ? String(mapped.warehouseGroup).trim() : undefined,
            documents: []
          });
          imported++;
        } catch {
          skipped++;
        }
      }

      triggerNotif(`📥 Imported ${imported} row${imported === 1 ? '' : 's'}${skipped > 0 ? ` - skipped ${skipped} (missing Date/Warehouse Name/Vehicle Number/Closing KM, or failed to save)` : ''}.`);
    } catch (err) {
      console.error(err);
      alert('Failed to read the import file. Make sure it\'s a valid Excel (.xlsx/.xls) or CSV file with a header row.');
    } finally {
      setIsImporting(false);
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
  };

  // Deployments/Rates switcher - shared between the early return below (Rates
  // tab) and the main return's Header Widget (Deployments tab), so there's
  // one definition instead of two copies drifting apart.
  const moduleTabBar = (
    <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
      {([
        ['deployments', 'Deployments', Warehouse],
        ['rates', 'Rates', Calculator],
      ] as const).map(([key, label, Icon]) => (
        <button key={key} onClick={() => setModuleTab(key)}
          className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
            moduleTab === key ? 'bg-gradient-to-r from-pink-600 to-purple-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}>
          <Icon className="w-3.5 h-3.5" /> {label}
        </button>
      ))}
    </div>
  );

  // Rates tab is a completely separate, much smaller return - safer than
  // threading a conditional through the large Deployments JSX below (every
  // hook above has already run unconditionally by this point, so an early
  // return here doesn't violate the Rules of Hooks). See
  // components/warehouse/RatesSummary.tsx for why this is read-only for now.
  if (moduleTab === 'rates') {
    return (
      <div className="space-y-6" id="warehouse-details-root">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-pink-100/50 shadow-xs">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <Warehouse className="text-pink-600 w-6 h-6" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-purple-800">
                Warehouse Operations Details
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Every rate that drives Log Warehouse Deployment's auto-fills, in one place.
            </p>
          </div>
          {moduleTabBar}
        </div>
        <RatesSummary />
      </div>
    );
  }

  return (
    <div className="space-y-6" id="warehouse-details-root">
      
      {/* Toast Notification */}
      {notif && (
        <div className="fixed bottom-5 right-5 z-50 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-xl border border-emerald-400 flex items-center gap-2 animate-bounce">
          <CheckCircle className="w-4 h-4 text-emerald-300" />
          <span>{notif}</span>
        </div>
      )}

      {/* Header Widget */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-pink-100/50 shadow-xs">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Warehouse className="text-pink-600 w-6 h-6" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-purple-800">
              Warehouse Operations Details
            </span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Maintain deployment records, vehicle slabs, dynamic kilometers utilized, in-out closure logging, and real-time cost sheets.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto flex-wrap">
          {moduleTabBar}
          <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Sheet (Excel)
          </button>
          {/* Import - bulk-loads a past month's data from Excel/CSV instead
              of re-typing it (see handleImportFile above for the column
              matching/skip rules). */}
          <input
            ref={importFileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
          />
          <button
            onClick={() => importFileInputRef.current?.click()}
            disabled={isImporting}
            title="Import a past month's data from Excel/CSV"
            className="bg-white border border-purple-200 hover:bg-purple-50 text-purple-800 font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-all disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? 'Importing...' : 'Import'}
          </button>
          <button
            onClick={() => setShowCloseMonthTool(true)}
            title="12Hr Km Slab is a whole-month KM budget per vehicle - total it up and apply any excess to Add KM"
            className="bg-white border border-purple-200 hover:bg-purple-50 text-purple-800 font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
          >
            <Calculator className="w-4 h-4" />
            Close Month (12Hr)
          </button>
          <button
            onClick={() => setShowAddSidebar(true)}
            className="bg-gradient-to-r from-pink-600 to-purple-800 hover:from-pink-700 hover:to-purple-900 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            Log New Deployment
          </button>
          </div>
        </div>
      </div>

      {showCloseMonthTool && (
        <CloseMonthKmSlab entries={entries} onUpdateEntry={onUpdateEntry} onClose={() => setShowCloseMonthTool(false)} />
      )}

      {/* Ledger - full width; Log New Warehouse Deployment lives in its own
          slide-out sidebar below (triggered by the button above), matching
          Fuel Management/Mileage Report's own +Add Entry pattern, instead of
          sitting open as a permanent left-hand panel. */}
      <div className="space-y-4">

      {/* Slide-out Sidebar: Log New Warehouse Deployment */}
      <AnimatePresence>
        {showAddSidebar && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end z-50">
            <div className="absolute inset-0" onClick={() => setShowAddSidebar(false)} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 border-l border-pink-100"
            >
              <div className="p-4 bg-gradient-to-r from-purple-950 to-pink-950 text-white flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-pink-400" />
                  Log New Warehouse Deployment
                </h2>
                <button onClick={() => setShowAddSidebar(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
              <form id="warehouse-entry-form" onSubmit={handleSubmit} className="space-y-3.5 text-xs text-slate-700">

            {/* 1. Date & Warehouse Name */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Date *</label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <DateInput
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg py-2 pl-8 pr-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Warehouse Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BLR IM1"
                  value={warehouseName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWarehouseName(val);
                    const matchedCity = cityForWarehouseName(val);
                    if (matchedCity) setWarehouseCity(matchedCity); // Auto-fetch city for a known warehouse name; still freely editable/overridable below
                  }}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  list="suggested-warehouses"
                />
                <datalist id="suggested-warehouses">
                  {WAREHOUSE_LOCATIONS.map(w => <option key={w.name} value={w.name} />)}
                </datalist>
              </div>
            </div>

            {/* 2. Warehouse City & Vehicle Number */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Warehouse City</label>
                <input
                  type="text"
                  placeholder="e.g. Bangalore"
                  value={warehouseCity}
                  onChange={(e) => setWarehouseCity(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  list="suggested-warehouse-cities"
                />
                <datalist id="suggested-warehouse-cities">
                  {WAREHOUSE_CITIES.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Vehicle Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KA53D9514"
                  value={vehicleNumber}
                  onChange={(e) => handleVehicleChange(e.target.value)}
                  onKeyDown={(e) => handleVehicleNumberEnterKey(e, vehicleNumber, knownVehicleNumbers, handleVehicleChange)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none uppercase"
                  list="registered-fleet-nums"
                />
                <datalist id="registered-fleet-nums">
                  {vehicles.map((v, idx) => (
                    <option key={v.id || v.regNo || `veh-${idx}`} value={v['Reg. No.'] || v.regNo || ''} />
                  ))}
                  {vendorVehicleNumbers.map((v, idx) => <option key={`vendor-${idx}`} value={v} />)}
                </datalist>
              </div>
            </div>

            {/* 3. Vehicle Type & Vehicle Category - auto-filled+locked for a
                Fleet-registered vehicle; for a vendor/ad-hoc one (see
                handleVehicleChange) these are freely editable, pre-filled
                from that vehicle's last Warehouse entry when it has one. */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">
                  Vehicle Type {isFleetVehicleNumber(vehicleNumber) ? '(Auto)' : ''}
                </label>
                <input
                  type="text"
                  readOnly={isFleetVehicleNumber(vehicleNumber)}
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  placeholder={isFleetVehicleNumber(vehicleNumber) ? 'Linked to Fleet Master' : 'e.g. 17 FT'}
                  list={isFleetVehicleNumber(vehicleNumber) ? undefined : 'warehouse-vehicle-type-suggestions'}
                  className={`w-full border border-purple-100 rounded-lg p-2 text-xs font-bold focus:outline-none ${isFleetVehicleNumber(vehicleNumber) ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-800 focus:ring-2 focus:ring-pink-500'}`}
                />
                <datalist id="warehouse-vehicle-type-suggestions">
                  {VEHICLE_TYPE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">
                  Vehicle Category {isFleetVehicleNumber(vehicleNumber) ? '(Auto)' : ''}
                </label>
                <input
                  type="text"
                  readOnly={isFleetVehicleNumber(vehicleNumber)}
                  value={vehicleCategory}
                  onChange={(e) => setVehicleCategory(e.target.value)}
                  placeholder={isFleetVehicleNumber(vehicleNumber) ? 'Linked to Fleet Master' : 'e.g. Dry'}
                  list={isFleetVehicleNumber(vehicleNumber) ? undefined : 'warehouse-vehicle-category-suggestions'}
                  className={`w-full border border-purple-100 rounded-lg p-2 text-xs font-bold focus:outline-none ${isFleetVehicleNumber(vehicleNumber) ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-800 focus:ring-2 focus:ring-pink-500'}`}
                />
                <datalist id="warehouse-vehicle-category-suggestions">
                  {VEHICLE_CATEGORIES.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            {!isFleetVehicleNumber(vehicleNumber) && vehicleNumber.trim() && (
              <p className="text-[9px] text-purple-400 -mt-1.5">
                Not in Fleet &amp; Vehicles - {vehicleType || vehicleCategory ? 'reused from this vehicle\'s last entry, still' : 'this looks like a first-time vendor vehicle,'} editable above.
              </p>
            )}

            {/* 4. Deployment Type & POD Details */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Deployment</label>
                <select
                  value={deploymentType}
                  onChange={(e) => setDeploymentType(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                >
                  <option value="regular">Regular</option>
                  <option value="ad-hoc">Ad-Hoc</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">POD Name</label>
                <input
                  type="text"
                  placeholder="POD Name"
                  value={pod}
                  onChange={(e) => setPod(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">POD City</label>
                <input
                  type="text"
                  placeholder="POD City"
                  value={podCity}
                  onChange={(e) => setPodCity(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
              </div>
            </div>

            {/* 5. Fixed Hours, Slab & Hours/Days */}
            <div className={`grid gap-2 ${isAdHoc24 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Fixed Hrs</label>
                <select
                  value={fixedHours}
                  onChange={(e) => setFixedHours(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                >
                  <option value={12}>12 hrs</option>
                  <option value={24}>24 hrs</option>
                </select>
              </div>
              {/* Ad-hoc 24Hr is trip-based (flat round-trip rate from a From
                  City/To City/Vehicle lookup, see below) - KM Slab doesn't
                  apply to it at all, so it's hidden rather than left sitting
                  there unused. Every other combination (12Hr, 24Hr Regular)
                  keeps it exactly as before. */}
              {!isAdHoc24 && (
                <div>
                  <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">KM Slab</label>
                  <input
                    type="number"
                    list="km-slab-suggestions"
                    placeholder="e.g. 2000"
                    value={kmSlab}
                    onChange={(e) => setKmSlab(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  />
                  <datalist id="km-slab-suggestions">
                    {KM_SLAB_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
              )}
            </div>

            {/* 6. Opening & Closing KM */}
            <div className="grid grid-cols-2 gap-2 bg-pink-50/30 p-2 rounded-xl border border-pink-100/30">
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Opening KM (Auto)</label>
                <input
                  type="number"
                  value={openingKm}
                  onChange={(e) => setOpeningKm(Number(e.target.value))}
                  className="w-full bg-slate-200 border border-purple-100 rounded-lg p-2 text-xs font-mono font-bold focus:outline-none"
                  placeholder="Odometer"
                />
                <span className="text-[9px] text-pink-500 font-bold block mt-0.5">Calculated from previous entry</span>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Closing KM *</label>
                <input
                  type="number"
                  required
                  value={closingKm || ''}
                  onChange={(e) => setClosingKm(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs font-mono font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none text-purple-950"
                  placeholder="Enter ending KM"
                />
                {closingKm > 0 && (
                  <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                    Utilised: {kmUtilised} KM
                  </span>
                )}
              </div>
            </div>

            {/* 7. In Time & Closure Time & Add KM & Add Hour - Overtime is now
                captured via Add Hour below, so the old OT Vehicle Yes/No
                field is gone here (still shown as-is in reports/exports for
                any entry that already has one). */}
            <div className="grid grid-cols-4 gap-1.5">
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">In Time{fixedHours === 24 ? ' (N/A)' : ''}</label>
                <input
                  type="text"
                  placeholder="08:00"
                  value={inTime}
                  readOnly={fixedHours === 24}
                  onChange={(e) => setInTime(e.target.value)}
                  title={fixedHours === 24 ? "24Hr dedicated vehicles don't have a shift start time" : undefined}
                  className={`w-full border border-purple-100 rounded-lg p-1 text-center font-mono focus:outline-none text-xs ${fixedHours === 24 ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`}
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Closure{fixedHours === 24 ? ' (N/A)' : ''}</label>
                <input
                  type="text"
                  placeholder="20:00"
                  value={closureTime}
                  readOnly={fixedHours === 24}
                  onChange={(e) => setClosureTime(e.target.value)}
                  title={fixedHours === 24 ? "24Hr dedicated vehicles don't have a shift end time" : undefined}
                  className={`w-full border border-purple-100 rounded-lg p-1 text-center font-mono focus:outline-none text-xs ${fixedHours === 24 ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`}
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide" title="km run beyond the KM Slab, e.g. slab 2000 + 100 run over = 100">Add KM</label>
                <input
                  type="number"
                  placeholder="0"
                  value={extraKm || ''}
                  onChange={(e) => setExtraKm(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1 text-xs focus:outline-none"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide" title="hours run beyond Fixed Hrs, e.g. 12 booked + 1 run over = 1">Add Hour</label>
                <input
                  type="number"
                  placeholder="0"
                  value={addHour || ''}
                  onChange={(e) => setAddHour(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1 text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* 8. Rate Configuration - Base Rate/Fuel Cost/Extra KM & Hour
                Amounts below all auto-calculate from these, nothing here is
                typed directly into the totals anymore. */}
            <div className="p-2.5 bg-purple-50/40 rounded-xl border border-purple-100/50 space-y-2">
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">Rate Configuration</span>

              {isAdHoc24 ? (
                <>
                  {/* Ad-hoc 24Hr is trip-based, not formula-based - Base Rate
                      is a direct flat lookup from the round-trip route table
                      (utils/warehouseRateMatrix24hr.ts) by From City + To
                      City + Vehicle, so Scheduled Rate/Variable Cost/Working
                      Days/KM per Day don't apply here at all. "Hybrid
                      Vehicle" in that table is Vehicle Category = Hybrid,
                      not a separate deployment type. */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">From City</label>
                      <select value={adHocFromCity} onChange={(e) => { setAdHocFromCity(e.target.value); setAdHocToCity(''); }}
                        className="w-full bg-white border border-purple-100 rounded-lg p-1.5 text-xs font-bold text-slate-800">
                        <option value="">Select</option>
                        {adHocFromCities().map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">To City</label>
                      <select value={adHocToCity} onChange={(e) => setAdHocToCity(e.target.value)} disabled={!adHocFromCity}
                        className="w-full bg-white border border-purple-100 rounded-lg p-1.5 text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed">
                        <option value="">Select</option>
                        {adHocToCities(adHocFromCity).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Route Rate (₹, flat round-trip)</label>
                    <input type="text" readOnly value={matchedAdHocRate != null ? formatINR(matchedAdHocRate) : ''}
                      placeholder="Select From/To City and Vehicle"
                      className="w-full bg-slate-100 border border-purple-100 rounded-lg p-1.5 text-xs font-bold text-slate-700 cursor-not-allowed" />
                    {adHocFromCity && adHocToCity && matchedAdHocRate == null && (
                      <p className="text-[9px] text-rose-500 font-mono mt-0.5">No rate configured for this route/vehicle combination. Contact admin.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Rate / Extra KM (₹)</label>
                      <input type="number" placeholder="0" value={ratePerExtraKm || ''} onChange={(e) => setRatePerExtraKm(Number(e.target.value))}
                        className="w-full bg-white border border-purple-100 rounded-lg p-1.5 text-xs font-bold text-slate-800" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Rate / Extra Hour (₹)</label>
                      <input type="number" placeholder="0" value={ratePerExtraHour || ''} onChange={(e) => setRatePerExtraHour(Number(e.target.value))}
                        className="w-full bg-white border border-purple-100 rounded-lg p-1.5 text-xs font-bold text-slate-800" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* 12Hr Dedicated / 24Hr Dedicated / 24Hr Reefer & Walkes
                      fixed rate lookups - Vehicle Type (x KM Slab for 12Hr),
                      Warehouse Group/City derived automatically from the
                      Warehouse Name field above (see utils/warehouseRateMatrix.ts
                      and utils/warehouseRateMatrix24hr.ts), no separate
                      selection needed here. A combination with no configured
                      rate leaves Scheduled Rate/Variable Cost as plain manual
                      fields exactly as before. */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Scheduled Rate (₹/month)</label>
                      <input type="number" placeholder="e.g. 75000" value={scheduledRate || ''}
                        readOnly={matchedScheduledRate != null || matched24hrDedicatedRate != null || matchedReeferWalkesRate != null}
                        onChange={(e) => setScheduledRate(Number(e.target.value))}
                        className={`w-full border border-purple-100 rounded-lg p-1.5 text-xs font-bold ${(matchedScheduledRate != null || matched24hrDedicatedRate != null || matchedReeferWalkesRate != null) ? 'bg-slate-100 text-slate-700 cursor-not-allowed' : 'bg-white text-slate-800'}`} />
                      {matchedScheduledRate != null ? (
                        <p className="text-[9px] text-emerald-600 font-mono mt-0.5">Auto-filled from {warehouseGroup}'s 12Hr Dedicated rate table.</p>
                      ) : matched24hrDedicatedRate != null ? (
                        <p className="text-[9px] text-emerald-600 font-mono mt-0.5">Auto-filled from {warehouseGroup}'s 24Hr Dedicated rate table.</p>
                      ) : matchedReeferWalkesRate != null ? (
                        <p className="text-[9px] text-emerald-600 font-mono mt-0.5">Auto-filled from the 24Hr Reefer &amp; Walkes rate table.</p>
                      ) : fixedHours === 12 && warehouseGroup ? (
                        <p className="text-[9px] text-rose-500 font-mono mt-0.5">Rate not configured for this combination. Contact admin.</p>
                      ) : null}
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Rate / Extra KM (₹)</label>
                      <input type="number" placeholder="0" value={ratePerExtraKm || ''} onChange={(e) => setRatePerExtraKm(Number(e.target.value))}
                        className="w-full bg-white border border-purple-100 rounded-lg p-1.5 text-xs font-bold text-slate-800" />
                    </div>
                  </div>
                  <div className={`grid gap-2 ${fixedHours === 24 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <div>
                      <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Rate / Extra Hour (₹)</label>
                      <input type="number" placeholder="0" value={ratePerExtraHour || ''} onChange={(e) => setRatePerExtraHour(Number(e.target.value))}
                        className="w-full bg-white border border-purple-100 rounded-lg p-1.5 text-xs font-bold text-slate-800" />
                    </div>
                    {fixedHours === 24 && (
                      <div>
                        <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Variable Cost (₹/km)</label>
                        <input type="number" placeholder="e.g. 18" value={variableCostPerKm || ''}
                          readOnly={matched24hrDedicatedRate != null || matchedReeferWalkesRate != null}
                          onChange={(e) => setVariableCostPerKm(Number(e.target.value))}
                          className={`w-full border border-purple-100 rounded-lg p-1.5 text-xs font-bold ${(matched24hrDedicatedRate != null || matchedReeferWalkesRate != null) ? 'bg-slate-100 text-slate-700 cursor-not-allowed' : 'bg-white text-slate-800'}`} />
                      </div>
                    )}
                  </div>

                  {/* Working Days - auto-fills from the Month + Year calendar,
                      never hard-coded to 30; stays editable with a Reset to
                      auto link. */}
                  <div className="p-2 bg-white rounded-lg border border-purple-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-purple-700 uppercase tracking-wide">Working Days</span>
                      {workingDaysOverride != null && (
                        <button type="button" onClick={() => setWorkingDaysOverride(null)} className="text-[9px] text-pink-600 hover:text-pink-800 underline cursor-pointer">Reset to auto</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="month" value={workingMonth} onChange={(e) => setWorkingMonth(e.target.value)}
                        className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs font-mono text-slate-800" />
                      <input type="number" min={1} value={workingDaysOverride ?? workingDaysAuto}
                        onChange={(e) => setWorkingDaysOverride(e.target.value ? Number(e.target.value) : null)}
                        className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs font-bold text-slate-800" />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 text-[9px] font-semibold text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={deductSundays} onChange={(e) => setDeductSundays(e.target.checked)} /> Deduct Sundays
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-semibold text-slate-600">Holidays</span>
                        <input type="number" min={0} value={holidaysCount || ''} onChange={(e) => setHolidaysCount(Number(e.target.value) || 0)}
                          className="w-14 bg-slate-50 border border-purple-100 rounded p-1 text-[10px] font-bold text-slate-800" />
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 font-mono">
                      Auto: {workingDaysAuto} days ({daysInMonth(workingMonth)} in month{deductSundays ? ` - ${countSundaysInMonth(workingMonth)} Sundays` : ''}{holidaysCount ? ` - ${holidaysCount} holidays` : ''})
                    </p>
                  </div>

                  {fixedHours === 24 && (
                    <p className="text-[9px] text-slate-400 font-mono">
                      Variable Cost term uses KM Utilised ({kmUtilised} KM = Closing − Opening), shown above under Opening/Closing KM.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* 9. Computed Rates Block - Base Rate, Fuel Cost, Extra KM/Hour
                Amounts are all read-only now (see computeWarehouseRates) -
                Grand Total updates live, no Calculate button. */}
            <div className="p-3 bg-purple-950 text-slate-100 rounded-2xl border border-pink-500/20 shadow-sm space-y-1.5 font-mono">
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-purple-300 block">Base Rate ({fixedHours} Hrs)</span>
                  <span className="font-extrabold text-white text-xs">{formatINR(baseRate)}</span>
                </div>
                <div>
                  <span className="text-purple-300 block">Fuel Cost ({FUEL_COST_PERCENT}%)</span>
                  <span className="font-extrabold text-white text-xs">{formatINR(fuelCost)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-[11px] pt-1">
                <span className="text-pink-300 font-bold uppercase tracking-wider">Final Base Rate:</span>
                <span className="font-extrabold text-white text-xs">{formatINR(finalBaseRate)}</span>
              </div>
              <span className="text-[9px] text-pink-300/60 block leading-tight mb-2">Calculated automatically as (Base Rate + Fuel Cost)</span>

              <div className="h-px bg-pink-500/20" />

              <div className="grid grid-cols-2 gap-2 pt-1.5 text-[10px]">
                <div>
                  <span className="text-purple-300 block">Extra KM Amount</span>
                  <span className="font-bold text-white">{formatINR(additionalKmCost)}</span>
                </div>
                <div>
                  <span className="text-purple-300 block">Extra Hour Amount</span>
                  <span className="font-bold text-white">{formatINR(additionalHourCost)}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 pt-1.5 text-[9.5px]">
                <div>
                  <span className="text-purple-300">Tolls (₹)</span>
                  <input
                    type="number"
                    value={tollCharges || ''}
                    onChange={(e) => setTollCharges(Number(e.target.value))}
                    className="w-full bg-white/10 text-white rounded p-1 text-center font-bold font-mono text-[10px] focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-purple-300">Parking (₹)</span>
                  <input
                    type="number"
                    value={parkingCost || ''}
                    onChange={(e) => setParkingCost(Number(e.target.value))}
                    className="w-full bg-white/10 text-white rounded p-1 text-center font-bold font-mono text-[10px] focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-purple-300">Hybrid Reefer (₹)</span>
                  <input
                    type="number"
                    value={hybridReeferCost || ''}
                    onChange={(e) => setHybridReeferCost(Number(e.target.value))}
                    className="w-full bg-white/10 text-white rounded p-1 text-center font-bold font-mono text-[10px] focus:outline-none"
                  />
                </div>
              </div>

              <div className="h-px bg-pink-500/20 my-2" />

              <div className="flex justify-between items-center pt-1">
                <span className="text-pink-300 font-extrabold uppercase tracking-widest text-xs flex items-center gap-1">
                  <Calculator className="w-3.5 h-3.5" /> Grand Total:
                </span>
                <span className="font-black text-emerald-400 text-sm">{formatINR(grandTotal)}</span>
              </div>
            </div>

            {/* 10. Vendor Remarks */}
            <div>
              <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Vendor Remarks</label>
              <textarea
                placeholder="Enter details, delivery milestones, extra hour reasons..."
                value={vendorRemarks}
                onChange={(e) => setVendorRemarks(e.target.value)}
                className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none h-14"
              />
            </div>

            {/* Document Attachments */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-purple-700 uppercase tracking-wide flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5 text-pink-600" />
                Upload Supporting POD / Documents
              </label>
              <DocumentAttachment 
                documents={newEntryDocs}
                onChange={(docs) => setNewEntryDocs(docs)}
                hideAddFilesButton={true}
              />
            </div>

              </form>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button type="button" onClick={() => setShowAddSidebar(false)} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  form="warehouse-entry-form"
                  disabled={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-pink-600 to-purple-800 hover:from-pink-700 hover:to-purple-900 text-slate-100 font-black py-2.5 px-4 rounded-xl shadow-lg shadow-pink-500/10 cursor-pointer text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Processing Record...' : 'Post Warehouse Details Log'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Tabular LEDGER View of Logs */}
        <div className="space-y-4">

          {/* Filters Bar Widget */}
          <div className="bg-white p-4 rounded-2xl border border-pink-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-purple-50/50 pb-2">
              <span className="text-xs font-black text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-pink-600" />
                Warehouse Filters & Dynamic Queries
              </span>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterWarehouse('');
                  setFilterVehicleType('');
                  setFilterVehicleCategory('');
                  setFilterDeploymentType('');
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
                className="text-[10px] text-pink-600 font-bold hover:underline"
              >
                Reset All Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              
              {/* Warehouse name & Vehicle Type */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase text-purple-800 tracking-wide">Warehouse</label>
                <select
                  value={filterWarehouse}
                  onChange={(e) => setFilterWarehouse(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 focus:outline-none"
                >
                  <option value="">All Warehouses</option>
                  {uniqueWarehouses.map((wh, idx) => (
                    <option key={wh || `wh-filter-${idx}`} value={wh}>{wh}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase text-purple-800 tracking-wide">Vehicle Type</label>
                <select
                  value={filterVehicleType}
                  onChange={(e) => setFilterVehicleType(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 focus:outline-none"
                >
                  <option value="">All Types</option>
                  <option value="tata ace">TATA Ace</option>
                  <option value="bolero">Bolero</option>
                  <option value="tata 407">TATA 407</option>
                  <option value="14ft">14ft</option>
                  <option value="17ft">17ft</option>
                  <option value="20ft">20ft</option>
                  <option value="22ft">22ft</option>
                  <option value="32ft">32ft</option>
                </select>
              </div>

              {/* Category & Deployment */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase text-purple-800 tracking-wide">Category</label>
                <select
                  value={filterVehicleCategory}
                  onChange={(e) => setFilterVehicleCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 focus:outline-none"
                >
                  <option value="">All Categories</option>
                  <option value="dry">Dry</option>
                  <option value="reefer">Reefer</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="walkes">Walkes</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase text-purple-800 tracking-wide">Deployment Type</label>
                <select
                  value={filterDeploymentType}
                  onChange={(e) => setFilterDeploymentType(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 focus:outline-none"
                >
                  <option value="">All Deployments</option>
                  <option value="regular">Regular</option>
                  <option value="ad-hoc">Ad-Hoc</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>

            </div>

            {/* Date Ranges & Search */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1.5">
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase text-purple-800 tracking-wide">Start Date</label>
                <DateInput
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase text-purple-800 tracking-wide">End Date</label>
                <DateInput
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase text-purple-800 tracking-wide">Search Term</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search WH, vehicle, POD Name, remarks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg py-1.5 pl-8 pr-2 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Table Ledger Panel */}
          <div className="bg-white rounded-2xl border border-pink-100 shadow-xs overflow-hidden">
            
            <div className="bg-purple-950 text-slate-100 px-5 py-4 border-b border-pink-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-pink-300">Warehouse Logs Registry</h3>
                <p className="text-[10px] text-slate-300 mt-0.5 font-medium">Viewing {filteredEntries.length} out of {entries.length} recorded deployments</p>
              </div>

              <div className="flex gap-2 font-mono text-[10.5px]">
                <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">
                  <span className="text-purple-300">Total KM Utilised:</span> <strong className="text-emerald-300">{filteredEntries.reduce((acc, curr) => acc + (curr.kmUtilised || 0), 0).toLocaleString()} KM</strong>
                </div>
                <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">
                  <span className="text-purple-300">Grand Total Expense:</span> <strong className="text-pink-300">₹{filteredEntries.reduce((acc, curr) => acc + (curr.grandTotal || 0), 0).toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="p-16 text-center text-slate-400 font-mono text-xs">
                📭 NO WAREHOUSE DEPLOYMENT LOGS MATCHING FILTER CONDITIONS.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-pink-100 text-[10px] text-purple-900 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">SL</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Warehouse / City</th>
                      <th className="py-3 px-3">Vehicle Details</th>
                      <th className="py-3 px-3">Deployment</th>
                      <th className="py-3 px-3">KM Stats</th>
                      <th className="py-3 px-3">In/Out Times</th>
                      <th className="py-3 px-3">POD Info</th>
                      <th className="py-3 px-3 text-right">Grand Total</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-50/50">
                    {filteredEntries.map((e, idx) => (
                      <tr key={e.id || `wh-entry-${e.slNo || idx}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-3.5 px-3 font-medium whitespace-nowrap text-purple-950">{e.date}</td>
                        <td className="py-3.5 px-3">
                          <div className="font-extrabold text-slate-800">{e.warehouseName}</div>
                          <div className="text-[10px] text-slate-400 font-bold">{e.warehouseCity || 'Not specified'}</div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="font-mono font-bold text-slate-900 uppercase bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10.5px]">
                            {e.vehicleNumber}
                          </span>
                          <div className="text-[10px] text-pink-600 font-black uppercase mt-1 tracking-wider">
                            {e.vehicleType} • {e.vehicleCategory}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            e.deploymentType === 'regular' 
                              ? 'bg-purple-100 text-purple-700' 
                              : e.deploymentType === 'ad-hoc' 
                              ? 'bg-amber-100 text-amber-700' 
                              : 'bg-pink-100 text-pink-700'
                          }`}>
                            {e.deploymentType}
                          </span>
                          <div className="text-[10px] font-mono text-slate-400 font-semibold mt-1">Slab: {e.kmSlab || 'N/A'}</div>
                        </td>
                        <td className="py-3.5 px-3 font-mono">
                          <div className="text-slate-500 text-[10px]">C: {e.closingKm} • O: {e.openingKm}</div>
                          <div className="text-emerald-700 font-black text-xs">Utilised: {e.kmUtilised} KM</div>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-700">
                          <div>In: {e.inTime || '-'}</div>
                          <div>Out: {e.closureTime || '-'}</div>
                        </td>
                        <td className="py-3.5 px-3">
                          {e.pod ? (
                            <>
                              <div className="font-bold text-slate-800 text-[11px]">{e.pod}</div>
                              <div className="text-[10px] text-slate-400 font-semibold">{e.podCity || '-'}</div>
                            </>
                          ) : (
                            <span className="text-slate-400 italic">No POD</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-black text-slate-900 text-xs">
                          ₹{e.grandTotal?.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(e)}
                              className="p-1.5 text-purple-700 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit record"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(e.id, idx + 1)}
                                className="p-1.5 text-pink-600 hover:bg-pink-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {e.documents && e.documents.length > 0 && (
                              <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" title="Has attachments" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Edit Modal (Overlaid) */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-purple-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-pink-100 max-w-4xl w-full p-6 relative overflow-hidden my-8">
            <div className="absolute top-0 left-0 right-0 h-2.5 bg-gradient-to-r from-pink-500 to-purple-800" />
            
            <button
              onClick={() => setSelectedEntry(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Warehouse className="text-pink-600 w-5.5 h-5.5" />
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Update Warehouse Entry: SL No. {selectedEntry.slNo}
                </h3>
                <p className="text-[11px] text-slate-400 font-semibold">Editing live corporate operations log for vehicle {selectedEntry.vehicleNumber}</p>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs text-slate-700">
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                
                {/* Dates & WH */}
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Date *</label>
                  <DateInput
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Warehouse Name *</label>
                  <input
                    type="text"
                    required
                    value={editWarehouseName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditWarehouseName(val);
                      const matchedCity = cityForWarehouseName(val);
                      if (matchedCity) setEditWarehouseCity(matchedCity); // Auto-fetch city for a known warehouse name; still freely editable/overridable below
                    }}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                    list="suggested-warehouses-edit"
                  />
                  <datalist id="suggested-warehouses-edit">
                    {WAREHOUSE_LOCATIONS.map(w => <option key={w.name} value={w.name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Warehouse City</label>
                  <input
                    type="text"
                    value={editWarehouseCity}
                    onChange={(e) => setEditWarehouseCity(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                    list="suggested-warehouse-cities-edit"
                  />
                  <datalist id="suggested-warehouse-cities-edit">
                    {WAREHOUSE_CITIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Vehicle Number *</label>
                  <input
                    type="text"
                    required
                    value={editVehicleNumber}
                    onChange={(e) => handleEditVehicleChange(e.target.value)}
                    onKeyDown={(e) => handleVehicleNumberEnterKey(e, editVehicleNumber, knownVehicleNumbers, handleEditVehicleChange)}
                    list="registered-fleet-nums-edit"
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 uppercase focus:ring-1 focus:ring-pink-500 focus:outline-none"
                  />
                  <datalist id="registered-fleet-nums-edit">
                    {vehicles.map((v, idx) => (
                      <option key={v.id || v.regNo || `veh-edit-${idx}`} value={v['Reg. No.'] || v.regNo || ''} />
                    ))}
                    {vendorVehicleNumbers.map((v, idx) => <option key={`vendor-edit-${idx}`} value={v} />)}
                  </datalist>
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">

                {/* Type & Categories - see handleEditVehicleChange: locked
                    Auto for a Fleet-registered vehicle, freely editable
                    (pre-filled from its last entry if any) otherwise. */}
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">
                    Vehicle Type {isFleetVehicleNumber(editVehicleNumber) ? '(Auto)' : ''}
                  </label>
                  <input
                    type="text"
                    readOnly={isFleetVehicleNumber(editVehicleNumber)}
                    value={editVehicleType}
                    onChange={(e) => setEditVehicleType(e.target.value)}
                    placeholder={isFleetVehicleNumber(editVehicleNumber) ? 'Auto-filled from Fleet' : 'e.g. 17 FT'}
                    list={isFleetVehicleNumber(editVehicleNumber) ? undefined : 'warehouse-vehicle-type-suggestions'}
                    className={`w-full border border-purple-100 rounded-lg p-2 font-bold focus:outline-none ${isFleetVehicleNumber(editVehicleNumber) ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-800 focus:ring-1 focus:ring-pink-500'}`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">
                    Vehicle Category {isFleetVehicleNumber(editVehicleNumber) ? '(Auto)' : ''}
                  </label>
                  <input
                    type="text"
                    readOnly={isFleetVehicleNumber(editVehicleNumber)}
                    value={editVehicleCategory}
                    onChange={(e) => setEditVehicleCategory(e.target.value)}
                    placeholder={isFleetVehicleNumber(editVehicleNumber) ? 'Auto-filled from Fleet' : 'e.g. Dry'}
                    list={isFleetVehicleNumber(editVehicleNumber) ? undefined : 'warehouse-vehicle-category-suggestions'}
                    className={`w-full border border-purple-100 rounded-lg p-2 font-bold focus:outline-none ${isFleetVehicleNumber(editVehicleNumber) ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-800 focus:ring-1 focus:ring-pink-500'}`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Deployment Type</label>
                  <select
                    value={editDeploymentType}
                    onChange={(e) => setEditDeploymentType(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  >
                    <option value="regular">Regular</option>
                    <option value="ad-hoc">Ad-Hoc</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Fixed Hours</label>
                  <select
                    value={editFixedHours}
                    onChange={(e) => setEditFixedHours(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  >
                    <option value={12}>12 hrs</option>
                    <option value={24}>24 hrs</option>
                  </select>
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                
                {/* PODs & KM Slab */}
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">POD Name</label>
                  <input
                    type="text"
                    value={editPod}
                    onChange={(e) => setEditPod(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">POD City</label>
                  <input
                    type="text"
                    value={editPodCity}
                    onChange={(e) => setEditPodCity(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                  />
                </div>
                {/* Ad-hoc 24Hr doesn't use KM Slab at all - From/To City
                    (Rate Configuration below) drives its flat route rate
                    instead, same as Add Entry. */}
                {!editIsAdHoc24 && (
                  <div>
                    <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">KM Slab</label>
                    <input
                      type="number"
                      list="km-slab-suggestions-edit"
                      value={editKmSlab}
                      onChange={(e) => setEditKmSlab(e.target.value)}
                      className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                    />
                    <datalist id="km-slab-suggestions-edit">
                      {KM_SLAB_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Contract Quantity</label>
                  <input
                    type="number"
                    value={editHoursDaysAsPerContract}
                    onChange={(e) => setEditHoursDaysAsPerContract(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                  />
                </div>

              </div>

              {/* KM Tracking */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-pink-50/20 p-3 rounded-2xl border border-pink-100/50 font-mono">
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Opening KM (Manual Override)</label>
                  <input
                    type="number"
                    value={editOpeningKm}
                    onChange={(e) => setEditOpeningKm(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 font-mono font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Closing KM *</label>
                  <input
                    type="number"
                    required
                    value={editClosingKm}
                    onChange={(e) => setEditClosingKm(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 font-mono font-bold focus:outline-none text-purple-950"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 mb-1">Odometer Utilised:</span>
                  <div className="text-sm font-black text-emerald-700 pt-1.5">{editKmUtilised} KM utilized</div>
                </div>
                <div className="grid grid-cols-2 gap-1 font-sans">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">In Time{editFixedHours === 24 ? ' (N/A)' : ''}</label>
                    <input
                      type="text"
                      value={editInTime}
                      readOnly={editFixedHours === 24}
                      onChange={(e) => setEditInTime(e.target.value)}
                      title={editFixedHours === 24 ? "24Hr dedicated vehicles don't have a shift start time" : undefined}
                      className={`w-full border border-purple-100 rounded-lg p-1.5 font-mono ${editFixedHours === 24 ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Closure{editFixedHours === 24 ? ' (N/A)' : ''}</label>
                    <input
                      type="text"
                      value={editClosureTime}
                      readOnly={editFixedHours === 24}
                      onChange={(e) => setEditClosureTime(e.target.value)}
                      title={editFixedHours === 24 ? "24Hr dedicated vehicles don't have a shift end time" : undefined}
                      className={`w-full border border-purple-100 rounded-lg p-1.5 font-mono ${editFixedHours === 24 ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Add KM / Add Hour - Overtime is now captured via Add Hour
                  instead of the old separate OT Vehicle Yes/No field. */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1" title="km run beyond the KM Slab">Add KM</label>
                  <input
                    type="number"
                    value={editExtraKm}
                    onChange={(e) => setEditExtraKm(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1" title="hours run beyond Fixed Hours">Add Hour</label>
                  <input
                    type="number"
                    value={editAddHour}
                    onChange={(e) => setEditAddHour(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Vendor Remarks</label>
                  <input
                    type="text"
                    value={editVendorRemarks}
                    onChange={(e) => setEditVendorRemarks(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2"
                  />
                </div>
              </div>

              {/* Rate Configuration - same auto-calc system as Add Entry.
                  Note for legacy records saved before this system existed:
                  their original Base Rate/Grand Total stay exactly as
                  already stored in reports/exports until Scheduled Rate
                  etc. are entered here and this edit is saved. */}
              <div className="p-3 bg-purple-50/40 rounded-xl border border-purple-100/50 space-y-2 text-xs">
                <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">Rate Configuration</span>

                {editIsAdHoc24 ? (
                  <>
                    {/* Ad-hoc 24Hr - flat route-table lookup, same as Add
                        Entry (see utils/warehouseRateMatrix24hr.ts). */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">From City</label>
                        <select value={editAdHocFromCity} onChange={(e) => { setEditAdHocFromCity(e.target.value); setEditAdHocToCity(''); }}
                          className="w-full bg-white border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800">
                          <option value="">Select</option>
                          {adHocFromCities().map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">To City</label>
                        <select value={editAdHocToCity} onChange={(e) => setEditAdHocToCity(e.target.value)} disabled={!editAdHocFromCity}
                          className="w-full bg-white border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed">
                          <option value="">Select</option>
                          {adHocToCities(editAdHocFromCity).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Route Rate (₹, flat round-trip)</label>
                      <input type="text" readOnly value={editMatchedAdHocRate != null ? formatINR(editMatchedAdHocRate) : ''}
                        placeholder="Select From/To City and Vehicle"
                        className="w-full bg-slate-100 border border-purple-100 rounded-lg p-1.5 font-bold text-slate-700 cursor-not-allowed" />
                      {editAdHocFromCity && editAdHocToCity && editMatchedAdHocRate == null && (
                        <p className="text-[9px] text-rose-500 font-mono mt-0.5">No rate configured for this route/vehicle combination. Contact admin.</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Rate / Extra KM</label>
                        <input type="number" value={editRatePerExtraKm || ''} onChange={(e) => setEditRatePerExtraKm(Number(e.target.value))}
                          className="w-full bg-white border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Rate / Extra Hour</label>
                        <input type="number" value={editRatePerExtraHour || ''} onChange={(e) => setEditRatePerExtraHour(Number(e.target.value))}
                          className="w-full bg-white border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800" />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Warehouse Group/City is derived automatically from
                        Warehouse Name above - no separate selection here. */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Scheduled Rate (₹/mo)</label>
                        <input type="number" value={editScheduledRate || ''}
                          readOnly={editMatchedScheduledRate != null || editMatched24hrDedicatedRate != null || editMatchedReeferWalkesRate != null}
                          onChange={(e) => setEditScheduledRate(Number(e.target.value))}
                          className={`w-full border border-purple-100 rounded-lg p-1.5 font-bold ${(editMatchedScheduledRate != null || editMatched24hrDedicatedRate != null || editMatchedReeferWalkesRate != null) ? 'bg-slate-100 text-slate-700 cursor-not-allowed' : 'bg-white text-slate-800'}`} />
                        {editMatchedScheduledRate != null ? (
                          <p className="text-[9px] text-emerald-600 font-mono mt-0.5">Auto-filled from {editWarehouseGroup}'s rate table.</p>
                        ) : editMatched24hrDedicatedRate != null ? (
                          <p className="text-[9px] text-emerald-600 font-mono mt-0.5">Auto-filled from {editWarehouseGroup}'s 24Hr Dedicated rate table.</p>
                        ) : editMatchedReeferWalkesRate != null ? (
                          <p className="text-[9px] text-emerald-600 font-mono mt-0.5">Auto-filled from the 24Hr Reefer &amp; Walkes rate table.</p>
                        ) : editFixedHours === 12 && editWarehouseGroup ? (
                          <p className="text-[9px] text-rose-500 font-mono mt-0.5">Rate not configured for this combination. Contact admin.</p>
                        ) : null}
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Rate / Extra KM</label>
                        <input type="number" value={editRatePerExtraKm || ''} onChange={(e) => setEditRatePerExtraKm(Number(e.target.value))}
                          className="w-full bg-white border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Rate / Extra Hour</label>
                        <input type="number" value={editRatePerExtraHour || ''} onChange={(e) => setEditRatePerExtraHour(Number(e.target.value))}
                          className="w-full bg-white border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800" />
                      </div>
                      {editFixedHours === 24 && (
                        <div>
                          <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Variable Cost (₹/km)</label>
                          <input type="number" value={editVariableCostPerKm || ''}
                            readOnly={editMatched24hrDedicatedRate != null || editMatchedReeferWalkesRate != null}
                            onChange={(e) => setEditVariableCostPerKm(Number(e.target.value))}
                            className={`w-full border border-purple-100 rounded-lg p-1.5 font-bold ${(editMatched24hrDedicatedRate != null || editMatchedReeferWalkesRate != null) ? 'bg-slate-100 text-slate-700 cursor-not-allowed' : 'bg-white text-slate-800'}`} />
                        </div>
                      )}
                    </div>

                    <div className="p-2 bg-white rounded-lg border border-purple-100 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-purple-700 uppercase tracking-wide">Working Days</span>
                        {editWorkingDaysOverride != null && (
                          <button type="button" onClick={() => setEditWorkingDaysOverride(null)} className="text-[9px] text-pink-600 hover:text-pink-800 underline cursor-pointer">Reset to auto</button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="month" value={editWorkingMonth} onChange={(e) => setEditWorkingMonth(e.target.value)}
                          className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 font-mono text-slate-800" />
                        <input type="number" min={1} value={editWorkingDaysOverride ?? editWorkingDaysAuto}
                          onChange={(e) => setEditWorkingDaysOverride(e.target.value ? Number(e.target.value) : null)}
                          className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800" />
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 text-[9px] font-semibold text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={editDeductSundays} onChange={(e) => setEditDeductSundays(e.target.checked)} /> Deduct Sundays
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-semibold text-slate-600">Holidays</span>
                          <input type="number" min={0} value={editHolidaysCount || ''} onChange={(e) => setEditHolidaysCount(Number(e.target.value) || 0)}
                            className="w-14 bg-slate-50 border border-purple-100 rounded p-1 text-[10px] font-bold text-slate-800" />
                        </div>
                      </div>
                      <p className="text-[9px] text-slate-400 font-mono">Auto: {editWorkingDaysAuto} days</p>
                    </div>

                    {editFixedHours === 24 && (
                      <p className="text-[9px] text-slate-400 font-mono">
                        Variable Cost term uses KM Utilised ({editKmUtilised} KM = Closing − Opening).
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Costing parameters & Calculations */}
              <div className="p-4 bg-purple-950 text-slate-100 rounded-2xl border border-pink-500/20 grid grid-cols-1 md:grid-cols-12 gap-4 font-mono">

                <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-[9.5px]">
                  <div>
                    <span className="text-purple-300 block mb-1">Base Rate ({editFixedHours} Hrs)</span>
                    <div className="bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px]">{formatINR(editBaseRate)}</div>
                  </div>
                  <div>
                    <span className="text-purple-300 block mb-1">Fuel Cost ({FUEL_COST_PERCENT}%)</span>
                    <div className="bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px]">{formatINR(editFuelCost)}</div>
                  </div>
                  <div>
                    <span className="text-purple-300 block mb-1">Extra KM Amount</span>
                    <div className="bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px]">{formatINR(editAdditionalKmCost)}</div>
                  </div>
                  <div>
                    <span className="text-purple-300 block mb-1">Extra Hour Amount</span>
                    <div className="bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px]">{formatINR(editAdditionalHourCost)}</div>
                  </div>

                  <div>
                    <span className="text-purple-300 block mb-1">Tolls (₹)</span>
                    <input
                      type="number"
                      value={editTollCharges || ''}
                      onChange={(e) => setEditTollCharges(Number(e.target.value))}
                      className="w-full bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-purple-300 block mb-1">Parking (₹)</span>
                    <input
                      type="number"
                      value={editParkingCost || ''}
                      onChange={(e) => setEditParkingCost(Number(e.target.value))}
                      className="w-full bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-purple-300 block mb-1">Hybrid Reefer (₹)</span>
                    <input
                      type="number"
                      value={editHybridReeferCost || ''}
                      onChange={(e) => setEditHybridReeferCost(Number(e.target.value))}
                      className="w-full bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-purple-300 block mb-1">Final Base (₹)</span>
                    <div className="bg-white/5 text-pink-300 rounded p-1.5 text-center font-bold font-mono text-[11px] border border-white/5">
                      {formatINR(editFinalBaseRate)}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-4 bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col justify-center items-center text-center">
                  <span className="text-pink-300 font-extrabold uppercase tracking-widest text-[10px] mb-1">Re-calculated Grand Total</span>
                  <span className="font-black text-emerald-400 text-lg">{formatINR(editGrandTotal)}</span>
                  <span className="text-[9px] text-slate-300 mt-1 leading-normal">Base Rate + Fuel Cost + Extra KM + Extra Hour + toll/parking/hybrid-reefer logs.</span>
                </div>

              </div>

              {/* File Documents for Selected Entry */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide">
                  Attached Invoices / POD Receipts
                </label>
                <DocumentAttachment 
                  documents={selectedEntry.documents || []}
                  onChange={handleUpdateEntryDocs}
                  hideAddFilesButton={true}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-pink-50/50">
                <button
                  type="button"
                  onClick={() => setSelectedEntry(null)}
                  className="px-4 py-2.5 rounded-xl border border-purple-100 hover:bg-purple-50 text-slate-600 font-bold transition-all text-xs"
                >
                  Close Editor
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-gradient-to-r from-pink-600 to-purple-800 hover:from-pink-700 hover:to-purple-900 text-slate-100 font-black px-6 py-2.5 rounded-xl transition-all shadow-lg text-xs uppercase cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : 'Apply Modifications'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
