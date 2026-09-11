// Warehouse Details' Import/Export logic (2026-09-10 direct request) - kept
// separate from WarehouseDetails.tsx (already large), mirroring
// billingImportExport.ts's shape so both modules' importers work the same
// way. Column matching (WAREHOUSE_IMPORT_ALIASES/normalizeImportDate) is
// promoted unchanged from what WarehouseDetails.tsx already had - this file
// adds the missing preview/validation/duplicate-detection/deployment-check
// layer Customer Billing's importer already had and Warehouse's own direct-
// save-loop version never did.
import * as XLSX from 'xlsx';
import { WarehouseEntry, Vehicle, WarehouseRateOverride } from '../types';
import { WAREHOUSE_LOCATIONS } from './warehouseLocations';
import { computeWarehouseRates, computeAutoWorkingDays, resolveWorkingDays, round2 } from './warehouseRates';
import { rateGroupForWarehouseName, lookupScheduledRate } from './warehouseRateMatrix';
import { lookup24hrDedicatedRate, lookupReeferWalkesRate, lookupAdHocRouteRate } from './warehouseRateMatrix24hr';

// --- Column matching (promoted from WarehouseDetails.tsx unchanged, plus
// the rate-calc-input aliases needed so computeWarehouseRates() can run on
// an imported row - see the alignment note above additionalKmCost etc.) ---
const normalizeHeader = (h: unknown): string => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const WAREHOUSE_IMPORT_ALIASES: Record<string, keyof WarehouseEntry> = {
  date: 'date', deploymentdate: 'date',
  warehousename: 'warehouseName', warehouse: 'warehouseName',
  warehousecity: 'warehouseCity',
  vehiclenumber: 'vehicleNumber', vehicleno: 'vehicleNumber', vehicle: 'vehicleNumber', regno: 'vehicleNumber',
  vehicletype: 'vehicleType', type: 'vehicleType',
  vehiclecategory: 'vehicleCategory', category: 'vehicleCategory',
  deploymenttype: 'deploymentType', deployment: 'deploymentType',
  fromcityadhoc: 'adHocFromCity', fromcity: 'adHocFromCity',
  tocityadhoc: 'adHocToCity', tocity: 'adHocToCity',
  podname: 'pod', pod: 'pod',
  podcity: 'podCity',
  fixedhours: 'fixedHours', fixedhrs: 'fixedHours',
  kmslab: 'kmSlab',
  openingkm: 'openingKm', opening: 'openingKm',
  closingkm: 'closingKm', closing: 'closingKm',
  intime: 'inTime',
  closuretime: 'closureTime', closure: 'closureTime',
  contractperioddayshrs: 'hoursDaysAsPerContract', contractperiod: 'hoursDaysAsPerContract',
  hourdayaspercontract: 'hoursDaysAsPerContract', hourdayascontract: 'hoursDaysAsPerContract',
  overtimevehicle: 'overtimeVehicle', ot: 'overtimeVehicle', otvehicle: 'overtimeVehicle',
  extrakm: 'extraKm', addkm: 'extraKm',
  baserate: 'baseRate',
  fuelcost: 'fuelCost',
  finalbaserate: 'finalBaseRate',
  additionalkmcost: 'additionalKmCost',
  additionalhourcost: 'additionalHourCost',
  tollcharges: 'tollCharges', tolls: 'tollCharges',
  parkingcost: 'parkingCost', parking: 'parkingCost',
  hybridreefercost: 'hybridReeferCost', hybridreefer: 'hybridReeferCost',
  grandtotal: 'grandTotal',
  vendorremarks: 'vendorRemarks', remarks: 'vendorRemarks',
  scheduledrate: 'scheduledRate',
  warehousegroup: 'warehouseGroup',
  // 2026-09-10 addition - rate-calc inputs, needed for computeWarehouseRates()
  // to run on an imported row rather than always trusting the file's own
  // cost figures (see "Cost figures" validation below).
  workingdays: 'workingDays', workingdaysoverride: 'workingDaysOverride',
  variablecostperkm: 'variableCostPerKm', variablecost: 'variableCostPerKm',
  rateperextrakm: 'ratePerExtraKm',
  addhour: 'addHour', extrahour: 'addHour',
  rateperextrahour: 'ratePerExtraHour'
};

// Same tolerant date parser WarehouseDetails.tsx already had - ISO,
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

