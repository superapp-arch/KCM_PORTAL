// Fuel Management's Import/Export logic (2026-09-11 direct request) - kept
// separate from FuelManagement.tsx (already large), mirroring
// warehouseImportExport.ts's shape (upload -> validate/preview -> confirm ->
// sequential import via the wizard shell). Two entry points -
// parseFuelBunkImportFile (bunk pre-selected up front for the whole file)
// and parseFuelCardImportFile (bunk/location are real per-row columns
// instead, since a card can be swiped at a different physical bunk each
// time) - share everything else via parseFuelRows below.
//
// Every save still goes through the EXISTING, already-validated
// POST /api/fuel endpoint (via FuelManagement.tsx's own onAddLog prop) -
// this file only builds the preview/validation; it never talks to the
// server or creates a new bulk-insert path, so server-side duplicate/
// future-date protection is inherited automatically, never re-implemented.
import * as XLSX from 'xlsx';
import { FuelLog, Vehicle } from '../types';
import { findDuplicateFuelIndentNumber } from './fuelIndentNumber';

const normalizeHeader = (h: unknown): string => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const stripRegNo = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

// Same tolerant date parser the Warehouse importer uses - ISO,
// dd.mm.yyyy/dd-mm-yyyy/dd/mm/yyyy, month-name text, or an Excel date serial.
function normalizeImportDate(raw: string | number): string {
  if (typeof raw === 'number') {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (dmy) { const [, d, m, y] = dmy; return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  if (/[a-zA-Z]/.test(s)) {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
  }
  return '';
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const FUEL_IMPORT_ALIASES: Record<string, keyof FuelLog> = {
  date: 'date',
  period: 'period', month: 'period', billingmonth: 'period',
  location: 'location',
  bunkname: 'bunkName', bunk: 'bunkName',
  vehiclenumber: 'vehicleNumber', vehicleno: 'vehicleNumber', vehicle: 'vehicleNumber', regno: 'vehicleNumber',
  // Indent No. aliases deliberately do NOT include anything that could be
  // confused with a different numeric field (e.g. no bare "no") - see
  // parseFuelRows below for why this column is read as a raw string,
  // never parsed as a number.
  indentno: 'indentNumber', indentnumber: 'indentNumber',
  ltrs: 'ltrs', litres: 'ltrs', liters: 'ltrs', qty: 'ltrs', quantity: 'ltrs',
  rate: 'rate', rateperlitre: 'rate',
  amount: 'amount', amt: 'amount',
  client: 'client',
  type: 'type', entrytype: 'type',
  vendorname: 'vendorName',
  vendorcode: 'vendorCode',
  remarks: 'remarks', remark: 'remarks',
  requestedby: 'requestedBy',
  rqid: 'rqId'
};

const FUEL_TEMPLATE_HEADERS_COMMON = [
  'Date', 'Period (YYYY-MM)', 'Vehicle Number', 'Indent No.', 'Litres', 'Rate', 'Amount',
  'Client', 'Type', 'Vendor Name', 'Vendor Code', 'Remarks', 'Requested By'
];
const FUEL_TEMPLATE_HEADERS_BUNK = FUEL_TEMPLATE_HEADERS_COMMON; // Bunk Name/Location supplied by the Select Bunk step, not a file column
const FUEL_TEMPLATE_HEADERS_CARD = ['Date', 'Period (YYYY-MM)', 'Location', 'Bunk Name', 'Vehicle Number', 'Indent No.', 'Litres', 'Rate', 'Amount', 'Client', 'Type', 'Vendor Name', 'Vendor Code', 'Remarks', 'Requested By'];

const TEMPLATE_INDENT_NOTE = 'Sample row - delete before importing. Indent No. is imported EXACTLY as typed here, including leading zeros - Excel must treat this column as TEXT (format the column as Text, or prefix the value with an apostrophe like \'0014258) or Excel itself will silently drop the leading zeros before this file is even uploaded. Amount is recalculated as Litres x Rate when left blank.';

export function downloadFuelBunkImportTemplate(): void {
  const sample: Record<string, string | number> = {
    'Date': '2026-09-01', 'Period (YYYY-MM)': '2026-09', 'Vehicle Number': 'KA01AB1234', 'Indent No.': '0014258',
    'Litres': 50, 'Rate': 95.5, 'Amount': '', 'Client': 'KCM', 'Type': 'KCM', 'Vendor Name': '', 'Vendor Code': '',
    'Requested By': '', 'Remarks': TEMPLATE_INDENT_NOTE
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: FUEL_TEMPLATE_HEADERS_BUNK });
  ws['!cols'] = FUEL_TEMPLATE_HEADERS_BUNK.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import Fuel (Bunk)');
  XLSX.writeFile(wb, 'KCM_Fuel_Bunk_Import_Template.xlsx');
}

export function downloadFuelCardImportTemplate(): void {
  const sample: Record<string, string | number> = {
    'Date': '2026-09-01', 'Period (YYYY-MM)': '2026-09', 'Location': 'Hyderabad', 'Bunk Name': 'HPCL',
    'Vehicle Number': 'KA01AB1234', 'Indent No.': '00042', 'Litres': 50, 'Rate': 95.5, 'Amount': '',
    'Client': 'KCM', 'Type': 'KCM', 'Vendor Name': '', 'Vendor Code': '', 'Requested By': '',
    'Remarks': TEMPLATE_INDENT_NOTE
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: FUEL_TEMPLATE_HEADERS_CARD });
  ws['!cols'] = FUEL_TEMPLATE_HEADERS_CARD.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import Fuel (Card)');
  XLSX.writeFile(wb, 'KCM_Fuel_Card_Import_Template.xlsx');
}

export interface ParsedFuelImportRow {
  rowNumber: number;
  errors: string[];
  warnings: string[];
  date: string;
  period: string;
  location: string;
  bunkName: string;
  bunkOrCard: 'Bunk' | 'Card';
  vehicleNumber: string;
  indentNumber: string; // read verbatim from the file - never generated, never reformatted
  ltrs: number;
  rate: number;
  amount: number;
  client: string;
  type: 'Vendor' | 'KCM';
  vendorName: string;
  vendorCode: string;
  remarks: string;
  requestedBy: string;
  rqId: string;
}

// Shared by both entry points below. `fixedBunk` (Bunk-import only) forces
// every row's Location/Bunk Name to the one selected up front, regardless
// of what the file itself has in those columns - "the selected bunk must
// become the context for the imported Fuel records", per direct request -
// Card import passes null and reads them per-row instead.
async function parseFuelRows(
  file: File,
  existingLogs: FuelLog[],
  vehicles: Vehicle[],
  bunkOrCard: 'Bunk' | 'Card',
  fixedBunk: { bunkName: string; location: string } | null,
  enteredBy: string | undefined,
  requiredHeaders: (keyof FuelLog)[],
  requiredLabels: Partial<Record<keyof FuelLog, string>>
): Promise<{ headerValid: boolean; missingHeaders: string[]; rows: ParsedFuelImportRow[] }> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const headerRow: unknown[] = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as unknown[]) || [];

  // Checked per TARGET FIELD, not one hardcoded header spelling - a
  // required field is present as long as ANY of its aliases (see
  // FUEL_IMPORT_ALIASES) appears in the file, e.g. "Litres" and "Qty" and
  // "Liters" all satisfy the same required `ltrs` field. Checking a single
  // fixed normalized string here would silently defeat the whole point of
  // having multiple aliases for a required column.
  const presentNormalized = new Set(headerRow.map(h => normalizeHeader(h)));
  const hasAnyAliasFor = (field: keyof FuelLog) =>
    Object.entries(FUEL_IMPORT_ALIASES).some(([headerKey, mappedField]) => mappedField === field && presentNormalized.has(headerKey));
  const missingRequired = requiredHeaders.filter(f => !hasAnyAliasFor(f)).map(f => requiredLabels[f]);
  if (missingRequired.length > 0) {
    return { headerValid: false, missingHeaders: missingRequired, rows: [] };
  }

  // raw: false (same convention as Warehouse's importer) - a Text-formatted
  // Indent No. cell reads back exactly as typed, leading zeros and all.
  const json: Record<string, string | number>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });

  const knownVehicleNos = new Set(vehicles.map(v => stripRegNo(v.regNo || v['Reg. No.'] || '')));

  // GET /api/fuel strips `enteredBy` off every row the viewer owns before it
  // ever reaches this client (see server.ts's filterFuelOrMileageRowsForViewer
  // - "the viewer's own rows... enteredBy always stripped, even from
  // themselves"), so for anyone except a super admin/full-view login,
  // existingLogs arrives with enteredBy === undefined on every row that
  // actually belongs to them. Comparing that directly against this import's
  // real `enteredBy` (the current session's own username, same value
  // FuelManagement.tsx already passes into nextBunkFuelIndentNumber/
  // nextCardFuelIndentNumber for its own live preview) would always mismatch
  // and silently defeat the whole "check against already-saved logs"
  // duplicate check for most users - it would still be caught by the
  // server's own authoritative check at actual-save time (server.ts's
  // POST /api/fuel stamps sessionUser.username fresh and checks against the
  // real unfiltered table), but the point of previewing duplicates before
  // import is to catch them here first. A stripped enteredBy can only mean
  // "this row is mine" (a genuinely foreign row keeps its real enteredBy
  // intact, see the same server comment), so it's safe to fill it back in
  // with this import's own enteredBy for comparison purposes only.
  const existingLogsForDupeCheck = existingLogs.map(l => (l.enteredBy ? l : { ...l, enteredBy }));

  // Both duplicate checks (A: against already-saved logs, B: within this
  // same file) go through the exact same identity function the server
  // itself re-checks at save time - never a separately-invented key.
  const seenThisFile: { id?: string; bunkOrCard?: string; bunkName?: string; date?: string; enteredBy?: string; indentNumber?: string }[] = [];

  const rows: ParsedFuelImportRow[] = json.map((row, idx) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const mapped: Partial<Record<keyof FuelLog, string | number>> = {};
    Object.entries(row).forEach(([header, value]) => {
      const key = FUEL_IMPORT_ALIASES[normalizeHeader(header)];
      if (key && value !== '') mapped[key] = value;
    });

    const date = normalizeImportDate(mapped.date ?? '');
    const location = fixedBunk ? fixedBunk.location : String(mapped.location || '').trim();
    const bunkName = fixedBunk ? fixedBunk.bunkName : String(mapped.bunkName || '').trim();
    const vehicleNumber = String(mapped.vehicleNumber || '').trim().toUpperCase();
    // Indent No. - read verbatim, always as a string, never through
    // Number()/parseInt() anywhere in this function. Whatever XLSX handed
    // back for this cell (already text-preserving thanks to raw:false
    // above, for a properly Text-formatted column) is used exactly as-is.
    const indentNumber = String(mapped.indentNumber ?? '').trim();
    const ltrs = Number(mapped.ltrs) || 0;
    const rate = Number(mapped.rate) || 0;
    const client = String(mapped.client || '').trim();

    if (!date) errors.push('Date is missing or not a recognized date.');
    else if (date > todayIso()) errors.push('Date cannot be in the future.');
    if (!location) errors.push('Location is required.');
    if (!bunkName) errors.push('Bunk Name is required.');
    if (!vehicleNumber) errors.push('Vehicle Number is required.');
    if (!indentNumber) errors.push('Indent No. is required.');
    if (!(ltrs > 0)) errors.push('Litres must be greater than 0.');
    if (!(rate > 0)) errors.push('Rate must be greater than 0.');
    if (!client) errors.push('Client is required.');

    // Vehicle not in Fleet & Vehicles - a warning only, matching Fuel
    // Management's own existing rule (FuelLog.vehicleNumber's own type
    // comment: "autofetched from Fleet, manual entry allowed if not
    // found") - not a new, stricter rule invented for import.
    if (vehicleNumber && !knownVehicleNos.has(stripRegNo(vehicleNumber))) {
      warnings.push('Vehicle Number not found in Fleet & Vehicles - imported as-is (manual entry is already allowed for this field on the live form too).');
    }

    const candidate = { bunkOrCard, bunkName, date, enteredBy };
    if (indentNumber) {
      if (findDuplicateFuelIndentNumber(existingLogsForDupeCheck, indentNumber, candidate)) {
        errors.push(`Indent No. ${indentNumber} already exists in your ${bunkOrCard} sequence${bunkOrCard === 'Bunk' ? ` for ${bunkName} this month` : ''} - not imported. Correct the Indent No. in Excel; it is never silently changed.`);
      } else if (findDuplicateFuelIndentNumber(seenThisFile, indentNumber, candidate)) {
        errors.push(`Indent No. ${indentNumber} is duplicated elsewhere in this file (same ${bunkOrCard === 'Bunk' ? 'bunk/month' : 'sequence'}).`);
      }
      // A synthetic, always-unique id per seen row - findDuplicateFuelIndentNumber's
      // own excludeId check (`l.id === excludeId`) would otherwise compare
      // undefined === undefined for every entry here (we never pass an
      // excludeId when checking against this in-file list) and silently
      // bypass the whole check for every single row.
      seenThisFile.push({ id: `row-${idx}`, bunkOrCard, bunkName, date, enteredBy, indentNumber });
    }

    const period = String(mapped.period || '').trim() || (date ? date.slice(0, 7) : '');
    const amount = mapped.amount != null && mapped.amount !== '' ? Number(mapped.amount) : Math.round(ltrs * rate * 100) / 100;
    const typeRaw = String(mapped.type || '').trim();
    // Same default rule the manual Add Entry form uses (FuelManagement.tsx)
    // - 'KCM' unless the Client is specifically "One Time Vendor", still
    // overridable via the file's own Type column.
    const type: 'Vendor' | 'KCM' = typeRaw === 'Vendor' || typeRaw === 'KCM' ? typeRaw : (client === 'One Time Vendor' ? 'Vendor' : 'KCM');

    return {
      rowNumber: idx + 2, errors, warnings,
      date, period, location, bunkName, bunkOrCard, vehicleNumber, indentNumber,
      ltrs, rate, amount, client, type,
      vendorName: String(mapped.vendorName || '').trim(),
      vendorCode: String(mapped.vendorCode || '').trim(),
      remarks: String(mapped.remarks || '').trim(),
      requestedBy: String(mapped.requestedBy || '').trim(),
      rqId: String(mapped.rqId || '').trim()
    };
  });

  return { headerValid: true, missingHeaders: [], rows };
}

