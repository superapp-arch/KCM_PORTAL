import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { Vehicle, VehicleDocument } from '../types';
import {
  Search,
  Filter,
  Edit2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Truck,
  Calendar,
  Shield,
  FileSpreadsheet,
  AlertTriangle,
  FileCheck,
  MapPin,
  User,
  Activity,
  FileText,
  Upload,
  Download,
  Share2,
  Printer,
  Trash2,
  Lock,
  Mail,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Phone
} from 'lucide-react';

interface FleetSheetProps {
  vehicles: Vehicle[];
  userRole: string;
  onUpdateVehicle: (vehicle: Vehicle) => Promise<void>;
  onDeleteVehicle: (id: string) => Promise<void>;
}

const VEHICLE_TYPES = [
  'Tata Ace', '207', '407', '14 FT', '17 FT','20 FT', '32 FT'
];

const VEHICLE_CATEGORIES = [
  'Dry', 'Hybrid', 'Walkes', 'Reefer'
];

const VEHICLE_OWNERSHIPS = [
  'KCM SUPPLY', 'KCM INSTA'
];

export default function FleetSheet({ vehicles, userRole, onUpdateVehicle, onDeleteVehicle }: FleetSheetProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedOwnership, setSelectedOwnership] = useState<string>('all');
  const [itemsPerPage, setItemsPerPage] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  const [expandedRegNo, setExpandedRegNo] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isNewVehicle, setIsNewVehicle] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'specs' | 'compliance' | 'insurance' | 'accident'>('general');
  const [isUpdating, setIsUpdating] = useState(false);

  // Vehicle Document Management States
  const [uploadCategory, setUploadCategory] = useState<string>('RC');
  const [uploadName, setUploadName] = useState<string>('');
  
  const [sharingDoc, setSharingDoc] = useState<{ vehicleId: string; docId: string; docName: string } | null>(null);
  const [sharingEmail, setSharingEmail] = useState('');
  const [sharingSuccess, setSharingSuccess] = useState<string | null>(null);

  const [editingDoc, setEditingDoc] = useState<{ vehicleId: string; docId: string; newName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const fileInputRefImport = useRef<HTMLInputElement>(null);

  const triggerNotif = (message: string, type: 'success' | 'info' | 'error') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 5000);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  };

  const handleImportVehiclesCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        const lines = text.split('\n');
        if (lines.length < 2) {
          triggerNotif('CSV file is empty or formatted incorrectly.', 'error');
          return;
        }

        // Find the line containing the actual header (starts with "reg no" or "si no" or "registration")
        let headerLineIdx = 0;
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i].toLowerCase();
          if (l.includes('reg no') || l.includes('reg. no.') || l.includes('registration') || l.includes('si no')) {
            headerLineIdx = i;
            break;
          }
        }

        const headers = parseCSVLine(lines[headerLineIdx]).map(h => h.trim().toLowerCase());
        
        let importCount = 0;
        let failCount = 0;

        for (let i = headerLineIdx + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const values = parseCSVLine(line);
          
          const getVal = (fields: string[], defaultValue = '') => {
            for (const f of fields) {
              const idx = headers.indexOf(f.toLowerCase());
              if (idx !== -1 && values[idx] !== undefined) {
                return values[idx];
              }
            }
            return defaultValue;
          };

          // Try to grab regNo
          const regNo = getVal(['reg no', 'reg. no.', 'registration number', 'regno']);
          if (!regNo) {
            failCount++;
            continue;
          }

          const rawSi = getVal(['si no', 'si. no.', 'serial no', 'sno', 'entry no', 'entry number']);
          const parsedSi = rawSi ? parseInt(rawSi) : undefined;

          const parsedVehicle: Vehicle = {
            id: String(Date.now() + i),
            regNo: regNo.toUpperCase().trim(),
            "Reg. No.": regNo.toUpperCase().trim(),
            type: getVal(['type'], 'tata ace'),
            Type: getVal(['type'], 'tata ace'),
            category: normalizeCategory(getVal(['category'], 'dry')),
            Category: normalizeCategory(getVal(['category'], 'dry')),
            ownership: normalizeOwnership(getVal(['ownership', 'owner'], 'KCM SUPPLY')),
            Ownership: normalizeOwnership(getVal(['ownership', 'owner'], 'KCM SUPPLY')),
            model: getVal(['model'], ''),
            Model: getVal(['model'], ''),
            regYear: getVal(['reg year', 'regyear', 'year'], String(new Date().getFullYear())),
            "Reg Year": getVal(['reg year', 'regyear', 'year'], String(new Date().getFullYear())),
            regDate: getVal(['reg date', 'regdate', 'date'], ''),
            "Reg Date": getVal(['reg date', 'regdate', 'date'], ''),
            chassisNo: getVal(['chassis no', 'chassisno', 'chassis'], ''),
            "Chassis No": getVal(['chassis no', 'chassisno', 'chassis'], ''),
            tax: getVal(['tax'], ''),
            Tax: getVal(['tax'], ''),
            emissionTest: getVal(['emission test', 'emissiontest', 'emission'], ''),
            "Emission Test": getVal(['emission test', 'emissiontest', 'emission'], ''),
            fc: getVal(['fc', 'fitness certificate', 'fitness'], ''),
            FC: getVal(['fc', 'fitness certificate', 'fitness'], ''),
            insurance: getVal(['insurance'], ''),
            Insurance: getVal(['insurance'], ''),
            allIndiaPermit: getVal(['all india permit', 'permit'], ''),
            statePermit: getVal(['state permit'], ''),
            engineNo: getVal(['engine no', 'engineno'], ''),
            vehicleIdvAmount: getVal(['idv amount', 'idv'], ''),
            gvwKgs: getVal(['gvw', 'gvw kgs'], ''),
            unladenWeightKgs: getVal(['unladen weight', 'unladen weight kgs'], ''),
            insuranceCompany: getVal(['insurance company', 'company'], ''),
            policyNo: getVal(['policy no', 'policyno', 'policy'], ''),
            premiumAmount: getVal(['premium', 'premium amount'], ''),
            remarks: getVal(['remarks'], ''),
            "SI No": parsedSi,
            documents: []
          };

          try {
            await onUpdateVehicle(parsedVehicle);
            importCount++;
          } catch (err) {
            console.error(err);
            failCount++;
          }
        }

        triggerNotif(`Successfully imported ${importCount} vehicles into the master database! ${failCount > 0 ? `${failCount} rows failed.` : ''}`, 'success');
        if (fileInputRefImport.current) fileInputRefImport.current.value = '';
      } catch (err) {
        console.error(err);
        triggerNotif('Failed to parse the Vehicles CSV file.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleExportVehiclesCSV = () => {
    const data = vehicles.map((v, i) => ({
      "SI No": i + 1,
      "Reg. No.": v['Reg. No.'] || v.regNo || '',
      "Type": v['Type'] || v.type || '',
      "Category": v['Category'] || v.category || '',
      "Ownership": v['Ownership'] || v.ownership || '',
      "Model": v['Model'] || v.model || '',
      "Reg Year": v['Reg Year'] || v.regYear || '',
      "Reg Date": v['Reg Date'] || v.regDate || '',
      "Chassis No": v['Chassis No'] || v.chassisNo || '',
      "Engine No": v.engineNo || '',
      "GVW Kgs": v['GVW in Kgs'] || v.gvwKgs || v.gvwKgs || '',
      "Unladen Weight Kgs": v['Unloaden Weight in Kgs'] || v.unladenWeightKgs || '',
      "Tax Expiry": v['Tax'] || v.tax || '',
      "Emission Test": v['Emission Test'] || v.emissionTest || '',
      "FC Expiry": v['FC'] || v.fc || '',
      "Insurance Expiry": v['Insurance'] || v.insurance || '',
      "Policy No": v.policyNo || '',
      "Premium Amount": v.premiumAmount || '',
      "Insurance Company": v.insuranceCompany || '',
      "Remarks": v.remarks || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fleet Master");
    XLSX.writeFile(workbook, "KCM_Fleet_Master_Database.xlsx");
  };

  const canEdit = true;

  // Helper to match input criteria perfectly
  const normalize = (val: string | undefined) => String(val || '').toLowerCase().trim();

  const normalizeCategory = (cat: string | undefined) => {
    const c = String(cat || '').toLowerCase().trim();
    if (c === 'normal' || c === 'dry') return 'dry';
    if (c === 'walkee') return 'walkes';
    return c;
  };

  const normalizeOwnership = (own: string | undefined) => {
    const o = String(own || '').toUpperCase().trim();
    if (o.includes('KCM SUPPLY')) return 'KCM SUPPLY';
    if (o.includes('KCM INSTA')) return 'KCM INSTA';
    return o.replace(/kcm/gi, 'KCM') || 'KCM SUPPLY';
  };

  // Apply filters
  const filteredVehicles = vehicles.filter((v) => {
    const regVal = v['Reg. No.'] || v.regNo || '';
    const matchesSearch = !searchTerm || normalize(regVal).includes(normalize(searchTerm));
    
    // Exact or loose match for type filter
    const matchesType =
      selectedType === 'all' ||
      normalize(v.Type || v.type || '').includes(normalize(selectedType));

    // Exact or loose match for category filter
    const matchesCategory =
      selectedCategory === 'all' ||
      normalizeCategory(v.Category || v.category || '') === normalizeCategory(selectedCategory);

    // Exact or loose match for ownership filter
    const matchesOwnership =
      selectedOwnership === 'all' ||
      normalize(v.Ownership || v.ownership || '').includes(normalize(selectedOwnership));

    return matchesSearch && matchesType && matchesCategory && matchesOwnership;
  });

  const toggleExpand = (regNo: string) => {
    if (expandedRegNo === regNo) {
      setExpandedRegNo(null);
    } else {
      setExpandedRegNo(regNo);
    }
  };

  const [editForm, setEditForm] = useState<Vehicle | null>(null);

  const startEdit = (vehicle: Vehicle) => {
    setEditForm({ ...vehicle });
    setIsNewVehicle(false);
    setActiveTab('general');
  };

  const startCreate = () => {
    const fresh: Vehicle = {
      id: String(Date.now()),
      regNo: '',
      type: 'tata ace',
      Category: 'dry',
      Ownership: 'KCM SUPPLY',
      model: 'TATA Ace',
      regYear: String(new Date().getFullYear()),
      regDate: '',
      chassisNo: '',
      tax: '',
      emissionTest: '',
      fc: '',
      insurance: '',
      allIndiaPermit: '',
      statePermit: '',
      engineNo: '',
      vehicleIdvAmount: '',
      gvwKgs: '',
      unladenWeightKgs: '',
      insuranceCompany: '',
      policyNo: '',
      premiumAmount: '',
      remarks: '',
      accidentDate: '',
      accidentTime: '',
      accidentPlace: '',
      driverName: '',
      driverLicenseNo: '',
      claimNumber: '',
      policeFirNo: '',
      firDate: '',
      policeStationAddress: '',
      accidentIncidentDetails: '',
      claimAmount: ''
    };
    setEditForm(fresh);
    setIsNewVehicle(true);
    setActiveTab('general');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;

    setIsUpdating(true);
    try {
      const finalVehicle = {
        ...editForm,
        'Reg. No.': editForm['Reg. No.'] || editForm.regNo
      };

      const response = await fetch('/api/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalVehicle)
      });
      if (response.ok) {
        setEditForm(null);
        await onUpdateVehicle(finalVehicle);
      }
    } catch (err) {
      console.error('Error saving vehicle:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedType, selectedCategory, selectedOwnership, itemsPerPage]);

  const totalFilteredCount = filteredVehicles.length;

  const paginatedVehicles = (() => {
    if (itemsPerPage === 'ALL') {
      return filteredVehicles;
    }
    const limit = parseInt(itemsPerPage, 10);
    const startIdx = (currentPage - 1) * limit;
    return filteredVehicles.slice(startIdx, startIdx + limit);
  })();

  const totalPages = itemsPerPage === 'ALL' ? 1 : Math.ceil(totalFilteredCount / parseInt(itemsPerPage, 10));

  return (
    <div className="bg-[#F8FAFC] min-h-screen p-4 md:p-6" id="fleet-sheet-wrapper">
      {notif && (
        <div
          className={`mb-4 p-3 border rounded-xl text-xs font-medium flex items-center gap-2.5 shadow-sm transition-all animate-fade-in ${
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

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <FileSpreadsheet className="text-blue-600 w-5 h-5" />
            KCM Fleet Master Database
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            {canEdit ? 'Authorized Access: Read / Write Operations Active' : 'Read-Only View Enabled'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-4 md:mt-0">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRefImport}
            onChange={handleImportVehiclesCSV}
            className="hidden"
          />

          <button
            onClick={() => fileInputRefImport.current?.click()}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold tracking-wide flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer"
            title="Import Vehicles from CSV spreadsheet"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            Import CSV
          </button>

          <button
            onClick={handleExportVehiclesCSV}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold tracking-wide flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer"
            title="Export Master Fleet to Excel (.xlsx) spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            Export Excel
          </button>

          {canEdit && (
            <button
              onClick={startCreate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold tracking-wide flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              id="add-vehicle-btn"
            >
              <Plus className="w-4 h-4" />
              Add New Vehicle
            </button>
          )}
        </div>
      </div>

      {/* Database Filters Dashboard */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Registration Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search Reg No (e.g. KA53)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none focus:border-blue-500 text-slate-800 font-mono font-bold uppercase tracking-wider"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-bold shrink-0">Type:</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:outline-none capitalize font-medium"
            >
              <option value="all">All Vehicle Types</option>
              {VEHICLE_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-bold shrink-0">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:outline-none capitalize font-medium"
            >
              <option value="all">All Categories</option>
              {VEHICLE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Ownership Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-bold shrink-0">Owner:</span>
            <select
              value={selectedOwnership}
              onChange={(e) => setSelectedOwnership(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:outline-none capitalize font-medium"
            >
              <option value="all">All Ownerships</option>
              {VEHICLE_OWNERSHIPS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Items Per Page (Visible limit) */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-bold shrink-0">Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:outline-none font-medium"
            >
              <option value="ALL">ALL</option>
              <option value="10">10</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fleet table card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 border-b-2 border-purple-500 font-bold text-white uppercase text-[10px] tracking-wider font-mono">
              <tr>
                <th className="px-4 py-4 text-center w-12 text-purple-200 font-extrabold">SI No</th>
                <th className="px-4 py-4 text-purple-100">Reg. No.</th>
                <th className="px-4 py-4 text-purple-100">Type</th>
                <th className="px-4 py-4 text-purple-100">Category</th>
                <th className="px-4 py-4 text-purple-100">Ownership</th>
                <th className="px-4 py-4 text-purple-100">Insurance Exp</th>
                <th className="px-4 py-4 text-purple-100">FC Expiry</th>
                <th className="px-4 py-4 text-right text-purple-100">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400 font-mono">
                    NO FLEET RECORDS FOUND MATCHING THE SELECTED PARAMETERS.
                  </td>
                </tr>
              ) : (
                paginatedVehicles.map((v, i) => {
                  const reg = String(v['Reg. No.'] || v.regNo || '');
                  const typeLabel = v.Type || v.type;
                  const catLabel = normalizeCategory(v.Category || v.category);
                  const ownLabel = normalizeOwnership(v.Ownership || v.ownership);
                  const insExp = v.Insurance || v.insurance;
                  const fcDate = v.FC || v.fc;
                  const siNo = itemsPerPage === 'ALL' ? (i + 1) : ((currentPage - 1) * parseInt(itemsPerPage, 10) + i + 1);

                  // Calculate insurance alert color
                  let isNearExpiry = false;
                  if (insExp) {
                    const parts = insExp.split('.');
                    let dateObj: Date | null = null;
                    if (parts.length === 3) {
                      dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    } else if (insExp.includes('-')) {
                      dateObj = new Date(insExp);
                    }
                    if (dateObj && !isNaN(dateObj.getTime())) {
                      const today = new Date('2026-07-07');
                      const diff = Math.ceil((dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                      isNearExpiry = diff >= 10 && diff <= 15;
                    }
                  }

                  return (
                    <React.Fragment key={reg + '-' + siNo}>
                      <tr
                        onClick={() => toggleExpand(reg)}
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                          expandedRegNo === reg ? 'bg-slate-50/70 border-b-0' : ''
                        }`}
                      >
                        <td className="px-4 py-3.5 text-center font-mono text-slate-400">{siNo}</td>
                        <td className="px-4 py-3.5 font-bold font-mono text-slate-900 tracking-wider">
                          <span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded text-slate-800">
                            {reg}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 capitalize font-sans">{typeLabel}</td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border shadow-sm ${
                            catLabel === 'dry' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                            catLabel === 'hybrid' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                            catLabel === 'walkes' ? 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300' :
                            catLabel === 'reefer' ? 'bg-cyan-100 text-cyan-800 border-cyan-300' :
                            'bg-slate-100 text-slate-800 border-slate-300'
                          }`}>
                            {catLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 capitalize max-w-[150px] truncate">{ownLabel}</td>
                        <td className="px-4 py-3.5 font-mono">
                          {isNearExpiry ? (
                            <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded font-bold flex items-center gap-1 w-fit animate-pulse">
                              <AlertTriangle className="w-3 h-3 text-red-500" />
                              {insExp} (ALERT)
                            </span>
                          ) : (
                            <span className="text-slate-600 font-semibold">{insExp || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-500">{fcDate || '-'}</td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-2">
                            {canEdit && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEdit(v);
                                  }}
                                  className="p-1 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded transition-all cursor-pointer"
                                  title="Edit Fleet Data"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm(`Are you sure you want to delete vehicle ${v['Reg. No.']}? This action is irreversible.`)) {
                                      setIsUpdating(true);
                                      await onDeleteVehicle(v.id || v['Reg. No.'] || '');
                                      setIsUpdating(false);
                                      triggerNotif(`Vehicle ${v['Reg. No.']} successfully removed from master database.`, 'success');
                                    }
                                  }}
                                  className="p-1 text-slate-400 hover:text-pink-600 hover:bg-slate-100 rounded transition-all cursor-pointer"
                                  title="Delete Vehicle Asset"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              className="p-1 text-slate-400 hover:text-slate-600 rounded"
                              title="Expand all details"
                            >
                              {expandedRegNo === reg ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Row Expansion */}
                      {expandedRegNo === reg && (
                        <tr>
                          <td colSpan={8} className="bg-slate-50/50 p-6 border-t border-slate-100">
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="grid grid-cols-1 md:grid-cols-3 gap-6 text-slate-700"
                            >
                              {/* Left Panel: Specifications */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-3 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                                  <Truck className="w-3.5 h-3.5 text-teal-600" />
                                  Fleet Specifications
                                </h3>
                                <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-sans">
                                  <dt className="text-slate-400">Model Name</dt>
                                  <dd className="font-bold text-slate-800">{v.Model || v.model || '-'}</dd>

                                  <dt className="text-slate-400">Chassis Number</dt>
                                  <dd className="font-mono text-slate-800 break-all">{v['Chassis No'] || v.chassisNo || '-'}</dd>

                                  <dt className="text-slate-400">Engine Number</dt>
                                  <dd className="font-mono text-slate-800 break-all">{v['Engine No'] || v.engineNo || '-'}</dd>

                                  <dt className="text-slate-400">Gross Weight (GVW)</dt>
                                  <dd className="font-mono text-slate-800">{v['GVW in Kgs'] || v.gvwKgs || '-'} kgs</dd>

                                  <dt className="text-slate-400">Unladen Weight</dt>
                                  <dd className="font-mono text-slate-800">{v['Unloaden Weight in Kgs'] || v.unladenWeightKgs || '-'} kgs</dd>

                                  <dt className="text-slate-400">Reg Year</dt>
                                  <dd className="font-mono text-slate-800">{v['Reg Year'] || v.regYear || '-'}</dd>
                                </dl>
                              </div>

                              {/* Center Panel: Permits & Taxes */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-3 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                                  <FileCheck className="w-3.5 h-3.5 text-teal-600" />
                                  Compliance & Permits
                                </h3>
                                <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-sans">
                                  <dt className="text-slate-400">Tax Expiry</dt>
                                  <dd className="font-mono text-slate-800">{v.Tax || v.tax || '-'}</dd>

                                  <dt className="text-slate-400">Emission Check</dt>
                                  <dd className="font-mono text-slate-800">{v['Emission Test'] || v.emissionTest || '-'}</dd>

                                  <dt className="text-slate-400">FC Expiry</dt>
                                  <dd className="font-mono font-medium">{v.FC || v.fc || '-'}</dd>

                                  <span className="col-span-2 border-t my-1 border-gray-100"></span>

                                  <dt className="text-gray-500 font-medium">All India Permit</dt>
                                  <dd className="font-mono text-xs">{v['All India Permit'] || '-'}</dd>

                                  <dt className="text-gray-500 font-medium">State Permit</dt>
                                  <dd className="font-mono text-xs">{v['State permit'] || v.statePermit || '-'}</dd>
                                </dl>
                              </div>

                              {/* Right Panel: Insurance & Accidents */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-3 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                                  <Shield className="w-3.5 h-3.5 text-teal-600" />
                                  Insurance, Driver & Claims
                                </h3>
                                <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-sans">
                                  <dt className="text-slate-400">Insurance Company</dt>
                                  <dd className="font-bold text-slate-800">{v['Insurance Company Name'] || v.insuranceCompany || '-'}</dd>

                                  <dt className="text-slate-400">Policy Number</dt>
                                  <dd className="font-mono text-slate-800 break-all">{v['Policy No'] || v.policyNo || '-'}</dd>

                                  <dt className="text-slate-400">Premium Cost</dt>
                                  <dd className="font-mono font-bold text-slate-800">₹{v['Premium Amount'] || v.premiumAmount || '-'}</dd>

                                  <dt className="text-slate-400">IDV Value</dt>
                                  <dd className="font-mono text-slate-800">₹{v['Vehicle IDV Amount'] || v.vehicleIdvAmount || '-'}</dd>

                                  <span className="col-span-2 border-t my-1 border-gray-100"></span>

                                  <dt className="text-slate-400">Driver Name</dt>
                                  <dd className="font-semibold text-slate-800">{v['Driver Name'] || v.driverName || '-'}</dd>

                                  <dt className="text-slate-400">License No</dt>
                                  <dd className="font-mono text-slate-800 break-all">{v['Driver License No'] || v.driverLicenseNo || '-'}</dd>

                                  {v['Accident Date'] && (
                                    <>
                                      <dt className="text-red-500 font-bold col-span-2 border-t pt-1 border-red-50 mt-1 uppercase text-[9px] tracking-widest flex items-center gap-1">
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        Accident Incident Recorded
                                      </dt>
                                      <dt className="text-slate-400">Incident Date</dt>
                                      <dd className="font-mono font-bold text-red-600">{v['Accident Date']}</dd>

                                      <dt className="text-slate-400">Claim Code</dt>
                                      <dd className="font-mono text-slate-800">{v['Claim Number'] || v.claimNumber || '-'}</dd>
                                    </>
                                  )}
                                </dl>
                              </div>

                              {/* DOCUMENT PORTFOLIO SECTION (Pink & Purple colorful layout) */}
                              <div className="col-span-1 md:col-span-3 mt-6 border-t border-pink-100 pt-6">
                              <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl border border-pink-100 p-6 shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                  <div>
                                    <h4 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-purple-800 uppercase tracking-wider flex items-center gap-2">
                                      <FileSpreadsheet className="w-5 h-5 text-pink-600" />
                                      Vehicle Document Management System
                                    </h4>
                                    <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider font-mono mt-0.5">
                                      Secure digital locker: license, insurance, fc, tax invoices
                                    </p>
                                  </div>

                                  {/* Access Status Tag */}
                                  <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full text-[10px] font-bold text-emerald-800 uppercase">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>VDM Access Granted</span>
                                  </div>
                                </div>

                                {/* Access control check block */}
                                {false ? (
                                  <div className="bg-pink-50/50 border border-pink-100 rounded-xl p-5 text-center">
                                    <Lock className="w-8 h-8 text-pink-500 mx-auto mb-2 animate-bounce" />
                                    <h5 className="text-xs font-extrabold text-pink-800 uppercase tracking-wider">Access Restricted</h5>
                                    <p className="text-[11px] text-purple-600 mt-1 max-w-md mx-auto leading-normal">
                                      You are logged in under the {userRole.replace('_', ' ')} department. Secure KCM policy restricts vehicle document uploads, edits, shares, and print commands exclusively to **Vehicle Data Managers** and **Super Admins**.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    
                                    {/* Upload Area */}
                                    <div className="bg-white p-5 rounded-2xl border border-pink-100 shadow-xs space-y-4">
                                      <h5 className="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                                        <Upload className="w-4 h-4 text-pink-600" />
                                        Upload New Asset Document
                                      </h5>

                                      <div className="space-y-3">
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-700 mb-1">
                                            Document Category
                                          </label>
                                          <select
                                            value={uploadCategory}
                                            onChange={(e) => setUploadCategory(e.target.value)}
                                            className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-1 focus:ring-pink-500 focus:outline-none capitalize"
                                          >
                                            <option value="RC">RC (Registration Certificate)</option>
                                            <option value="License">Driver License</option>
                                            <option value="Insurance">Insurance Copy</option>
                                            <option value="FC">FC (Fitness Certificate)</option>
                                            <option value="Tax Invoice">Tax Invoice</option>
                                            <option value="Other">Other Certificate</option>
                                          </select>
                                        </div>

                                        <div className="pt-2">
                                          <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = async () => {
                                                  const base64String = reader.result as string;
                                                  const newDoc: VehicleDocument = {
                                                    id: String(Date.now()),
                                                    name: uploadCategory,
                                                    type: file.type.includes('pdf') ? 'pdf' : 'image',
                                                    fileName: file.name,
                                                    fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                                                    uploadDate: new Date().toISOString().split('T')[0],
                                                    fileData: base64String
                                                  };
                                                  const currentDocs = v.documents || [];
                                                  const updatedVehicle = {
                                                    ...v,
                                                    documents: [...currentDocs, newDoc]
                                                  };
                                                  setIsUpdating(true);
                                                  await onUpdateVehicle(updatedVehicle);
                                                  setIsUpdating(false);
                                                };
                                                reader.readAsDataURL(file);
                                              }
                                            }}
                                            className="hidden"
                                            accept=".pdf,image/*"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold py-2 px-4 rounded-xl text-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                                          >
                                            <Upload className="w-3.5 h-3.5" />
                                            Select File to Upload
                                          </button>
                                        </div>
                                        <p className="text-[9px] text-slate-400 text-center">
                                          Supports high resolution PDFs and vehicle images.
                                        </p>
                                      </div>
                                    </div>

                                    {/* Document List Panel */}
                                    <div className="bg-white p-5 rounded-2xl border border-pink-100 shadow-xs lg:col-span-2 space-y-4">
                                      <h5 className="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                                        <FileText className="w-4 h-4 text-pink-600" />
                                        Uploaded Document Registry
                                      </h5>

                                      {!(v.documents) || v.documents.length === 0 ? (
                                        <div className="text-center py-10 border border-dashed border-purple-100 rounded-xl bg-slate-50/50">
                                          <AlertCircle className="w-8 h-8 text-purple-300 mx-auto mb-2" />
                                          <p className="text-xs text-purple-600 font-semibold">No Documents Linked to {v['Reg. No.'] || v.regNo}</p>
                                          <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto">
                                            Attach a certified PDF or vehicle image using the sidebar loader to establish database records.
                                          </p>
                                        </div>
                                      ) : (
                                        <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                                          {v.documents.map((doc) => (
                                            <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-pink-50/20 border border-purple-50 rounded-xl gap-3 transition-all hover:bg-pink-50/40">
                                              
                                              {/* Doc details */}
                                              <div className="min-w-0">
                                                {editingDoc?.docId === doc.id ? (
                                                  <div className="flex items-center gap-2">
                                                    <input
                                                      type="text"
                                                      value={editingDoc.newName}
                                                      onChange={(e) => setEditingDoc({ ...editingDoc, newName: e.target.value })}
                                                      className="bg-white border border-pink-300 text-xs rounded px-2 py-0.5 focus:outline-none"
                                                    />
                                                    <button
                                                      onClick={async () => {
                                                        const updatedDocs = v.documents!.map(d => d.id === doc.id ? { ...d, name: editingDoc.newName } : d);
                                                        await onUpdateVehicle({ ...v, documents: updatedDocs });
                                                        setEditingDoc(null);
                                                      }}
                                                      className="text-[10px] font-bold text-emerald-600 hover:underline"
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      onClick={() => setEditingDoc(null)}
                                                      className="text-[10px] font-bold text-slate-400 hover:underline"
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-slate-800 truncate block max-w-[200px]">
                                                      {doc.name}
                                                    </span>
                                                    <span className="text-[8px] bg-purple-100 text-purple-700 font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                      {doc.type}
                                                    </span>
                                                  </div>
                                                )}
                                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                  File: {doc.fileName} ({doc.fileSize}) | Date: {doc.uploadDate}
                                                </p>
                                              </div>

                                              {/* Operational Actions */}
                                              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                                {/* Download */}
                                                <button
                                                  onClick={() => {
                                                    if (!doc.fileData) return;
                                                    const link = document.createElement('a');
                                                    link.href = doc.fileData;
                                                    link.download = doc.fileName;
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    document.body.removeChild(link);
                                                  }}
                                                  className="p-1.5 bg-white border border-purple-100 text-purple-700 hover:bg-pink-50 rounded-lg transition-colors cursor-pointer"
                                                  title="Download File"
                                                >
                                                  <Download className="w-3.5 h-3.5" />
                                                </button>

                                                {/* Print */}
                                                <button
                                                  onClick={() => {
                                                    if (!doc.fileData) return;
                                                    const printWindow = window.open('', '_blank');
                                                    if (!printWindow) return;
                                                    printWindow.document.write(`
                                                      <html>
                                                        <head>
                                                          <title>KCM Print System - ${doc.name}</title>
                                                          <style>
                                                            body { margin: 20px; text-align: center; font-family: sans-serif; background-color: white; }
                                                            img { max-width: 100%; border-radius: 8px; border: 1px solid #ddd; padding: 5px; }
                                                            h1 { font-size: 14px; color: #475569; }
                                                          </style>
                                                        </head>
                                                        <body>
                                                          <h1>KCM Logistics Document Registry: ${doc.name} (${doc.fileName})</h1>
                                                          <img src="${doc.fileData}" />
                                                          <script>
                                                            window.onload = function() { window.print(); };
                                                          </script>
                                                        </body>
                                                      </html>
                                                    `);
                                                    printWindow.document.close();
                                                  }}
                                                  className="p-1.5 bg-white border border-purple-100 text-purple-700 hover:bg-pink-50 rounded-lg transition-colors cursor-pointer"
                                                  title="Print Document"
                                                >
                                                  <Printer className="w-3.5 h-3.5" />
                                                </button>

                                                {/* Edit Metadata */}
                                                {/* Share options */}
                                                <button
                                                  onClick={() => {
                                                    setSharingDoc({ vehicleId: v.id || '', docId: doc.id, docName: doc.name });
                                                    setSharingEmail('');
                                                    setSharingSuccess(null);
                                                  }}
                                                  className="p-1.5 bg-white border border-purple-100 text-purple-700 hover:bg-pink-50 rounded-lg transition-colors cursor-pointer"
                                                  title="Share Document"
                                                >
                                                  <Share2 className="w-3.5 h-3.5" />
                                                </button>

                                                {/* Delete */}
                                                <button
                                                  onClick={async () => {
                                                    if (confirm(`Remove "${doc.name}" from fleet records?`)) {
                                                      const updatedDocs = v.documents!.filter(d => d.id !== doc.id);
                                                      await onUpdateVehicle({ ...v, documents: updatedDocs });
                                                    }
                                                  }}
                                                  className="p-1.5 bg-white border border-pink-200 text-pink-600 hover:bg-pink-50 rounded-lg transition-colors cursor-pointer"
                                                  title="Delete Asset File"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    
                                  </div>
                                )}

                                {/* Interactive Sharing Dialog overlay in expanded panel */}
                                {sharingDoc && (
                                  <div className="mt-4 p-4 rounded-xl bg-purple-900 text-white border border-pink-400/20 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold flex items-center gap-1">
                                        <Share2 className="w-4 h-4 text-pink-400" />
                                        Share Document: "{sharingDoc.docName}"
                                      </span>
                                      <button
                                        onClick={() => setSharingDoc(null)}
                                        className="text-pink-300 hover:text-white font-bold text-xs"
                                      >
                                        Close
                                      </button>
                                    </div>

                                    {sharingSuccess ? (
                                      <p className="text-[11px] text-emerald-300 font-semibold">{sharingSuccess}</p>
                                    ) : (
                                      <div className="space-y-2">
                                        <div className="flex flex-col sm:flex-row gap-2">
                                          <input
                                            type="email"
                                            value={sharingEmail}
                                            onChange={(e) => setSharingEmail(e.target.value)}
                                            placeholder="Enter recipient's email address"
                                            className="flex-1 bg-white/10 border border-white/20 rounded-lg p-2 text-xs focus:outline-none"
                                          />
                                          <button
                                            onClick={() => {
                                              if (!sharingEmail) return;
                                              setSharingSuccess(`Document secure repository link successfully dispatched to ${sharingEmail} via KCM mail servers!`);
                                              setSharingEmail('');
                                            }}
                                            className="bg-pink-500 hover:bg-pink-600 text-white font-bold px-4 py-2 rounded-lg text-xs"
                                          >
                                            Send Email
                                          </button>
                                        </div>

                                        <div className="flex items-center justify-between pt-1">
                                          <span className="text-[10px] text-purple-300">Generate copy link for WhatsApp:</span>
                                          <button
                                            onClick={() => {
                                              const msg = `KCM Logistics Document link: ${sharingDoc.docName} for vehicle registration ${v['Reg. No.'] || v.regNo}. Please check compliance logbook.`;
                                              const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                                              navigator.clipboard.writeText(url);
                                              setSharingSuccess("WhatsApp secure share link generated and copied to clipboard!");
                                            }}
                                            className="text-[11px] text-pink-300 hover:text-pink-100 flex items-center gap-1 font-bold"
                                          >
                                            <Phone className="w-3 h-3 text-emerald-400" /> Generate WhatsApp link
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {itemsPerPage !== 'ALL' && totalPages > 1 && (
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-600">
            <div>
              Showing {Math.min(totalFilteredCount, (currentPage - 1) * parseInt(itemsPerPage, 10) + 1)} to {Math.min(totalFilteredCount, currentPage * parseInt(itemsPerPage, 10))} of {totalFilteredCount} vehicles
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 font-mono">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Database Edit Form modal */}
      {editForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4 z-40 overflow-y-auto font-sans">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
          >
            {/* Modal Header */}
            <div className="bg-[#0f172a] text-white p-4 md:p-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Truck className="w-5 h-5 text-teal-400" />
                  {isNewVehicle ? 'Register New Logistics Fleet Asset' : `Edit Vehicle - ${editForm['Reg. No.'] || 'Update fields'}`}
                </h2>
                <p className="text-[11px] text-slate-400 mt-1 uppercase font-mono tracking-widest">
                  Secure Cloud DB Transaction // Author: {userRole}
                </p>
              </div>
              <button
                onClick={() => setEditForm(null)}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Field Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 text-xs overflow-x-auto whitespace-nowrap">
              {[
                { id: 'general', label: 'Primary Details', icon: Truck },
                { id: 'specs', label: 'Technical Spec', icon: Activity },
                { id: 'compliance', label: 'Compliance & Permits', icon: FileCheck },
                { id: 'insurance', label: 'Insurance Portfolio', icon: Shield },
                { id: 'accident', label: 'Incidents & Claims', icon: AlertTriangle }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-3 border-b-2 font-semibold tracking-wide flex items-center gap-2 transition-all uppercase text-[10px] cursor-pointer ${
                    activeTab === tab.id
                      ? 'border-teal-600 text-teal-700 bg-white font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Body / Forms */}
            <div className="p-6 overflow-y-auto flex-1 max-h-[60vh] bg-slate-50/30">
              <form onSubmit={handleSave} className="space-y-6">
                
                {/* TAB 1: GENERAL PRIMARY DETAILS */}
                {activeTab === 'general' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Entry SI Number
                      </label>
                      <input
                        type="number"
                        value={editForm['SI No'] !== undefined ? editForm['SI No'] : ''}
                        onChange={(e) => setEditForm({ ...editForm, 'SI No': e.target.value ? parseInt(e.target.value) : undefined })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                        placeholder="Manually enter numerical value (e.g. 15)"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Vehicle Registration Number *
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!isNewVehicle}
                        value={editForm['Reg. No.'] || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Reg. No.': e.target.value.toUpperCase().trim() })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-mono font-bold tracking-wider text-slate-800 focus:ring-1 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        placeholder="e.g. KA53AA0069"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Vehicle OEM Model Name
                      </label>
                      <input
                        type="text"
                        value={editForm.Model || editForm.model || ''}
                        onChange={(e) => setEditForm({ ...editForm, Model: e.target.value, model: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                        placeholder="e.g. TATA LPT 1212"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Logistics Body Type
                      </label>
                      <select
                        value={editForm.Type || editForm.type || 'tata ace'}
                        onChange={(e) => setEditForm({ ...editForm, Type: e.target.value, type: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500 capitalize"
                      >
                        {VEHICLE_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Container Category
                      </label>
                      <select
                        value={normalizeCategory(editForm.Category || editForm.category || 'dry')}
                        onChange={(e) => setEditForm({ ...editForm, Category: e.target.value, category: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500 capitalize"
                      >
                        {VEHICLE_CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Asset Ownership Portfolio
                      </label>
                      <select
                        value={normalizeOwnership(editForm.Ownership || editForm.ownership || 'KCM SUPPLY')}
                        onChange={(e) => setEditForm({ ...editForm, Ownership: e.target.value, ownership: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500 capitalize"
                      >
                        {VEHICLE_OWNERSHIPS.map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Registration Date
                      </label>
                      <input
                        type="date"
                        value={editForm['Reg Date'] || editForm.regDate || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Reg Date': e.target.value, regDate: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500 font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 2: TECHNICAL SPECS */}
                {activeTab === 'specs' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Chassis Identification Number
                      </label>
                      <input
                        type="text"
                        value={editForm['Chassis No'] || editForm.chassisNo || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Chassis No': e.target.value.toUpperCase().trim(), chassisNo: e.target.value.toUpperCase().trim() })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                        placeholder="MAT545256..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Engine Identification Number
                      </label>
                      <input
                        type="text"
                        value={editForm['Engine No'] || editForm.engineNo || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Engine No': e.target.value.toUpperCase().trim(), engineNo: e.target.value.toUpperCase().trim() })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                        placeholder="497TC41..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Gross Vehicle Weight (GVW in Kgs)
                      </label>
                      <input
                        type="number"
                        value={editForm['GVW in Kgs'] || editForm.gvwKgs || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'GVW in Kgs': e.target.value, gvwKgs: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                        placeholder="e.g. 11990"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Unladen Tare Weight (in Kgs)
                      </label>
                      <input
                        type="number"
                        value={editForm['Unloaden Weight in Kgs'] || editForm.unladenWeightKgs || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Unloaden Weight in Kgs': e.target.value, unladenWeightKgs: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                        placeholder="e.g. 4880"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 3: COMPLIANCE & PERMITS */}
                {activeTab === 'compliance' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        FC Expiry Date (Fitness Certificate)
                      </label>
                      <input
                        type="date"
                        value={editForm.FC || editForm.fc || ''}
                        onChange={(e) => setEditForm({ ...editForm, FC: e.target.value, fc: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Road Tax Validity
                      </label>
                      <input
                        type="text"
                        value={editForm.Tax || editForm.tax || ''}
                        onChange={(e) => setEditForm({ ...editForm, Tax: e.target.value, tax: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                        placeholder="LTT or YYYY-MM-DD"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Emission Test Expiry Date
                      </label>
                      <input
                        type="date"
                        value={editForm['Emission Test'] || editForm.emissionTest || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Emission Test': e.target.value, emissionTest: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        All India National Permit Details
                      </label>
                      <input
                        type="text"
                        value={editForm['All India Permit'] || editForm.allIndiaPermit || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'All India Permit': e.target.value, allIndiaPermit: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
                        placeholder="Permit No or valid status"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        State Road Permit Expiry Date
                      </label>
                      <input
                        type="date"
                        value={editForm['State permit'] || editForm.statePermit || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'State permit': e.target.value, statePermit: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 4: INSURANCE PORTFOLIO */}
                {activeTab === 'insurance' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Insurance Expiry Date * (Triggers Super Admin Alerts)
                      </label>
                      <input
                        type="date"
                        required
                        value={editForm.Insurance || editForm.insurance || ''}
                        onChange={(e) => setEditForm({ ...editForm, Insurance: e.target.value, insurance: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono font-bold text-teal-700"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Insurance Company Provider
                      </label>
                      <input
                        type="text"
                        value={editForm['Insurance Company Name'] || editForm.insuranceCompany || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Insurance Company Name': e.target.value, insuranceCompany: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
                        placeholder="e.g. Royal Sundaram"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Insurance Policy Number
                      </label>
                      <input
                        type="text"
                        value={editForm['Policy No'] || editForm.policyNo || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Policy No': e.target.value, policyNo: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                        placeholder="AVO/2315/..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Policy Premium Cost (₹ Annual)
                      </label>
                      <input
                        type="number"
                        value={editForm['Premium Amount'] || editForm.premiumAmount || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Premium Amount': e.target.value, premiumAmount: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                        placeholder="Premium amount"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Approved Vehicle IDV Asset Value (₹)
                      </label>
                      <input
                        type="text"
                        value={editForm['Vehicle IDV Amount'] || editForm.vehicleIdvAmount || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Vehicle IDV Amount': e.target.value, vehicleIdvAmount: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                        placeholder="e.g. 1250000"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 5: INCIDENTS & CLAIMS */}
                {activeTab === 'accident' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Accident Incident Date
                        </label>
                        <input
                          type="date"
                          value={editForm['Accident Date'] || editForm.accidentDate || ''}
                          onChange={(e) => setEditForm({ ...editForm, 'Accident Date': e.target.value, accidentDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Accident Time
                        </label>
                        <input
                          type="text"
                          value={editForm['Accident Time'] || editForm.accidentTime || ''}
                          onChange={(e) => setEditForm({ ...editForm, 'Accident Time': e.target.value, accidentTime: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
                          placeholder="e.g. 11.30 pm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Accident Location / Place
                        </label>
                        <input
                          type="text"
                          value={editForm['Accident Place'] || editForm.accidentPlace || ''}
                          onChange={(e) => setEditForm({ ...editForm, 'Accident Place': e.target.value, accidentPlace: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
                          placeholder="Highway location"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Assign Driver Name at Incident
                        </label>
                        <input
                          type="text"
                          value={editForm['Driver Name'] || editForm.driverName || ''}
                          onChange={(e) => setEditForm({ ...editForm, 'Driver Name': e.target.value, driverName: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
                          placeholder="Driver Name"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Driver License Number
                        </label>
                        <input
                          type="text"
                          value={editForm['Driver License No'] || editForm.driverLicenseNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, 'Driver License No': e.target.value, driverLicenseNo: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                          placeholder="TN68..."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Insurance Claim Voucher Code
                        </label>
                        <input
                          type="text"
                          value={editForm['Claim Number'] || editForm.claimNumber || ''}
                          onChange={(e) => setEditForm({ ...editForm, 'Claim Number': e.target.value, claimNumber: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                          placeholder="e.g. C23002..."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                          Police FIR Case Number
                        </label>
                        <input
                          type="text"
                          value={editForm['Police FIR No.'] || editForm.policeFirNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, 'Police FIR No.': e.target.value, policeFirNo: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                          placeholder="0186/2024"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Accident Event Incident Details / Garage Report
                      </label>
                      <textarea
                        value={editForm['Accident Incident Details'] || editForm.accidentIncidentDetails || ''}
                        onChange={(e) => setEditForm({ ...editForm, 'Accident Incident Details': e.target.value, accidentIncidentDetails: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 h-20 focus:ring-1 focus:ring-teal-500"
                        placeholder="Describe chronological event details, damage metrics, and towing status..."
                      />
                    </div>
                  </div>
                )}

                {/* General Actions */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-200 mt-6">
                  <div className="text-slate-400 text-[10px] uppercase font-mono">
                    SECURITY CHECKPOINT: LOG_IP_STAMPED
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setEditForm(null)}
                      className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      {isUpdating ? 'Executing Transaction...' : 'Save & Publish Asset'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
