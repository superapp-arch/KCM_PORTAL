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
import { normalizeRateMatrixVehicleType, rateGroupForWarehouseName, RateMatrixVehicleType, findRateOverride } from './warehouseRateMatrix';
import { cityForWarehouseName } from './warehouseLocations';
import { WarehouseRateOverride } from '../types';

// ---------------------------------------------------------------------------
// 1. BLR Dedicated (24Hr) - effective 1st Feb.
// ---------------------------------------------------------------------------

// Exported for the read-only Rates tab (components/warehouse/RatesSummary.tsx)
// to enumerate directly, same reasoning as warehouseRateMatrix.ts's RATE_TABLES.
export const BLR_24HR_DEDICATED: Partial<Record<RateMatrixVehicleType, { fixed: number; variable: number }>> = {
  '207': { fixed: 34837, variable: 11.58 }, // "Bolero/207" in the rate card
  '407': { fixed: 38504, variable: 13.51 },
  '14 FT': { fixed: 44004, variable: 15.44 },
  '17 FT': { fixed: 49505, variable: 17.37 },
  '20 FT': { fixed: 55005, variable: 20.27 },
};

// Vizag (ECOM) Dedicated 24Hr - effective 1st Feb, same rate card refresh as
// BLR's table above. Only 14 FT/20 FT provided so far - any other vehicle
// type on this group simply has no configured entry yet (null), same as an
// unmatched combination anywhere else in this file.
export const ECOM_VIZAG_24HR_DEDICATED: Partial<Record<RateMatrixVehicleType, { fixed: number; variable: number }>> = {
  '14 FT': { fixed: 65000, variable: 17 },
  '20 FT': { fixed: 75000, variable: 18 },
};

// HYD IM4 (ECOM) Dedicated 24Hr - effective 1st Feb, same rate card refresh.
// Only 14 FT/20 FT provided so far.
export const HYD_IM4_24HR_DEDICATED: Partial<Record<RateMatrixVehicleType, { fixed: number; variable: number }>> = {
  '14 FT': { fixed: 69528, variable: 14.86 },
  '20 FT': { fixed: 75000, variable: 18 },
};

// One table per configured warehouse group (see rateGroupForWarehouseName in
// warehouseRateMatrix.ts) - exported so the read-only Rates tab
// (RatesSummary.tsx) can render one card per group instead of only ever
// showing BLR. A group with no entry here (anything besides these three)
// simply has no Dedicated 24Hr rate yet, same as before.
export const DEDICATED_24HR_TABLES: Record<string, Partial<Record<RateMatrixVehicleType, { fixed: number; variable: number }>>> = {
  'BLR': BLR_24HR_DEDICATED,
  'Vizag': ECOM_VIZAG_24HR_DEDICATED,
  'HYD IM4': HYD_IM4_24HR_DEDICATED,
};

// `vehicleCategory` matters here: this table is Dry-vehicle pricing only -
// Reefer/Walkes have their own separate rate card below
// (lookupReeferWalkesRate) even when the Vehicle Type coincides (e.g.
// "14 FT" exists in both tables, at different rates). Without checking
// category, a Reefer/Walkes vehicle whose Type happens to match a Dedicated
// row would silently get the wrong (Dry) rate - matching on Vehicle Type
// alone isn't enough, both fields have to agree this is really a Dry
// deployment.
export function lookup24hrDedicatedRate(warehouseName: string, vehicleType: string, vehicleCategory?: string, overrides?: WarehouseRateOverride[]): { fixed: number; variable: number } | null {
  const cat = (vehicleCategory || '').trim().toLowerCase();
  if (cat === 'reefer' || cat === 'walkes' || cat === 'walkee') return null;
  const group = rateGroupForWarehouseName(warehouseName);
  // Every BLR entity (ECOM/IM1-4/DHL) shares the one "BLR" Dedicated table -
  // any other group (Vizag, HYD IM4) is looked up by its own exact group
  // name instead of a startsWith match.
  const tableKey = group && group.startsWith('BLR') ? 'BLR' : group;
  if (!tableKey || !DEDICATED_24HR_TABLES[tableKey]) return null;
  const normType = normalizeRateMatrixVehicleType(vehicleType);
  if (!normType) return null;
  const override = findRateOverride(overrides, 'dedicated24hr', { group: tableKey, vehicleType: normType });
  if (override) return { fixed: override.value.fixed ?? 0, variable: override.value.variable ?? 0 };
  return DEDICATED_24HR_TABLES[tableKey][normType] ?? null;
}

