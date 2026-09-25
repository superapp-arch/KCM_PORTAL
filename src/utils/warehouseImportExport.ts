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
import { computeAutoWorkingDays, resolveWorkingDays, round2 } from './warehouseRates';
import { rateGroupForWarehouseName, normalizeRateMatrixVehicleType } from './warehouseRateMatrix';
import { calculateWarehouseEntry, normalizeDeploymentType } from './warehouseRateEngine';
import { VEHICLE_CATEGORIES } from './vehicleCycleDefaults';

// --- Column matching (promoted from WarehouseDetails.tsx unchanged, plus
// the rate-calc-input aliases needed so computeWarehouseRates() can run on
// an imported row - see the alignment note above additionalKmCost etc.) ---
const normalizeHeader = (h: unknown): string => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

// 2026-09-11: compared punctuation-stripped, not just trimmed+uppercased -
// Fleet & Vehicles' own Reg. No. field doesn't strip spaces/hyphens either
// (confirmed: FleetSheet.tsx only .toUpperCase().trim()s it), so the same
// real vehicle can easily be stored there as "KA51AL3422" while elsewhere
// it's typed as "KA 51 AL 3422" or "KA-51-AL-3422" - a strict compare would
// wrongly reject a genuine match. Stripping all non-alphanumerics before
// comparing can only ever turn a false rejection into a correct match - two
// genuinely different plates never collide from this alone. Exported so
// WarehouseDetails.tsx's own live-entry-form vehicle matching (Fleet lookup,
// duplicate/conflict checks) uses the exact same rule as this importer,
// instead of drifting into its own plain string compare.
export const stripRegNo = (s: string): string => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

// Case/whitespace-insensitive Warehouse Name compare, for the same reason
// as stripRegNo above - the duplicate/deployment-conflict checks below used
// to compare warehouseName with a raw ===, so "Bangalore Hub" vs
// "bangalore hub" (or a trailing space from a pasted cell) read as two
// different warehouses and let a real duplicate/conflict through.
const sameWarehouseName = (a: string, b: string): boolean => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

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
  grandtotal: 'grandTotal', amount: 'grandTotal', totalamount: 'grandTotal',
  kmutilised: 'kmUtilised', kmutilized: 'kmUtilised',
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

// Calculated/rate columns (2026-09-25) - the employee's OWN Excel figures,
// read only to compare against KCM's calculation in the import review; KCM's
// figures are what get saved. Leave blank to skip the comparison.
const CALCULATED_HEADERS = ['KM Utilised', 'Base Rate', 'Fuel Cost', 'Final Base Rate', 'Additional KM Cost', 'Additional Hour Cost', 'Grand Total'];
const FLAT_CALCULATED_HEADERS = ['Base Rate', 'Fuel Cost', 'Final Base Rate', 'Grand Total']; // Ad-hoc/Hybrid - no KM/hour add-ons
const CALCULATED_NOTE = ' The Base Rate / Fuel Cost / Final Base Rate / Additional KM & Hour Cost / Grand Total columns are YOUR sheet\'s figures: KCM recalculates each one with the official rates, shows Excel vs KCM vs the difference in the import review, and saves KCM\'s figures (your values are kept on the record for audit).';

const TEMPLATE_HEADERS = [
  'Date', 'Warehouse Name', 'Warehouse City', 'Vehicle Number', 'Vehicle Type', 'Vehicle Category',
  'Deployment Type', 'From City (Ad-hoc)', 'To City (Ad-hoc)', 'POD Name', 'POD City', 'Fixed Hours',
  'KM Slab', 'Opening KM', 'Closing KM', 'In Time', 'Closure Time', 'Contract Period (Days/Hrs)',
  'Extra KM', 'Working Days', 'Variable Cost Per KM', 'Rate Per Extra KM', 'Add Hour', 'Rate Per Extra Hour',
  'Toll Charges', 'Parking Cost', 'Hybrid Reefer Cost', 'Scheduled Rate', ...CALCULATED_HEADERS, 'Vendor Remarks'
];

export function downloadWarehouseImportTemplate(): void {
  const sample: Record<string, string | number> = {
    'Date': '2026-09-01', 'Warehouse Name': 'BLR IM1', 'Warehouse City': 'Bangalore', 'Vehicle Number': 'KA01AB1234',
    'Vehicle Type': '14ft', 'Vehicle Category': 'dry', 'Deployment Type': 'regular', 'From City (Ad-hoc)': '',
    'To City (Ad-hoc)': '', 'POD Name': '', 'POD City': '', 'Fixed Hours': 12, 'KM Slab': '', 'Opening KM': 10000,
    'Closing KM': 10120, 'In Time': '', 'Closure Time': '', 'Contract Period (Days/Hrs)': 1, 'Extra KM': 0,
    'Working Days': 30, 'Variable Cost Per KM': 0, 'Rate Per Extra KM': 0, 'Add Hour': 0, 'Rate Per Extra Hour': 0,
    'Toll Charges': 0, 'Parking Cost': 0, 'Hybrid Reefer Cost': 0, 'Scheduled Rate': 15000,
    'KM Utilised': 120, 'Base Rate': '', 'Fuel Cost': '', 'Final Base Rate': '', 'Additional KM Cost': '', 'Additional Hour Cost': '', 'Grand Total': '',
    'Vendor Remarks': 'Sample row - delete before importing. Only Date/Warehouse Name/Vehicle Number are always required (Closing KM too, for Regular). Fixed Hours, KM Slab, Opening/Closing KM, Extra KM and Add Hour apply to REGULAR deployments only - Ad-hoc (route rate) and Hybrid (agreed Scheduled Rate) ignore them. Rates resolve through the same rate tables as the Add/Edit Entry form; Scheduled Rate/Variable Cost Per KM are only used when no configured rate matches (and for Hybrid).' + CALCULATED_NOTE
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: TEMPLATE_HEADERS });
  ws['!cols'] = TEMPLATE_HEADERS.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import Warehouse Details');
  XLSX.writeFile(wb, 'KCM_Warehouse_Import_Template.xlsx');
}

