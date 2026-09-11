import React, { useState } from 'react';
import { FuelLog, Vehicle } from '../../types';
import {
  downloadFuelBunkImportTemplate, parseFuelBunkImportFile, buildFuelLogFromImportRow,
  exportFuelImportErrorRows, ParsedFuelImportRow
} from '../../utils/fuelImportExport';
import ImportWizardModal from '../ImportWizardModal';

interface FuelBunkImportModalProps {
  logs: FuelLog[];
  vehicles: Vehicle[];
  enteredBy: string | undefined;
  bunkOptions: { bunkName: string; location: string }[]; // known (bunk, location) pairs - see FuelManagement.tsx's own usedBunks/LOCATION_BUNK_MAP
  onAddLog: (log: Omit<FuelLog, 'id'>) => Promise<void>;
  onClose: () => void;
  onImported: () => void;
}

// 2026-09-11 direct request: "Import Fuel Excel" - Bunk-paid entries only.
// The employee picks ONE bunk up front (the spec's own "Bunk: [ Select
// Bunk v ]") and that becomes the context for every row in the file - the
// file itself never needs Bunk Name/Location columns (see
// parseFuelBunkImportFile's fixedBunk param). Every save goes through the
// EXISTING onAddLog -> POST /api/fuel path (same as a manual Add Entry) -
// this component never talks to the server directly, so the existing
// future-date rejection, Indent No. duplicate check, and audit log all
// apply automatically, unchanged.
export default function FuelBunkImportModal({ logs, vehicles, enteredBy, bunkOptions, onAddLog, onClose, onImported }: FuelBunkImportModalProps) {
  const [selectedKey, setSelectedKey] = useState(() => (bunkOptions[0] ? `${bunkOptions[0].location}|||${bunkOptions[0].bunkName}` : ''));
  const selected = (() => {
    const [location, bunkName] = selectedKey.split('|||');
    return { bunkName: bunkName || '', location: location || '' };
  })();

  // entryNumber is a client-computed running counter, not server-generated
  // (see FuelManagement.tsx's own manual-entry handleSubmit) - same
  // technique WarehouseImportModal.tsx already uses for slNo.
  const startingEntryNumber = logs.length > 0 ? Math.max(...logs.map(lg => lg.entryNumber || 0)) : 0;
  let nextEntryNumber = startingEntryNumber;

  return (
    <ImportWizardModal<ParsedFuelImportRow>
      title="Import Fuel Excel"
      infoText={
        <>
          Upload an Excel (.xlsx) or CSV file matching the template below. Every row is validated and previewed before anything is actually imported - nothing goes in blind.
          The Bunk selected above applies to every row in this file - the file itself doesn't need its own Bunk Name/Location columns. Indent No. is imported EXACTLY as it appears in the file, never generated or changed - a row whose Indent No. already exists in this Bunk's sequence is flagged and skipped, never silently renumbered.
        </>
      }
      scopeToggle={{
        label: 'Select Bunk *',
        chipLabel: 'Bunk',
        value: selectedKey,
        options: bunkOptions.map(b => ({ value: `${b.location}|||${b.bunkName}`, label: `${b.bunkName} (${b.location})` })),
        onChange: setSelectedKey,
        caption: 'Every row in this file will be logged against this one Bunk + Location.',
        variant: 'dropdown'
      }}
      onDownloadTemplate={downloadFuelBunkImportTemplate}
      onParseFile={(file) => parseFuelBunkImportFile(file, logs, vehicles, selected, enteredBy)}
      previewColumns={['Row', 'Date', 'Vehicle No', 'Indent No.', 'Litres', 'Rate', 'Amount']}
      renderPreviewRow={(r) => [r.rowNumber, r.date || '-', r.vehicleNumber || '-', r.indentNumber || '-', r.ltrs, r.rate, r.amount]}
      onImportRow={(row) => {
        nextEntryNumber += 1;
        return onAddLog(buildFuelLogFromImportRow(row, nextEntryNumber));
      }}
      onDownloadErrorRows={exportFuelImportErrorRows}
      itemNounSingular="entry"
      itemNounPlural="entries"
      onClose={onClose}
      onImported={onImported}
    />
  );
}