export function parseFuelBunkImportFile(
  file: File,
  existingLogs: FuelLog[],
  vehicles: Vehicle[],
  selectedBunk: { bunkName: string; location: string },
  enteredBy: string | undefined
): Promise<{ headerValid: boolean; missingHeaders: string[]; rows: ParsedFuelImportRow[] }> {
  const required: (keyof FuelLog)[] = ['date', 'vehicleNumber', 'indentNumber', 'ltrs', 'rate', 'client'];
  const labels: Partial<Record<keyof FuelLog, string>> = { date: 'Date', vehicleNumber: 'Vehicle Number', indentNumber: 'Indent No.', ltrs: 'Litres', rate: 'Rate', client: 'Client' };
  return parseFuelRows(file, existingLogs, vehicles, 'Bunk', selectedBunk, enteredBy, required, labels);
}

export function parseFuelCardImportFile(
  file: File,
  existingLogs: FuelLog[],
  vehicles: Vehicle[],
  enteredBy: string | undefined
): Promise<{ headerValid: boolean; missingHeaders: string[]; rows: ParsedFuelImportRow[] }> {
  const required: (keyof FuelLog)[] = ['date', 'location', 'bunkName', 'vehicleNumber', 'indentNumber', 'ltrs', 'rate', 'client'];
  const labels: Partial<Record<keyof FuelLog, string>> = { date: 'Date', location: 'Location', bunkName: 'Bunk Name', vehicleNumber: 'Vehicle Number', indentNumber: 'Indent No.', ltrs: 'Litres', rate: 'Rate', client: 'Client' };
  return parseFuelRows(file, existingLogs, vehicles, 'Card', null, enteredBy, required, labels);
}

