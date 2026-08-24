// Fixed Scheduled Rate lookup for 12Hr Dedicated Warehouse deployments -
// Vehicle Type x KM Slab, per Warehouse Group. A plain in-code table for now
// (not database-backed/admin-editable) - Base Rate/Fuel Cost/Grand Total
// downstream (see warehouseRates.ts) are unaffected; this only decides what
// pre-fills the Scheduled Rate input.
//
// Four independent tables:
// - "blr": shared by all 6 BLR entities (ECOM, IM1, IM2, IM3, IM4, DHL) -
//   whichever of the six is picked, the lookup is identical.
// - "ecomHyd": ECOM HYD (IM1, IM2, IM3) - one merged group, its own table.
// - "vizag" / "hydIm4": each fully independent, even though they happen to
//   coincide on Tata Ace/207/407 - 14/17/20 FT genuinely diverge between
//   them, so they're kept as separate lookup keys, never merged.

export type RateTableKey = 'blr' | 'ecomHyd' | 'vizag' | 'hydIm4';

export interface WarehouseGroupOption {
  value: string; // shown in the Warehouse Group dropdown
  rateTableKey: RateTableKey;
}

// The 6 BLR entities all map to the one shared "blr" table - selecting any
// of them identifies the client for the record, but never changes the rate.
export const WAREHOUSE_GROUP_OPTIONS: WarehouseGroupOption[] = [
  { value: 'BLR ECOM', rateTableKey: 'blr' },
  { value: 'BLR IM1', rateTableKey: 'blr' },
  { value: 'BLR IM2', rateTableKey: 'blr' },
  { value: 'BLR IM3', rateTableKey: 'blr' },
  { value: 'BLR IM4', rateTableKey: 'blr' },
  { value: 'BLR DHL', rateTableKey: 'blr' },
  { value: 'ECOM HYD (IM1, IM2, IM3)', rateTableKey: 'ecomHyd' },
  { value: 'Vizag', rateTableKey: 'vizag' },
  { value: 'HYD IM4', rateTableKey: 'hydIm4' },
];

export const RATE_MATRIX_KM_SLABS = [2000, 2500, 3000] as const;
export type RateMatrixKmSlab = typeof RATE_MATRIX_KM_SLABS[number];

// Canonical Vehicle Type row keys - matches Fleet & Vehicles/FleetSheet.tsx's
// own VEHICLE_TYPES spelling exactly (so a Fleet-registered vehicle's
// auto-filled Type resolves directly, no fuzzy matching needed for the
// common case). "Bolero"/"T407"/"14ft/LPT"/"19-20ft" etc. from the source
// rate sheets are folded into these via normalizeRateMatrixVehicleType below
// - a display-label rename scoped to this table only, not a rename of
// Fleet & Vehicles' own Type field.
export const RATE_MATRIX_VEHICLE_TYPES = ['Tata Ace', '207', '407', '14 FT', '17 FT', '20 FT'] as const;
export type RateMatrixVehicleType = typeof RATE_MATRIX_VEHICLE_TYPES[number];

export type RateRow = Record<RateMatrixKmSlab, number>;
export type RateTable = Partial<Record<RateMatrixVehicleType, RateRow>>;

const BLR_TABLE: RateTable = {
  'Tata Ace': { 2000: 38378, 2500: 41186, 3000: 43994 },
  '207': { 2000: 43994, 2500: 48675, 3000: 51483 },
  '407': { 2000: 56163, 2500: 63651, 3000: 67396 },
  '14 FT': { 2000: 65524, 2500: 73012, 3000: 77692 },
  '17 FT': { 2000: 70204, 2500: 81436, 3000: 85181 },
  '20 FT': { 2000: 83955, 2500: 86117, 3000: 93605 },
};

const ECOM_HYD_TABLE: RateTable = {
  'Tata Ace': { 2000: 41495, 2500: 43908, 3000: 47285 },
  '207': { 2000: 53075, 2500: 55005, 3000: 56935 },
  '407': { 2000: 59348, 2500: 66585, 3000: 72858 },
  '14 FT': { 2000: 67550, 2500: 75270, 3000: 81060 },
  '17 FT': { 2000: 73340, 2500: 82025, 3000: 88780 },
  '20 FT': { 2000: 87815, 2500: 91675, 3000: 98430 },
};

const VIZAG_TABLE: RateTable = {
  'Tata Ace': { 2000: 44400, 2500: 46981, 3000: 50595 },
  '207': { 2000: 56790, 2500: 58855, 3000: 60920 },
  '407': { 2000: 63502, 2500: 71246, 3000: 77958 },
  '14 FT': { 2000: 72279, 2500: 80539, 3000: 86734 },
  '17 FT': { 2000: 78474, 2500: 87767, 3000: 94995 },
  '20 FT': { 2000: 93962, 2500: 98092, 3000: 105320 },
};

const HYD_IM4_TABLE: RateTable = {
  'Tata Ace': { 2000: 44400, 2500: 46981, 3000: 50595 },
  '207': { 2000: 56790, 2500: 58855, 3000: 60920 },
  '407': { 2000: 63502, 2500: 71246, 3000: 77958 },
  '14 FT': { 2000: 78279, 2500: 86539, 3000: 92734 },
  '17 FT': { 2000: 85474, 2500: 94767, 3000: 101995 },
  '20 FT': { 2000: 101962, 2500: 106092, 3000: 113320 },
};