// --- Per-rate-type templates (2026-09-21 direct request) ---------------------
// The single generic template above has all 28 columns at once regardless of
// which rate rule actually applies to a given row - easy to fill in the
// wrong combination (e.g. leaving Vehicle Category blank on a Reefer/Walkes
// row, which silently falls through to the Dry Dedicated table instead - see
// lookup24hrDedicatedRate's own category check) and get a real but wrong
// number back with no error, since a wrong-but-plausible rate isn't
// something the validator can catch. Each function below produces a
// single-sheet file scoped to ONLY the columns that rule actually reads,
// with the type-defining fields pre-filled in the sample row and a remark
// spelling out exactly what's required/ignored - importable as-is through
// the SAME parseWarehouseImportFile as the generic template (nothing about
// parsing changes; this only narrows what's asked for up front so there's
// less to get wrong).
interface RateTypeTemplateSpec {
  filename: string;
  sheetName: string;
  headers: string[];
  sample: Record<string, string | number>;
}

function writeSingleSheetTemplate(spec: RateTypeTemplateSpec): void {
  const ws = XLSX.utils.json_to_sheet([spec.sample], { header: spec.headers });
  ws['!cols'] = spec.headers.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, spec.sheetName);
  XLSX.writeFile(wb, spec.filename);
}

const COMMON_HEADERS = ['Date', 'Warehouse Name', 'Warehouse City', 'Vehicle Number', 'Vehicle Type', 'Vehicle Category', 'POD Name', 'POD City', 'Toll Charges', 'Parking Cost', 'Vendor Remarks'];

export function downloadWarehouse12HrTemplate(): void {
  writeSingleSheetTemplate({
    filename: 'KCM_Warehouse_Import_12Hr_Dedicated.xlsx',
    sheetName: '12Hr Dedicated',
    headers: ['Deployment Type', 'Fixed Hours', 'KM Slab', ...COMMON_HEADERS, 'Opening KM', 'Closing KM', 'Extra KM', 'Rate Per Extra KM', 'Add Hour', 'Rate Per Extra Hour', 'Working Days', ...CALCULATED_HEADERS],
    sample: {
      'Deployment Type': 'regular', 'Fixed Hours': 12, 'KM Slab': 2000,
      'Date': '2026-09-01', 'Warehouse Name': 'BLR IM1', 'Warehouse City': 'Bangalore', 'Vehicle Number': 'KA01AB1234',
      'Vehicle Type': '14 FT', 'Vehicle Category': 'Dry', 'POD Name': '', 'POD City': '', 'Toll Charges': 0, 'Parking Cost': 0,
      'Opening KM': 10000, 'Closing KM': 10120, 'Extra KM': 0, 'Rate Per Extra KM': 0, 'Add Hour': 0, 'Rate Per Extra Hour': 0,
      'Working Days': '',
      'Vendor Remarks': '12Hr DEDICATED - Deployment Type must be "regular", Fixed Hours must be 12. KM Slab MUST be exactly 2000, 2500, or 3000 - this is what selects the Scheduled Rate from the Warehouse Group + Vehicle Type table (Vehicle Category is NOT part of this lookup, any value is fine). Vehicle Type must be one of: Tata Ace, 207 (or Bolero), 407, 14 FT, 17 FT, 20 FT. Working Days: leave blank to auto-use the calendar month\'s day count, or type a number to override it. Base Rate = Scheduled Rate / Working Days (KM Utilised is tracked but does NOT affect Base Rate for 12Hr). Extra KM/Rate Per Extra KM and Add Hour/Rate Per Extra Hour are optional add-ons on top.' + CALCULATED_NOTE
    }
  });
}

