// Fuel entry Type <- Fleet & Vehicles Ownership (2026-09-23/24 direct
// requests). One rule shared by Fuel Management's Add Entry form, the fuel
// Excel importer, and the server's one-time backfill of older "KCM" entries,
// so all three always agree. Diesel Payments' KCM Supply / KCM Insta tabs
// split purchases by this Type.
import type { Vehicle } from '../types';

export type KcmOwnershipType = 'KCM Supply' | 'KCM Insta';

export function fleetVehicleByNumber(vehicles: Vehicle[], vehicleNumber: string): Vehicle | undefined {
  const wanted = (vehicleNumber || '').trim().toUpperCase();
  if (!wanted) return undefined;
  return vehicles.find(v => String(v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === wanted);
}

// Blank/unrecognised ownership reads as KCM SUPPLY - the same default Fleet &
// Vehicles itself shows for a vehicle with no Ownership set.
export function kcmTypeFromOwnership(vehicle: Vehicle): KcmOwnershipType {
  const ownership = String(vehicle['Ownership'] || vehicle.ownership || '').toUpperCase();
  return ownership.includes('INSTA') ? 'KCM Insta' : 'KCM Supply';
}