// Exported (not just used internally by lookupScheduledRate below) so the
// read-only Rates tab (components/warehouse/RatesSummary.tsx) can enumerate
// every configured Vehicle Type x KM Slab combination per group, rather than
// only ever resolving one cell at a time.
export const RATE_TABLES: Record<RateTableKey, RateTable> = {
  blr: BLR_TABLE,
  ecomHyd: ECOM_HYD_TABLE,
  vizag: VIZAG_TABLE,
  hydIm4: HYD_IM4_TABLE,
};

// Extra Km/Extra Hr rates per Vehicle Type - unlike Scheduled Rate above,
// these don't vary by KM Slab (same rate across the 2000/2500/3000 rows on
// the source rate card). Only BLR's rate card has this data so far (HYD
// etc. still pending) - RATES_SUMMARY in warehouseRatesSummary.ts reads this
// for the read-only Rates tab; not yet wired into the Add/Edit Entry form's
// own Rate/Extra KM and Rate/Extra Hour fields, which stay manually typed as
// today until that's asked for.
export interface ExtraRateRow { extraKm: number; extraHr: number }
type ExtraRateTable = Partial<Record<RateMatrixVehicleType, ExtraRateRow>>;

const BLR_EXTRA_RATES: ExtraRateTable = {
  'Tata Ace': { extraKm: 8.69, extraHr: 87 },
  '207': { extraKm: 9.65, extraHr: 97 },
  '407': { extraKm: 11.58, extraHr: 116 },
  '14 FT': { extraKm: 12.55, extraHr: 135 },
  '17 FT': { extraKm: 13.51, extraHr: 145 },
  '20 FT': { extraKm: 16.41, extraHr: 174 },
};

const EXTRA_RATE_TABLES: Partial<Record<RateTableKey, ExtraRateTable>> = {
  blr: BLR_EXTRA_RATES,
};

export function lookupExtraRates(rateTableKey: RateTableKey, vehicleType: RateMatrixVehicleType): ExtraRateRow | null {
  return EXTRA_RATE_TABLES[rateTableKey]?.[vehicleType] ?? null;
}

// Tolerant of the source sheets' own varied spellings ("Bolero/207",
// "14ft/LPT", "19/20ft", "T407") as well as Fleet & Vehicles' canonical
// "207"/"14 FT" etc. - returns null (not a guess) for anything that isn't
// clearly one of the 6 recognized types, e.g. "32 FT" (out of scope here).
export function normalizeRateMatrixVehicleType(raw: string | undefined | null): RateMatrixVehicleType | null {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('tata ace') || v === 'ace') return 'Tata Ace';
  if (v.includes('bolero') || v === '207') return '207';
  if (v === '407' || v === 't407' || v.includes('407')) return '407';
  if (v.includes('14')) return '14 FT';
  if (v.includes('17')) return '17 FT';
  if (v.includes('19') || v.includes('20')) return '20 FT';
  return null;
}

// Warehouse Name -> rate-group value (see WAREHOUSE_GROUP_OPTIONS above) -
// lets the Warehouse Details form drive the Scheduled Rate lookup directly
// off the single "Warehouse Name" field instead of asking for a separate
// Warehouse Group selection. Keyed on the exact names from
// WarehouseDetails.tsx's own WAREHOUSE_LOCATIONS list (case-insensitive
// match, see rateGroupForWarehouseName below) - a name with no entry here
// (e.g. "CHN COLD IM1", "GOA IM1", "Goravegere Cold WH", "HYD IM5", or any
// new/ad-hoc name typed in that isn't in the known list at all) simply has
// no rate group, so the Scheduled Rate stays a plain manual field for it,
// same as today.
const WAREHOUSE_NAME_TO_RATE_GROUP: Record<string, string> = {
  'BLR DHL': 'BLR DHL',
  'BLR ECOM2': 'BLR ECOM', // all 6 BLR entities share one rate table regardless
  'BLR IM1': 'BLR IM1',
  'BLR IM2': 'BLR IM2',
  'BLR IM3': 'BLR IM3',
  'BLR IM4': 'BLR IM4',
  'HYD IM1': 'ECOM HYD (IM1, IM2, IM3)',
  'HYD IM2': 'ECOM HYD (IM1, IM2, IM3)',
  'HYD IM3 -Cold Star': 'ECOM HYD (IM1, IM2, IM3)',
  'HYD IM4': 'HYD IM4',
  'VIZ IM1': 'Vizag',
};

export function rateGroupForWarehouseName(warehouseName: string | undefined | null): string | null {
  const name = (warehouseName || '').trim();
  if (!name) return null;
  const key = Object.keys(WAREHOUSE_NAME_TO_RATE_GROUP).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? WAREHOUSE_NAME_TO_RATE_GROUP[key] : null;
}

// Resolves the fixed Scheduled Rate for a (Warehouse Group, Vehicle Type, KM
// Slab) combination - null when any part doesn't match a configured
// combination (unrecognized group, unrecognized/unsupported vehicle type, or
// a KM Slab this group's table doesn't have a rate for).
export function lookupScheduledRate(warehouseGroupValue: string | undefined | null, vehicleType: string | undefined | null, kmSlab: number | undefined | null): number | null {
  if (!warehouseGroupValue || !kmSlab) return null;
  const group = WAREHOUSE_GROUP_OPTIONS.find(g => g.value === warehouseGroupValue);
  if (!group) return null;
  const normType = normalizeRateMatrixVehicleType(vehicleType);
  if (!normType) return null;
  const row = RATE_TABLES[group.rateTableKey][normType];
  if (!row) return null;
  return row[kmSlab as RateMatrixKmSlab] ?? null;
}