export function downloadWarehouse24HrDedicatedTemplate(): void {
  writeSingleSheetTemplate({
    filename: 'KCM_Warehouse_Import_24Hr_Dedicated_Dry.xlsx',
    sheetName: '24Hr Dedicated Dry',
    headers: ['Deployment Type', 'Fixed Hours', ...COMMON_HEADERS, 'Opening KM', 'Closing KM', 'Extra KM', 'Rate Per Extra KM', 'Add Hour', 'Rate Per Extra Hour', 'Working Days', ...CALCULATED_HEADERS],
    sample: {
      'Deployment Type': 'regular', 'Fixed Hours': 24,
      'Date': '2026-09-01', 'Warehouse Name': 'BLR IM1', 'Warehouse City': 'Bangalore', 'Vehicle Number': 'KA01AB1234',
      'Vehicle Type': '14 FT', 'Vehicle Category': 'Dry', 'POD Name': '', 'POD City': '', 'Toll Charges': 0, 'Parking Cost': 0,
      'Opening KM': 10000, 'Closing KM': 10180, 'Extra KM': 0, 'Rate Per Extra KM': 0, 'Add Hour': 0, 'Rate Per Extra Hour': 0,
      'Working Days': '',
      'Vendor Remarks': '24Hr DEDICATED (DRY) - Deployment Type must be "regular", Fixed Hours must be 24. Vehicle Category MUST be "Dry" (or blank) - "Reefer"/"Walkes" here route to the DIFFERENT Reefer & Walkes table instead (use that template for those). Warehouse Name must belong to a configured group (any BLR entity, Vizag, or HYD IM4); Vehicle Type one of 207/407/14 FT/17 FT/20 FT (Tata Ace not configured for 24Hr Dedicated). No KM Slab here - Base Rate = (Fixed / Working Days) + (KM Utilised x Variable), where KM Utilised = Closing KM - Opening KM, so those two ARE required and DO affect the total (unlike 12Hr).' + CALCULATED_NOTE
    }
  });
}

export function downloadWarehouse24HrReeferWalkesTemplate(): void {
  writeSingleSheetTemplate({
    filename: 'KCM_Warehouse_Import_24Hr_Reefer_Walkes.xlsx',
    sheetName: '24Hr Reefer-Walkes',
    headers: ['Deployment Type', 'Fixed Hours', ...COMMON_HEADERS, 'Opening KM', 'Closing KM', 'Extra KM', 'Rate Per Extra KM', 'Add Hour', 'Rate Per Extra Hour', 'Hybrid Reefer Cost', 'Working Days', ...CALCULATED_HEADERS],
    sample: {
      'Deployment Type': 'regular', 'Fixed Hours': 24,
      'Date': '2026-09-01', 'Warehouse Name': 'BLR IM1', 'Warehouse City': 'Bangalore', 'Vehicle Number': 'KA01AB1234',
      'Vehicle Type': '14 FT', 'Vehicle Category': 'Reefer', 'POD Name': '', 'POD City': '', 'Toll Charges': 0, 'Parking Cost': 0,
      'Opening KM': 10000, 'Closing KM': 10180, 'Extra KM': 0, 'Rate Per Extra KM': 0, 'Add Hour': 0, 'Rate Per Extra Hour': 0,
      'Hybrid Reefer Cost': 0, 'Working Days': '',
      'Vendor Remarks': '24Hr REEFER & WALKES - Deployment Type "regular", Fixed Hours 24. Vehicle Category MUST be exactly "Reefer" or "Walkes" (spelled exactly like that) - this is REQUIRED, not optional, and is exactly what tells this apart from the plain Dry Dedicated table. Vehicle Type: "14 FT" for Reefer or Walkes; "207" (or V70) for Walkes only - no 207 Reefer rate exists. Warehouse City must resolve to BLR/Chennai/HYD/Vizag/Goa (Goa only has a Walkes rate, no Reefer). Base Rate = (FC / Working Days) + (KM Utilised x VC), same shape as Dry Dedicated but its own FC/VC figures. "Hybrid Reefer Cost" is an optional extra amount added on top of the whole Grand Total, not part of the FC/VC formula itself.' + CALCULATED_NOTE
    }
  });
}

export function downloadWarehouse24HrAdHocTemplate(): void {
  writeSingleSheetTemplate({
    filename: 'KCM_Warehouse_Import_24Hr_AdHoc_Route.xlsx',
    sheetName: '24Hr Ad-hoc Route',
    headers: ['Deployment Type', 'From City (Ad-hoc)', 'To City (Ad-hoc)', ...COMMON_HEADERS, ...FLAT_CALCULATED_HEADERS],
    sample: {
      'Deployment Type': 'ad-hoc', 'From City (Ad-hoc)': 'Bangalore', 'To City (Ad-hoc)': 'Mysore',
      'Date': '2026-09-01', 'Warehouse Name': 'BLR IM1', 'Warehouse City': 'Bangalore', 'Vehicle Number': 'KA01AB1234',
      'Vehicle Type': '407', 'Vehicle Category': 'Dry', 'POD Name': '', 'POD City': '', 'Toll Charges': 0, 'Parking Cost': 0,
      'Vendor Remarks': '24Hr AD-HOC ROUTE - Deployment Type MUST be "ad-hoc" (Fixed Hours does not apply - no column for it). This is a FLAT round-trip rate looked up directly by From City (Ad-hoc) + To City (Ad-hoc) + Vehicle Type - NOT a formula, so Opening/Closing KM, KM Slab, and Working Days are all irrelevant here and left out of this template entirely (leave them blank if using the combined generic template instead). From/To City must exactly match a configured route (see the Rates tab for the full route list) or nothing will auto-resolve. For a Hybrid-category vehicle, set Vehicle Category to "Hybrid" instead of a Vehicle Type match - that selects the route\'s own separate "Hybrid Vehicle" rate column. A route not in the Rates tab is flagged "New route - rate not configured" in the import review (Super Admin can add it there with "Add Rate").' + CALCULATED_NOTE
    }
  });
}

