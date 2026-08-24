// Warehouse Details' rate-calculation system (KM Slab / Working Days / Base
// Rate / Fuel Cost / Add KM & Add Hour / 24 Hrs variant) - one shared home so
// the Add Entry form and the Edit modal can never compute a different Grand
// Total for the same inputs.

// Config, not hard-coded inline in the formula - change this one place if
// the fuel cost percentage ever changes.
export const FUEL_COST_PERCENT = 3.5;

export const KM_SLAB_SUGGESTIONS = [2000, 2500, 3000];

// Round to 2 decimals the standard way (avoids classic floating-point
// artifacts like 4219.34999999).
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Indian Rupee formatting, e.g. 4219.35 -> "₹4,219.35" - always exactly 2
// decimals, even for a whole number.
export const formatINR = (n: number): string =>
  `₹${round2(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Calendar days in a YYYY-MM month - never hard-coded to 30. Day 0 of the
// following month is the last day of this one.
export function daysInMonth(yyyyMm: string): number {
  const [y, m] = (yyyyMm || '').split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

export function countSundaysInMonth(yyyyMm: string): number {
  const [y, m] = (yyyyMm || '').split('-').map(Number);
  if (!y || !m) return 0;
  const total = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= total; d++) {
    if (new Date(y, m - 1, d).getDay() === 0) count++;
  }
  return count;
}

// Working Days auto-fill from the calendar - total days in the month, minus
// Sundays (if the office wants that deducted) and any manually-counted
// holidays. Floored at 1 so a Base Rate divide-by-zero can never happen, per
// the "at least 1" rule.
export function computeAutoWorkingDays(yyyyMm: string, deductSundays: boolean, holidays: number): number {
  const total = daysInMonth(yyyyMm);
  const sundays = deductSundays ? countSundaysInMonth(yyyyMm) : 0;
  return Math.max(1, total - sundays - Math.max(0, Math.floor(holidays || 0)));
}

// The Working Days value actually used in the formula - an explicit
// override always wins over the auto-computed one, still floored at 1.
export function resolveWorkingDays(auto: number, override: number | undefined | null): number {
  const val = override != null && override !== 0 ? override : auto;
  return Math.max(1, Math.floor(val || 1));
}

export interface WarehouseRateInputs {
  fixedHours: number; // 12 or 24 - selects which Base Rate formula applies
  scheduledRate: number; // fixed monthly rate
  workingDays: number; // already resolved (>= 1) - see resolveWorkingDays
  kmSlab: number; // numeric KM Slab value
  variableCostPerKm: number; // 24 Hrs only
  kmUtilised: number; // 24 Hrs only - Closing KM - Opening KM, drives the Variable Cost term
  addKm: number; // "Add KM" - km beyond the slab
  ratePerExtraKm: number;
  addHour: number; // "Add Hour" - hours beyond fixedHours
  ratePerExtraHour: number;
  tollCharges: number;
  parkingCost: number;
  hybridReeferCost: number;
  // Ad-hoc 24Hr only - a direct flat Base Rate (from the round-trip route
  // table) that bypasses the Scheduled Rate/Working Days/KM Utilised formula
  // entirely. null/undefined for every other Deployment Type - Fuel
  // Cost/Extra KM/Extra Hour/Grand Total are still computed normally on top
  // of whichever Base Rate results, formula or flat.
  flatBaseRateOverride?: number | null;
}

export interface WarehouseRateResult {
  baseRate: number;
  fuelCost: number;
  extraKmAmount: number;
  extraHourAmount: number;
  grandTotal: number;
}

// Base Rate (12 Hrs) = Scheduled Rate / Working Days.
// Base Rate (24 Hrs) = (Scheduled Rate / Working Days) + (KM Utilised x Variable Cost per km).
// Base Rate (24 Hrs Ad-hoc) = flatBaseRateOverride (a flat route-table rate) directly.
// Fuel Cost = Base Rate x FUEL_COST_PERCENT%, recalculating on any change.
// Grand Total = Base Rate + Fuel Cost + Extra KM Amount + Extra Hour Amount
// + whatever Toll/Parking/Hybrid-Reefer costs are already logged for this
// trip (kept - those are real costs the new formula doesn't replace).
export function computeWarehouseRates(inputs: WarehouseRateInputs): WarehouseRateResult {
  const workingDays = Math.max(1, inputs.workingDays || 1);
  const baseRateRaw = inputs.flatBaseRateOverride != null
    ? inputs.flatBaseRateOverride
    : inputs.fixedHours === 24
    ? (inputs.scheduledRate / workingDays) + (inputs.kmUtilised * inputs.variableCostPerKm)
    : inputs.scheduledRate / workingDays;
  const baseRate = round2(Math.max(0, baseRateRaw));
  const fuelCost = round2(baseRate * (FUEL_COST_PERCENT / 100));
  // Extra KM Amount is NOT clamped at 0 - for 12Hr, Add KM is itself allowed
  // to be negative (this entry's KM Utilised came in under the month's daily
  // average - see the live Add KM formula in WarehouseDetails.tsx), and that
  // negative genuinely flows through as a credit here, verified against a
  // real rate sheet: Add KM -17/-15 lined up with Extra KM Amount -286/-247
  // at that vehicle's own ~16.41/km rate. A positive addKm (24Hr's "km run
  // beyond the slab" sense) behaves exactly as before.
  const extraKmAmount = round2((inputs.addKm || 0) * (inputs.ratePerExtraKm || 0));
  const extraHourAmount = round2(Math.max(0, inputs.addHour || 0) * (inputs.ratePerExtraHour || 0));
  const grandTotal = round2(
    baseRate + fuelCost + extraKmAmount + extraHourAmount +
    Math.max(0, inputs.tollCharges || 0) + Math.max(0, inputs.parkingCost || 0) + Math.max(0, inputs.hybridReeferCost || 0)
  );
  return { baseRate, fuelCost, extraKmAmount, extraHourAmount, grandTotal };
}
