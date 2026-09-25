// Warehouse Details' ONE calculation entry point (2026-09-25). The Add Entry
// form, the Edit modal and the Excel import all resolve a deployment's rate
// and totals through calculateWarehouseEntry(), so "Manual Entry -> KCM rate
// engine" and "Excel Import -> KCM rate engine" can never produce different
// official figures for the same inputs. It adds no formula of its own: the
// rate lookups are the existing tables/overrides (warehouseRateMatrix.ts,
// warehouseRateMatrix24hr.ts) and the arithmetic is computeWarehouseRates().
//
// Deployment rules:
//   Regular - Fixed Hrs (12/24) applies and picks the formula/rate table:
//             12Hr Dedicated table, else 24Hr Dedicated, else 24Hr Reefer &
//             Walkes, else the entry's own manual Scheduled Rate.
//   Ad-hoc  - Fixed Hrs does NOT apply: flat rate from the 24Hr Ad-hoc route
//             table (From City -> To City -> vehicle column).
//   Hybrid  - Fixed Hrs does NOT apply: no rate table, the agreed Scheduled
//             Rate / Working Days.
// For Ad-hoc and Hybrid every KM/shift-time input (KM Slab, KM Utilised, Add
// KM, Add Hour, Variable Cost, per-extra rates) is forced to 0 here, so a
// hidden or stale value can never reach a total.
import { WarehouseRateOverride } from '../types';
import { computeWarehouseRates, round2, WarehouseRateResult } from './warehouseRates';
import { rateGroupForWarehouseName, lookupScheduledRate, normalizeRateMatrixVehicleType } from './warehouseRateMatrix';
import { lookup24hrDedicatedRate, lookupReeferWalkesRate, findAdHocRoute, adHocColumn } from './warehouseRateMatrix24hr';

export type WarehouseDeployment = 'regular' | 'ad-hoc' | 'hybrid';

// "Ad-Hoc", "adhoc", "24Hr Ad-Hoc", "AD HOC" -> 'ad-hoc'; blank -> 'regular';
// anything unrecognised -> null (the caller reports it, never guesses).
export function normalizeDeploymentType(raw: string | undefined | null): WarehouseDeployment | null {
  const v = (raw || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!v || v === 'regular' || v === 'dedicated') return 'regular';
  if (v.includes('adhoc')) return 'ad-hoc';
  if (v.includes('hybrid')) return 'hybrid';
  return null;
}

export const fixedHoursApplies = (deploymentType: string | undefined | null): boolean =>
  normalizeDeploymentType(deploymentType) === 'regular';

// Ledger/export display - "N/A" wherever Fixed Hrs doesn't apply and none was
// stored (entries saved from 2026-09-25 store 0 for Ad-hoc/Hybrid).
export const fixedHoursLabel = (entry: { deploymentType?: string; fixedHours?: number }): string =>
  entry.fixedHours ? `${entry.fixedHours} Hrs` : fixedHoursApplies(entry.deploymentType) ? '12 Hrs' : 'N/A';

export interface WarehouseCalcInput {
  deploymentType: string;
  fixedHours: number;
  warehouseName: string;
  vehicleType: string;
  vehicleCategory: string;
  kmSlab: number;
  kmUtilised: number;
  addKm: number;
  addHour: number;
  ratePerExtraKm: number;
  ratePerExtraHour: number;
  scheduledRate: number; // the entry's own/manual value - used only when no rate table applies
  variableCostPerKm: number; // same - 24Hr only
  workingDays: number; // already resolved (>= 1)
  tollCharges: number;
  parkingCost: number;
  hybridReeferCost: number;
  adHocFromCity: string;
  adHocToCity: string;
}

export type WarehouseRateSource = 'adHocRoute' | 'dedicated12hr' | 'dedicated24hr' | 'reeferWalkes24hr' | 'manual' | 'none';

// Why no official rate could be resolved - never papered over with 0 or a
// different route's rate; callers show it and block/flag the entry.
export interface WarehouseMissingRate {
  code: 'NEW_ROUTE' | 'ROUTE_VEHICLE_RATE' | 'ROUTE_NOT_SELECTED' | 'RATE_NOT_CONFIGURED' | 'UNKNOWN_VEHICLE_TYPE';
  message: string;
  from?: string;
  to?: string;
}

export interface WarehouseCalcResult extends WarehouseRateResult {
  deploymentType: WarehouseDeployment;
  fixedHoursApplies: boolean;
  fixedHours: number; // 12/24 for Regular, 0 (N/A) for Ad-hoc/Hybrid
  finalBaseRate: number;
  scheduledRate: number; // the Scheduled Rate actually used (table or manual)
  variableCostPerKm: number;
  kmUtilised: number; // 0 for Ad-hoc/Hybrid
  adHocRouteRate: number | null;
  rateSource: WarehouseRateSource;
  rateSourceNote: string;
  missingRate: WarehouseMissingRate | null;
}