export function downloadWarehouseHybridTemplate(): void {
  writeSingleSheetTemplate({
    filename: 'KCM_Warehouse_Import_Hybrid_Manual.xlsx',
    sheetName: 'Hybrid (Manual)',
    headers: ['Deployment Type', ...COMMON_HEADERS, 'Scheduled Rate', 'Hybrid Reefer Cost', ...FLAT_CALCULATED_HEADERS],
    sample: {
      'Deployment Type': 'hybrid',
      'Date': '2026-09-01', 'Warehouse Name': 'BLR IM1', 'Warehouse City': 'Bangalore', 'Vehicle Number': 'KA01AB1234',
      'Vehicle Type': '14 FT', 'Vehicle Category': 'Hybrid', 'POD Name': '', 'POD City': '', 'Toll Charges': 0, 'Parking Cost': 0,
      'Scheduled Rate': 20000, 'Hybrid Reefer Cost': 0,
      'Vendor Remarks': 'HYBRID DEPLOYMENT - Fixed Hours does not apply (no column for it). Deployment Type "hybrid" has NO rate table/auto-lookup at all (unlike every other type above) - Scheduled Rate here is used directly as the Base Rate (divided by Working Days, defaulting to the calendar month), and Fuel Cost/Grand Total compute from that. Opening/Closing KM are not tracked for Hybrid (same as Ad-hoc). If you don\'t know the right Base Rate/Grand Total for this trip, check with whoever set the rate before importing - there is nothing here to auto-verify it against.' + CALCULATED_NOTE
    }
  });
}

// ---------------------------------------------------------------------------
// Import review (2026-09-25): the file is read EXACTLY as entered, validated,
// run through the same KCM rate engine the Add/Edit form uses
// (calculateWarehouseEntry), and every calculated figure the file carries is
// compared with KCM's value - nothing is silently overwritten. The saved
// record always holds KCM's official figures; what the file said is kept on
// the record itself (WarehouseEntry.importAudit) and in the Audit Trail.
// ---------------------------------------------------------------------------

export type WarehouseImportFlag = 'calcDifference' | 'newRoute' | 'missingRate' | 'vehicleTypeMismatch' | 'categoryMismatch';

export const WAREHOUSE_IMPORT_FLAG_LABELS: Record<WarehouseImportFlag, string> = {
  calcDifference: 'Calculation Difference',
  newRoute: 'New Route',
  missingRate: 'Missing Rate',
  vehicleTypeMismatch: 'Vehicle Type Mismatch',
  categoryMismatch: 'Category Mismatch'
};

// Calculated columns compared file-vs-KCM, in display order.
const COMPARED_FIELDS = [
  { field: 'scheduledRate', label: 'Scheduled Rate' },
  { field: 'kmUtilised', label: 'KM Utilised' },
  { field: 'baseRate', label: 'Base Rate' },
  { field: 'fuelCost', label: 'Fuel Cost' },
  { field: 'finalBaseRate', label: 'Final Base Rate' },
  { field: 'additionalKmCost', label: 'Additional KM Cost' },
  { field: 'additionalHourCost', label: 'Additional Hour Cost' },
  { field: 'grandTotal', label: 'Grand Total' }
] as const;
export type WarehouseComparedField = typeof COMPARED_FIELDS[number]['field'];

export interface WarehouseImportComparison {
  field: WarehouseComparedField;
  label: string;
  excel: number | null; // null = the file didn't have this column/value
  kcm: number;
  difference: number | null; // KCM - Excel (+ = KCM is higher), exact to the paisa
  // 'not-calculated': KCM can't produce an official figure for this row yet
  // (missing/new rate, or a Vehicle Type/Category mismatch) - no comparison
  // is made against a guessed value.
  status: 'match' | 'different' | 'not-in-file' | 'not-calculated';
}

// One file row as read - the review re-validates from this (e.g. after a
// missing route rate is added) without re-reading the file.
export type WarehouseImportRaw = Partial<Record<keyof WarehouseEntry, string | number>>;

export interface ParsedWarehouseImportRow {
  rowNumber: number; // 1-based, matches the spreadsheet row (header is row 1)
  errors: string[];
  warnings: string[];
  flags: WarehouseImportFlag[];
  comparisons: WarehouseImportComparison[];
  kcmCalculated: boolean; // false while a rate is missing or the vehicle doesn't match its configuration
  rateSourceNote: string;
  missingRoute: { from: string; to: string } | null; // for the "Add Rate" action
  raw: WarehouseImportRaw;
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
  addHour: number;
  ratePerExtraKm: number;
  ratePerExtraHour: number;
  variableCostPerKm: number;
  workingMonth: string;
  workingDaysAuto: number;
  workingDaysOverride?: number;
  workingDays: number;
  // KCM-calculated (official) figures - what gets saved
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
  // Duplicate handling (2026-09-10) - "already exists" blocks the row until
  // "Overwrite" is ticked (see WarehouseImportModal's row action).
  duplicateOf: string | null; // existing WarehouseEntry.id, when matched
  willOverwrite: boolean;
}

