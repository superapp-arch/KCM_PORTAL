// Driver Salary export's "Actual Mileage" column - per driver, per vehicle,
// per salary month. Shared by server.ts (which resolves each Trip Details
// entry to the registered driver(s) it belongs to - see
// resolveTripDriverIds) and the Driver Salary export (which aggregates the
// resolved trips - see driverVehicleMileage). No new mileage formula: every
// figure comes from what Trip Details (MileageReport) already stores per trip:
//   mileage       = totalKm / totalLitres, the trip's achieved KM/L
//   actualMileage = the vehicle's FIXED KM/L from the Vehicle Mileage Master,
//                   snapshotted onto the trip when it was saved
// and aggregates them the same way Trip Details' own "Avg Segmented
// Mileage" summary does (a plain average of per-trip mileage).
import { MileageReport } from '../types';

// Slim, payroll-safe slice of a Trip Details entry - everything the column
// needs, nothing else (no amounts, remarks, documents or enteredBy).
export interface DriverTripMileage {
  date: string; // YYYY-MM-DD
  vehicleNo: string;
  driverIds: string[]; // registered Driver IDs this trip is credited to
  mileage: number;
  actualMileage: number;
}

const normalizeName = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

// Which registered driver(s) a trip belongs to. A trip's own driverId (set
// when Authorized Driver matched exactly one registered driver at entry
// time) always wins. An older/manual entry without one falls back to its
// Authorized Driver name(s) - "Suresh / Adhithya" credits both - but only a
// name that matches exactly ONE registered driver counts, the same
// exactly-one rule Trip Details itself uses to fill driverId. Anything
// ambiguous or unregistered is left unattributed rather than guessed.
export function resolveTripDriverIds(
  trip: Pick<MileageReport, 'driverId' | 'driverName'>,
  drivers: { id: string; name: string }[]
): string[] {
  if (trip.driverId && drivers.some(d => d.id === trip.driverId)) return [trip.driverId];
  const byName = new Map<string, string[]>();
  drivers.forEach(d => {
    const key = normalizeName(d.name || '');
    if (!key) return;
    byName.set(key, [...(byName.get(key) || []), d.id]);
  });
  const ids = (trip.driverName || '')
    .split(/[\/,&]+/)
    .map(normalizeName)
    .filter(Boolean)
    .map(n => byName.get(n))
    .filter((m): m is string[] => !!m && m.length === 1)
    .map(m => m[0]);
  return Array.from(new Set(ids));
}

export interface DriverVehicleMileage {
  vehicleNo: string;
  trips: number; // valid trips counted
  avgMileage: number; // driver's achieved KM/L on this vehicle this month
  fixedMileage: number | null; // vehicle's fixed KM/L; null when no trip had one
  difference: number | null; // avgMileage - fixedMileage (KM/L); null when not computable
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// One entry per vehicle this driver drove in `month` (YYYY-MM), sorted by
// vehicle number. A trip counts only with a real achieved mileage (> 0).
// Difference = average achieved mileage - average fixed mileage, over the
// trips that carry a fixed mileage; a trip saved without one (vehicle not
// in the Vehicle Mileage Master at the time) still counts toward
// avgMileage but never toward the difference - it's never treated as 0.
export function driverVehicleMileage(driverId: string, month: string, trips: DriverTripMileage[]): DriverVehicleMileage[] {
  const byVehicle = new Map<string, DriverTripMileage[]>();
  trips.forEach(t => {
    if (!t.date.startsWith(month) || !t.driverIds.includes(driverId)) return;
    if (!(t.mileage > 0) || !Number.isFinite(t.mileage)) return;
    const vehicleNo = (t.vehicleNo || '').trim().toUpperCase();
    if (!vehicleNo) return;
    byVehicle.set(vehicleNo, [...(byVehicle.get(vehicleNo) || []), t]);
  });
  return Array.from(byVehicle.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vehicleNo, list]) => {
      const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
      const avgMileage = round2(avg(list.map(t => t.mileage)));
      const withFixed = list.filter(t => t.actualMileage > 0 && Number.isFinite(t.actualMileage));
      if (withFixed.length === 0) return { vehicleNo, trips: list.length, avgMileage, fixedMileage: null, difference: null };
      const fixedMileage = round2(avg(withFixed.map(t => t.actualMileage)));
      const difference = round2(avg(withFixed.map(t => t.mileage)) - fixedMileage);
      return { vehicleNo, trips: list.length, avgMileage, fixedMileage, difference };
    });
}

// "AP39VE1234: +0.30" per vehicle, one per line - readable in a single
// Excel/PDF cell. '-' when the driver has no valid trip that month.
export function formatDriverVehicleMileage(entries: DriverVehicleMileage[]): string {
  if (entries.length === 0) return '-';
  return entries
    .map(e => e.difference === null
      ? `${e.vehicleNo}: N/A (no fixed mileage)`
      : `${e.vehicleNo}: ${e.difference > 0 ? '+' : e.difference < 0 ? '-' : ''}${Math.abs(e.difference).toFixed(2)}`)
    .join('\n');
}
