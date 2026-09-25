import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Plus } from 'lucide-react';
import { WarehouseEntry, Vehicle, WarehouseRateOverride } from '../../types';
import {
  downloadWarehouseImportTemplate, readWarehouseImportFile, validateWarehouseImportRows, buildWarehouseEntryFromImportRow,
  exportWarehouseImportErrorRows, ParsedWarehouseImportRow, WarehouseImportFlag, WAREHOUSE_IMPORT_FLAG_LABELS, DUPLICATE_ERROR,
  downloadWarehouse12HrTemplate, downloadWarehouse24HrDedicatedTemplate, downloadWarehouse24HrReeferWalkesTemplate,
  downloadWarehouse24HrAdHocTemplate, downloadWarehouseHybridTemplate
} from '../../utils/warehouseImportExport';
import { formatINR } from '../../utils/warehouseRates';
import ImportWizardModal from '../ImportWizardModal';
import AdHocRouteRateEditor from './AdHocRouteRateEditor';
import { findAdHocRoute, adHocTripOf } from '../../utils/warehouseRateMatrix24hr';

interface WarehouseImportModalProps {
  entries: WarehouseEntry[];
  vehicles: Vehicle[];
  warehouseRateOverrides: WarehouseRateOverride[];
  isSuperAdmin: boolean; // may add a missing route rate from the review ("Add Rate")
  onSaveRateOverride: (override: WarehouseRateOverride) => Promise<void>;
  onAddEntry: (entry: Omit<WarehouseEntry, 'id'>) => Promise<void>;
  onUpdateEntry: (id: string, entry: Partial<WarehouseEntry>) => Promise<void>;
  onClose: () => void;
  onImported: () => void;
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatINR(Math.abs(n))}`;
const hasFlag = (r: ParsedWarehouseImportRow, f: WarehouseImportFlag) => r.flags.includes(f);

// 2026-09-10 direct request: same wizard as Customer Billing's import (upload
// -> validate/preview -> confirm -> sequential import with progress/cancel
// -> summary, via the shared ImportWizardModal shell), with no warehouse
// scope toggle - a file can mix warehouses, each row routes itself.
//
// 2026-09-25: the preview is now an Excel-vs-KCM REVIEW. Every row is run
// through the same KCM rate engine as the Add/Edit form; each calculated
// figure in the file is shown next to KCM's value and the difference, rows
// are summarised/filterable by issue type, a missing Ad-hoc route rate can be
// added right here (Super Admin) and the affected rows revalidate without
// re-uploading. Import saves KCM's figures; the file's own figures are kept
// on each record (importAudit).
export default function WarehouseImportModal({ entries, vehicles, warehouseRateOverrides, isSuperAdmin, onSaveRateOverride, onAddEntry, onUpdateEntry, onClose, onImported }: WarehouseImportModalProps) {
  const startingSlNo = entries.length > 0 ? Math.max(...entries.map(e => e.slNo || 0)) : 0;
  let nextSlNo = startingSlNo;
  const ctx = { existingEntries: entries, vehicles, warehouseRateOverrides };
  const [addRateFor, setAddRateFor] = useState<{ from: string; to: string } | null>(null);

  const summary = (rows: ParsedWarehouseImportRow[]) => {
    const count = (p: (r: ParsedWarehouseImportRow) => boolean) => rows.filter(p).length;
    const valid = count(r => r.errors.length === 0 && r.warnings.length === 0);
    const cards: { label: string; value: number; tone: string; icon: React.ReactNode }[] = [
      { label: 'Total Rows', value: rows.length, tone: 'bg-slate-50 border-slate-200 text-slate-700', icon: null },
      { label: 'Valid', value: valid, tone: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
      { label: 'Warnings', value: count(r => r.errors.length === 0 && r.warnings.length > 0), tone: 'bg-amber-50 border-amber-200 text-amber-700', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
      { label: 'Calculation differences', value: count(r => hasFlag(r, 'calcDifference')), tone: 'bg-amber-50 border-amber-200 text-amber-700', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
      { label: 'New routes / missing rates', value: count(r => hasFlag(r, 'newRoute') || hasFlag(r, 'missingRate')), tone: 'bg-orange-50 border-orange-200 text-orange-700', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
      { label: 'Vehicle / category mismatches', value: count(r => hasFlag(r, 'vehicleTypeMismatch') || hasFlag(r, 'categoryMismatch')), tone: 'bg-orange-50 border-orange-200 text-orange-700', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
      { label: 'Errors', value: count(r => r.errors.length > 0), tone: 'bg-rose-50 border-rose-200 text-rose-700', icon: <XCircle className="w-3.5 h-3.5" /> }
    ];
    return (
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Import Summary</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {cards.map(c => (
            <div key={c.label} className={`border rounded-lg px-2.5 py-1.5 ${c.tone}`}>
              <p className="text-[9px] font-bold uppercase tracking-wide flex items-center gap-1">{c.icon}{c.label}</p>
              <p className="text-base font-black font-mono">{c.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const rowDetail = (r: ParsedWarehouseImportRow) => (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
        <span><b className="text-slate-700">Row {r.rowNumber}</b></span>
        <span>Vehicle: <b className="text-slate-700">{r.vehicleNumber || '-'}</b> ({r.vehicleType || '-'} · {r.vehicleCategory || '-'})</span>
        <span>Deployment: <b className="text-slate-700">{r.deploymentType || '-'}</b>{r.fixedHours ? ` · ${r.fixedHours} Hrs` : ' · Fixed Hrs N/A'}</span>
        {r.adHocFromCity && <span>Route: <b className="text-slate-700">{r.adHocFromCity} → {r.adHocToCity}</b></span>}
        {r.rateSourceNote && <span>KCM rate: <b className="text-slate-700">{r.rateSourceNote}</b></span>}
      </div>
      <table className="w-full text-[11px] bg-white border border-slate-200 rounded-lg overflow-hidden">
        <thead className="bg-slate-100 text-slate-500 uppercase text-[9px]">
          <tr>
            <th className="px-2 py-1 text-left">Field</th>
            <th className="px-2 py-1 text-right">Original Excel Value</th>
            <th className="px-2 py-1 text-right">KCM Calculated Value</th>
            <th className="px-2 py-1 text-right" title="KCM value minus Excel value">Difference (KCM − Excel)</th>
            <th className="px-2 py-1 text-right">Final Saved Value</th>
            <th className="px-2 py-1 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {r.comparisons.map(c => (
            <tr key={c.field} className={c.status === 'different' ? 'bg-amber-50/60' : ''}>
              <td className="px-2 py-1 font-semibold text-slate-700">{c.label}</td>
              <td className="px-2 py-1 text-right font-mono">{c.excel == null ? <span className="text-slate-300">not in file</span> : c.field === 'kmUtilised' ? c.excel : formatINR(c.excel)}</td>
              <td className="px-2 py-1 text-right font-mono">{c.status === 'not-calculated' ? <span className="text-slate-300">not calculated</span> : c.field === 'kmUtilised' ? c.kcm : formatINR(c.kcm)}</td>
              <td className={`px-2 py-1 text-right font-mono ${c.status === 'different' ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>{c.difference == null ? '-' : c.field === 'kmUtilised' ? `${c.difference > 0 ? '+' : ''}${c.difference}` : signed(c.difference)}</td>
              <td className="px-2 py-1 text-right font-mono font-bold text-slate-800">{r.errors.length > 0 ? <span className="text-slate-300">not saved</span> : c.field === 'kmUtilised' ? c.kcm : formatINR(c.kcm)}</td>
              <td className="px-2 py-1 whitespace-nowrap">
                {c.status === 'match' && <span className="text-emerald-700 font-bold">✓ Matches KCM rate</span>}
                {c.status === 'different' && <span className="text-amber-700 font-bold">⚠ Difference detected</span>}
                {c.status === 'not-in-file' && <span className="text-slate-400">No Excel value to compare</span>}
                {c.status === 'not-calculated' && <span className="text-rose-600 font-bold">✕ Fix the row's error first - no guessed KCM value</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const excelTotal = (r: ParsedWarehouseImportRow) => r.comparisons.find(c => c.field === 'grandTotal');

  return (
    <>
      <ImportWizardModal<ParsedWarehouseImportRow>
        title="Import Warehouse Details"
        infoText={
          <>
            Upload an Excel (.xlsx) or CSV file matching the template below. Your values are read exactly as entered and checked against the <b>KCM rate engine</b> (the same calculation as the Add/Edit Entry form) before anything is saved.
            The review shows each calculated figure as <b>Excel value vs KCM value vs difference</b>, and flags vehicle type/category mismatches with Fleet &amp; Vehicles, new Ad-hoc routes and missing rates.
            Imported entries are saved with KCM's official figures; your original Excel figures are kept on each entry for audit. Fixed Hrs/KM values apply to Regular deployments only.
          </>
        }
        onDownloadTemplate={downloadWarehouseImportTemplate}
        extraTemplateOptions={[
          { label: '12Hr Dedicated', onClick: downloadWarehouse12HrTemplate },
          { label: '24Hr Dedicated (Dry)', onClick: downloadWarehouse24HrDedicatedTemplate },
          { label: '24Hr Reefer & Walkes', onClick: downloadWarehouse24HrReeferWalkesTemplate },
          { label: '24Hr Ad-hoc Route', onClick: downloadWarehouse24HrAdHocTemplate },
          { label: 'Hybrid (Manual)', onClick: downloadWarehouseHybridTemplate }
        ]}
        onParseFile={async (file) => {
          const read = await readWarehouseImportFile(file);
          if (!read.headerValid) return { headerValid: false, missingHeaders: read.missingHeaders, rows: [] };
          return { headerValid: true, missingHeaders: [], rows: validateWarehouseImportRows(read.raws, ctx) };
        }}
        // Re-check every row against the latest rates (e.g. right after
        // "Add Rate") - the file isn't read again, and Overwrite ticks stay.
        revalidate={{
          key: warehouseRateOverrides,
          run: (rows) => validateWarehouseImportRows(rows.map(r => ({ rowNumber: r.rowNumber, raw: r.raw })), ctx, rows)
        }}
        renderSummary={summary}
        rowFilters={[
          { key: 'valid', label: 'Valid', test: r => r.errors.length === 0 && r.warnings.length === 0 },
          { key: 'warnings', label: 'Warnings', test: r => r.errors.length === 0 && r.warnings.length > 0 },
          { key: 'errors', label: 'Errors', test: r => r.errors.length > 0 },
          ...(Object.keys(WAREHOUSE_IMPORT_FLAG_LABELS) as WarehouseImportFlag[]).map(f => ({ key: f, label: WAREHOUSE_IMPORT_FLAG_LABELS[f], test: (r: ParsedWarehouseImportRow) => hasFlag(r, f) }))
        ]}
        renderRowDetail={(r) => (r.comparisons.length > 0 ? rowDetail(r) : null)}
        previewColumns={['Row', 'Date', 'Warehouse', 'Vehicle No', 'Deployment', 'Route', 'Excel Grand Total', 'KCM Grand Total', 'Difference', 'Check']}
        renderPreviewRow={(r) => {
          const gt = excelTotal(r);
          const differs = r.comparisons.some(c => c.status === 'different');
          return [
            r.rowNumber, r.date || '-', r.warehouseName || '-', r.vehicleNumber || '-', r.deploymentType || '-',
            r.adHocFromCity ? `${r.adHocFromCity} → ${r.adHocToCity}` : '-',
            gt?.excel != null ? formatINR(gt.excel) : '-',
            r.kcmCalculated ? formatINR(r.grandTotal) : '-',
            gt?.difference != null && gt.difference !== 0 ? signed(gt.difference) : '-',
            r.errors.length > 0 ? '✕ Error' : differs ? '⚠ Difference' : r.comparisons.some(c => c.status === 'match') ? '✓ Matches KCM' : '✓'
          ];
        }}
        renderRowAction={(row, updateRow) => (
          <div className="flex flex-col gap-1">
            {row.missingRoute && (isSuperAdmin ? (
              <button type="button" onClick={() => setAddRateFor(row.missingRoute)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-bold whitespace-nowrap cursor-pointer">
                <Plus className="w-3 h-3" /> Add Rate
              </button>
            ) : (
              <span className="text-[9px] text-slate-500 whitespace-nowrap" title="Only a Super Admin can add route rates">Ask Super Admin to add rate</span>
            ))}
            {row.duplicateOf && (
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={row.willOverwrite}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateRow({
                      willOverwrite: checked,
                      errors: checked
                        ? row.errors.filter(err => err !== DUPLICATE_ERROR)
                        : (row.errors.includes(DUPLICATE_ERROR) ? row.errors : [...row.errors, DUPLICATE_ERROR])
                    } as Partial<ParsedWarehouseImportRow>);
                  }}
                />
                Overwrite
              </label>
            )}
          </div>
        )}
        importButtonLabel={(n) => `Recalculate with KCM rates & import ${n} row${n === 1 ? '' : 's'}`}
        onImportRow={async (row) => {
          if (row.duplicateOf && row.willOverwrite) {
            // Overwriting must never touch the existing entry's own slNo.
            const { slNo: _slNo, ...payload } = buildWarehouseEntryFromImportRow(row, 0);
            await onUpdateEntry(row.duplicateOf, payload);
          } else {
            nextSlNo += 1;
            await onAddEntry(buildWarehouseEntryFromImportRow(row, nextSlNo));
          }
        }}
        onDownloadErrorRows={exportWarehouseImportErrorRows}
        itemNounSingular="entry"
        itemNounPlural="entries"
        onClose={onClose}
        onImported={onImported}
      />
      {addRateFor && (() => {
        // Route already configured but not for this vehicle -> edit that
        // route's rates; otherwise add it as a new route.
        const existing = findAdHocRoute(addRateFor.from, addRateFor.to, warehouseRateOverrides);
        return (
        <AdHocRouteRateEditor
          mode={existing ? 'edit' : 'add'}
          initialFrom={existing ? existing.from : addRateFor.from}
          initialTo={existing ? existing.to : addRateFor.to}
          initialTrip={existing ? adHocTripOf(existing) : 'Round Trip'}
          initialRates={existing?.rates}
          overrides={warehouseRateOverrides}
          onSave={onSaveRateOverride}
          onClose={() => setAddRateFor(null)}
        />
        );
      })()}
    </>
  );
}