export const DUPLICATE_ERROR = 'This entry already exists for this Warehouse + Vehicle + Date - check "Overwrite" to replace it, or leave unchecked to skip it.';

export interface WarehouseImportContext {
  existingEntries: WarehouseEntry[];
  vehicles: Vehicle[];
  warehouseRateOverrides: WarehouseRateOverride[];
}

// Reads the file into raw rows - no validation or calculation yet.
export async function readWarehouseImportFile(file: File): Promise<{ headerValid: boolean; missingHeaders: string[]; raws: { rowNumber: number; raw: WarehouseImportRaw }[] }> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const headerRow: unknown[] = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as unknown[]) || [];

  // 2026-09-11: Closing KM isn't a required COLUMN - an all-Ad-hoc/Hybrid
  // file has none; it's still required per Regular row (see below).
  const REQUIRED = ['date', 'warehousename', 'vehiclenumber'];
  const REQUIRED_LABELS: Record<string, string> = { date: 'Date', warehousename: 'Warehouse Name', vehiclenumber: 'Vehicle Number' };
  const presentNormalized = new Set(headerRow.map(h => normalizeHeader(h)));
  const missingRequired = REQUIRED.filter(k => !presentNormalized.has(k)).map(k => REQUIRED_LABELS[k]);
  if (missingRequired.length > 0) return { headerValid: false, missingHeaders: missingRequired, raws: [] };

  const json: Record<string, string | number>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
  return {
    headerValid: true, missingHeaders: [],
    raws: json.map((row, idx) => {
      const raw: WarehouseImportRaw = {};
      Object.entries(row).forEach(([header, value]) => {
        const key = WAREHOUSE_IMPORT_ALIASES[normalizeHeader(header)];
        if (key && value !== '' && raw[key] === undefined) raw[key] = value;
      });
      return { rowNumber: idx + 2, raw };
    })
  };
}

// "₹1,23,456.50" / "1,23,456.5" / "12000" -> number; blank/unparsable -> null.
const parseMoney = (v: string | number | undefined): number | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const num = (v: string | number | undefined): number => parseMoney(v) ?? 0;

// Fleet stores e.g. "14ft" / "14 FT" / "Bolero" - compared through the same
// rate-matrix normalisation the rate tables use, falling back to a plain
// case/space-insensitive compare for types outside those tables (e.g. 32 FT).
const sameVehicleType = (a: string, b: string): boolean => {
  const na = normalizeRateMatrixVehicleType(a), nb = normalizeRateMatrixVehicleType(b);
  if (na || nb) return na === nb;
  return a.trim().toLowerCase().replace(/[\s.]/g, '') === b.trim().toLowerCase().replace(/[\s.]/g, '');
};
const normCategory = (c: string) => { const v = c.trim().toLowerCase(); return v === 'walkee' ? 'walkes' : v; };
const KNOWN_CATEGORIES = new Set(VEHICLE_CATEGORIES.map(c => c.toLowerCase()));

