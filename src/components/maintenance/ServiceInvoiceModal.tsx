import React, { useState, useEffect } from 'react';
import { X, Download, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { MaintenanceRecord, ServiceInvoiceRecord, Vehicle, VehicleServiceSchedule, MaintenanceServiceStation } from '../../types';
import { resolveOrGenerateInvoice, markInvoiceDownloaded, updateInvoicePaidAmount } from '../../utils/serviceInvoiceGenerate';
import { buildServiceInvoiceFile } from '../../utils/serviceInvoicePdf';
import { numberToIndianWords } from '../../utils/numberToWords';
import DocumentHeader from '../DocumentHeader';

interface ServiceInvoiceModalProps {
  record: MaintenanceRecord;
  vehicles: Vehicle[];
  vehicleServiceSchedules: VehicleServiceSchedule[];
  serviceStations: MaintenanceServiceStation[];
  existingInvoices: ServiceInvoiceRecord[];
  performedBy: string;
  onClose: () => void;
  onInvoiceSaved: (invoice: ServiceInvoiceRecord) => void; // lets the parent merge the new/updated invoice into its own list
  onRecordInvoiceNumberSet: (invoiceNumber: string) => void; // syncs the denormalized MaintenanceRecord.invoiceNumber shown in the ledger table
}

const rupee = (n: number | undefined) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;

export default function ServiceInvoiceModal({
  record, vehicles, vehicleServiceSchedules, serviceStations, existingInvoices, performedBy, onClose, onInvoiceSaved, onRecordInvoiceNumberSet
}: ServiceInvoiceModalProps) {
  const [invoice, setInvoice] = useState<ServiceInvoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [paidInput, setPaidInput] = useState('');
  const [savingPaid, setSavingPaid] = useState(false);

  const run = async (forceRegenerate: boolean) => {
    setLoading(true);
    setError('');
    try {
      const result = await resolveOrGenerateInvoice({ record, vehicles, vehicleServiceSchedules, serviceStations, existingInvoices, forceRegenerate, performedBy });
      setInvoice(result.invoice);
      setPaidInput(result.invoice.paidAmount != null ? String(result.invoice.paidAmount) : '');
      onInvoiceSaved(result.invoice);
      onRecordInvoiceNumberSet(result.invoice.invoiceNumber);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate the service invoice.');
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  };

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      const file = await buildServiceInvoiceFile(invoice);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      await markInvoiceDownloaded(invoice, performedBy);
      onInvoiceSaved({ ...invoice, isDownloaded: true, lastDownloadedDate: new Date().toISOString().slice(0, 10) });
    } finally {
      setDownloading(false);
    }
  };

  const handleRegenerate = () => {
    if (!confirm(`Regenerate the invoice for ${record.regNo}? This creates a new invoice number and audit entry - the old one stays on record.`)) return;
    setRegenerating(true);
    run(true);
  };

  const handleSavePaid = async () => {
    if (!invoice) return;
    const amount = parseFloat(paidInput) || 0;
    setSavingPaid(true);
    try {
      const updated = await updateInvoicePaidAmount(invoice, amount);
      setInvoice(updated);
      onInvoiceSaved(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to update the paid amount.');
    } finally {
      setSavingPaid(false);
    }
  };

  const balance = invoice ? (invoice.totalAmount || 0) - (invoice.paidAmount || 0) : 0;

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-700 to-slate-900 text-white">
          <h3 className="text-sm font-bold">Service Invoice - {record.regNo}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 text-xs">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Generating...</div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          ) : invoice ? (
            <div className="space-y-3">
              <DocumentHeader subtitle="Service Invoice" />

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div><span className="text-slate-400">Invoice No.: </span><span className="font-semibold font-mono">{invoice.invoiceNumber}</span></div>
                <div><span className="text-slate-400">Work Order: </span><span className="font-semibold">{invoice.workOrderDate}{invoice.workOrderTime ? ` ${invoice.workOrderTime}` : ''}</span></div>
                <div><span className="text-slate-400">Vehicle No.: </span><span className="font-semibold font-mono">{invoice.regNo}</span></div>
                <div><span className="text-slate-400">Service Station: </span><span className="font-semibold">{invoice.garageName || '-'}</span></div>
                <div><span className="text-slate-400">Model: </span><span className="font-semibold">{invoice.vehicleModel || '-'}</span></div>
                <div><span className="text-slate-400">Ownership: </span><span className="font-semibold">{invoice.vehicleOwnership || '-'}</span></div>
                <div className="col-span-2"><span className="text-slate-400">Odometer: </span><span className="font-semibold">{invoice.odometer != null ? `${invoice.odometer.toLocaleString('en-IN')} km` : 'No fuel/mileage entries yet'}</span></div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-blue-800 text-white px-3 py-1.5 font-bold">Spare / Labour Items</div>
                <div className="divide-y divide-slate-100">
                  {invoice.workItems.map((w, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1 gap-2">
                      <span className="text-slate-600 truncate">{w.description}{w.type ? <span className="text-slate-400"> ({w.type})</span> : ''}</span>
                      <span className="font-mono font-semibold shrink-0">{rupee(w.cost)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">Total Amount</span><span className="font-mono font-semibold">{rupee(invoice.totalAmount)}</span></div>
                  <div className="flex items-center justify-between px-3 py-1 gap-2">
                    <span className="text-slate-600 shrink-0">Paid Amount</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" step="0.01" value={paidInput} onChange={(e) => setPaidInput(e.target.value)} placeholder="0"
                        className="w-24 bg-white border border-slate-200 rounded-lg p-1 text-[11px] font-mono font-bold text-slate-800 text-right" />
                      <button onClick={handleSavePaid} disabled={savingPaid} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer disabled:opacity-50">
                        {savingPaid ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50 font-bold text-blue-800"><span>Balance Due</span><span className="font-mono">{rupee(balance)}</span></div>
                </div>
              </div>

              <p className="text-slate-500 italic text-center">{numberToIndianWords(invoice.totalAmount)}</p>
              {invoice.nextServiceDueNote && (
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-center">Next Servicing Due: {invoice.nextServiceDueNote}</p>
              )}

              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 flex items-center justify-between">
                <span>Generated: {invoice.generatedDate}{invoice.generatedTime ? ` ${invoice.generatedTime}` : ''}</span>
                <span>System-generated invoice.</span>
              </div>
            </div>
          ) : null}
        </div>

        {invoice && !loading && (
          <div className="p-4 border-t border-slate-100 flex items-center gap-2">
            <button onClick={handleRegenerate} disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg font-semibold cursor-pointer disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} /> Regenerate
            </button>
            <button onClick={handleDownload} disabled={downloading}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-all">
              <Download className="w-3.5 h-3.5" /> {downloading ? 'Downloading...' : 'Download PDF'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