const TEMPLATE_HEADERS = [
  'Date', 'Warehouse Name', 'Warehouse City', 'Vehicle Number', 'Vehicle Type', 'Vehicle Category',
  'Deployment Type', 'From City (Ad-hoc)', 'To City (Ad-hoc)', 'POD Name', 'POD City', 'Fixed Hours',
  'KM Slab', 'Opening KM', 'Closing KM', 'In Time', 'Closure Time', 'Contract Period (Days/Hrs)',
  'Extra KM', 'Working Days', 'Variable Cost Per KM', 'Rate Per Extra KM', 'Add Hour', 'Rate Per Extra Hour',
  'Toll Charges', 'Parking Cost', 'Hybrid Reefer Cost', 'Scheduled Rate', 'Vendor Remarks'
];

export function downloadWarehouseImportTemplate(): void {
  const sample: Record<string, string | number> = {
    'Date': '2026-09-01', 'Warehouse Name': 'BLR IM1', 'Warehouse City': 'Bangalore', 'Vehicle Number': 'KA01AB1234',
    'Vehicle Type': '14ft', 'Vehicle Category': 'dry', 'Deployment Type': 'regular', 'From City (Ad-hoc)': '',
    'To City (Ad-hoc)': '', 'POD Name': '', 'POD City': '', 'Fixed Hours': 12, 'KM Slab': '', 'Opening KM': 10000,
    'Closing KM': 10120, 'In Time': '', 'Closure Time': '', 'Contract Period (Days/Hrs)': 1, 'Extra KM': 0,
    'Working Days': 30, 'Variable Cost Per KM': 0, 'Rate Per Extra KM': 0, 'Add Hour': 0, 'Rate Per Extra Hour': 0,
    'Toll Charges': 0, 'Parking Cost': 0, 'Hybrid Reefer Cost': 0, 'Scheduled Rate': 15000,
    'Vendor Remarks': 'Sample row - delete before importing. Only Date/Warehouse Name/Vehicle Number are always required (Closing KM too, unless Deployment Type is Ad-hoc/Hybrid - those don\'t track KM at all, leave that whole block blank as in a real Ad-hoc export). KM Utilised, Base Rate, Fuel Cost, Final Base Rate, Additional KM/Hour Cost and Grand Total auto-resolve through the same rate-lookup tables the Add/Edit Entry form itself uses (Warehouse + Vehicle Type + KM Slab/Deployment Type) - Scheduled Rate/Variable Cost Per KM below are only a fallback for when no configured rate matches.'
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: TEMPLATE_HEADERS });
  ws['!cols'] = TEMPLATE_HEADERS.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import Warehouse Details');
  XLSX.writeFile(wb, 'KCM_Warehouse_Import_Template.xlsx');
}

export interface ParsedWarehouseImportRow {
  rowNumber: number; // 1-based, matches the spreadsheet row (header is row 1)
  errors: string[];
  warnings: string[];
  date: string;
  warehouseName: string;
  warehouseCity: string;
  vehicleNumber: string;
  vehicleType: string;
  vehicleCategory: string;
  deploymentType: string;
  adHocFromCity: string;
  adHocToCity: string;
  pod: string;
  podCity: string;
  fixedHours: number;
  kmSlab: string;
  openingKm: number;
  closingKm: number;
  inTime: string;
  closureTime: string;
  hoursDaysAsPerContract: number;
  overtimeVehicle: string;
  extraKm: number;
  kmUtilised: number;
  baseRate: number;
  fuelCost: number;
  finalBaseRate: number;
  additionalKmCost: number;
  additionalHourCost: number;
  tollCharges: number;
  parkingCost: number;
  hybridReeferCost: number;
  grandTotal: number;
  vendorRemarks: string;
  scheduledRate?: number;
  warehouseGroup?: string;
  // Duplicate handling (2026-09-10) - "already exists" is a warning, not a
  // hard error: skipped by default (kept out of errors so it doesn't block
  // OTHER clean rows, but flagged below via duplicateOf so the wizard's
  // per-row action can move it from excluded to included).
  duplicateOf: string | null; // existing WarehouseEntry.id, when matched
  willOverwrite: boolean;
}

const DUPLICATE_ERROR = 'This entry already exists for this Warehouse + Vehicle + Date - check "Overwrite" to replace it, or leave unchecked to skip it.';