export function validateWarehouseImportRows(
  raws: { rowNumber: number; raw: WarehouseImportRaw }[],
  ctx: WarehouseImportContext,
  previous?: ParsedWarehouseImportRow[]
): ParsedWarehouseImportRow[] {
  const { existingEntries, vehicles, warehouseRateOverrides } = ctx;
  const knownWarehouseNames = new Set([
    ...WAREHOUSE_LOCATIONS.map(w => w.name.trim().toLowerCase()),
    ...existingEntries.map(e => (e.warehouseName || '').trim().toLowerCase())
  ]);
  const fleetByNo = new Map(vehicles.map(v => [stripRegNo(v.regNo || v['Reg. No.'] || ''), v]));
  // Duplicate/conflict checks also cover rows earlier in this same file.
  const seenThisFile: { warehouseName: string; vehicleNumber: string; date: string }[] = [];

  return raws.map(({ rowNumber, raw: mapped }) => {
    const prev = previous?.find(p => p.rowNumber === rowNumber);
    const errors: string[] = [];
    const warnings: string[] = [];
    const flags = new Set<WarehouseImportFlag>();

    const date = normalizeImportDate(mapped.date ?? '');
    const warehouseName = String(mapped.warehouseName || '').trim();
    const vehicleNumber = String(mapped.vehicleNumber || '').trim().toUpperCase();
    const closingKm = num(mapped.closingKm);
    const openingKm = num(mapped.openingKm);
    const deploymentRaw = String(mapped.deploymentType || '').trim();
    const deployment = normalizeDeploymentType(deploymentRaw);
    const regular = deployment === 'regular';

    if (!date) errors.push('Date is missing or not a recognized date.');
    if (!warehouseName) errors.push('Warehouse Name is required.');
    if (!vehicleNumber) errors.push('Vehicle Number is required.');
    if (!deployment) errors.push(`Deployment Type "${deploymentRaw}" is not recognised - use Regular, Ad-hoc or Hybrid.`);
    if (regular && !closingKm) errors.push('Closing KM is required for a Regular deployment.');
    if (regular && closingKm && closingKm < openingKm) errors.push(`Closing KM (${closingKm}) is less than Opening KM (${openingKm}).`);

    if (warehouseName && !knownWarehouseNames.has(warehouseName.toLowerCase())) {
      warnings.push('Unrecognized warehouse name - not found in the warehouse master list or existing entries.');
    }

    // ---- Vehicle Type / Category vs Fleet & Vehicles and the rate config ----
    let vehicleType = String(mapped.vehicleType || '').trim();
    let vehicleCategory = String(mapped.vehicleCategory || '').trim();
    const fleet = vehicleNumber ? fleetByNo.get(stripRegNo(vehicleNumber)) : undefined;
    if (vehicleNumber && !fleet) {
      // A vendor/third-party vehicle - still imports; nothing is written to Fleet.
      warnings.push('Vehicle Number not found in Fleet & Vehicles - imported as-is (likely a vendor/third-party vehicle). This does not add it to Fleet & Vehicles or any other module.');
    }
    if (fleet) {
      const fleetType = String(fleet.Type || fleet.type || '').trim();
      const fleetCategory = String(fleet.Category || fleet.category || '').trim();
      if (fleetType && vehicleType && !sameVehicleType(vehicleType, fleetType)) {
        errors.push(`Vehicle Type mismatch - Excel: ${vehicleType}, KCM Fleet: ${fleetType}. Correct the file (no rate is calculated from a guessed type).`);
        flags.add('vehicleTypeMismatch');
      } else if (fleetType && !vehicleType) {
        vehicleType = fleetType;
        warnings.push(`Vehicle Type blank in the file - taken from Fleet & Vehicles (${fleetType}), same as the Add Entry form.`);
      }
      if (fleetCategory && vehicleCategory && normCategory(vehicleCategory) !== normCategory(fleetCategory)) {
        errors.push(`Category mismatch - Excel: ${vehicleCategory}, KCM Fleet: ${fleetCategory}. Correct the file (no rate is calculated from a guessed category).`);
        flags.add('categoryMismatch');
      } else if (fleetCategory && !vehicleCategory) {
        vehicleCategory = fleetCategory;
        warnings.push(`Vehicle Category blank in the file - taken from Fleet & Vehicles (${fleetCategory}).`);
      }
    }
    if (vehicleCategory && !KNOWN_CATEGORIES.has(normCategory(vehicleCategory))) {
      errors.push(`Category/rate configuration mismatch - "${vehicleCategory}" is not a KCM vehicle category (${VEHICLE_CATEGORIES.join(', ')}).`);
      flags.add('categoryMismatch');
    }

    // ---- Duplicates / deployment conflicts (unchanged rules) ----
    if (vehicleNumber && date) {
      const conflict = existingEntries.find(e => stripRegNo(e.vehicleNumber) === stripRegNo(vehicleNumber) && e.date === date && !sameWarehouseName(e.warehouseName, warehouseName))
        || seenThisFile.find(e => stripRegNo(e.vehicleNumber) === stripRegNo(vehicleNumber) && e.date === date && !sameWarehouseName(e.warehouseName, warehouseName));
      if (conflict) errors.push(`Vehicle already logged at a different warehouse (${conflict.warehouseName}) on this date.`);
    }
    let duplicateOf: string | null = null;
    const willOverwrite = !!prev?.willOverwrite;
    if (warehouseName && vehicleNumber && date) {
      const existing = existingEntries.find(e => sameWarehouseName(e.warehouseName, warehouseName) && stripRegNo(e.vehicleNumber) === stripRegNo(vehicleNumber) && e.date === date);
      if (existing) {
        duplicateOf = existing.id;
        if (!willOverwrite) errors.push(DUPLICATE_ERROR);
      } else if (seenThisFile.some(e => sameWarehouseName(e.warehouseName, warehouseName) && stripRegNo(e.vehicleNumber) === stripRegNo(vehicleNumber) && e.date === date)) {
        errors.push('Duplicated elsewhere in this file (same Warehouse + Vehicle + Date).');
      }
      seenThisFile.push({ warehouseName, vehicleNumber, date });
    }

    // ---- Fixed Hrs / KM applicability ----
    const fileFixedHours = num(mapped.fixedHours);
    if (deployment && !regular) {
      const ignored = [
        fileFixedHours ? 'Fixed Hours' : '', mapped.kmSlab ? 'KM Slab' : '', num(mapped.extraKm) ? 'Extra KM' : '',
        num(mapped.addHour) ? 'Add Hour' : '', num(mapped.variableCostPerKm) ? 'Variable Cost Per KM' : '',
        num(mapped.ratePerExtraKm) ? 'Rate Per Extra KM' : '', num(mapped.ratePerExtraHour) ? 'Rate Per Extra Hour' : ''
      ].filter(Boolean);
      if (ignored.length) warnings.push(`${ignored.join(', ')} ignored - Fixed Hrs/KM values don't apply to ${deployment === 'ad-hoc' ? 'Ad-hoc' : 'Hybrid'} deployments.`);
    }
    if (regular && fileFixedHours && fileFixedHours !== 12 && fileFixedHours !== 24) {
      errors.push(`Fixed Hours must be 12 or 24 for a Regular deployment (file: ${fileFixedHours}).`);
    }

    // ---- KCM calculation (the same engine as the Add/Edit form) ----
    const kmSlabText = String(mapped.kmSlab || '').trim();
    const kmSlabNum = parseFloat(kmSlabText) || 0;
    const workingMonth = date ? date.slice(0, 7) : '';
    const workingDaysOverrideVal = parseMoney(mapped.workingDays ?? mapped.workingDaysOverride);
    const workingDaysAuto = computeAutoWorkingDays(workingMonth, false, 0);
    const workingDays = resolveWorkingDays(workingDaysAuto, workingDaysOverrideVal);
    const kmUtilisedInput = Math.round(Math.max(0, closingKm - openingKm));
    const fixedHoursInput = fileFixedHours === 24 ? 24 : 12;
    // 12Hr Add KM - the same live auto-fill the Add Entry form applies
    // (KM Utilised - KM Slab / Working Days) when the file leaves it blank.
    const extraKmVal = parseMoney(mapped.extraKm) ?? (regular && fixedHoursInput === 12 && kmSlabNum > 0 ? Math.round(kmUtilisedInput - kmSlabNum / workingDays) : 0);
    const calc = calculateWarehouseEntry({
      deploymentType: deployment || 'regular', fixedHours: fixedHoursInput, warehouseName, vehicleType, vehicleCategory,
      kmSlab: kmSlabNum, kmUtilised: kmUtilisedInput, addKm: extraKmVal, addHour: num(mapped.addHour),
      ratePerExtraKm: num(mapped.ratePerExtraKm), ratePerExtraHour: num(mapped.ratePerExtraHour),
      scheduledRate: num(mapped.scheduledRate), variableCostPerKm: num(mapped.variableCostPerKm), workingDays,
      tollCharges: num(mapped.tollCharges), parkingCost: num(mapped.parkingCost), hybridReeferCost: num(mapped.hybridReeferCost),
      adHocFromCity: String(mapped.adHocFromCity || '').trim(), adHocToCity: String(mapped.adHocToCity || '').trim()
    }, warehouseRateOverrides);

    let missingRoute: { from: string; to: string } | null = null;
    if (calc.missingRate && deployment) {
      const m = calc.missingRate;
      if (m.code === 'NEW_ROUTE') {
        flags.add('newRoute');
        flags.add('missingRate');
        missingRoute = { from: m.from!, to: m.to! };
        errors.push(`⚠ Add rate for new route: ${m.from} → ${m.to} (not in the 24Hr Ad-hoc route rates).`);
      } else if (m.code === 'ROUTE_VEHICLE_RATE') {
        flags.add('missingRate');
        missingRoute = { from: m.from!, to: m.to! };
        errors.push(`⚠ Rate not configured - ${m.message}`);
      } else if (m.code === 'UNKNOWN_VEHICLE_TYPE') {
        flags.add('vehicleTypeMismatch');
        errors.push(`⚠ Vehicle type/rate configuration mismatch - ${m.message}`);
      } else {
        flags.add('missingRate');
        errors.push(`⚠ Rate not configured - ${m.message}`);
      }
    }
    const rateSourceNote = calc.rateSourceNote;
    if (calc.rateSource === 'manual' && regular) warnings.push(`${calc.rateSourceNote} It is not verified against a KCM rate table.`);
    if (calc.rateSource === 'manual' && deployment === 'hybrid') warnings.push('Hybrid - no KCM rate table exists; Base Rate uses the file\'s agreed Scheduled Rate.');

    // ---- Excel vs KCM comparison ----
    const kcmValues: Record<WarehouseComparedField, number> = {
      scheduledRate: calc.scheduledRate, kmUtilised: calc.kmUtilised, baseRate: calc.baseRate, fuelCost: calc.fuelCost,
      finalBaseRate: calc.finalBaseRate, additionalKmCost: calc.extraKmAmount, additionalHourCost: calc.extraHourAmount,
      grandTotal: calc.grandTotal
    };
    const kcmCalculated = !!deployment && !calc.missingRate && !flags.has('vehicleTypeMismatch') && !flags.has('categoryMismatch');
    const comparisons: WarehouseImportComparison[] = COMPARED_FIELDS
      // Scheduled Rate is only a CALCULATED value when a rate table supplied
      // it; otherwise it's the file's own input, and comparing it to itself
      // would say nothing.
      .filter(f => f.field !== 'scheduledRate' || (calc.rateSource !== 'manual' && calc.rateSource !== 'none' && calc.rateSource !== 'adHocRoute'))
      .filter(f => f.field !== 'kmUtilised' || regular)
      .map(({ field, label }) => {
        const excel = parseMoney(mapped[field]);
        const kcm = kcmValues[field];
        if (!kcmCalculated) return { field, label, excel, kcm, difference: null, status: 'not-calculated' as const };
        if (excel == null) return { field, label, excel: null, kcm, difference: null, status: 'not-in-file' as const };
        const difference = round2(kcm - excel);
        return { field, label, excel, kcm, difference, status: difference === 0 ? 'match' as const : 'different' as const };
      });
    const diffs = comparisons.filter(c => c.status === 'different');
    if (diffs.length > 0) {
      flags.add('calcDifference');
      warnings.push(`⚠ Calculation difference in ${diffs.map(d => d.label).join(', ')} - KCM's figures will be saved.`);
    }

    return {
      rowNumber, errors, warnings, flags: Array.from(flags), comparisons, kcmCalculated, rateSourceNote, missingRoute, raw: mapped,
      date, warehouseName, warehouseCity: String(mapped.warehouseCity || '').trim(),
      vehicleNumber, vehicleType, vehicleCategory,
      deploymentType: deployment || deploymentRaw.toLowerCase(),
      adHocFromCity: calc.deploymentType === 'ad-hoc' ? String(mapped.adHocFromCity || '').trim() : '',
      adHocToCity: calc.deploymentType === 'ad-hoc' ? String(mapped.adHocToCity || '').trim() : '',
      pod: String(mapped.pod || '').trim(), podCity: String(mapped.podCity || '').trim(),
      fixedHours: calc.fixedHours, kmSlab: regular ? kmSlabText : '',
      openingKm, closingKm, inTime: String(mapped.inTime || '').trim(), closureTime: String(mapped.closureTime || '').trim(),
      hoursDaysAsPerContract: num(mapped.hoursDaysAsPerContract) || 1, overtimeVehicle: String(mapped.overtimeVehicle || '').trim(),
      extraKm: regular ? extraKmVal : 0,
      addHour: regular ? num(mapped.addHour) : 0,
      ratePerExtraKm: regular ? num(mapped.ratePerExtraKm) : 0,
      ratePerExtraHour: regular ? num(mapped.ratePerExtraHour) : 0,
      variableCostPerKm: calc.variableCostPerKm,
      workingMonth, workingDaysAuto, workingDaysOverride: workingDaysOverrideVal ?? undefined, workingDays,
      kmUtilised: calc.kmUtilised,
      baseRate: calc.baseRate, fuelCost: calc.fuelCost, finalBaseRate: calc.finalBaseRate,
      additionalKmCost: calc.extraKmAmount, additionalHourCost: calc.extraHourAmount,
      tollCharges: num(mapped.tollCharges), parkingCost: num(mapped.parkingCost), hybridReeferCost: num(mapped.hybridReeferCost),
      grandTotal: calc.grandTotal,
      vendorRemarks: String(mapped.vendorRemarks || '').trim(),
      scheduledRate: calc.scheduledRate || undefined,
      warehouseGroup: rateGroupForWarehouseName(warehouseName) || (mapped.warehouseGroup ? String(mapped.warehouseGroup).trim() : undefined),
      duplicateOf, willOverwrite
    };
  });
}

