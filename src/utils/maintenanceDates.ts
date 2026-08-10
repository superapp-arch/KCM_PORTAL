// Shared due-soon/overdue math for Fleet Maintenance's Service Schedule and
// Wheel Alignment tracking (src/components/maintenance/*) - both a time
// interval and a KM interval are checked, whichever is crossed first wins
// (confirmed with the user). KM tracking is best-effort: only vehicles with
// mileage-tracked fuel entries have a reliable current odometer reading (see
// FuelManagement.tsx), so a vehicle with none of that data just falls back
// to the time interval alone - never crashes or blocks on missing KM data.

export type ServiceDueStatus = 'ok' | 'due-soon' | 'overdue';

// How close to the due date/km counts as "due soon" (yellow) rather than
// "ok" (green).
const DUE_SOON_WINDOW_DAYS = 14;
const DUE_SOON_WINDOW_KM = 500;

export function computeServiceDueStatus(
  lastDate: string | undefined,
  intervalDays: number | undefined,
  lastOdometerKm: number | undefined,
  currentOdometerKm: number | undefined,
  intervalKm: number | undefined
): ServiceDueStatus {
  let status: ServiceDueStatus = 'ok';

  // Time-based check
  if (lastDate && intervalDays != null) {
    const [y, m, d] = lastDate.split('-').map(Number);
    if (y && m) {
      const due = new Date(y, m - 1, d || 1);
      due.setDate(due.getDate() + intervalDays);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) status = 'overdue';
      else if (diffDays <= DUE_SOON_WINDOW_DAYS) status = 'due-soon';
    }
  }

  // KM-based check - only runs when both a baseline (last known odometer)
  // and a current odometer reading exist; "whichever comes first" means this
  // can escalate the status the time check already set (ok -> due-soon,
  // either -> overdue) but never downgrade it.
  if (lastOdometerKm != null && currentOdometerKm != null && intervalKm != null) {
    const kmRemaining = (lastOdometerKm + intervalKm) - currentOdometerKm;
    if (kmRemaining < 0) status = 'overdue';
    else if (kmRemaining <= DUE_SOON_WINDOW_KM && status !== 'overdue') status = 'due-soon';
  }

  return status;
}

// Vehicle's latest known odometer reading, read from its most recent Mileage
// Report closing KM (same source FuelManagement.tsx already reads for
// opening-KM autofill) - undefined for a vehicle with no mileage-tracked
// fuel entries.
export function latestOdometerFor(vehicleNo: string, mileageReports: { vehicleNo: string; date: string; closingKm: number }[]): number | undefined {
  const reports = mileageReports
    .filter(r => (r.vehicleNo || '').trim().toUpperCase() === vehicleNo.trim().toUpperCase())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return reports.length > 0 ? reports[reports.length - 1].closingKm : undefined;
}

// --- Fleet Maintenance rebuild: Service Schedule / Tire & Alignment /
// Warranty helpers. Kept separate from computeServiceDueStatus above (which
// still serves whatever hasn't been migrated off the legacy combined Vehicle
// Maintenance Profile) since the rebuilt module uses the spec's own fixed
// thresholds rather than the DUE_SOON_WINDOW_* constants above.

export type KmStatus = 'ok' | 'due-soon' | 'overdue';

// remainingKm > 3000 -> Green (ok); 0-3000 -> Yellow (due-soon); <= 0 -> Red
// (overdue). Used for both Service Status and (with a fixed 10,000 km
// interval) Wheel Alignment Status - same thresholds, per spec.
export function computeKmStatus(remainingKm: number | undefined): KmStatus | null {
  if (remainingKm == null || isNaN(remainingKm)) return null;
  if (remainingKm <= 0) return 'overdue';
  if (remainingKm <= 3000) return 'due-soon';
  return 'ok';
}

