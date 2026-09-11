import React, { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

// Generic bulk-import wizard shell (2026-09-10 direct request) - extracted
// out of Customer Billing's own import modal (formerly a one-off
// BillingImportModal.tsx) so every module's importer goes through the exact
// same upload -> validate/preview -> confirm -> sequential import -> summary
// flow, same look, same behavior, instead of each module reinventing it.
// Domain-specific work (column matching, per-row validation, duplicate
// detection, building the real save payload) stays OUTSIDE this file, in
// each module's own utils file (e.g. billingImportExport.ts,
// warehouseImportExport.ts) - this component only owns the wizard's stage
// machine and chrome, never a module's own field logic.
//
// Row contract: every module's parsed-row type must satisfy this. `errors`
// gates whether a row is importable at all (rose-highlighted, excluded from
// the default "Import N Valid Rows" action). `warnings` are shown too but
// never exclude a row - for something worth the office's attention without
// blocking import (e.g. "cost figures could not be verified").
export interface ImportWizardRow {
  rowNumber: number; // 1-based, matches the spreadsheet row (header is row 1) - also the React key and the identity updateRow() matches on
  errors: string[];
  warnings?: string[];
}

type Stage = 'idle' | 'preview' | 'importing' | 'done';

export interface ImportWizardModalProps<T extends ImportWizardRow> {
  title: string; // e.g. "Import Invoices" / "Import Warehouse Details"
  infoText: React.ReactNode; // the light-blue notice box content - explain what's validated and which fields always recompute
  // Present only for a module that genuinely needs one global scope chosen
  // up front for the whole file (Customer Billing's company). Omit entirely
  // for a module where scope varies row-by-row (Warehouse Details) - there
  // is then no toggle bar at all.
  scopeToggle?: {
    label: string; // the idle-stage question, e.g. "Which company does this file belong to? *"
    chipLabel: string; // short label for the post-upload read-only chip, e.g. "Company"
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    caption: string;
    // 'pills' (default) - a row of buttons, fine for a couple of options
    // (Billing's KCM Insta/KCM Supply). 'dropdown' - a real <select>, for
    // a module with many options (Fuel's Select Bunk, a dozen+ bunk/
    // location pairs) where a button row would overflow/look wrong.
    variant?: 'pills' | 'dropdown';
  };
  onDownloadTemplate: () => void;
  onParseFile: (file: File) => Promise<{ headerValid: boolean; missingHeaders: string[]; rows: T[] }>;
  previewColumns: string[]; // module-specific data columns only - this component appends its own trailing Status column
  renderPreviewRow: (row: T) => (string | number)[]; // must have the same length/order as previewColumns
  // Extra trailing cell per row (e.g. Warehouse's "already exists - Skip /
  // Overwrite" toggle) - rendered between the data columns and Status.
  // `updateRow` merges a patch into this exact row (matched by rowNumber)
  // and re-renders - the caller decides what a patch means (e.g. clearing
  // its own "duplicate" error text to move a row from excluded to included).
  renderRowAction?: (row: T, updateRow: (patch: Partial<T>) => void) => React.ReactNode;
  onImportRow: (row: T) => Promise<void>;
  onDownloadErrorRows: (rows: T[]) => void;
  itemNounSingular: string; // "invoice" / "entry" - for the done-stage summary sentence
  itemNounPlural: string; // "invoices" / "entries" (kept separate from itemNounSingular rather than auto-pluralized - not every noun this shell serves is regular)
  onClose: () => void;
  onImported: () => void; // lets the parent refresh/toast after a successful batch
}

export default function ImportWizardModal<T extends ImportWizardRow>({
  title, infoText, scopeToggle, onDownloadTemplate, onParseFile, previewColumns, renderPreviewRow,
  renderRowAction, onImportRow, onDownloadErrorRows, itemNounSingular, itemNounPlural, onClose, onImported
}: ImportWizardModalProps<T>) {
  const [stage, setStage] = useState<Stage>('idle');
  const [fileError, setFileError] = useState('');
  const [rows, setRows] = useState<T[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ imported: 0, skipped: 0 });
  const [cancelRequested, setCancelRequested] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter(r => r.errors.length === 0);
  const errorRows = rows.filter(r => r.errors.length > 0);
  const warningRows = rows.filter(r => r.errors.length === 0 && (r.warnings?.length || 0) > 0);

  const updateRow = (rowNumber: number, patch: Partial<T>) =>
    setRows(prev => prev.map(r => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    try {
      const result = await onParseFile(file);
      if (!result.headerValid) {
        setFileError(`Couldn't find a required column: ${result.missingHeaders.join(', ')}. Column names are matched flexibly, but this one wasn't found under any recognized name - check the template below for the expected columns.`);
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
        await onImportRow(validRows[i]);
        imported++;
      } catch (err) {
        console.error(`Failed to import row ${validRows[i].rowNumber}:`, err);
        // Keep going - a single row failing to save shouldn't abort the rest.
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
          <h3 className="font-bold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-blue-400" /> {title}</h3>
          <button onClick={handleClose} disabled={stage === 'importing'} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {scopeToggle && stage !== 'idle' && (
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="font-bold uppercase text-[9px] tracking-wider">{scopeToggle.chipLabel}:</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 font-bold text-slate-700">
                {scopeToggle.options.find(o => o.value === scopeToggle.value)?.label || scopeToggle.value}
              </span>
            </div>
          )}
          {stage === 'idle' && (
            <>
              {scopeToggle && (
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5 uppercase text-[10px] tracking-wider">{scopeToggle.label}</label>
                  {scopeToggle.variant === 'dropdown' ? (
                    <select
                      value={scopeToggle.value}
                      onChange={(e) => scopeToggle.onChange(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {!scopeToggle.options.some(o => o.value === scopeToggle.value) && <option value={scopeToggle.value}>Select...</option>}
                      {scopeToggle.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      {scopeToggle.options.map(o => (
                        <button key={o.value} type="button" onClick={() => scopeToggle.onChange(o.value)}
                          className={`flex-1 py-2 rounded-lg border font-bold text-xs cursor-pointer transition-colors ${scopeToggle.value === o.value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[9px] text-slate-400 font-mono mt-1">{scopeToggle.caption}</p>
                </div>
              )}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-blue-800">
                <FileSpreadsheet className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{infoText}</div>
              </div>
              <button type="button" onClick={onDownloadTemplate}
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
                {warningRows.length > 0 && <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 font-bold">{warningRows.length} row{warningRows.length === 1 ? '' : 's'} with warnings</span>}
                <span className="text-slate-400 font-mono">{rows.length} total row{rows.length === 1 ? '' : 's'} read</span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-[#0f172a] text-slate-200 uppercase text-[9px] sticky top-0">
                      <tr>
                        {previewColumns.map(c => <th key={c} className="px-2 py-2 whitespace-nowrap">{c}</th>)}
                        {renderRowAction && <th className="px-2 py-2">Action</th>}
                        <th className="px-2 py-2">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(r => (
                        <tr key={r.rowNumber} className={r.errors.length > 0 ? 'bg-rose-50 text-rose-800' : (r.warnings?.length ? 'bg-amber-50/60 text-slate-700' : 'text-slate-700')}>
                          {renderPreviewRow(r).map((cell, i) => (
                            <td key={i} className={`px-2 py-1.5 whitespace-nowrap ${typeof cell === 'number' ? 'text-right font-mono' : ''}`}>{cell}</td>
                          ))}
                          {renderRowAction && (
                            <td className="px-2 py-1.5">{renderRowAction(r, (patch) => updateRow(r.rowNumber, patch))}</td>
                          )}
                          <td className="px-2 py-1.5 max-w-[220px]">
                            {r.errors.length > 0
                              ? r.errors.join(' ')
                              : r.warnings?.length
                              ? <span className="text-amber-700">{r.warnings.join(' ')}</span>
                              : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {errorRows.length > 0 && (
                <button type="button" onClick={() => onDownloadErrorRows(rows)}
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
              <p className="font-bold text-slate-800 text-sm">
                {result.imported} {result.imported === 1 ? itemNounSingular : itemNounPlural} imported successfully{result.skipped > 0 ? `, ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped` : ''}.
              </p>
              {errorRows.length > 0 && (
                <button type="button" onClick={() => onDownloadErrorRows(rows)}
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