// Back-compatible one-shot entry point (read + validate).
export async function parseWarehouseImportFile(
  file: File,
  existingEntries: WarehouseEntry[],
  vehicles: Vehicle[],
  warehouseRateOverrides: WarehouseRateOverride[]
): Promise<{ headerValid: boolean; missingHeaders: string[]; rows: ParsedWarehouseImportRow[] }> {
  const read = await readWarehouseImportFile(file);
  if (!read.headerValid) return { headerValid: false, missingHeaders: read.missingHeaders, rows: [] };
  return { headerValid: true, missingHeaders: [], rows: validateWarehouseImportRows(read.raws, { existingEntries, vehicles, warehouseRateOverrides }) };
}

// The saved record: every figure is KCM's; the file's own calculated values
// (and the differences) ride along in importAudit so nothing the employee
// entered is lost.
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
    workingMonth: row.workingMonth || undefined,
    workingDaysAuto: row.workingDaysAuto,
    workingDaysOverride: row.workingDaysOverride,
    workingDays: row.workingDays,
    ratePerExtraKm: row.ratePerExtraKm,
    addHour: row.addHour,
    ratePerExtraHour: row.ratePerExtraHour,
    variableCostPerKm: row.variableCostPerKm,
    documents: [],
    importAudit: {
      importedAt: new Date().toISOString(),
      fileRow: row.rowNumber,
      rateSource: row.rateSourceNote,
      values: row.comparisons.map(c => ({ field: c.field, label: c.label, excel: c.excel, kcm: c.kcm, difference: c.difference }))
    }
  };
}

export function exportWarehouseImportErrorRows(rows: ParsedWarehouseImportRow[]): void {
  const errorRows = rows.filter(r => r.errors.length > 0);
  const data = errorRows.map(r => ({
    'Row': r.rowNumber, 'Date': r.date, 'Warehouse Name': r.warehouseName, 'Vehicle Number': r.vehicleNumber,
    'Vehicle Type': r.vehicleType, 'Vehicle Category': r.vehicleCategory, 'Deployment Type': r.deploymentType,
    'From City (Ad-hoc)': r.adHocFromCity, 'To City (Ad-hoc)': r.adHocToCity,
    'Opening KM': r.openingKm, 'Closing KM': r.closingKm,
    'Excel Grand Total': r.comparisons.find(c => c.field === 'grandTotal')?.excel ?? '',
    'KCM Grand Total': r.grandTotal,
    'Issues': r.flags.map(f => WAREHOUSE_IMPORT_FLAG_LABELS[f]).join('; '),
    'Errors': r.errors.join('; '), 'Warnings': r.warnings.join('; ')
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errors');
  XLSX.writeFile(wb, `KCM_Warehouse_Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
