// Fixed 24Hr rate lookups for Warehouse Details - three independent tables,
// selected by Deployment Type + Vehicle Category (see WarehouseDetails.tsx's
// 24Hr Rate Configuration block):
//
// 1. Dedicated (Regular deployment, Dry vehicles) - Fixed/Variable per
//    Vehicle Type, BLR only for now. Feeds Base Rate = (Fixed / Working
//    Days) + (KM Utilised x Variable), same formula shape as the existing
//    12Hr Scheduled Rate lookup.
// 2. Reefer & Walkes (Regular deployment) - monthly FC (Fixed Cost) / VC
//    (Variable Cost) per Location + Vehicle, since these bill differently
//    from Dry Dedicated (per-location variable cost, not a single company-
//    wide rate). Same formula shape: Base Rate = (FC / Working Days) +
//    (KM Utilised x VC).
// 3. Ad-hoc route table - trip-based, not formula-based. Flat round-trip
//    rate per From City + To City + Vehicle, looked up directly (no Working
//    Days/KM Utilised involved at all).
//
// All three are plain in-code tables for now (not database-backed/admin-
// editable), same convention as utils/warehouseRateMatrix.ts's 12Hr table -
// a combination with no configured rate simply returns null, leaving
// Scheduled Rate/Variable Cost/Base Rate as plain manual fields exactly like
// today.
import { normalizeRateMatrixVehicleType, rateGroupForWarehouseName, RateMatrixVehicleType } from './warehouseRateMatrix';
import { cityForWarehouseName } from './warehouseLocations';

// ---------------------------------------------------------------------------
// 1. BLR Dedicated (24Hr) - effective 1st Feb.
// ---------------------------------------------------------------------------

const BLR_24HR_DEDICATED: Partial<Record<RateMatrixVehicleType, { fixed: number; variable: number }>> = {
  '207': { fixed: 34837, variable: 11.58 }, // "Bolero/207" in the rate card
  '407': { fixed: 38504, variable: 13.51 },
  '14 FT': { fixed: 44004, variable: 15.44 },
  '17 FT': { fixed: 49505, variable: 17.37 },
  '20 FT': { fixed: 55005, variable: 20.27 },
};

// Only BLR has a Dedicated 24Hr table so far - any other warehouse group (or
// a group with no configured entry for this vehicle type, e.g. Tata Ace)
// returns null, same as an unmatched 12Hr combination.
export function lookup24hrDedicatedRate(warehouseName: string, vehicleType: string): { fixed: number; variable: number } | null {
  const group = rateGroupForWarehouseName(warehouseName);
  if (!group || !group.startsWith('BLR')) return null;
  const normType = normalizeRateMatrixVehicleType(vehicleType);
  if (!normType) return null;
  return BLR_24HR_DEDICATED[normType] ?? null;
}

// ---------------------------------------------------------------------------
// 2. Reefer & Walkes (24Hr) - monthly FC/VC by Location + Vehicle, effective
//    1st July'26.
// ---------------------------------------------------------------------------

type ReeferWalkesKey = '14 FT Reefer' | '14 FT Walkes' | '207/V70 Walkes';
type ReeferWalkesLocation = 'BLR' | 'Chennai' | 'HYD' | 'Vizag' | 'Goa';

const REEFER_WALKES_TABLE: Record<ReeferWalkesLocation, Partial<Record<ReeferWalkesKey, { fc: number; vc: number }>>> = {
  BLR: { '14 FT Reefer': { fc: 76000, vc: 21 }, '14 FT Walkes': { fc: 70000, vc: 18 }, '207/V70 Walkes': { fc: 60000, vc: 13 } },
  Chennai: { '14 FT Reefer': { fc: 76000, vc: 25 }, '14 FT Walkes': { fc: 70000, vc: 19 }, '207/V70 Walkes': { fc: 60000, vc: 14 } },
  HYD: { '14 FT Reefer': { fc: 76000, vc: 23 }, '14 FT Walkes': { fc: 70000, vc: 21 }, '207/V70 Walkes': { fc: 60000, vc: 14 } },
  Vizag: { '14 FT Reefer': { fc: 76000, vc: 30 }, '14 FT Walkes': { fc: 70000, vc: 18 } },
  Goa: { '14 FT Walkes': { fc: 70000, vc: 17 } },
};

// WAREHOUSE_LOCATIONS' own "city" values (Bangalore/Chennai/Hyderabad/Vizag/
// Central Goa) -> this table's short location codes.
const CITY_TO_REEFER_WALKES_LOCATION: Record<string, ReeferWalkesLocation> = {
  'Bangalore': 'BLR', 'Chennai': 'Chennai', 'Hyderabad': 'HYD', 'Vizag': 'Vizag', 'Central Goa': 'Goa',
};

// '14 FT' + Reefer/Walkes, or '207'/'V70' + Walkes only (no 207 Reefer row
// exists in the rate card) - anything else (17 FT Reefer, Dry, etc.) isn't in
// this table and returns null.
function reeferWalkesKey(vehicleType: string, vehicleCategory: string): ReeferWalkesKey | null {
  const cat = (vehicleCategory || '').trim().toLowerCase();
  const raw = (vehicleType || '').trim().toLowerCase();
  const is14Ft = raw.includes('14');
  const is207OrV70 = raw.includes('v70') || normalizeRateMatrixVehicleType(vehicleType) === '207';
  if (cat === 'reefer' && is14Ft) return '14 FT Reefer';
  if (cat === 'walkes' && is14Ft) return '14 FT Walkes';
  if (cat === 'walkes' && is207OrV70) return '207/V70 Walkes';
  return null;
}

