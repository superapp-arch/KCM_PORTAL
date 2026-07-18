import React, { useState, useRef } from 'react';
import { BillingInvoice, VehicleDocument } from '../types';
import { 
  FileText, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Edit2, 
  Trash2, 
  Paperclip, 
  X, 
  Upload, 
  Download, 
  Printer 
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';

interface BillingProps {
  invoices: BillingInvoice[];
  onAddInvoice: (inv: Omit<BillingInvoice, 'id'>) => Promise<void>;
  onUpdateInvoice: (id: string, inv: Partial<BillingInvoice>) => Promise<void>;
  onDeleteInvoice: (id: string) => Promise<void>;
}

export default function Billing({ invoices, onAddInvoice, onUpdateInvoice, onDeleteInvoice }: BillingProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Invoice State
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState('2026-07-07');
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'Paid' | 'Pending' | 'Overdue'>('Pending');
  const [description, setDescription] = useState('');
  const [newEntryDocs, setNewEntryDocs] = useState<VehicleDocument[]>([]);

  const [notif, setNotif] = useState<string | null>(null);

  // Modal / Management State
  const [selectedInvoiceForManage, setSelectedInvoiceForManage] = useState<BillingInvoice | null>(null);

  // Modal Editing Fields
  const [editInvoiceNo, setEditInvoiceNo] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editStatus, setEditStatus] = useState<'Paid' | 'Pending' | 'Overdue'>('Pending');
  const [editDescription, setEditDescription] = useState('');

  const triggerNotif = (msg: string) => {
    setNotif(msg);
    setTimeout(() => setNotif(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNo || !customerName || !amount) {
      alert('Please fill in all invoice details.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddInvoice({
        invoiceNo: invoiceNo.toUpperCase().trim(),
        date,
        customerName,
        amount: parseFloat(amount),
        status,
        description,
        documents: newEntryDocs
      });

      // Reset
      setInvoiceNo('');
      setCustomerName('');
      setAmount('');
      setDescription('');
      setNewEntryDocs([]);
      triggerNotif('🧾 Billing invoice posted successfully & dispatched to ledger!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenManageModal = (inv: BillingInvoice) => {
    setSelectedInvoiceForManage(inv);
    setEditInvoiceNo(inv.invoiceNo);
    setEditDate(inv.date);
    setEditCustomerName(inv.customerName);
    setEditAmount(String(inv.amount));
    setEditStatus(inv.status);
    setEditDescription(inv.description || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForManage) return;

    setIsSubmitting(true);
    try {
      const updatedData: Partial<BillingInvoice> = {
        invoiceNo: editInvoiceNo.toUpperCase().trim(),
        date: editDate,
        customerName: editCustomerName,
        amount: parseFloat(editAmount),
        status: editStatus,
        description: editDescription
      };

      await onUpdateInvoice(selectedInvoiceForManage.id, updatedData);

      setSelectedInvoiceForManage({
        ...selectedInvoiceForManage,
        ...updatedData
      });

      triggerNotif('✏️ Invoice details updated successfully!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateManageDocs = async (updatedDocs: VehicleDocument[]) => {
    if (!selectedInvoiceForManage) return;
    try {
      await onUpdateInvoice(selectedInvoiceForManage.id, { documents: updatedDocs });
      setSelectedInvoiceForManage({
        ...selectedInvoiceForManage,
        documents: updatedDocs
      });
      triggerNotif('📎 Documents updated successfully.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteInvoice = async (id: string, invNo: string) => {
    if (!confirm(`Are you sure you want to delete invoice ${invNo}? This action is irreversible.`)) return;
    try {
      await onDeleteInvoice(id);
      triggerNotif('🗑️ Invoice successfully deleted.');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredInvoices = invoices.filter(inv =>
    (inv?.invoiceNo || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (inv?.customerName || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const totalBilled = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const totalPaid = invoices.filter(inv => inv.status === 'Paid').reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const totalPending = invoices.filter(inv => inv.status === 'Pending').reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const totalOverdue = invoices.filter(inv => inv.status === 'Overdue').reduce((sum, inv) => sum + (inv.amount || 0), 0);

  return (
    <div className="space-y-6" id="billing-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <FileText className="text-blue-600 w-5 h-5" />
            KCM Customer Invoicing & Billing
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Departmental view: B2B Loading Invoices, AR Trackers, and Freight Billing
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider">Total Gross Billing</p>
          <h3 className="text-lg font-bold text-slate-800 mt-1">₹{totalBilled.toLocaleString('en-IN')}</h3>
          <p className="text-slate-400 mt-0.5">{invoices.length} invoices logged</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider text-emerald-600">Collected Revenue</p>
          <h3 className="text-lg font-bold text-emerald-700 mt-1">₹{totalPaid.toLocaleString('en-IN')}</h3>
          <p className="text-emerald-500 font-medium mt-0.5">Cleared at bank</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider text-amber-600">Pending Receivables</p>
          <h3 className="text-lg font-bold text-amber-700 mt-1">₹{totalPending.toLocaleString('en-IN')}</h3>
          <p className="text-slate-400 mt-0.5">Under invoice terms</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider text-rose-600">Overdue Outstanding</p>
          <h3 className="text-lg font-bold text-rose-700 mt-1">₹{totalOverdue.toLocaleString('en-IN')}</h3>
          <p className="text-rose-500 font-semibold mt-0.5">Immediate notice draft ready</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Create Invoice */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit text-xs">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-600" />
            Issue New Freight Invoice
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Invoice Reference Number *</label>
              <input
                type="text"
                required
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-2026-004"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider text-slate-800 uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">B2B Customer Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. DHL Group Supply Chain"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Invoice Value (₹) *</label>
                <input
                  type="number"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 75000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono font-semibold"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Payment Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-medium"
                >
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Invoice Issue Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Consignment Cargo Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Consignment weight, routes, and billing breakdown..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 focus:outline-none text-slate-800"
              />
            </div>

            <DocumentAttachment
              documents={newEntryDocs}
              onChange={setNewEntryDocs}
              label="Attach Signed POD / Invoice Copy"
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs mt-3 cursor-pointer"
            >
              {isSubmitting ? 'Posting Ledger...' : 'Publish Customer Invoice'}
            </button>
          </form>
        </div>

        {/* Right Tabular: Invoice Log */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" />
              Customer Billings & Invoice Journal
            </h2>
            <div className="relative w-full sm:w-48 text-xs">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Search Client or Invoice No"
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
                  <th className="px-3 py-2.5">Invoice No</th>
                  <th className="px-3 py-2.5">Customer Name</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-right">Invoice Amount</th>
                  <th className="px-3 py-2.5 text-center">Docs</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400 font-mono">
                      NO CUSTOMER BILLINGS FOUND IN DIRECTORY JOURNAL.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{inv.date}</td>
                      <td className="px-3 py-2.5 font-bold font-mono text-slate-900 tracking-wider whitespace-nowrap">{inv.invoiceNo}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{inv.customerName}</td>
                      <td className="px-3 py-2.5 text-slate-500 truncate max-w-[120px]">{inv.description || '-'}</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit mx-auto ${
                          inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          inv.status === 'Pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {inv.status === 'Paid' ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> :
                           inv.status === 'Pending' ? <Clock className="w-2.5 h-2.5 text-amber-500" /> :
                           <AlertCircle className="w-2.5 h-2.5 text-rose-500" />}
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        ₹{(inv.amount || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {inv.documents && inv.documents.length > 0 ? (
                          <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
                            <Paperclip className="w-2.5 h-2.5 mr-0.5" />
                            {inv.documents.length}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleOpenManageModal(inv)}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                            title="Edit invoice details & manage files"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNo)}
                            className="p-1 text-slate-400 hover:text-pink-600 hover:bg-slate-100 rounded cursor-pointer"
                            title="Delete invoice record"
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
      {selectedInvoiceForManage && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-sm">Manage Invoice Details</h3>
                  <p className="text-[10px] font-mono text-slate-500">Invoice: {selectedInvoiceForManage.invoiceNo} | ID: {selectedInvoiceForManage.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedInvoiceForManage(null)}
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
                  Edit Invoice Fields
                </h4>
                <form onSubmit={handleSaveEdit} className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Invoice Reference Number *</label>
                    <input
                      type="text"
                      required
                      value={editInvoiceNo}
                      onChange={(e) => setEditInvoiceNo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider uppercase text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      value={editCustomerName}
                      onChange={(e) => setEditCustomerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Invoice Value (₹) *</label>
                      <input
                        type="number"
                        required
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Payment Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold"
                      >
                        <option value="Paid">Paid</option>
                        <option value="Pending">Pending</option>
                        <option value="Overdue">Overdue</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Invoice Date *</label>
                    <input
                      type="date"
                      required
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">cargo / Consignment Description</label>
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
                    {isSubmitting ? 'Saving changes...' : 'Save Invoice Changes'}
                  </button>
                </form>
              </div>

              {/* Right Column: Document Upload & List */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                <DocumentAttachment
                  documents={selectedInvoiceForManage.documents}
                  onChange={handleUpdateManageDocs}
                  label="Verified Invoice Documents"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
