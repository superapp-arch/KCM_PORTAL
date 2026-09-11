import React from 'react';
import { FuelLog, Vehicle } from '../../types';
import {
  downloadFuelCardImportTemplate, parseFuelCardImportFile, buildFuelLogFromImportRow,
  exportFuelImportErrorRows, ParsedFuelImportRow
} from '../../utils/fuelImportExport';
import ImportWizardModal from '../ImportWizardModal';

interface FuelCardImportModalProps {
  logs: FuelLog[];
  vehicles: Vehicle[];
  enteredBy: string | undefined;
  onAddLog: (log: Omit<FuelLog, 'id'>) => Promise<void>;
  onClose: () => void;
  onImported: () => void;
}

// 2026-09-11 direct request: "Import Card Entry" - Card-paid entries only,
// deliberately separate from "Import Fuel Excel" (Bunk-paid). A fuel card
// can be swiped at different physical bunks on different days, so - unlike
// the Bunk import - there's no single bunk to pick up front: Bunk Name and
// Location are real per-row columns in this template instead (see
// parseFuelCardImportFile). Every row is saved with bunkOrCard: 'Card' via
// the EXISTING onAddLog -> POST /api/fuel path, so it structurally can
// never touch Bunk-only calculations (Diesel Payments' bunk balances,
// bunk purchases, etc. already filter on bunkOrCard === 'Bunk') - a Card
// row was never counted there to begin with, same as a manually-entered
// Card row today.
export default function FuelCardImportModal({ logs, vehicles, enteredBy, onAddLog, onClose, onImported }: FuelCardImportModalProps) {
  // entryNumber is a client-computed running counter, not server-generated
  // (see FuelManagement.tsx's own manual-entry handleSubmit) - same
  // technique WarehouseImportModal.tsx already uses for slNo, and
  // FuelBunkImportModal.tsx already uses above.
  const startingEntryNumber = logs.length > 0 ? Math.max(...logs.map(lg => lg.entryNumber || 0)) : 0;
  let nextEntryNumber = startingEntryNumber;

  return (
    <ImportWizardModal<ParsedFuelImportRow>
      title="Import Card Entry"
      infoText={
        <>
          Upload an Excel (.xlsx) or CSV file matching the template below. Every row is validated and previewed before anything is actually imported - nothing goes in blind.
          Each row carries its own Bunk Name and Location, since a fuel card can be used at different bunks on different days. Indent No. is imported EXACTLY as it appears in the file, never generated or changed - a row whose Indent No. already exists in this Card sequence is flagged and skipped, never silently renumbered.
        </>
      }
      onDownloadTemplate={downloadFuelCardImportTemplate}
      onParseFile={(file) => parseFuelCardImportFile(file, logs, vehicles, enteredBy)}
      previewColumns={['Row', 'Date', 'Bunk', 'Vehicle No', 'Indent No.', 'Litres', 'Rate', 'Amount']}
      renderPreviewRow={(r) => [r.rowNumber, r.date || '-', r.bunkName ? `${r.bunkName} (${r.location || '-'})` : '-', r.vehicleNumber || '-', r.indentNumber || '-', r.ltrs, r.rate, r.amount]}
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
