import React, { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { BillingInvoice } from '../../types';
import {
  downloadBillingImportTemplate, parseBillingImportFile, buildInvoiceFromImportRow,
  exportErrorRowsToExcel, ParsedBillingImportRow
} from '../../utils/billingImportExport';

interface BillingImportModalProps {
  invoices: BillingInvoice[];
  onAddInvoice: (inv: Omit<BillingInvoice, 'id'>) => Promise<void>;
  onClose: () => void;
  onImported: () => void; // lets the parent refresh its list after a successful batch
}

type Stage = 'idle' | 'preview' | 'importing' | 'done';

// Import wizard: pick file -> validate + preview (errors highlighted, never
// imported blind) -> import only the valid rows, one at a time so the UI
// stays responsive and shows live progress -> summary, with a one-click
// re-download of just the rows that failed for correction/re-upload.
export default function BillingImportModal({ invoices, onAddInvoice, onClose, onImported }: BillingImportModalProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [fileError, setFileError] = useState('');
  const [rows, setRows] = useState<ParsedBillingImportRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ imported: 0, skipped: 0 });
  const [cancelRequested, setCancelRequested] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter(r => r.errors.length === 0);
  const errorRows = rows.filter(r => r.errors.length > 0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    try {
      const result = await parseBillingImportFile(file, invoices);
      if (!result.headerValid) {
        setFileError(`This file doesn't match the expected Import Invoices template - missing column(s): ${result.missingHeaders.join(', ')}. Download the template below and try again.`);
        return;
      }
      if (result.rows.length === 0) {
        setFileError('No data rows found in this file.');
        return;
      }
      setRows(result.rows);
      setStage('preview');
    } catch (err) {
      console.error(err);
      setFileError('Failed to read this file - make sure it\'s a valid .xlsx or .csv file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setStage('importing');
    setCancelRequested(false);
    setProgress({ done: 0, total: validRows.length });
    let imported = 0;
    for (let i = 0; i < validRows.length; i++) {
      if (cancelRequested) break;
      try {
        await onAddInvoice(buildInvoiceFromImportRow(validRows[i]));
        imported++;
      } catch (err) {
        console.error(`Failed to import row ${validRows[i].rowNumber}:`, err);
        // Keep going - a single row failing to save (e.g. a race on a
        // duplicate Invoice No) shouldn't abort the rest of the batch.
      }
      setProgress({ done: i + 1, total: validRows.length });
    }
    setResult({ imported, skipped: rows.length - imported });
    setStage('done');
    onImported();
  };

  const handleClose = () => {
    if (stage === 'importing') return; // don't let the dialog close mid-batch
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col text-xs">
        <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-gradient-to-r from-slate-900 to-blue-950 text-white">
          <h3 className="font-bold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-blue-400" /> Import Invoices</h3>
          <button onClick={handleClose} disabled={stage === 'importing'} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {stage === 'idle' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-blue-800">
                <FileSpreadsheet className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  Upload an Excel (.xlsx) or CSV file matching the template below. Every row is validated and previewed before anything is actually imported - nothing goes in blind.
                  Total Amt, TDS Amount, and Amount Receivable are always recalculated from List Price/GST %/TDS Rate/Credit Note, never read as raw values from the file.
                </div>
              </div>
              <button type="button" onClick={downloadBillingImportTemplate}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold cursor-pointer">
                <Download className="w-3.5 h-3.5" /> Download Template
              </button>
              {fileError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{fileError}</span>
                </div>
              )}
              <div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors cursor-pointer font-bold">
                  <Upload className="w-5 h-5" /> Click to choose a .xlsx or .csv file
                </button>
              </div>
            </>
          )}

          {stage === 'preview' && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">{validRows.length} valid row{validRows.length === 1 ? '' : 's'}</span>
                {errorRows.length > 0 && <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold">{errorRows.length} row{errorRows.length === 1 ? '' : 's'} with errors</span>}
                <span className="text-slate-400 font-mono">{rows.length} total row{rows.length === 1 ? '' : 's'} read</span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-[#0f172a] text-slate-200 uppercase text-[9px] sticky top-0">
                      <tr>
                        <th className="px-2 py-2">Row</th>
                        <th className="px-2 py-2">Invoice No</th>
                        <th className="px-2 py-2">Client</th>
                        <th className="px-2 py-2">Entity</th>
                        <th className="px-2 py-2 text-right">List Price</th>
                        <th className="px-2 py-2 text-right">GST %</th>
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(r => (
                        <tr key={r.rowNumber} className={r.errors.length > 0 ? 'bg-rose-50 text-rose-800' : 'text-slate-700'}>
                          <td className="px-2 py-1.5 font-mono">{r.rowNumber}</td>
                          <td className="px-2 py-1.5 font-mono font-bold">{r.invoiceNo || '-'}</td>
                          <td className="px-2 py-1.5">{r.customerName || '-'}</td>
                          <td className="px-2 py-1.5">{r.entity || '-'}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.listPrice ? `₹${r.listPrice.toLocaleString('en-IN')}` : '-'}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.gstPercent || 0}%</td>
                          <td className="px-2 py-1.5 font-mono">{r.date || '-'}</td>
                          <td className="px-2 py-1.5">{r.paymentStatus}</td>
                          <td className="px-2 py-1.5 max-w-[220px]">{r.errors.length > 0 ? r.errors.join(' ') : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {errorRows.length > 0 && (
                <button type="button" onClick={() => exportErrorRowsToExcel(rows)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold cursor-pointer">
                  <Download className="w-3.5 h-3.5" /> Download Error Rows for Correction
                </button>
              )}
            </>
          )}

          {stage === 'importing' && (
            <div className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <p className="font-bold text-slate-700">Importing {progress.done} of {progress.total}...</p>
              <div className="w-full max-w-sm h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
              <button type="button" onClick={() => setCancelRequested(true)} className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer">Cancel remaining rows</button>
            </div>
          )}

          {stage === 'done' && (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p className="font-bold text-slate-800 text-sm">{result.imported} invoice{result.imported === 1 ? '' : 's'} imported successfully{result.skipped > 0 ? `, ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped due to errors` : ''}.</p>
              {errorRows.length > 0 && (
                <button type="button" onClick={() => exportErrorRowsToExcel(rows)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold cursor-pointer">
                  <Download className="w-3.5 h-3.5" /> Download Error Rows for Correction
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
          {stage === 'preview' && (
            <>
              <button type="button" onClick={() => { setRows([]); setStage('idle'); }} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Choose a Different File</button>
              <button type="button" onClick={handleImport} disabled={validRows.length === 0}
                className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer disabled:opacity-50">
                Import {validRows.length} Valid Row{validRows.length === 1 ? '' : 's'}
              </button>
            </>
          )}
          {(stage === 'idle' || stage === 'done') && (
            <button type="button" onClick={handleClose} className="w-full bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">
              {stage === 'done' ? 'Close' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
