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

// In Time/Closure Time -> total shift duration in hours, for a 12Hr
// deployment's Add Hour auto-calc (see WarehouseDetails.tsx). Both times are
// "HH:MM" text paired with their own AM/PM (see WarehouseEntry.inTimePeriod/
// closureTimePeriod) - converted to minutes-since-midnight, then the
// duration wraps past midnight when Closure lands earlier in the clock than
// In (e.g. 08:00 PM in -> 08:00 AM out = a 12h overnight shift, not -12h).
// Returns null when either time is missing/unparsable, so the caller can
// leave Add Hour alone rather than zeroing it out on an incomplete form.
function timeToMinutes(raw: string, period: 'AM' | 'PM' | undefined): number | null {
  const m = (raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 1 || h > 12 || min < 0 || min > 59) return null;
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

// Converts a legacy 24-hour "HH:MM" (the only format inTime/closureTime
// ever stored before inTimePeriod/closureTimePeriod existed) into the new
// 12-hour text + AM/PM pair - fully unambiguous, not a guess: 24-hour format
// already pins down AM/PM exactly (00 = 12 AM, 01-11 = AM, 12 = 12 PM,
// 13-23 = PM). Used only when loading an entry that predates this field, so
// its time still displays/computes correctly instead of showing a raw
// value like "20:00" next to an AM/PM toggle that doesn't match it. Returns
// null for anything that isn't a plain HH:MM (already-12-hour values from a
// newer entry never reach this, since those always carry their own period).
export function legacyTimeTo12Hour(raw: string): { time: string; period: 'AM' | 'PM' } | null {
  const m = (raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2];
  if (h < 0 || h > 23) return null;
  if (h === 0) return { time: `12:${min}`, period: 'AM' };
  if (h === 12) return { time: `12:${min}`, period: 'PM' };
  if (h > 12) return { time: `${String(h - 12).padStart(2, '0')}:${min}`, period: 'PM' };
  return { time: `${String(h).padStart(2, '0')}:${min}`, period: 'AM' };
}

export function computeShiftDurationHours(
  inTimeStr: string, inPeriod: 'AM' | 'PM' | undefined,
  closureTimeStr: string, closurePeriod: 'AM' | 'PM' | undefined
): number | null {
  const start = timeToMinutes(inTimeStr, inPeriod);
  const end = timeToMinutes(closureTimeStr, closurePeriod);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60; // crossed midnight
  return round2(diff / 60);
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
