import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FuelLog, FuelVendor, MileageReport, Vehicle, VehicleDocument, User, VehicleMileage, Vendor } from '../types';
import {
  Fuel,
  Plus,
  Search,
  Calendar,
  Landmark,
  CheckCircle2,
  Edit2,
  Trash2,
  Paperclip,
  X,
  Route,
  Building2
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';
import DateInput from './DateInput';
import MileageReportModule from './MileageReport';

const LOCATIONS = [
  'AP', 'Nelmangala', 'Belagaum', 'BLR', 'Chennai', 'Goa', 'Hyd', 'Hassan',
  'Hoskote', 'Kandlakoya', 'Mysore', 'Manoharabad', 'Vijayawada', 'Vizag'
];

const BUNK_NAMES = [
  'Atharv', 'Kamala', 'H V Subbaya', 'HPCL', 'Isnapur', 'Lakshmi',
  'OM Petroleum', 'Simhadhri', 'Sri Sai Baba', 'Sri Venkateshwara',
  'Tejashri', 'Vayuputra', 'Visalakshi'
];

const CLIENTS = ['DHL', 'KCM', 'Market Vehicle', 'Reliance', 'Shadowfax', 'Swiggy'];

interface FuelManagementProps {
  user: User;
  logs: FuelLog[];
  onAddLog: (log: Omit<FuelLog, 'id'>) => Promise<void>;
  onUpdateLog: (id: string, log: Partial<FuelLog>) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
  vehicles: Vehicle[];
  vendors: FuelVendor[];
  onAddVendor: (vendor: Omit<FuelVendor, 'id'>) => Promise<void>;
  onDeleteVendor: (id: string) => Promise<void>;
  mileageReports: MileageReport[];
  onAddMileageReport: (report: Omit<MileageReport, 'id'>) => Promise<void>;
  onUpdateMileageReport: (id: string, report: Partial<MileageReport>) => Promise<void>;
  onDeleteMileageReport: (id: string) => Promise<void>;
  vehicleMileages: VehicleMileage[];
  onAddVehicleMileage: (entry: Omit<VehicleMileage, 'id'>) => Promise<void>;
  onDeleteVehicleMileage: (id: string) => Promise<void>;
  // Read-only lookup into the Vendor Management registry (separate module,
  // separate access group) - used only to auto-fill/select Vehicle Number
  // when the typed Vendor Name matches a registered vendor there.
  vendorProfiles: Vendor[];
}

export default function FuelManagement({
  user,
  logs,
  onAddLog,
  onUpdateLog,
  onDeleteLog,
  vehicles,
  vendors,
  onAddVendor,
  onDeleteVendor,
  mileageReports,
  onAddMileageReport,
  onUpdateMileageReport,
  onDeleteMileageReport,
  vehicleMileages,
  onAddVehicleMileage,
  onDeleteVehicleMileage,
  vendorProfiles
}: FuelManagementProps) {
  const [activeSubTab, setActiveSubTab] = useState<'entry' | 'trip'>('entry');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<string | null>(null);

  // Sidebar / editing state
  const [showSidebar, setShowSidebar] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  // Vendor Master mini-management
  const [showVendorManager, setShowVendorManager] = useState(false);
  const [vendorFormName, setVendorFormName] = useState('');
  const [vendorFormCode, setVendorFormCode] = useState('');

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

  // Amount auto-calc = Ltrs * Rate (editable override afterward)
  useEffect(() => {
    const l = parseFloat(ltrs) || 0;
    const r = parseFloat(rate) || 0;
    setAmount(String(parseFloat((l * r).toFixed(2))));
  }, [ltrs, rate]);

  // Vendor Code auto-fill based on the selected Vendor Name
  useEffect(() => {
    const matched = vendors.find(v => v.name.trim().toLowerCase() === vendorName.trim().toLowerCase());
    if (matched) setVendorCode(matched.code);
  }, [vendorName, vendors]);

  // Vehicle Number auto-fill from the Vendor Management registry (separate
  // read-only lookup, keyed by the same Vendor Name text). If the matched
  // vendor has exactly one registered vehicle, fill it directly; if several,
  // a picker is shown below instead so the user chooses which one.
  const matchedVendorProfile = vendorProfiles.find(
    v => v.name.trim().toLowerCase() === vendorName.trim().toLowerCase()
  );
  useEffect(() => {
    if (matchedVendorProfile && matchedVendorProfile.vehicleNumbers.length === 1) {
      setVehicleNumber(matchedVendorProfile.vehicleNumbers[0]);
    }
  }, [matchedVendorProfile]);

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
    setShowSidebar(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!period || !date || !location || !bunkName || !vehicleNumber || !ltrs || !rate || !client) {
      triggerNotif('Please complete all required fields (*)');
      return;
    }

    setIsSubmitting(true);
    try {
      const l = parseFloat(ltrs);
      const r = parseFloat(rate);
      const a = parseFloat(amount) || parseFloat((l * r).toFixed(2));
      const nextEntryNumber = logs.length > 0 ? Math.max(...logs.map(lg => lg.entryNumber || 0)) + 1 : 1;

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
        documents: entryDocs
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

  const handleDeleteLog = async (id: string, entryNumber: number) => {
    if (!confirm(`Are you sure you want to delete fuel entry #${entryNumber}? This action is irreversible.`)) return;
    try {
      await onDeleteLog(id);
      triggerNotif('Fuel entry deleted successfully.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorFormName.trim() || !vendorFormCode.trim()) return;
    try {
      await onAddVendor({ name: vendorFormName.trim(), code: vendorFormCode.trim() });
      setVendorFormName('');
      setVendorFormCode('');
      triggerNotif('Vendor added to Vendor Master.');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredLogs = logs.filter(log =>
    (log?.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log?.vendorName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log?.rqId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log?.indentNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isSuperAdmin = user.department === 'super_admin';

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
            Fuel Entry &amp; Trip Details - connected to Fleet and Mileage Report
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

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Active Fuel Vouchers</p>
            <h3 className="text-xl font-bold text-slate-800 mt-1">{logs.length} logged slips</h3>
            <p className="text-xs text-emerald-500 font-medium mt-0.5">Synced with secure servers</p>
          </div>
          <div className="p-3 bg-teal-50 text-teal-600 rounded-lg">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Sub-module tab switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-0">
        <button
          onClick={() => setActiveSubTab('entry')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wide rounded-t-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
            activeSubTab === 'entry'
              ? 'bg-white border border-b-0 border-slate-200 text-blue-700'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Fuel className="w-3.5 h-3.5" /> Fuel Entry
        </button>
        <button
          onClick={() => setActiveSubTab('trip')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wide rounded-t-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
            activeSubTab === 'trip'
              ? 'bg-white border border-b-0 border-slate-200 text-pink-700'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Route className="w-3.5 h-3.5" /> Trip Details
        </button>
      </div>

      {activeSubTab === 'entry' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Fuel className="w-4 h-4 text-emerald-600" />
              Fuel Entry Ledger
            </h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
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
                  <th className="px-3 py-2.5">Vehicle No</th>
                  <th className="px-3 py-2.5">Indent No</th>
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
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{log.entryNumber}</td>
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
                            onClick={() => handleDeleteLog(log.id, log.entryNumber)}
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
        </div>
      )}

      {activeSubTab === 'trip' && (
        <MileageReportModule
          user={user}
          reports={mileageReports}
          vehicles={vehicles}
          onAddReport={onAddMileageReport}
          onUpdateReport={onUpdateMileageReport}
          onDeleteReport={onDeleteMileageReport}
          vehicleMileages={vehicleMileages}
          onAddVehicleMileage={onAddVehicleMileage}
          onDeleteVehicleMileage={onDeleteVehicleMileage}
        />
      )}

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
                        {BUNK_NAMES.map((b, i) => <option key={i} value={b} />)}
                      </datalist>
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
                      {matchedVendorProfile && matchedVendorProfile.vehicleNumbers.length > 1 && (
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
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> Vendor Master
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowVendorManager(!showVendorManager)}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        {showVendorManager ? 'Hide' : 'Manage Vendors'}
                      </button>
                    </div>

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
                        {vendors.map((v) => <option key={v.id} value={v.name} />)}
                      </datalist>
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

                    {showVendorManager && (
                      <div className="pt-2 border-t border-slate-200 space-y-2">
                        <p className="text-[9px] text-slate-400 font-mono">Add a vendor to the Vendor Master list.</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Vendor name"
                            value={vendorFormName}
                            onChange={(e) => setVendorFormName(e.target.value)}
                            autoComplete="off"
                            className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-slate-800 text-[11px]"
                          />
                          <input
                            type="text"
                            placeholder="Vendor code"
                            value={vendorFormCode}
                            onChange={(e) => setVendorFormCode(e.target.value)}
                            autoComplete="off"
                            className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-slate-800 text-[11px]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddVendor}
                          className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-lg py-1.5 font-semibold text-[10px] uppercase cursor-pointer"
                        >
                          Add Vendor
                        </button>
                        {vendors.length > 0 && (
                          <div className="max-h-28 overflow-y-auto space-y-1 pt-1">
                            {vendors.map(v => (
                              <div key={v.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-md px-2 py-1">
                                <span className="text-[10px] font-semibold text-slate-700">{v.name} <span className="text-slate-400 font-mono">({v.code})</span></span>
                                <button type="button" onClick={() => onDeleteVendor(v.id)} className="text-rose-400 hover:text-rose-600 cursor-pointer">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