export async function parseWarehouseImportFile(
  file: File,
  existingEntries: WarehouseEntry[],
  vehicles: Vehicle[],
  warehouseRateOverrides: WarehouseRateOverride[]
): Promise<{ headerValid: boolean; missingHeaders: string[]; rows: ParsedWarehouseImportRow[] }> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const headerRow: unknown[] = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as unknown[]) || [];

  // 2026-09-11: Closing KM dropped from the column-level requirement - a
  // file can be entirely Ad-hoc/Hybrid rows, which (see WarehouseDetails.tsx's
  // hideKmTimeBlock) don't track Closing KM at all, so requiring that
  // COLUMN to even exist would reject an otherwise-valid all-Ad-hoc file.
  // It's still required PER ROW for Regular deployments, checked below.
  const REQUIRED = ['date', 'warehousename', 'vehiclenumber'];
  const REQUIRED_LABELS: Record<string, string> = { date: 'Date', warehousename: 'Warehouse Name', vehiclenumber: 'Vehicle Number' };
  const presentNormalized = new Set(headerRow.map(h => normalizeHeader(h)));
  const missingRequired = REQUIRED.filter(k => !presentNormalized.has(k)).map(k => REQUIRED_LABELS[k]);
  if (missingRequired.length > 0) {
    return { headerValid: false, missingHeaders: missingRequired, rows: [] };
  }

  const json: Record<string, string | number>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });

  const knownWarehouseNames = new Set([
    ...WAREHOUSE_LOCATIONS.map(w => w.name.trim().toLowerCase()),
    ...existingEntries.map(e => (e.warehouseName || '').trim().toLowerCase())
  ]);
  // 2026-09-11: compared punctuation-stripped, not just trimmed+uppercased -
  // Fleet & Vehicles' own Reg. No. field doesn't strip spaces/hyphens either
  // (confirmed: FleetSheet.tsx only .toUpperCase().trim()s it), so the same
  // real vehicle can easily be stored there as "KA51AL3422" while a real
  // import file has "KA 51 AL 3422" or "KA-51-AL-3422" - a strict compare
  // would wrongly reject a genuine match. Stripping all non-alphanumerics
  // before comparing can only ever turn a false rejection into a correct
  // match - two genuinely different plates never collide from this alone.
  const stripRegNo = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const knownVehicleNos = new Set(vehicles.map(v => stripRegNo(v.regNo || v['Reg. No.'] || '')));

  // For duplicate + deployment-conflict checks: every entry already saved,
  // PLUS every row already parsed earlier in this same file (both checks
  // must catch a conflict within the file itself, not only against
  // already-saved data - e.g. two rows in one upload for the same vehicle
  // on the same day at two different warehouses).
  const seenThisFile: { warehouseName: string; vehicleNumber: string; date: string }[] = [];

  const rows: ParsedWarehouseImportRow[] = json.map((row, idx) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const mapped: Partial<Record<keyof WarehouseEntry, string | number>> = {};
    Object.entries(row).forEach(([header, value]) => {
      const key = WAREHOUSE_IMPORT_ALIASES[normalizeHeader(header)];
      if (key && value !== '') mapped[key] = value;
    });

    const date = normalizeImportDate(mapped.date ?? '');
    const warehouseName = String(mapped.warehouseName || '').trim();
    const vehicleNumber = String(mapped.vehicleNumber || '').trim().toUpperCase();
    const closingKm = Number(mapped.closingKm) || 0;
    const openingKm = Number(mapped.openingKm) || 0;
    const deploymentTypeVal = String(mapped.deploymentType || 'regular').trim().toLowerCase() || 'regular';
    // Ad-hoc/Hybrid don't track KM at all (see WarehouseDetails.tsx's
    // hideKmTimeBlock) - Closing KM is only required for Regular.
    const hideKmTimeRow = deploymentTypeVal === 'ad-hoc' || deploymentTypeVal === 'hybrid';

    if (!date) errors.push('Date is missing or not a recognized date.');
    if (!warehouseName) errors.push('Warehouse Name is required.');
    if (!vehicleNumber) errors.push('Vehicle Number is required.');
    if (!closingKm && !hideKmTimeRow) errors.push('Closing KM is required.');

    // Known warehouse - a warning, not a hard error (free-text in the manual
    // form too), so an office adding a genuinely new warehouse isn't blocked.
    if (warehouseName && !knownWarehouseNames.has(warehouseName.toLowerCase())) {
      warnings.push('Unrecognized warehouse name - not found in the warehouse master list or existing entries.');
    }

    // 2026-09-11 direct request (reversed from the earlier hard-error
    // version): a vehicle not in Fleet & Vehicles is very often a genuine
    // vendor/third-party vehicle used for a warehouse trip, not a data
    // error - these rows must still import. This is a warning only, never
    // a hard error, and importing one never writes anything back to Fleet
    // & Vehicles or any other module's vehicle list - this file only ever
    // calls onAddEntry/onUpdateEntry for WarehouseEntry rows themselves,
    // so an unrecognized vehicle number can never "sit" in Fleet &
    // Vehicles, Vendor Management, or anywhere else just by importing it
    // here.
    if (vehicleNumber && !knownVehicleNos.has(stripRegNo(vehicleNumber))) {
      warnings.push('Vehicle Number not found in Fleet & Vehicles - imported as-is (likely a vendor/third-party vehicle). This does not add it to Fleet & Vehicles or any other module.');
    }

    // Deployment conflict - same vehicle, same date, a DIFFERENT warehouse
    // already on record (either already-saved or elsewhere in this file).
    // There is no separate "Vehicle Deployment" table in this codebase -
    // a vehicle's own WarehouseEntry history IS its deployment record.
    if (vehicleNumber && date) {
      const conflict = existingEntries.find(e => e.vehicleNumber === vehicleNumber && e.date === date && e.warehouseName !== warehouseName)
        || seenThisFile.find(e => e.vehicleNumber === vehicleNumber && e.date === date && e.warehouseName !== warehouseName);
      if (conflict) errors.push(`Vehicle already logged at a different warehouse (${conflict.warehouseName}) on this date.`);
    }

    // Duplicate - same Warehouse + Vehicle + Date already on record.
    let duplicateOf: string | null = null;
    if (warehouseName && vehicleNumber && date) {
      const existing = existingEntries.find(e => e.warehouseName === warehouseName && e.vehicleNumber === vehicleNumber && e.date === date);
      if (existing) {
        duplicateOf = existing.id;
        errors.push(DUPLICATE_ERROR);
      } else if (seenThisFile.some(e => e.warehouseName === warehouseName && e.vehicleNumber === vehicleNumber && e.date === date)) {
        errors.push('Duplicated elsewhere in this file (same Warehouse + Vehicle + Date).');
      }
      seenThisFile.push({ warehouseName, vehicleNumber, date });
    }

    const kmUtilised = Math.max(0, closingKm - openingKm); // always derived, never trusted raw - same as today

    // 2026-09-11 direct request: "it will be of complete data so it should
    // not sit like that only instead take necessary data and auto
    // calculate the other rates data and grand total everything" - cost
    // figures now resolve through the EXACT SAME rate-lookup chain the
    // live Add/Edit Entry form uses (see WarehouseDetails.tsx's own
    // matchedScheduledRate/matched24hrDedicatedRate/matchedReeferWalkesRate/
    // matchedAdHocRate), not just a flag on whether the file happened to
    // supply a Scheduled Rate directly. A file only needs the identifying/
    // operational columns (Warehouse Name, Vehicle Type, KM Slab, Fixed
    // Hours, Deployment Type, From/To City for Ad-hoc) for the correct
    // rate to resolve automatically - Scheduled Rate/Variable Cost Per KM
    // are only ever read from the file as a LAST resort, when no
    // configured rate matches (same "Rate not configured, enter manually"
    // situation the live form already has).
    const fixedHoursVal = Number(mapped.fixedHours) || 12;
    const vehicleTypeVal = String(mapped.vehicleType || '').trim();
    const vehicleCategoryVal = String(mapped.vehicleCategory || '').trim();
    const kmSlabVal = parseFloat(String(mapped.kmSlab || '')) || 0;
    const adHocFromCityVal = String(mapped.adHocFromCity || '').trim();
    const adHocToCityVal = String(mapped.adHocToCity || '').trim();
    const warehouseGroupVal = rateGroupForWarehouseName(warehouseName) || '';

    let lookedUpScheduledRate: number | null = null;
    let lookedUpVariableCostPerKm: number | null = null;
    let lookedUpFlatBaseRate: number | null = null;
    let rateSourceNote: string | null = null;

    if (fixedHoursVal === 24 && deploymentTypeVal === 'ad-hoc') {
      lookedUpFlatBaseRate = lookupAdHocRouteRate(adHocFromCityVal, adHocToCityVal, vehicleTypeVal, vehicleCategoryVal);
      if (lookedUpFlatBaseRate != null) rateSourceNote = `Auto-resolved from the Ad-hoc route table (${adHocFromCityVal} -> ${adHocToCityVal}).`;
    } else if (fixedHoursVal === 24 && deploymentTypeVal === 'regular') {
      const dedicated = lookup24hrDedicatedRate(warehouseName, vehicleTypeVal, vehicleCategoryVal, warehouseRateOverrides);
      if (dedicated) {
        lookedUpScheduledRate = dedicated.fixed;
        lookedUpVariableCostPerKm = dedicated.variable;
        rateSourceNote = `Auto-resolved from ${warehouseGroupVal || warehouseName}'s 24Hr Dedicated rate table.`;
      } else {
        const reeferWalkes = lookupReeferWalkesRate(warehouseName, vehicleTypeVal, vehicleCategoryVal, warehouseRateOverrides);
        if (reeferWalkes) {
          lookedUpScheduledRate = reeferWalkes.fc;
          lookedUpVariableCostPerKm = reeferWalkes.vc;
          rateSourceNote = 'Auto-resolved from the 24Hr Reefer & Walkes rate table.';
        }
      }
    } else if (fixedHoursVal === 12) {
      const dedicated12 = lookupScheduledRate(warehouseGroupVal, vehicleTypeVal, kmSlabVal, warehouseRateOverrides);
      if (dedicated12 != null) {
        lookedUpScheduledRate = dedicated12;
        rateSourceNote = `Auto-resolved from ${warehouseGroupVal || warehouseName}'s 12Hr Dedicated rate table.`;
      }
    }

    const scheduledRateVal = lookedUpScheduledRate ?? (mapped.scheduledRate != null ? Number(mapped.scheduledRate) : undefined);
    const variableCostPerKmVal = lookedUpVariableCostPerKm ?? (Number(mapped.variableCostPerKm) || 0);
    const workingDaysOverrideVal = mapped.workingDays != null ? Number(mapped.workingDays) : (mapped.workingDaysOverride != null ? Number(mapped.workingDaysOverride) : null);
    const workingDaysAutoVal = computeAutoWorkingDays(date ? date.slice(0, 7) : '', false, 0);
    const workingDaysVal = resolveWorkingDays(workingDaysAutoVal, workingDaysOverrideVal);

    const canRecompute = lookedUpFlatBaseRate != null || (scheduledRateVal != null && scheduledRateVal > 0);

    let baseRate: number, fuelCost: number, finalBaseRate: number, additionalKmCost: number, additionalHourCost: number, grandTotal: number;
    const tollChargesVal = Number(mapped.tollCharges) || 0;
    const parkingCostVal = Number(mapped.parkingCost) || 0;
    const hybridReeferCostVal = Number(mapped.hybridReeferCost) || 0;

    if (canRecompute) {
      const result = computeWarehouseRates({
        fixedHours: fixedHoursVal,
        scheduledRate: scheduledRateVal ?? 0,
        workingDays: workingDaysVal,
        kmSlab: 0,
        variableCostPerKm: variableCostPerKmVal,
        kmUtilised,
        addKm: Number(mapped.extraKm) || 0,
        ratePerExtraKm: Number(mapped.ratePerExtraKm) || 0,
        addHour: Number(mapped.addHour) || 0,
        ratePerExtraHour: Number(mapped.ratePerExtraHour) || 0,
        tollCharges: tollChargesVal,
        parkingCost: parkingCostVal,
        hybridReeferCost: hybridReeferCostVal,
        flatBaseRateOverride: lookedUpFlatBaseRate
      });
      baseRate = result.baseRate;
      fuelCost = result.fuelCost;
      additionalKmCost = result.extraKmAmount;
      additionalHourCost = result.extraHourAmount;
      finalBaseRate = round2(baseRate + fuelCost);
      grandTotal = result.grandTotal;
      if (rateSourceNote) warnings.push(rateSourceNote);
      else warnings.push('Cost figures recalculated from this row\'s own Scheduled Rate/Working Days (no matching rate-table entry - same as "Rate not configured" on the live form).');
    } else {
      baseRate = Number(mapped.baseRate) || 0;
      fuelCost = Number(mapped.fuelCost) || 0;
      additionalKmCost = Number(mapped.additionalKmCost) || 0;
      additionalHourCost = Number(mapped.additionalHourCost) || 0;
      finalBaseRate = Number(mapped.finalBaseRate) || round2(baseRate + fuelCost);
      grandTotal = Number(mapped.grandTotal) || round2(baseRate + fuelCost + additionalKmCost + additionalHourCost + tollChargesVal + parkingCostVal + hybridReeferCostVal);
      warnings.push('Cost figures read from file - could not verify (no configured rate for this Warehouse/Vehicle Type/KM Slab/Deployment Type combination, and no Scheduled Rate supplied to fall back on).');
    }

    return {
      rowNumber: idx + 2, errors, warnings,
      date, warehouseName, warehouseCity: String(mapped.warehouseCity || '').trim(),
      vehicleNumber, vehicleType: vehicleTypeVal, vehicleCategory: vehicleCategoryVal,
      deploymentType: deploymentTypeVal,
      adHocFromCity: adHocFromCityVal, adHocToCity: adHocToCityVal,
      pod: String(mapped.pod || '').trim(), podCity: String(mapped.podCity || '').trim(),
      fixedHours: fixedHoursVal, kmSlab: String(mapped.kmSlab || '').trim(),
      openingKm, closingKm, inTime: String(mapped.inTime || '').trim(), closureTime: String(mapped.closureTime || '').trim(),
      hoursDaysAsPerContract: Number(mapped.hoursDaysAsPerContract) || 1, overtimeVehicle: String(mapped.overtimeVehicle || '').trim(),
      extraKm: Number(mapped.extraKm) || 0, kmUtilised,
      baseRate, fuelCost, finalBaseRate, additionalKmCost, additionalHourCost,
      tollCharges: tollChargesVal, parkingCost: parkingCostVal, hybridReeferCost: hybridReeferCostVal, grandTotal,
      vendorRemarks: String(mapped.vendorRemarks || '').trim(),
      scheduledRate: scheduledRateVal, warehouseGroup: mapped.warehouseGroup ? String(mapped.warehouseGroup).trim() : undefined,
      duplicateOf, willOverwrite: false
    };
  });

  return { headerValid: true, missingHeaders: [], rows };
}

