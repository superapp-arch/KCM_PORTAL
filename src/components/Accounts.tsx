import React, { useState, useRef } from 'react';
import { AccountsEntry, VehicleDocument } from '../types';
import { 
  Landmark, 
  Plus, 
  Search, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Edit2, 
  Trash2, 
  Paperclip, 
  X, 
  Upload, 
  Download, 
  Printer 
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import DateInput from './DateInput';
import DocumentAttachment from './DocumentAttachment';

interface AccountsProps {
  entries: AccountsEntry[];
  onAddEntry: (entry: Omit<AccountsEntry, 'id'>) => Promise<void>;
  onUpdateEntry: (id: string, entry: Partial<AccountsEntry>) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
}

export default function Accounts({ entries, onAddEntry, onUpdateEntry, onDeleteEntry }: AccountsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Entry State
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<'Income' | 'Expense'>('Income');
  const [category, setCategory] = useState('Freight Revenue');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [newEntryDocs, setNewEntryDocs] = useState<VehicleDocument[]>([]);

  const [notif, setNotif] = useState<string | null>(null);

  // Modal / Management State
  const [selectedEntryForManage, setSelectedEntryForManage] = useState<AccountsEntry | null>(null);

  // Modal Editing Fields
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<'Income' | 'Expense'>('Income');
  const [editCategory, setEditCategory] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editReference, setEditReference] = useState('');

  const triggerNotif = (msg: string) => {
    setNotif(msg);
    setTimeout(() => setNotif(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !amount) {
      alert('Please fill in all transaction details.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddEntry({
        date,
        type,
        category,
        amount: parseFloat(amount),
        reference: reference || 'N/A',
        documents: newEntryDocs
      });

      // Reset
      setAmount('');
      setReference('');
      setNewEntryDocs([]);
      triggerNotif('💰 Financial ledger updated and balanced successfully!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenManageModal = (entry: AccountsEntry) => {
    setSelectedEntryForManage(entry);
    setEditDate(entry.date);
    setEditType(entry.type);
    setEditCategory(entry.category);
    setEditAmount(String(entry.amount));
    setEditReference(entry.reference || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryForManage) return;

    setIsSubmitting(true);
    try {
      const updatedData: Partial<AccountsEntry> = {
        date: editDate,
        type: editType,
        category: editCategory,
        amount: parseFloat(editAmount),
        reference: editReference || 'N/A'
      };

      await onUpdateEntry(selectedEntryForManage.id, updatedData);

      setSelectedEntryForManage({
        ...selectedEntryForManage,
        ...updatedData
      });

      triggerNotif('✏️ Ledger entry updated successfully!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateManageDocs = async (updatedDocs: VehicleDocument[]) => {
    if (!selectedEntryForManage) return;
    try {
      await onUpdateEntry(selectedEntryForManage.id, { documents: updatedDocs });
      setSelectedEntryForManage({
        ...selectedEntryForManage,
        documents: updatedDocs
      });
      triggerNotif('📎 Documents updated successfully.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEntry = async (id: string, refCode: string) => {
    if (!confirm(`Are you sure you want to delete ledger transaction ${refCode}? This action is irreversible.`)) return;
    try {
      await onDeleteEntry(id);
      triggerNotif('🗑️ Transaction successfully removed.');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredEntries = entries.filter(e =>
    (e?.category || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (e?.reference || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const totalIncome = entries.filter(e => e.type === 'Income').reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalExpense = entries.filter(e => e.type === 'Expense').reduce((sum, e) => sum + (e.amount || 0), 0);
  const netProfit = totalIncome - totalExpense;

  // Prepare chart data for Recharts
  const chartData = [
    { name: 'Incoming Revenue', Value: totalIncome, fill: '#10b981' },
    { name: 'Disbursed Expenses', Value: totalExpense, fill: '#ef4444' },
    { name: 'Net Safe Profit', Value: Math.max(0, netProfit), fill: '#0ea5e9' }
  ];

  return (
    <div className="space-y-6" id="accounts-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <DollarSign className="text-blue-600 w-5 h-5" />
            KCM Accounts & Financial Ledger
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Departmental view: corporate double-entry general journal, profit statements, and liquidity dashboards
          </p>
        </div>
      </div>

      {notif && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {notif}
        </div>
      )}

      {/* KPI Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-xs">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-400 uppercase tracking-wider text-emerald-600 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              Incoming Credits
            </p>
            <h3 className="text-2xl font-bold text-emerald-700 mt-1">₹{totalIncome.toLocaleString('en-IN')}</h3>
            <p className="text-slate-400 mt-0.5">Freight AR clearing journal</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-400 uppercase tracking-wider text-rose-600 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              Operational Debits
            </p>
            <h3 className="text-2xl font-bold text-rose-700 mt-1">₹{totalExpense.toLocaleString('en-IN')}</h3>
            <p className="text-slate-400 mt-0.5">Disbursed diesel & driver cash</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-400 uppercase tracking-wider text-blue-600">Net Corporate Statement</p>
            <h3 className={`text-2xl font-bold mt-1 ${netProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
              ₹{netProfit.toLocaleString('en-IN')}
            </h3>
            <p className="text-slate-400 mt-0.5">Liquidity index safe status</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Add Transaction */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit text-xs">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-emerald-600" />
            Post Financial Ledger Entry
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Journal Side</label>
                <select
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as any);
                    setCategory(e.target.value === 'Income' ? 'Freight Revenue' : 'Fuel Cost');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-semibold"
                >
                  <option value="Income">Incoming Credit (Revenue)</option>
                  <option value="Expense">Outgoing Debit (Cost)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Entry Value (₹) *</label>
                <input
                  type="number"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 25000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Ledger Category / Head *</label>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Freight Revenue, Tire Release, Tax Clearing"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Doc Reference Code</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. INV-2026-001, PC-9912"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Ledger Timestamp Date</label>
              <DateInput
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono"
              />
            </div>

            <DocumentAttachment
              documents={newEntryDocs}
              onChange={setNewEntryDocs}
              label="Attach Transaction Receipts / Supporting Documents"
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs mt-3 cursor-pointer"
            >
              {isSubmitting ? 'Balancing Journal...' : 'Authorize General Ledger Post'}
            </button>
          </form>
        </div>

        {/* Right Panel: Recharts Analytics & Table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Liquidity chart */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100">
              Corporate Liquidity Index Trend
            </h2>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip formatter={(value: any) => [`₹${(value || 0).toLocaleString('en-IN')}`, 'Amount']} />
                  <Bar dataKey="Value" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Accounts General Journal */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Financial General Double-Entry Ledger
              </h2>
              <div className="relative w-full sm:w-48 text-xs">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Search ledger category"
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
                    <th className="px-3 py-2.5">Posting Date</th>
                    <th className="px-3 py-2.5">Category Class</th>
                    <th className="px-3 py-2.5">Doc Reference</th>
                    <th className="px-3 py-2.5 text-center">Type Class</th>
                    <th className="px-3 py-2.5 text-right">Corporate Volume</th>
                    <th className="px-3 py-2.5 text-center">Docs</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-400 font-mono">
                        NO TRANSACTION CODES DISCOVERED IN GENERAL LEDGER.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-slate-500">{e.date}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-800 uppercase tracking-wide">{e.category}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-600 uppercase">{e.reference || '-'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            e.type === 'Income' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                          }`}>
                            {e.type}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap ${
                          e.type === 'Income' ? 'text-emerald-700' : 'text-slate-800'
                        }`}>
                          {e.type === 'Income' ? '+' : '-'} ₹{(e.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {e.documents && e.documents.length > 0 ? (
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
                              <Paperclip className="w-2.5 h-2.5 mr-0.5" />
                              {e.documents.length}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => handleOpenManageModal(e)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                              title="Edit details & attachments"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(e.id, e.reference || 'Ref')}
                              className="p-1 text-slate-400 hover:text-pink-600 hover:bg-slate-100 rounded cursor-pointer"
                              title="Delete transaction entry"
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
      </div>

      {/* Unified Manage & Documents Modal */}
      {selectedEntryForManage && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <Landmark className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-sm">Manage Transaction Entry</h3>
                  <p className="text-[10px] font-mono text-slate-500">Ref: {selectedEntryForManage.reference || 'N/A'} | ID: {selectedEntryForManage.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEntryForManage(null)}
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
                  Edit Transaction Details
                </h4>
                <form onSubmit={handleSaveEdit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Journal Side</label>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold"
                      >
                        <option value="Income">Incoming Credit (Revenue)</option>
                        <option value="Expense">Outgoing Debit (Cost)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Entry Value (₹) *</label>
                      <input
                        type="number"
                        required
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Ledger Category / Head *</label>
                    <input
                      type="text"
                      required
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Doc Reference Code</label>
                    <input
                      type="text"
                      value={editReference}
                      onChange={(e) => setEditReference(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono uppercase"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Date *</label>
                    <DateInput
                      required
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs cursor-pointer"
                  >
                    {isSubmitting ? 'Saving changes...' : 'Save Ledger Changes'}
                  </button>
                </form>
              </div>

              {/* Right Column: Document Upload & List */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                <DocumentAttachment
                  documents={selectedEntryForManage.documents}
                  onChange={handleUpdateManageDocs}
                  label="Verified Financial Evidence"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