// entryNumber is NOT server-generated - it's a client-computed running
// counter (see FuelManagement.tsx's own manual-entry handleSubmit:
// `Math.max(...logs.map(lg => lg.entryNumber || 0)) + 1`, the same pattern
// warehouseImportExport.ts's buildWarehouseEntryFromImportRow already uses
// for slNo). The importer must supply it explicitly, so it's a required
// param here rather than left to the caller to remember to merge in.
export function buildFuelLogFromImportRow(row: ParsedFuelImportRow, entryNumber: number): Omit<FuelLog, 'id'> {
  return {
    entryNumber,
    period: row.period,
    date: row.date,
    location: row.location,
    bunkName: row.bunkName,
    bunkOrCard: row.bunkOrCard,
    vehicleNumber: row.vehicleNumber,
    indentNumber: row.indentNumber,
    ltrs: row.ltrs,
    rate: row.rate,
    amount: row.amount,
    client: row.client,
    type: row.type,
    vendorName: row.vendorName || undefined,
    vendorCode: row.vendorCode || undefined,
    remarks: row.remarks || undefined,
    requestedBy: row.requestedBy || undefined,
    rqId: row.rqId || undefined,
    documents: []
  };
}

export function exportFuelImportErrorRows(rows: ParsedFuelImportRow[]): void {
  const errorRows = rows.filter(r => r.errors.length > 0);
  const data = errorRows.map(r => ({
    'Row': r.rowNumber, 'Date': r.date, 'Location': r.location, 'Bunk Name': r.bunkName, 'Bunk/Card': r.bunkOrCard,
    'Vehicle Number': r.vehicleNumber, 'Indent No.': r.indentNumber, 'Litres': r.ltrs, 'Rate': r.rate, 'Amount': r.amount,
    'Client': r.client, 'Errors': r.errors.join('; '), 'Warnings': r.warnings.join('; ')
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errors');
  XLSX.writeFile(wb, `KCM_Fuel_Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