export function buildWarehouseEntryFromImportRow(row: ParsedWarehouseImportRow, slNo: number): Omit<WarehouseEntry, 'id'> {
  return {
    slNo,
    date: row.date,
    warehouseName: row.warehouseName,
    warehouseCity: row.warehouseCity,
    vehicleNumber: row.vehicleNumber,
    vehicleType: row.vehicleType,
    vehicleCategory: row.vehicleCategory,
    deploymentType: row.deploymentType,
    adHocFromCity: row.adHocFromCity || undefined,
    adHocToCity: row.adHocToCity || undefined,
    pod: row.pod,
    podCity: row.podCity,
    fixedHours: row.fixedHours,
    kmSlab: row.kmSlab,
    openingKm: row.openingKm,
    closingKm: row.closingKm,
    inTime: row.inTime,
    closureTime: row.closureTime,
    kmUtilised: row.kmUtilised,
    hoursDaysAsPerContract: row.hoursDaysAsPerContract,
    overtimeVehicle: row.overtimeVehicle,
    extraKm: row.extraKm,
    baseRate: row.baseRate,
    fuelCost: row.fuelCost,
    finalBaseRate: row.finalBaseRate,
    additionalKmCost: row.additionalKmCost,
    additionalHourCost: row.additionalHourCost,
    tollCharges: row.tollCharges,
    parkingCost: row.parkingCost,
    hybridReeferCost: row.hybridReeferCost,
    grandTotal: row.grandTotal,
    vendorRemarks: row.vendorRemarks,
    scheduledRate: row.scheduledRate,
    warehouseGroup: row.warehouseGroup,
    documents: []
  };
}

export function exportWarehouseImportErrorRows(rows: ParsedWarehouseImportRow[]): void {
  const errorRows = rows.filter(r => r.errors.length > 0);
  const data = errorRows.map(r => ({
    'Row': r.rowNumber, 'Date': r.date, 'Warehouse Name': r.warehouseName, 'Vehicle Number': r.vehicleNumber,
    'Vehicle Type': r.vehicleType, 'Vehicle Category': r.vehicleCategory, 'Deployment Type': r.deploymentType,
    'Opening KM': r.openingKm, 'Closing KM': r.closingKm, 'Grand Total': r.grandTotal,
    'Errors': r.errors.join('; '), 'Warnings': r.warnings.join('; ')
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errors');
  XLSX.writeFile(wb, `KCM_Warehouse_Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
