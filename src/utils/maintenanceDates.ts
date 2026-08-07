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