// ---------------------------------------------------------------------------
// 2. Reefer & Walkes (24Hr) - monthly FC/VC by Location + Vehicle, effective
//    1st July'26.
// ---------------------------------------------------------------------------

export type ReeferWalkesKey = '14 FT Reefer' | '14 FT Walkes' | '207/V70 Walkes';
export type ReeferWalkesLocation = 'BLR' | 'Chennai' | 'HYD' | 'Vizag' | 'Goa';
export const REEFER_WALKES_KEYS: ReeferWalkesKey[] = ['14 FT Reefer', '14 FT Walkes', '207/V70 Walkes'];
export const REEFER_WALKES_LOCATIONS: ReeferWalkesLocation[] = ['BLR', 'Chennai', 'HYD', 'Vizag', 'Goa'];

export const REEFER_WALKES_TABLE: Record<ReeferWalkesLocation, Partial<Record<ReeferWalkesKey, { fc: number; vc: number }>>> = {
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

export function lookupReeferWalkesRate(warehouseName: string, vehicleType: string, vehicleCategory: string, overrides?: WarehouseRateOverride[]): { fc: number; vc: number } | null {
  const city = cityForWarehouseName(warehouseName);
  const location = city ? CITY_TO_REEFER_WALKES_LOCATION[city] : undefined;
  if (!location) return null;
  const key = reeferWalkesKey(vehicleType, vehicleCategory);
  if (!key) return null;
  const override = findRateOverride(overrides, 'reeferWalkes24hr', { location, vehicleKey: key });
  if (override) return { fc: override.value.fc ?? 0, vc: override.value.vc ?? 0 };
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
  // Mirrors the source rate card's own "Remarks" column - "Round Trip" (the
  // default, every pre-existing row below) or "One Way Trip" (the Vizag
  // single-leg local rates, 20 FT only, added alongside the Hyderabad/Vizag
  // route rows).
  remarks?: 'Round Trip' | 'One Way Trip';
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
  // Goa routes - 0 for Bolero/407/14 FT/17 FT means no rate configured for
  // those vehicle types on these routes (see lookupAdHocRouteRate below),
  // not a real ₹0 fare.
  { from: 'Goa', to: 'Belgaum', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 15633, 'Hybrid Vehicle': 17500 } },
  { from: 'Goa', to: 'Hubli', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 14958, 'Hybrid Vehicle': 16500 } },
  { from: 'Goa', to: 'Hubli + Belgaum', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 17370, 'Hybrid Vehicle': 19500 } },
  { from: 'Goa', to: 'Kholapur', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 22678, 'Hybrid Vehicle': 25200 } },

  // Hyderabad routes - Round Trip.
  { from: 'Hyderabad', to: 'VIZAG', rates: { 'Bolero(207)': 17370, '407': 22195, '14 FT': 24125, '17 FT': 27985, '20 FT': 32328, 'Hybrid Vehicle': 37167 } },
  { from: 'Hyderabad', to: 'VIJAYAWADA', rates: { 'Bolero(207)': 10615, '407': 11580, '14 FT': 13510, '17 FT': 15440, '20 FT': 17853, 'Hybrid Vehicle': 20045 } },
  { from: 'Hyderabad', to: 'Warangal', rates: { 'Bolero(207)': 8203, '407': 10133, '14 FT': 11098, '17 FT': 12063, '20 FT': 13510, 'Hybrid Vehicle': 14773 } },
  { from: 'Hyderabad', to: 'Kurnool', rates: { 'Bolero(207)': 9650, '407': 10615, '14 FT': 12545, '17 FT': 14475, '20 FT': 16405, 'Hybrid Vehicle': 18492 } },
  { from: 'Hyderabad', to: 'Raipur', rates: { 'Bolero(207)': 27020, '407': 27985, '14 FT': 29433, '17 FT': 33775, '20 FT': 37635, 'Hybrid Vehicle': 42356 } },
  { from: 'Hyderabad', to: 'Khammam', rates: { 'Bolero(207)': 9650, '407': 12063, '14 FT': 13028, '17 FT': 14958, '20 FT': 15923, 'Hybrid Vehicle': 17735 } },
  { from: 'Hyderabad', to: 'Karimnagar', rates: { 'Bolero(207)': 7720, '407': 8685, '14 FT': 9650, '17 FT': 10615, '20 FT': 12063, 'Hybrid Vehicle': 13386 } },
  { from: 'Hyderabad', to: 'Kakinada', rates: { 'Bolero(207)': 18335, '407': 20265, '14 FT': 22195, '17 FT': 26055, '20 FT': 30398, 'Hybrid Vehicle': 33912 } },
  { from: 'Hyderabad', to: 'Vizianagaram', rates: { 'Bolero(207)': 21230, '407': 26055, '14 FT': 27985, '17 FT': 31845, '20 FT': 36670, 'Hybrid Vehicle': 41592 } },
  { from: 'Hyderabad', to: 'Rajahmundry', rates: { 'Bolero(207)': 15440, '407': 19300, '14 FT': 21230, '17 FT': 25090, '20 FT': 29433, 'Hybrid Vehicle': 32867 } },
  { from: 'Hyderabad', to: 'Vijayanagaram', rates: { 'Bolero(207)': 21230, '407': 26055, '14 FT': 27985, '17 FT': 31845, '20 FT': 36670, 'Hybrid Vehicle': 41592 } },
  { from: 'Hyderabad', to: 'Guntur', rates: { 'Bolero(207)': 11580, '407': 13510, '14 FT': 15440, '17 FT': 17370, '20 FT': 18818, 'Hybrid Vehicle': 21178 } },
  { from: 'Hyderabad', to: 'ELURU', rates: { 'Bolero(207)': 14475, '407': 15440, '14 FT': 17370, '17 FT': 19300, '20 FT': 21713, 'Hybrid Vehicle': 0 } },
  { from: 'Hyderabad', to: 'Tenali', rates: { 'Bolero(207)': 13510, '407': 15440, '14 FT': 17370, '17 FT': 19300, '20 FT': 20748, 'Hybrid Vehicle': 0 } },
  { from: 'Hyderabad', to: 'Tenali + Eluru', rates: { 'Bolero(207)': 17370, '407': 19300, '14 FT': 21230, '17 FT': 23160, '20 FT': 27020, 'Hybrid Vehicle': 0 } },
  { from: 'Hyderabad', to: 'Raipur / Bilai + Raipur', rates: { 'Bolero(207)': 31363, '407': 32810, '14 FT': 34258, '17 FT': 37153, '20 FT': 37635, 'Hybrid Vehicle': 42356 } },
  { from: 'Hyderabad', to: 'Bilai + Bilaspur', rates: { 'Bolero(207)': 39565, '407': 41013, '14 FT': 42460, '17 FT': 44390, '20 FT': 45838, 'Hybrid Vehicle': 51352 } },
  { from: 'Hyderabad', to: 'Raipur + Bilaspur', rates: { 'Bolero(207)': 39565, '407': 41013, '14 FT': 42460, '17 FT': 44390, '20 FT': 45838, 'Hybrid Vehicle': 51352 } },
  { from: 'Hyderabad', to: 'Bilai + Raipur + Bilaspur', rates: { 'Bolero(207)': 39565, '407': 41013, '14 FT': 42460, '17 FT': 44390, '20 FT': 45838, 'Hybrid Vehicle': 51352 } },
  { from: 'Hyderabad', to: 'Ongole', rates: { 'Bolero(207)': 15923, '407': 18721, '14 FT': 19590, '17 FT': 22002, '20 FT': 23353, 'Hybrid Vehicle': 25921 } },
  { from: 'Hyderabad', to: 'Tenali+ ongole', rates: { 'Bolero(207)': 19783, '407': 21037, '14 FT': 22485, '17 FT': 24897, '20 FT': 27792, 'Hybrid Vehicle': 0 } },
  { from: 'Hyderabad', to: 'Nizambad', rates: { 'Bolero(207)': 7238, '407': 7720, '14 FT': 8203, '17 FT': 9650, '20 FT': 11580, 'Hybrid Vehicle': 12780 } },
  // Only the 20 FT column had a rate on the source sheet for this route
  // (20510) - every other vehicle type is unconfigured, same "0 means no
  // rate" convention as every other route.
  { from: 'Hyderabad', to: 'WARANGAL+Khammam', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 20510, 'Hybrid Vehicle': 0 } },

  // Vizag routes - Round Trip.
  { from: 'Vizag', to: 'Kakinada', rates: { 'Bolero(207)': 8114, '407': 9947, '14 FT': 11781, '17 FT': 13614, '20 FT': 15440, 'Hybrid Vehicle': 17836 } },
  { from: 'Vizag', to: 'Rajahmundry', rates: { 'Bolero(207)': 9626, '407': 11459, '14 FT': 13293, '17 FT': 15126, '20 FT': 16888, 'Hybrid Vehicle': 19661 } },
  { from: 'Vizag', to: 'Kakinada + Rajahmundry', rates: { 'Bolero(207)': 11918, '407': 13751, '14 FT': 15585, '17 FT': 17418, '20 FT': 19252, 'Hybrid Vehicle': 22424 } },
  { from: 'Vizag', to: 'Eluru', rates: { 'Bolero(207)': 13568, '407': 15401, '14 FT': 17235, '17 FT': 19068, '20 FT': 20844, 'Hybrid Vehicle': 24334 } },
  { from: 'Vizag', to: 'Vijayawada', rates: { 'Bolero(207)': 15448, '407': 17281, '14 FT': 19115, '17 FT': 20948, '20 FT': 22774, 'Hybrid Vehicle': 26603 } },
  { from: 'Vizag', to: 'Guntur', rates: { 'Bolero(207)': 17235, '407': 19068, '14 FT': 20902, '17 FT': 22735, '20 FT': 24569, 'Hybrid Vehicle': 28729 } },
  { from: 'Vizag', to: 'Tenali', rates: { 'Bolero(207)': 18152, '407': 19985, '14 FT': 21819, '17 FT': 23652, '20 FT': 25476, 'Hybrid Vehicle': 29773 } },
  { from: 'Vizag', to: 'Guntur +Tenali', rates: { 'Bolero(207)': 19252, '407': 21085, '14 FT': 22919, '17 FT': 24752, '20 FT': 26586, 'Hybrid Vehicle': 31104 } },
  { from: 'Vizag', to: 'Brahmapur', rates: { 'Bolero(207)': 11580, '407': 12545, '14 FT': 13993, '17 FT': 16405, '20 FT': 17853, 'Hybrid Vehicle': 19655 } },
  { from: 'Vizag', to: 'Kakinada +Rajahmundry Bhimavaram', rates: { 'Bolero(207)': 18673, '407': 20506, '14 FT': 22340, '17 FT': 24173, '20 FT': 25042, 'Hybrid Vehicle': 28818 } },
  { from: 'Vizag', to: 'Bhimavaram', rates: { 'Bolero(207)': 13568, '407': 15401, '14 FT': 17235, '17 FT': 19068, '20 FT': 20844, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Bhimavaram + ELURU + Guntur', rates: { 'Bolero(207)': 17428, '407': 19261, '14 FT': 21095, '17 FT': 22928, '20 FT': 24704, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'BHIMAVARAM+ ELURU', rates: { 'Bolero(207)': 18393, '407': 20226, '14 FT': 22060, '17 FT': 23893, '20 FT': 25669, 'Hybrid Vehicle': 28847 } },
  { from: 'Vizag', to: 'Rajahmundry+Bhimavaram', rates: { 'Bolero(207)': 14451, '407': 16284, '14 FT': 18118, '17 FT': 19951, '20 FT': 21713, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Vijayawada + Guntur', rates: { 'Bolero(207)': 17235, '407': 19068, '14 FT': 20902, '17 FT': 22735, '20 FT': 24569, 'Hybrid Vehicle': 28729 } },
  { from: 'Vizag', to: 'Vijayawada + Eluru', rates: { 'Bolero(207)': 15448, '407': 17281, '14 FT': 19115, '17 FT': 20948, '20 FT': 22774, 'Hybrid Vehicle': 26536 } },
  { from: 'Vizag', to: 'Guntur+Tadepalli', rates: { 'Bolero(207)': 17235, '407': 19068, '14 FT': 20902, '17 FT': 22735, '20 FT': 24569, 'Hybrid Vehicle': 28655 } },
  { from: 'Vizag', to: 'Tadepalli+Vijayawada', rates: { 'Bolero(207)': 17448, '407': 19281, '14 FT': 21115, '17 FT': 22948, '20 FT': 24774, 'Hybrid Vehicle': 29608 } },
  { from: 'Vizag', to: 'Bhimavaram+Vijayawada', rates: { 'Bolero(207)': 22448, '407': 24281, '14 FT': 26115, '17 FT': 27948, '20 FT': 29774, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Tadepalli+Tenali', rates: { 'Bolero(207)': 21152, '407': 22985, '14 FT': 24819, '17 FT': 26652, '20 FT': 28476, 'Hybrid Vehicle': 33354 } },

  // Vizag - One Way Trip (20 FT only, per the source sheet).
  { from: 'Vizag', to: 'VIJAYAWADA', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 15300, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Guntur', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 16500, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'ELURU', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 14500, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Tenali', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 17000, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Kakinada & Rajahmundry', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 14500, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Guntur & Tenali', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 17500, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Kakinada', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 11500, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Rajahmundry', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 13000, 'Hybrid Vehicle': 0 } },
  // Two conflicting values for this route were on the source sheet (17300 and
  // 16300) - confirmed 16300 is the correct one to use.
  { from: 'Vizag', to: 'Tadepalli+Vijayawada', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 16300, 'Hybrid Vehicle': 0 } },
  { from: 'Vizag', to: 'Vijayawada + Eluru', remarks: 'One Way Trip', rates: { 'Bolero(207)': 0, '407': 0, '14 FT': 0, '17 FT': 0, '20 FT': 16300, 'Hybrid Vehicle': 0 } },
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

// ---------------------------------------------------------------------------
// 4. Ad-hoc Daily/Local rate table - the OTHER Ad-hoc pricing model,
//    separate from the Route table above. A per-vehicle-type flat day rate
//    (100 Kms/12 Hrs included) plus its own Extra Km/Extra Hr overage rates,
//    for local Ad-hoc use with no fixed From/To route - BLR only so far,
//    effective 1st Feb. Not yet surfaced as its own selector in the Add/Edit
//    Entry form (only shown on the read-only Rates tab for now) - Ad-hoc
//    there still only offers the Route table; wiring a Route vs Daily/Local
//    choice into the live form is a separate follow-up.
// ---------------------------------------------------------------------------

export interface AdHocDailyRateRow {
  dailyKms: number;
  hrs: number;
  rate: number;
  extraKm: number;
  extraHr: number;
}

export const BLR_ADHOC_DAILY_RATES: Partial<Record<RateMatrixVehicleType, AdHocDailyRateRow>> = {
  'Tata Ace': { dailyKms: 100, hrs: 12, rate: 1737, extraKm: 8.7, extraHr: 87 },
  '207': { dailyKms: 100, hrs: 12, rate: 1930, extraKm: 9.7, extraHr: 97 }, // "Bolero" in the rate card
  '407': { dailyKms: 100, hrs: 12, rate: 2702, extraKm: 11.6, extraHr: 116 },
  '14 FT': { dailyKms: 100, hrs: 12, rate: 3571, extraKm: 12.5, extraHr: 135 },
  '17 FT': { dailyKms: 100, hrs: 12, rate: 3667, extraKm: 13.5, extraHr: 145 },
  '20 FT': { dailyKms: 100, hrs: 12, rate: 4150, extraKm: 16.4, extraHr: 174 },
};

// HYD IM4 Local Ad-hoc, effective 1st Feb - 80 Kms/12 Hrs included (tolls
// included in the flat rate, unlike BLR's table above which is 100 Kms).
// Fully provided across all 6 vehicle types.
export const HYD_IM4_ADHOC_DAILY_RATES: Partial<Record<RateMatrixVehicleType, AdHocDailyRateRow>> = {
  'Tata Ace': { dailyKms: 80, hrs: 12, rate: 1930, extraKm: 3, extraHr: 87 },
  '207': { dailyKms: 80, hrs: 12, rate: 2413, extraKm: 10, extraHr: 87 }, // "Bolero" in the rate card
  '407': { dailyKms: 80, hrs: 12, rate: 3088, extraKm: 13, extraHr: 125 },
  '14 FT': { dailyKms: 80, hrs: 12, rate: 3378, extraKm: 14, extraHr: 145 },
  '17 FT': { dailyKms: 80, hrs: 12, rate: 4348, extraKm: 16, extraHr: 183 },
  '20 FT': { dailyKms: 80, hrs: 12, rate: 4825, extraKm: 21, extraHr: 212 },
};

// One table per configured warehouse group - exported so the read-only
// Rates tab (RatesSummary.tsx) can render one card per group instead of
// only ever showing BLR.
export const ADHOC_DAILY_TABLES: Record<string, Partial<Record<RateMatrixVehicleType, AdHocDailyRateRow>>> = {
  'BLR': BLR_ADHOC_DAILY_RATES,
  'HYD IM4': HYD_IM4_ADHOC_DAILY_RATES,
};

export function lookupAdHocDailyRate(warehouseName: string, vehicleType: string): AdHocDailyRateRow | null {
  const group = rateGroupForWarehouseName(warehouseName);
  const tableKey = group && group.startsWith('BLR') ? 'BLR' : group;
  if (!tableKey || !ADHOC_DAILY_TABLES[tableKey]) return null;
  const normType = normalizeRateMatrixVehicleType(vehicleType);
  if (!normType) return null;
  return ADHOC_DAILY_TABLES[tableKey][normType] ?? null;
}