// Wheel alignment cycle is a fixed 10,000 km from the last alignment -
// confirmed with the user, not a per-vehicle/per-tire configurable interval.
export const ALIGNMENT_INTERVAL_KM = 10000;

export function nextAlignmentDueKm(lastAlignmentKm: number | undefined): number | undefined {
  return lastAlignmentKm != null ? lastAlignmentKm + ALIGNMENT_INTERVAL_KM : undefined;
}

export function computeAlignmentStatus(lastAlignmentKm: number | undefined, currentOdometerKm: number | undefined): KmStatus | null {
  const dueAt = nextAlignmentDueKm(lastAlignmentKm);
  if (dueAt == null || currentOdometerKm == null) return null;
  return computeKmStatus(dueAt - currentOdometerKm);
}

// Warranty auto-expiry: a vehicle flips to OutOfWarranty the moment EITHER it
// crosses 3,00,000 km OR 3 years have passed since its Fleet & Vehicles
// Registration Date, whichever comes first (confirmed with the user) - this
// only ever pushes InWarranty -> OutOfWarranty (a floor), it never
// auto-reverts a manually-set OutOfWarranty back to InWarranty.
export const WARRANTY_KM_THRESHOLD = 300000;
export const WARRANTY_YEARS_THRESHOLD = 3;

export function computeWarrantyStatus(
  baseStatus: 'InWarranty' | 'OutOfWarranty',
  currentOdometerKm: number | undefined,
  registrationDate: string | undefined
): 'InWarranty' | 'OutOfWarranty' {
  if (baseStatus === 'OutOfWarranty') return 'OutOfWarranty';
  if (currentOdometerKm != null && currentOdometerKm >= WARRANTY_KM_THRESHOLD) return 'OutOfWarranty';
  if (registrationDate) {
    const regDate = parseAnyDate(registrationDate);
    if (regDate) {
      const ageYears = (Date.now() - regDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears >= WARRANTY_YEARS_THRESHOLD) return 'OutOfWarranty';
    }
  }
  return 'InWarranty';
}

// Registration Date on Fleet & Vehicles is entered in a couple of different
// formats depending on when/how the row was created - handle both
// DD.MM.YYYY (or DD-MM-YYYY / DD/MM/YYYY) and YYYY-MM-DD.
function parseAnyDate(raw: string): Date | null {
  const trimmed = raw.trim();
  const dmy = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const ymd = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

// Projects a calendar due date for a remaining-KM figure (Service Due /
// Wheel Alignment Due) from that vehicle's own trailing-30-day average
// km/day, computed off its Fuel Management closing-KM history (confirmed
// with the user, over a flat assumed rate). Returns null when there isn't
// enough mileage history to compute a rate, or the vehicle isn't actually
// covering distance (avg <= 0) - callers should fall back to KM-only status
// in that case rather than showing a bogus date.
export function projectDueDate(
  vehicleNo: string,
  remainingKm: number | undefined,
  mileageReports: { vehicleNo: string; date: string; closingKm: number }[]
): string | null {
  if (remainingKm == null) return null;
  if (remainingKm <= 0) return new Date().toISOString().slice(0, 10); // already due/overdue - "due date" is today

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const reports = mileageReports
    .filter(r => (r.vehicleNo || '').trim().toUpperCase() === vehicleNo.trim().toUpperCase())
    .filter(r => new Date(r.date).getTime() >= cutoff.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (reports.length < 2) return null;
  const first = reports[0];
  const last = reports[reports.length - 1];
  const daySpan = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24);
  if (daySpan <= 0) return null;
  const avgKmPerDay = (last.closingKm - first.closingKm) / daySpan;
  if (avgKmPerDay <= 0) return null;

  const projectedDays = remainingKm / avgKmPerDay;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + Math.round(projectedDays));
  return dueDate.toISOString().slice(0, 10);
}

// Days remaining until a YYYY-MM-DD date (negative once past) - used to check
// a projected due date against the 3/5/7-day email milestones.
export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
