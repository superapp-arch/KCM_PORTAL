// Multi-location driver assignment helpers (2026-09-03) - shared by
// server.ts and every Driver Details/Driver Attendance component so "which
// locations is this driver assigned to" and "is this driver active at this
// specific location" are each computed exactly one way, everywhere. See the
// comments on DriverEmployee.additionalLocations/inactiveLocations and
// DriverAttendance.location in types.ts for the full design rationale.
import { DriverEmployee, DriverAttendance, DriverLocationCategory } from '../types';

// Every location this driver is assigned to - their primary `location` plus
// any `additionalLocations` - deduped, primary first. Never reads either
// field directly elsewhere; a driver saved before additionalLocations
// existed still just returns their one location, unchanged.
export function driverAllLocations(driver: Pick<DriverEmployee, 'location' | 'additionalLocations'>): DriverLocationCategory[] {
  const seen = new Set<DriverLocationCategory>();
  const out: DriverLocationCategory[] = [];
  for (const loc of [driver.location, ...(driver.additionalLocations || [])]) {
    if (loc && !seen.has(loc)) { seen.add(loc); out.push(loc); }
  }
  return out;
}

// Active at ONE specific location - false if the driver is deactivated
// everywhere (status: 'inactive') OR that particular location is in their
// inactiveLocations list. A location the driver isn't even assigned to is
// never "active" here either, though callers normally only check locations
// already known to be assigned (see driverAllLocations).
export function isDriverActiveAtLocation(
  driver: Pick<DriverEmployee, 'status' | 'inactiveLocations' | 'location' | 'additionalLocations'>,
  location: DriverLocationCategory
): boolean {
  if (driver.status === 'inactive') return false;
  if (!driverAllLocations(driver).includes(location)) return false;
  return !(driver.inactiveLocations || []).includes(location);
}

// True if the driver is active at ANY of their assigned locations - used
// for "is this driver active at all" checks that aren't location-specific
// (e.g. deciding whether the whole-driver Deactivate/Reactivate action
// should be offered instead of a per-location one for a single-location
// driver).
export function isDriverActiveAnywhere(driver: Pick<DriverEmployee, 'status' | 'inactiveLocations' | 'location' | 'additionalLocations'>): boolean {
  if (driver.status === 'inactive') return false;
  return driverAllLocations(driver).some(loc => !(driver.inactiveLocations || []).includes(loc));
}

// Does this attendance record belong to `location`? A record stamped with
// its own `location` (every record marked after 2026-09-03) matches
// exactly; a legacy record with no `location` at all is treated as
// belonging to the driver's PRIMARY location only, exactly matching where
// it already displayed before multi-location support existed - so past
// history never silently moves or duplicates across locations.
export function attendanceBelongsToLocation(
  record: Pick<DriverAttendance, 'location'>,
  driver: Pick<DriverEmployee, 'location'>,
  location: DriverLocationCategory
): boolean {
  return record.location ? record.location === location : driver.location === location;
}