export function calculateWarehouseEntry(input: WarehouseCalcInput, overrides?: WarehouseRateOverride[]): WarehouseCalcResult {
  const deployment = normalizeDeploymentType(input.deploymentType) || 'regular';
  const regular = deployment === 'regular';
  const fixedHours = regular ? (input.fixedHours === 24 ? 24 : 12) : 0;
  let scheduledRate = Math.max(0, input.scheduledRate || 0);
  let variableCostPerKm = Math.max(0, input.variableCostPerKm || 0);
  let flat: number | null = null;
  let adHocRouteRate: number | null = null;
  let rateSource: WarehouseRateSource = 'none';
  let rateSourceNote = '';
  let missingRate: WarehouseMissingRate | null = null;

  if (deployment === 'ad-hoc') {
    const from = (input.adHocFromCity || '').trim();
    const to = (input.adHocToCity || '').trim();
    const route = findAdHocRoute(from, to, overrides);
    const column = adHocColumn(input.vehicleType, input.vehicleCategory);
    if (!from || !to) {
      missingRate = { code: 'ROUTE_NOT_SELECTED', message: 'Ad-hoc route not given - From City and To City are required.' };
    } else if (!route) {
      missingRate = { code: 'NEW_ROUTE', message: `New route - rate not configured: ${from} → ${to}.`, from, to };
    } else if (!column) {
      missingRate = { code: 'UNKNOWN_VEHICLE_TYPE', message: `Vehicle Type "${input.vehicleType || '(blank)'}" has no column in the Ad-hoc route table (Bolero(207), 407, 14 FT, 17 FT, 20 FT, or Category Hybrid).`, from, to };
    } else if (!(route.rates[column] > 0)) {
      missingRate = { code: 'ROUTE_VEHICLE_RATE', message: `Rate not configured for ${column} on ${route.from} → ${route.to}.`, from: route.from, to: route.to };
    } else {
      adHocRouteRate = route.rates[column];
      flat = adHocRouteRate;
      rateSource = 'adHocRoute';
      rateSourceNote = `Ad-hoc route rate ${route.from} → ${route.to} (${column}).`;
    }
    if (flat == null) flat = 0; // shown as ₹0 WITH missingRate set - never a guessed rate
    scheduledRate = 0;
    variableCostPerKm = 0;
  } else if (deployment === 'hybrid') {
    variableCostPerKm = 0;
    if (scheduledRate > 0) {
      rateSource = 'manual';
      rateSourceNote = 'Hybrid - no rate table; agreed Scheduled Rate / Working Days.';
    } else {
      missingRate = { code: 'RATE_NOT_CONFIGURED', message: 'Hybrid has no rate table - the agreed Scheduled Rate is required.' };
    }
  } else {
    const group = rateGroupForWarehouseName(input.warehouseName) || '';
    if (!normalizeRateMatrixVehicleType(input.vehicleType) && !(scheduledRate > 0)) {
      missingRate = { code: 'UNKNOWN_VEHICLE_TYPE', message: `Vehicle Type "${input.vehicleType || '(blank)'}" is not in the rate configuration and no Scheduled Rate was given.` };
    }
    if (fixedHours === 12) {
      const table = lookupScheduledRate(group, input.vehicleType, input.kmSlab, overrides);
      if (table != null) {
        scheduledRate = table;
        rateSource = 'dedicated12hr';
        rateSourceNote = `12Hr Dedicated rate table (${group}, KM Slab ${input.kmSlab}).`;
      }
      variableCostPerKm = 0;
    } else {
      const dedicated = lookup24hrDedicatedRate(input.warehouseName, input.vehicleType, input.vehicleCategory, overrides);
      const reeferWalkes = dedicated ? null : lookupReeferWalkesRate(input.warehouseName, input.vehicleType, input.vehicleCategory, overrides);
      if (dedicated) {
        scheduledRate = dedicated.fixed;
        variableCostPerKm = dedicated.variable;
        rateSource = 'dedicated24hr';
        rateSourceNote = `24Hr Dedicated rate table (${group || input.warehouseName}).`;
      } else if (reeferWalkes) {
        scheduledRate = reeferWalkes.fc;
        variableCostPerKm = reeferWalkes.vc;
        rateSource = 'reeferWalkes24hr';
        rateSourceNote = '24Hr Reefer & Walkes rate table.';
      }
    }
    if (rateSource === 'none') {
      if (scheduledRate > 0) {
        rateSource = 'manual';
        rateSourceNote = 'No rate-table match - using the entry\'s own Scheduled Rate.';
      } else if (!missingRate) {
        missingRate = {
          code: 'RATE_NOT_CONFIGURED',
          message: fixedHours === 12
            ? `12Hr rate not configured for ${group || input.warehouseName || '(no warehouse)'} / ${input.vehicleType || '(no vehicle type)'} / KM Slab ${input.kmSlab || '(blank)'}.`
            : `24Hr rate not configured for ${input.warehouseName || '(no warehouse)'} / ${input.vehicleType || '(no vehicle type)'} / ${input.vehicleCategory || '(no category)'}.`
        };
      }
    }
  }

  const kmBlock = regular;
  const kmUtilised = kmBlock ? Math.max(0, input.kmUtilised || 0) : 0;
  const result = computeWarehouseRates({
    fixedHours: regular ? fixedHours : 12,
    scheduledRate,
    workingDays: input.workingDays,
    kmSlab: kmBlock ? input.kmSlab : 0,
    variableCostPerKm: kmBlock && fixedHours === 24 ? variableCostPerKm : 0,
    kmUtilised,
    addKm: kmBlock ? input.addKm : 0,
    ratePerExtraKm: kmBlock ? input.ratePerExtraKm : 0,
    addHour: kmBlock ? input.addHour : 0,
    ratePerExtraHour: kmBlock ? input.ratePerExtraHour : 0,
    tollCharges: input.tollCharges,
    parkingCost: input.parkingCost,
    hybridReeferCost: input.hybridReeferCost,
    flatBaseRateOverride: flat
  });
  return {
    ...result,
    deploymentType: deployment,
    fixedHoursApplies: regular,
    fixedHours,
    finalBaseRate: round2(Math.max(0, result.baseRate + result.fuelCost)),
    scheduledRate,
    variableCostPerKm: kmBlock && fixedHours === 24 ? variableCostPerKm : 0,
    kmUtilised,
    adHocRouteRate,
    rateSource,
    rateSourceNote,
    missingRate
  };
}
