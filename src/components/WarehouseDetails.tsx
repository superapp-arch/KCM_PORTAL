import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { WarehouseEntry, VehicleDocument, Vehicle, User } from '../types';
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

interface WarehouseDetailsProps {
  user: User;
  entries: WarehouseEntry[];
  vehicles: Vehicle[];
  onAddEntry: (entry: Omit<WarehouseEntry, 'id'>) => Promise<void>;
  onUpdateEntry: (id: string, entry: Partial<WarehouseEntry>) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
}

export default function WarehouseDetails({ 
  user,
  entries, 
  vehicles, 
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

  // Form State for Adding New Entry
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseCity, setWarehouseCity] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('17ft');
  const [vehicleCategory, setVehicleCategory] = useState('dry');
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
  const [overtimeVehicle, setOvertimeVehicle] = useState('No');
  const [extraKm, setExtraKm] = useState<number>(0);
  const [baseRate, setBaseRate] = useState<number>(0);
  const [fuelCost, setFuelCost] = useState<number>(0);
  const [additionalKmCost, setAdditionalKmCost] = useState<number>(0);
  const [additionalHourCost, setAdditionalHourCost] = useState<number>(0);
  const [tollCharges, setTollCharges] = useState<number>(0);
  const [parkingCost, setParkingCost] = useState<number>(0);
  const [hybridReeferCost, setHybridReeferCost] = useState<number>(0);
  const [vendorRemarks, setVendorRemarks] = useState('');
  const [newEntryDocs, setNewEntryDocs] = useState<VehicleDocument[]>([]);

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
  const [editOvertimeVehicle, setEditOvertimeVehicle] = useState('');
  const [editExtraKm, setEditExtraKm] = useState<number>(0);
  const [editBaseRate, setEditBaseRate] = useState<number>(0);
  const [editFuelCost, setEditFuelCost] = useState<number>(0);
  const [editAdditionalKmCost, setEditAdditionalKmCost] = useState<number>(0);
  const [editAdditionalHourCost, setEditAdditionalHourCost] = useState<number>(0);
  const [editTollCharges, setEditTollCharges] = useState<number>(0);
  const [editParkingCost, setEditParkingCost] = useState<number>(0);
  const [editHybridReeferCost, setEditHybridReeferCost] = useState<number>(0);
  const [editVendorRemarks, setEditVendorRemarks] = useState('');

  // Auto-calculated fields for new entry form
  const kmUtilised = Math.max(0, closingKm - openingKm);
  const finalBaseRate = Math.max(0, Number(baseRate) + Number(fuelCost));
  const grandTotal = Math.max(0, 
    finalBaseRate + 
    Number(additionalKmCost) + 
    Number(additionalHourCost) + 
    Number(tollCharges) + 
    Number(parkingCost) + 
    Number(hybridReeferCost)
  );

  // Auto-calculated fields for edit modal
  const editKmUtilised = Math.max(0, editClosingKm - editOpeningKm);
  const editFinalBaseRate = Math.max(0, Number(editBaseRate) + Number(editFuelCost));
  const editGrandTotal = Math.max(0, 
    editFinalBaseRate + 
    Number(editAdditionalKmCost) + 
    Number(editAdditionalHourCost) + 
    Number(editTollCharges) + 
    Number(editParkingCost) + 
    Number(editHybridReeferCost)
  );

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

  // Handle vehicle number selection to also autofill its registered type/category
  const handleVehicleChange = (num: string) => {
    setVehicleNumber(num);
    const matchedVehicle = vehicles.find(v => (v['Reg. No.'] || v.regNo || '').trim().toLowerCase() === num.trim().toLowerCase());
    if (matchedVehicle) {
      const vType = matchedVehicle.Type || matchedVehicle.type || '';
      const vCategory = matchedVehicle.Category || matchedVehicle.category || '';
      if (vType) {
        setVehicleType(vType);
      }
      if (vCategory) {
        setVehicleCategory(vCategory);
      }
    }
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
        baseRate: Number(baseRate),
        fuelCost: Number(fuelCost),
        finalBaseRate,
        additionalKmCost: Number(additionalKmCost),
        additionalHourCost: Number(additionalHourCost),
        tollCharges: Number(tollCharges),
        parkingCost: Number(parkingCost),
        hybridReeferCost: Number(hybridReeferCost),
        grandTotal,
        vendorRemarks: vendorRemarks.trim(),
        documents: newEntryDocs
      });

      // Reset
      setWarehouseName('');
      setWarehouseCity('');
      setVehicleNumber('');
      setPod('');
      setPodCity('');
      setKmSlab('');
      setClosingKm(0);
      setHoursDaysAsPerContract(1);
      setOvertimeVehicle('No');
      setExtraKm(0);
      setBaseRate(0);
      setFuelCost(0);
      setAdditionalKmCost(0);
      setAdditionalHourCost(0);
      setTollCharges(0);
      setParkingCost(0);
      setHybridReeferCost(0);
      setVendorRemarks('');
      setNewEntryDocs([]);

      triggerNotif('🏬 New warehouse details log saved & calculated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save warehouse entry.');
    } finally {
      setIsSubmitting(false);
    }
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
    setEditOvertimeVehicle(entry.overtimeVehicle || '');
    setEditExtraKm(entry.extraKm || 0);
    setEditBaseRate(entry.baseRate || 0);
    setEditFuelCost(entry.fuelCost || 0);
    setEditAdditionalKmCost(entry.additionalKmCost || 0);
    setEditAdditionalHourCost(entry.additionalHourCost || 0);
    setEditTollCharges(entry.tollCharges || 0);
    setEditParkingCost(entry.parkingCost || 0);
    setEditHybridReeferCost(entry.hybridReeferCost || 0);
    setEditVendorRemarks(entry.vendorRemarks || '');
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
        baseRate: Number(editBaseRate),
        fuelCost: Number(editFuelCost),
        finalBaseRate: editFinalBaseRate,
        additionalKmCost: Number(editAdditionalKmCost),
        additionalHourCost: Number(editAdditionalHourCost),
        tollCharges: Number(editTollCharges),
        parkingCost: Number(editParkingCost),
        hybridReeferCost: Number(editHybridReeferCost),
        grandTotal: editGrandTotal,
        vendorRemarks: editVendorRemarks.trim()
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
    const data = filteredEntries.map(e => ({
      'SL No': e.slNo,
      'Date': e.date,
      'Warehouse Name': e.warehouseName,
      'Warehouse City': e.warehouseCity,
      'Vehicle Number': e.vehicleNumber,
      'Vehicle Type': e.vehicleType,
      'Vehicle Category': e.vehicleCategory,
      'Deployment Type': e.deploymentType,
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

        <button
          onClick={handleExportCSV}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-all shrink-0 self-start sm:self-auto"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export Sheet (Excel)
        </button>
      </div>

      {/* Main Grid: Form Left, Table Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Create Entry Form Panel */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-pink-100 p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-black text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-pink-600" />
            Log New Warehouse Deployment
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs text-slate-700">
            
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
                  placeholder="e.g. Amazon Sort WH"
                  value={warehouseName}
                  onChange={(e) => setWarehouseName(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  list="suggested-warehouses"
                />
                <datalist id="suggested-warehouses">
                  <option value="Flipkart WH 1" />
                  <option value="Amazon Sort Center" />
                  <option value="Swiggy Instamart Warehouse" />
                  <option value="RIL F&V Depot" />
                  <option value="KCM General Hub" />
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setWarehouseCity(val);
                    setPodCity(val); // Auto-apply to pod city
                  }}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Vehicle Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KA53D9514"
                  value={vehicleNumber}
                  onChange={(e) => handleVehicleChange(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none uppercase"
                  list="registered-fleet-nums"
                />
                <datalist id="registered-fleet-nums">
                  {vehicles.map((v, idx) => (
                    <option key={v.id || v.regNo || `veh-${idx}`} value={v['Reg. No.'] || v.regNo || ''} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* 3. Vehicle Type & Vehicle Category */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Vehicle Type (Auto)</label>
                <input
                  type="text"
                  readOnly
                  value={vehicleType}
                  placeholder="Linked to Fleet Master"
                  className="w-full bg-slate-100 border border-purple-100 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Vehicle Category (Auto)</label>
                <input
                  type="text"
                  readOnly
                  value={vehicleCategory}
                  placeholder="Linked to Fleet Master"
                  className="w-full bg-slate-100 border border-purple-100 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none"
                />
              </div>
            </div>

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
            <div className="grid grid-cols-2 gap-2">
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
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">KM Slab</label>
                <input
                  type="text"
                  placeholder="e.g. 100km"
                  value={kmSlab}
                  onChange={(e) => setKmSlab(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
              </div>
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

            {/* 7. In Time & Closure Time & Overtime & Extra KM */}
            <div className="grid grid-cols-4 gap-1.5">
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">In Time</label>
                <input
                  type="text"
                  placeholder="08:00"
                  value={inTime}
                  onChange={(e) => setInTime(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1 text-center font-mono focus:outline-none text-xs"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Closure</label>
                <input
                  type="text"
                  placeholder="20:00"
                  value={closureTime}
                  onChange={(e) => setClosureTime(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1 text-center font-mono focus:outline-none text-xs"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">OT Vehicle</label>
                <input
                  type="text"
                  placeholder="e.g. Yes / 2h"
                  value={overtimeVehicle}
                  onChange={(e) => setOvertimeVehicle(e.target.value)}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1 text-xs focus:outline-none"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Extra KM</label>
                <input
                  type="number"
                  placeholder="0"
                  value={extraKm || ''}
                  onChange={(e) => setExtraKm(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1 text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* 8. Costs: Base Rate & Fuel Cost */}
            <div className="grid grid-cols-2 gap-2 bg-purple-50/40 p-2.5 rounded-xl border border-purple-100/50">
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Base Rate (₹)</label>
                <input
                  type="number"
                  placeholder="Base Rate"
                  value={baseRate || ''}
                  onChange={(e) => setBaseRate(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Fuel Cost (₹)</label>
                <input
                  type="number"
                  placeholder="Fuel Cost"
                  value={fuelCost || ''}
                  onChange={(e) => setFuelCost(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs font-bold text-slate-800"
                />
              </div>
            </div>

            {/* 9. Computed Rates Block */}
            <div className="p-3 bg-purple-950 text-slate-100 rounded-2xl border border-pink-500/20 shadow-sm space-y-1.5 font-mono">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-pink-300 font-bold uppercase tracking-wider">Final Base Rate:</span>
                <span className="font-extrabold text-white text-xs">₹{finalBaseRate.toLocaleString('en-IN')}</span>
              </div>
              <span className="text-[9px] text-pink-300/60 block leading-tight mb-2">Calculated automatically as (Base Rate + Fuel Cost)</span>
              
              <div className="h-px bg-pink-500/20" />
              
              <div className="grid grid-cols-3 gap-1 pt-1.5 text-[9.5px]">
                <div>
                  <span className="text-purple-300">Add KM (₹)</span>
                  <input
                    type="number"
                    value={additionalKmCost || ''}
                    onChange={(e) => setAdditionalKmCost(Number(e.target.value))}
                    className="w-full bg-white/10 text-white rounded p-1 text-center font-bold font-mono text-[10px] focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-purple-300">Add Hour (₹)</span>
                  <input
                    type="number"
                    value={additionalHourCost || ''}
                    onChange={(e) => setAdditionalHourCost(Number(e.target.value))}
                    className="w-full bg-white/10 text-white rounded p-1 text-center font-bold font-mono text-[10px] focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-purple-300">Tolls (₹)</span>
                  <input
                    type="number"
                    value={tollCharges || ''}
                    onChange={(e) => setTollCharges(Number(e.target.value))}
                    className="w-full bg-white/10 text-white rounded p-1 text-center font-bold font-mono text-[10px] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1.5 text-[9.5px]">
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
                <span className="font-black text-emerald-400 text-sm">₹{grandTotal.toLocaleString('en-IN')}</span>
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-800 hover:from-pink-700 hover:to-purple-900 text-slate-100 font-black py-2.5 px-4 rounded-xl shadow-lg shadow-pink-500/10 cursor-pointer text-xs uppercase tracking-wider transition-all disabled:opacity-50 mt-2"
            >
              {isSubmitting ? 'Processing Record...' : 'Post Warehouse Details Log'}
            </button>

          </form>
        </div>

        {/* Right Side: Tabular LEDGER View of Logs */}
        <div className="lg:col-span-8 space-y-4">
          
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
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-400">{e.slNo}</td>
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
                                onClick={() => handleDelete(e.id, e.slNo)}
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
                    onChange={(e) => setEditWarehouseName(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Warehouse City</label>
                  <input
                    type="text"
                    value={editWarehouseCity}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditWarehouseCity(val);
                      setEditPodCity(val); // Auto-fill POD city
                    }}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Vehicle Number *</label>
                  <input
                    type="text"
                    required
                    value={editVehicleNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditVehicleNumber(val);
                      const matched = vehicles.find(v => (v['Reg. No.'] || v.regNo || '').trim().toLowerCase() === val.trim().toLowerCase());
                      if (matched) {
                        const vType = matched.Type || matched.type || '';
                        const vCategory = matched.Category || matched.category || '';
                        if (vType) setEditVehicleType(vType);
                        if (vCategory) setEditVehicleCategory(vCategory);
                      }
                    }}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 uppercase focus:ring-1 focus:ring-pink-500 focus:outline-none"
                  />
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                
                {/* Type & Categories */}
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Vehicle Type (Auto)</label>
                  <input
                    type="text"
                    readOnly
                    value={editVehicleType}
                    placeholder="Auto-filled from Fleet"
                    className="w-full bg-slate-100 border border-purple-100 rounded-lg p-2 font-bold text-slate-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Vehicle Category (Auto)</label>
                  <input
                    type="text"
                    readOnly
                    value={editVehicleCategory}
                    placeholder="Auto-filled from Fleet"
                    className="w-full bg-slate-100 border border-purple-100 rounded-lg p-2 font-bold text-slate-700 focus:outline-none"
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
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">KM Slab</label>
                  <input
                    type="text"
                    value={editKmSlab}
                    onChange={(e) => setEditKmSlab(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 focus:ring-1 focus:ring-pink-500 focus:outline-none"
                  />
                </div>
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
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">In Time</label>
                    <input
                      type="text"
                      value={editInTime}
                      onChange={(e) => setEditInTime(e.target.value)}
                      className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Closure</label>
                    <input
                      type="text"
                      value={editClosureTime}
                      onChange={(e) => setEditClosureTime(e.target.value)}
                      className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* OT and Extra KM */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Overtime Vehicle</label>
                  <input
                    type="text"
                    value={editOvertimeVehicle}
                    onChange={(e) => setEditOvertimeVehicle(e.target.value)}
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-800 uppercase tracking-wide mb-1">Extra KM Run</label>
                  <input
                    type="number"
                    value={editExtraKm}
                    onChange={(e) => setEditExtraKm(Number(e.target.value))}
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

              {/* Costing parameters & Calculations */}
              <div className="p-4 bg-purple-950 text-slate-100 rounded-2xl border border-pink-500/20 grid grid-cols-1 md:grid-cols-12 gap-4 font-mono">
                
                <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-[9.5px]">
                  <div>
                    <span className="text-purple-300 block mb-1">Base Rate (₹)</span>
                    <input
                      type="number"
                      value={editBaseRate || ''}
                      onChange={(e) => setEditBaseRate(Number(e.target.value))}
                      className="w-full bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-purple-300 block mb-1">Fuel Cost (₹)</span>
                    <input
                      type="number"
                      value={editFuelCost || ''}
                      onChange={(e) => setEditFuelCost(Number(e.target.value))}
                      className="w-full bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-purple-300 block mb-1">Add KM (₹)</span>
                    <input
                      type="number"
                      value={editAdditionalKmCost || ''}
                      onChange={(e) => setEditAdditionalKmCost(Number(e.target.value))}
                      className="w-full bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-purple-300 block mb-1">Add Hour (₹)</span>
                    <input
                      type="number"
                      value={editAdditionalHourCost || ''}
                      onChange={(e) => setEditAdditionalHourCost(Number(e.target.value))}
                      className="w-full bg-white/10 text-white rounded p-1.5 font-extrabold text-center text-[10.5px] focus:outline-none"
                    />
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
                      ₹{editFinalBaseRate}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-4 bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col justify-center items-center text-center">
                  <span className="text-pink-300 font-extrabold uppercase tracking-widest text-[10px] mb-1">Re-calculated Grand Total</span>
                  <span className="font-black text-emerald-400 text-lg">₹{editGrandTotal.toLocaleString('en-IN')}</span>
                  <span className="text-[9px] text-slate-300 mt-1 leading-normal">Sums final base rate, extra KM, extra hours, toll & parking logs.</span>
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
