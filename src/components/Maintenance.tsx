import React, { useState, useRef } from 'react';
import { MaintenanceRecord, VehicleDocument } from '../types';
import { 
  Shield, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  Settings, 
  Edit2, 
  Trash2, 
  Paperclip, 
  X, 
  Upload, 
  Download, 
  Printer 
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';
import DateInput from './DateInput';

interface MaintenanceProps {
  records: MaintenanceRecord[];
  onAddRecord: (record: Omit<MaintenanceRecord, 'id'>) => Promise<void>;
  onUpdateRecord: (id: string, record: Partial<MaintenanceRecord>) => Promise<void>;
  onDeleteRecord: (id: string) => Promise<void>;
}

export default function Maintenance({ records, onAddRecord, onUpdateRecord, onDeleteRecord }: MaintenanceProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Maintenance State
  const [regNo, setRegNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [serviceType, setServiceType] = useState<MaintenanceRecord['serviceType']>('Scheduled Servicing');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [garageName, setGarageName] = useState('');
  const [newEntryDocs, setNewEntryDocs] = useState<VehicleDocument[]>([]);

  const [notif, setNotif] = useState<string | null>(null);

  // Modal / Management State
  const [selectedRecordForManage, setSelectedRecordForManage] = useState<MaintenanceRecord | null>(null);

  // Modal Editing Fields
  const [editRegNo, setEditRegNo] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editServiceType, setEditServiceType] = useState<MaintenanceRecord['serviceType']>('Scheduled Servicing');
  const [editDescription, setEditDescription] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editGarageName, setEditGarageName] = useState('');

  const triggerNotif = (msg: string) => {
    setNotif(msg);
    setTimeout(() => setNotif(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNo || !cost || !garageName) {
      alert('Please fill in all maintenance service details.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddRecord({
        regNo: regNo.toUpperCase().trim(),
        date,
        serviceType,
        description,
        cost: parseFloat(cost),
        garageName,
        documents: newEntryDocs
      });

      // Reset
      setRegNo('');
      setCost('');
      setDescription('');
      setGarageName('');
      setNewEntryDocs([]);
      triggerNotif('🔧 Maintenance report published and archived in active logs!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenManageModal = (record: MaintenanceRecord) => {
    setSelectedRecordForManage(record);
    setEditRegNo(record.regNo);
    setEditDate(record.date);
    setEditServiceType(record.serviceType);
    setEditDescription(record.description || '');
    setEditCost(String(record.cost));
    setEditGarageName(record.garageName);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecordForManage) return;

    setIsSubmitting(true);
    try {
      const updatedData: Partial<MaintenanceRecord> = {
        regNo: editRegNo.toUpperCase().trim(),
        date: editDate,
        serviceType: editServiceType,
        description: editDescription,
        cost: parseFloat(editCost),
        garageName: editGarageName
      };

      await onUpdateRecord(selectedRecordForManage.id, updatedData);

      setSelectedRecordForManage({
        ...selectedRecordForManage,
        ...updatedData
      });

      triggerNotif('✏️ Maintenance record updated successfully!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateManageDocs = async (updatedDocs: VehicleDocument[]) => {
    if (!selectedRecordForManage) return;
    try {
      await onUpdateRecord(selectedRecordForManage.id, { documents: updatedDocs });
      setSelectedRecordForManage({
        ...selectedRecordForManage,
        documents: updatedDocs
      });
      triggerNotif('📎 Documents updated successfully.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRecord = async (id: string, reg: string) => {
    if (!confirm(`Are you sure you want to delete maintenance entry for vehicle ${reg}? This action is irreversible.`)) return;
    try {
      await onDeleteRecord(id);
      triggerNotif('🗑️ Maintenance log successfully deleted from server.');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredRecords = records.filter(r =>
    (r?.regNo || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (r?.serviceType || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (r?.garageName || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
  const totalBreakdowns = records.filter(r => r.serviceType === 'Breakdown Repair').length;

  return (
    <div className="space-y-6" id="maintenance-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Settings className="text-blue-600 w-5 h-5" />
            KCM Fleet Maintenance & Garage Center
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Departmental view: Scheduled Servicing checklists, breakdown analytics, and garage invoice logs
          </p>
        </div>
      </div>

      {notif && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {notif}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-400 uppercase tracking-wider">Total Garage Expended</p>
            <h3 className="text-lg font-bold text-slate-800 mt-1">₹{totalCost.toLocaleString('en-IN')}</h3>
            <p className="text-slate-400 mt-0.5">{records.length} total work orders</p>
          </div>
          <div className="p-2.5 bg-slate-100 rounded-lg text-slate-600">
            <Settings className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-400 uppercase tracking-wider text-rose-600">Active Breakdowns Logged</p>
            <h3 className="text-lg font-bold text-rose-700 mt-1">{totalBreakdowns} Incidents</h3>
            <p className="text-rose-500 font-semibold mt-0.5">Emergency roadside responses</p>
          </div>
          <div className="p-2.5 bg-rose-50 rounded-lg text-rose-600 animate-pulse">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-400 uppercase tracking-wider text-emerald-600">Preventative Compliance</p>
            <h3 className="text-lg font-bold text-emerald-700 mt-1">98.2%</h3>
            <p className="text-slate-400 mt-0.5">Fleet up-time maintained</p>
          </div>
          <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Log Work */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit text-xs">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-slate-600" />
            Issue Garage Work Order
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Vehicle Registration Number *</label>
              <input
                type="text"
                required
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                placeholder="e.g. KA53AA0069"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider text-slate-800 uppercase focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Authorized Workshop / Garage Name *</label>
              <input
                type="text"
                required
                value={garageName}
                onChange={(e) => setGarageName(e.target.value)}
                placeholder="e.g. Tata Authorized Service"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Maintenance Scope</label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-semibold"
                >
                  <option value="Scheduled Servicing">Scheduled Servicing</option>
                  <option value="Breakdown Repair">Breakdown Repair</option>
                  <option value="Parts Replacement">Parts Replacement</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Service Bill Cost (₹) *</label>
                <input
                  type="number"
                  required
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="e.g. 18500"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Date of Work Order</label>
              <DateInput
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Service & Parts Replaced Details</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Spare parts names, tire replacements, oil grades, breakdown causes..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 focus:outline-none text-slate-800"
              />
            </div>

            <DocumentAttachment
              documents={newEntryDocs}
              onChange={setNewEntryDocs}
              label="Attach Workshop Bills / Warranty Invoices"
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs mt-3 cursor-pointer"
            >
              {isSubmitting ? 'Posting work order...' : 'Authorize Garage Release'}
            </button>
          </form>
        </div>

        {/* Right Tabular Ledger */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-slate-600" />
              Garage Work Orders Ledger Journal
            </h2>
            <div className="relative w-full sm:w-48 text-xs">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Search Reg No or Garage"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Reg. No.</th>
                  <th className="px-3 py-2.5">Type Scope</th>
                  <th className="px-3 py-2.5">Garage Facility</th>
                  <th className="px-3 py-2.5">Work Summary Details</th>
                  <th className="px-3 py-2.5 text-right">Invoice Value</th>
                  <th className="px-3 py-2.5 text-center">Docs</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400 font-mono">
                      NO FLEET GARAGE ENTRIES IN PORTFOLIO CURRENTLY.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase tracking-wider">{r.regNo}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          r.serviceType === 'Breakdown Repair' ? 'bg-red-50 text-red-700 border border-red-100' :
                          r.serviceType === 'Parts Replacement' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          'bg-teal-50 text-teal-700 border border-teal-100'
                        }`}>
                          {r.serviceType}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800 truncate max-w-[120px]">{r.garageName}</td>
                      <td className="px-3 py-2.5 text-slate-500 truncate max-w-[120px]">{r.description || '-'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap font-semibold">
                        ₹{(r.cost || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {r.documents && r.documents.length > 0 ? (
                          <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
                            <Paperclip className="w-2.5 h-2.5 mr-0.5" />
                            {r.documents.length}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleOpenManageModal(r)}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                            title="Edit work details & upload receipts"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(r.id, r.regNo)}
                            className="p-1 text-slate-400 hover:text-pink-600 hover:bg-slate-100 rounded cursor-pointer"
                            title="Delete record"
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
      </div>

      {/* Unified Manage & Documents Modal */}
      {selectedRecordForManage && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <Settings className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-sm">Manage Maintenance Order</h3>
                  <p className="text-[10px] font-mono text-slate-500">Vehicle: {selectedRecordForManage.regNo} | ID: {selectedRecordForManage.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedRecordForManage(null)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Left Column: Edit Form */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  Edit Work Details
                </h4>
                <form onSubmit={handleSaveEdit} className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Vehicle Registration Number *</label>
                    <input
                      type="text"
                      required
                      value={editRegNo}
                      onChange={(e) => setEditRegNo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider uppercase text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Authorized Workshop / Garage Name *</label>
                    <input
                      type="text"
                      required
                      value={editGarageName}
                      onChange={(e) => setEditGarageName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Scope Category</label>
                      <select
                        value={editServiceType}
                        onChange={(e) => setEditServiceType(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold"
                      >
                        <option value="Scheduled Servicing">Scheduled Servicing</option>
                        <option value="Breakdown Repair">Breakdown Repair</option>
                        <option value="Parts Replacement">Parts Replacement</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Bill Cost (₹) *</label>
                      <input
                        type="number"
                        required
                        value={editCost}
                        onChange={(e) => setEditCost(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Date of Service *</label>
                    <DateInput
                      required
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Spare Parts & Work Summary Details</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 text-slate-800"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs cursor-pointer"
                  >
                    {isSubmitting ? 'Saving changes...' : 'Save Maintenance Changes'}
                  </button>
                </form>
              </div>

              {/* Right Column: Document Upload & List */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                <DocumentAttachment
                  documents={selectedRecordForManage.documents}
                  onChange={handleUpdateManageDocs}
                  label="Verified Maintenance Documents"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
