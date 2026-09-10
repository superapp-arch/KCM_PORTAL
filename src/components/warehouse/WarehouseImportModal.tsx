import React from 'react';
import { WarehouseEntry, Vehicle } from '../../types';
import {
  downloadWarehouseImportTemplate, parseWarehouseImportFile, buildWarehouseEntryFromImportRow,
  exportWarehouseImportErrorRows, ParsedWarehouseImportRow
} from '../../utils/warehouseImportExport';
import ImportWizardModal from '../ImportWizardModal';

interface WarehouseImportModalProps {
  entries: WarehouseEntry[];
  vehicles: Vehicle[];
  onAddEntry: (entry: Omit<WarehouseEntry, 'id'>) => Promise<void>;
  onUpdateEntry: (id: string, entry: Partial<WarehouseEntry>) => Promise<void>;
  onClose: () => void;
  onImported: () => void;
}

// 2026-09-10 direct request: same wizard as Customer Billing's import (upload
// -> validate/preview -> confirm -> sequential import with progress/cancel
// -> summary, via the shared ImportWizardModal shell) - WITH ONE KEY
// DIFFERENCE: no company/warehouse scope toggle. A single uploaded file can
// legitimately contain multiple warehouses' data across different date
// ranges (rows for 1st-7th under one warehouse, rows for 7th-15th under
// another) - unlike Billing, where the whole file belongs to one company
// chosen up front, Warehouse Details can't ask "which warehouse does this
// file belong to?" up front because the answer varies row by row. Each
// row's own Warehouse Name/Vehicle Number/Date columns are what route it -
// see parseWarehouseImportFile in warehouseImportExport.ts.
export default function WarehouseImportModal({ entries, vehicles, onAddEntry, onUpdateEntry, onClose, onImported }: WarehouseImportModalProps) {
  const startingSlNo = entries.length > 0 ? Math.max(...entries.map(e => e.slNo || 0)) : 0;
  let nextSlNo = startingSlNo;

  return (
    <ImportWizardModal<ParsedWarehouseImportRow>
      title="Import Warehouse Details"
      infoText={
        <>
          Upload an Excel (.xlsx) or CSV file matching the template below. Every row is validated and previewed before anything is actually imported - nothing goes in blind.
          KM Utilised is always recalculated from Opening/Closing KM. Base Rate, Fuel Cost, Final Base Rate, Additional KM/Hour Cost and Grand Total are recalculated the same way the module itself computes them whenever a row supplies Scheduled Rate/Working Days (and Variable Cost Per KM for 24Hr) - otherwise that row's own cost figures are used as-is and flagged "unverified" below.
        </>
      }
      onDownloadTemplate={downloadWarehouseImportTemplate}
      onParseFile={(file) => parseWarehouseImportFile(file, entries, vehicles)}
      previewColumns={['Row', 'Date', 'Warehouse', 'Vehicle No', 'Deployment', 'Grand Total']}
      renderPreviewRow={(r) => [
        r.rowNumber, r.date || '-', r.warehouseName || '-', r.vehicleNumber || '-', r.deploymentType || '-',
        r.grandTotal ? `₹${r.grandTotal.toLocaleString('en-IN')}` : '-'
      ]}
      renderRowAction={(row, updateRow) => {
        if (!row.duplicateOf) return null;
        return (
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={row.willOverwrite}
              onChange={(e) => {
                const checked = e.target.checked;
                updateRow({
                  willOverwrite: checked,
                  errors: checked
                    ? row.errors.filter(err => !err.startsWith('This entry already exists'))
                    : (row.errors.some(err => err.startsWith('This entry already exists'))
                      ? row.errors
                      : [...row.errors, 'This entry already exists for this Warehouse + Vehicle + Date - check "Overwrite" to replace it, or leave unchecked to skip it.'])
                } as Partial<ParsedWarehouseImportRow>);
              }}
            />
            Overwrite
          </label>
        );
      }}
      onImportRow={async (row) => {
        if (row.duplicateOf && row.willOverwrite) {
          // Overwriting an existing entry must never touch its own slNo -
          // buildWarehouseEntryFromImportRow always sets one (required on a
          // NEW entry), so it's stripped back out here rather than letting a
          // synthetic running-counter value clobber the real one.
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
  );
}