export function lookupReeferWalkesRate(warehouseName: string, vehicleType: string, vehicleCategory: string): { fc: number; vc: number } | null {
  const city = cityForWarehouseName(warehouseName);
  const location = city ? CITY_TO_REEFER_WALKES_LOCATION[city] : undefined;
  if (!location) return null;
  const key = reeferWalkesKey(vehicleType, vehicleCategory);
  if (!key) return null;
  return REEFER_WALKES_TABLE[location][key] ?? null;
}

// ---------------------------------------------------------------------------
// 3. Ad-hoc route table - flat round-trip rate, From City -> To City ->
//    Vehicle. "Hybrid Vehicle" is a rate-card column here, not a Deployment
//    Type - it applies whenever Vehicle Category is Hybrid, same as every
//    other vehicle category column.
// ---------------------------------------------------------------------------

export const ADHOC_VEHICLE_COLUMNS = ['Bolero(207)', '407', '14 FT', '17 FT', '20 FT', 'Hybrid Vehicle'] as const;
export type AdHocVehicleColumn = typeof ADHOC_VEHICLE_COLUMNS[number];

export interface AdHocRouteRow {
  from: string;
  to: string;
  rates: Record<AdHocVehicleColumn, number>;
}

export const ADHOC_ROUTES: AdHocRouteRow[] = [
  { from: 'Bangalore', to: 'Belgaum', rates: { 'Bolero(207)': 24125, '407': 27020, '14 FT': 28950, '17 FT': 30880, '20 FT': 31845, 'Hybrid Vehicle': 35464 } },
  { from: 'Bangalore', to: 'Hubli', rates: { 'Bolero(207)': 21230, '407': 23160, '14 FT': 26055, '17 FT': 27985, '20 FT': 28950, 'Hybrid Vehicle': 32053 } },
  { from: 'Bangalore', to: 'Mangalore', rates: { 'Bolero(207)': 18818, '407': 21713, '14 FT': 23160, '17 FT': 25090, '20 FT': 26055, 'Hybrid Vehicle': 28766 } },
  { from: 'Bangalore', to: 'Mangalore + Udupi', rates: { 'Bolero(207)': 22678, '407': 25573, '14 FT': 27020, '17 FT': 28950, '20 FT': 29915, 'Hybrid Vehicle': 33074 } },
  { from: 'Bangalore', to: 'Mysore', rates: { 'Bolero(207)': 6755, '407': 7720, '14 FT': 8685, '17 FT': 9650, '20 FT': 11966, 'Hybrid Vehicle': 13201 } },
  { from: 'Bangalore', to: 'Davanagere', rates: { 'Bolero(207)': 14475, '407': 16405, '14 FT': 18335, '17 FT': 20265, '20 FT': 22195, 'Hybrid Vehicle': 24356 } },
  { from: 'Bangalore', to: 'Shimoga', rates: { 'Bolero(207)': 15440, '407': 17370, '14 FT': 20265, '17 FT': 22195, '20 FT': 24125, 'Hybrid Vehicle': 26499 } },
  { from: 'Bangalore', to: 'Tumakuru', rates: { 'Bolero(207)': 5790, '407': 6755, '14 FT': 7720, '17 FT': 8685, '20 FT': 9650, 'Hybrid Vehicle': 0 } },
];

export const adHocFromCities = (): string[] => Array.from(new Set(ADHOC_ROUTES.map(r => r.from)));
export const adHocToCities = (from: string): string[] => ADHOC_ROUTES.filter(r => r.from === from).map(r => r.to);

// Vehicle Category "Hybrid" -> the "Hybrid Vehicle" column, regardless of
// Vehicle Type; every other category resolves by Vehicle Type as normal
// (Bolero/207 -> 'Bolero(207)', everything else 1:1 with the 12Hr matrix's
// own normalization).
function adHocColumn(vehicleType: string, vehicleCategory: string): AdHocVehicleColumn | null {
  if ((vehicleCategory || '').trim().toLowerCase() === 'hybrid') return 'Hybrid Vehicle';
  const normType = normalizeRateMatrixVehicleType(vehicleType);
  if (normType === '207') return 'Bolero(207)';
  if (normType === '407' || normType === '14 FT' || normType === '17 FT' || normType === '20 FT') return normType;
  return null;
}

// A 0 in the rate card (e.g. Tumakuru's Hybrid Vehicle column) means "no
// rate configured for this combination" - same as a missing entry, so it's
// treated as null rather than a real ₹0 flat rate.
export function lookupAdHocRouteRate(from: string, to: string, vehicleType: string, vehicleCategory: string): number | null {
  const route = ADHOC_ROUTES.find(r => r.from === from && r.to === to);
  if (!route) return null;
  const column = adHocColumn(vehicleType, vehicleCategory);
  if (!column) return null;
  const rate = route.rates[column];
  return rate > 0 ? rate : null;
}
