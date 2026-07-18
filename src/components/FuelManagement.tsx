import React, { useState, useRef } from 'react';
import { FuelLog, VehicleDocument } from '../types';
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
  Upload, 
  Download, 
  Printer 
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';

interface FuelManagementProps {
  logs: FuelLog[];
  onAddLog: (log: Omit<FuelLog, 'id'>) => Promise<void>;
  onUpdateLog: (id: string, log: Partial<FuelLog>) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
}

export default function FuelManagement({ logs, onAddLog, onUpdateLog, onDeleteLog }: FuelManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Fuel Entry State
  const [regNo, setRegNo] = useState('');
  const [date, setDate] = useState('2026-07-07');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('94.50');
  const [odometer, setOdometer] = useState('');
  const [slipNo, setSlipNo] = useState('');
  const [filledBy, setFilledBy] = useState('');
  const [newEntryDocs, setNewEntryDocs] = useState<VehicleDocument[]>([]);

  const [notif, setNotif] = useState<string | null>(null);

  // Modal / Management State
  const [selectedLogForManage, setSelectedLogForManage] = useState<FuelLog | null>(null);
  
  // Modal Editing Fields
  const [editRegNo, setEditRegNo] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editOdometer, setEditOdometer] = useState('');
  const [editSlipNo, setEditSlipNo] = useState('');
  const [editFilledBy, setEditFilledBy] = useState('');

  const triggerNotif = (msg: string) => {
    setNotif(msg);
    setTimeout(() => setNotif(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNo || !quantity || !rate || !odometer || !slipNo) {
      alert('Please fill in all fuel slip details.');
      return;
    }

    setIsSubmitting(true);
    try {
      const q = parseFloat(quantity);
      const r = parseFloat(rate);
      await onAddLog({
        regNo: regNo.toUpperCase().trim(),
        date,
        quantity: q,
        rate: r,
        amount: parseFloat((q * r).toFixed(2)),
        odometer: parseInt(odometer),
        slipNo: slipNo.toUpperCase().trim(),
        filledBy: filledBy || 'Fuel Attendant',
        documents: newEntryDocs
      });

      // Reset
      setRegNo('');
      setQuantity('');
      setOdometer('');
      setSlipNo('');
      setFilledBy('');
      setNewEntryDocs([]);
      triggerNotif('⛽ Fuel voucher slip logged successfully on secure server!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenManageModal = (log: FuelLog) => {
    setSelectedLogForManage(log);
    setEditRegNo(log.regNo);
    setEditDate(log.date);
    setEditQuantity(String(log.quantity));
    setEditRate(String(log.rate));
    setEditOdometer(String(log.odometer));
    setEditSlipNo(log.slipNo);
    setEditFilledBy(log.filledBy || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLogForManage) return;

    setIsSubmitting(true);
    try {
      const q = parseFloat(editQuantity);
      const r = parseFloat(editRate);
      const updatedData: Partial<FuelLog> = {
        regNo: editRegNo.toUpperCase().trim(),
        date: editDate,
        quantity: q,
        rate: r,
        amount: parseFloat((q * r).toFixed(2)),
        odometer: parseInt(editOdometer),
        slipNo: editSlipNo.toUpperCase().trim(),
        filledBy: editFilledBy || 'Fuel Attendant'
      };

      await onUpdateLog(selectedLogForManage.id, updatedData);
      
      // Update state for currently open modal
      setSelectedLogForManage({
        ...selectedLogForManage,
        ...updatedData
      });

      triggerNotif('✏️ Fuel log updated successfully!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateManageDocs = async (updatedDocs: VehicleDocument[]) => {
    if (!selectedLogForManage) return;
    try {
      await onUpdateLog(selectedLogForManage.id, { documents: updatedDocs });
      setSelectedLogForManage({
        ...selectedLogForManage,
        documents: updatedDocs
      });
      triggerNotif('📎 Documents updated successfully.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLog = async (id: string, slip: string) => {
    if (!confirm(`Are you sure you want to delete fuel slip ${slip}? This action is irreversible.`)) return;
    try {
      await onDeleteLog(id);
      triggerNotif('🗑️ Fuel log successfully deleted from server.');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredLogs = logs.filter(log =>
    (log?.regNo || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (log?.slipNo || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const totalFuelAmt = logs.reduce((sum, log) => sum + (log.amount || 0), 0);
  const totalLitres = logs.reduce((sum, log) => sum + (log.quantity || 0), 0);
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
            Departmental view: Fuel Slip Vouchers, Consumption Audits, & Logbook
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Add slip */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-emerald-600" />
            Log New Fuel Voucher Slip
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Vehicle Registration Number *</label>
              <input
                type="text"
                required
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                placeholder="e.g. KA53AA0069"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Fuel Quantity (Litres) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 120"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Rate per Litre (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="e.g. 94.50"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Odometer Reading *</label>
                <input
                  type="number"
                  required
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  placeholder="e.g. 142300"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Fuel Slip / Refuel No *</label>
                <input
                  type="text"
                  required
                  value={slipNo}
                  onChange={(e) => setSlipNo(e.target.value)}
                  placeholder="e.g. FL-9021"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono font-bold uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Date of Refuel</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Authorized Fuel filler Name</label>
              <input
                type="text"
                value={filledBy}
                onChange={(e) => setFilledBy(e.target.value)}
                placeholder="e.g. Anil Singh"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800"
              />
            </div>

            <DocumentAttachment 
              documents={newEntryDocs} 
              onChange={setNewEntryDocs} 
              label="Attach Fuel Receipt / Invoice"
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs mt-3 cursor-pointer"
            >
              {isSubmitting ? 'Posting Slip...' : 'Authorize Refuel Slip'}
            </button>
          </form>
        </div>

        {/* Right column: Fuel Log sheet */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Fuel className="w-4 h-4 text-emerald-600" />
              Fuel Refilling Slip Logs Ledger
            </h2>
            <div className="relative w-full sm:w-48">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Search Reg No or Slip"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 text-[11px] focus:outline-none text-slate-800 font-semibold"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Reg. No.</th>
                  <th className="px-3 py-2.5">Slip No</th>
                  <th className="px-3 py-2.5">Odometer</th>
                  <th className="px-3 py-2.5 text-right">Quantity</th>
                  <th className="px-3 py-2.5 text-right">Rate</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5 text-center">Docs</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400 font-mono">
                      NO REFUELLING RECORDS FOUND IN CURRENT JOURNAL.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{log.date}</td>
                      <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase tracking-wider">{log.regNo}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{log.slipNo}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-600">{log.odometer?.toLocaleString('en-IN')} km</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-800">{(log.quantity || 0)} L</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">₹{(log.rate || 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">₹{(log.amount || 0).toLocaleString('en-IN')}</td>
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
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleOpenManageModal(log)}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                            title="Edit entry & upload documents"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log.id, log.slipNo)}
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
      </div>

      {/* Unified Manage & Documents Modal */}
      {selectedLogForManage && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <Fuel className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-sm">Manage Fuel Log Entry</h3>
                  <p className="text-[10px] font-mono text-slate-500">Slip No: {selectedLogForManage.slipNo} | ID: {selectedLogForManage.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedLogForManage(null)}
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
                  Edit Entry Details
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

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Fuel Quantity (Litres) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Rate per Litre (₹) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Odometer Reading *</label>
                      <input
                        type="number"
                        required
                        value={editOdometer}
                        onChange={(e) => setEditOdometer(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Fuel Slip / Refuel No *</label>
                      <input
                        type="text"
                        required
                        value={editSlipNo}
                        onChange={(e) => setEditSlipNo(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono font-bold uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Date of Refuel *</label>
                      <input
                        type="date"
                        required
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Filler Name</label>
                      <input
                        type="text"
                        value={editFilledBy}
                        onChange={(e) => setEditFilledBy(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs cursor-pointer"
                  >
                    {isSubmitting ? 'Saving changes...' : 'Save Fuel Log Changes'}
                  </button>
                </form>
              </div>

              {/* Right Column: Document Upload & List */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                <DocumentAttachment
                  documents={selectedLogForManage.documents}
                  onChange={handleUpdateManageDocs}
                  label="Verified Fuel Slip Documents"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
