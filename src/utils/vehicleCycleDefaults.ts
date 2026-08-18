// Single source of truth for Fleet & Vehicles' 4 categories, shared by the
// Category dropdown in FleetSheet.tsx and by Fleet Maintenance's Service
// Schedule (Vehicle Type display + per-vehicle Cycle/Reminder-day defaults
// below) - and imported directly (no build step, .ts extension) by
// server.ts's reminder cron, so all three can never drift apart.
export const VEHICLE_CATEGORIES = ['Dry', 'Hybrid', 'Walkes', 'Reefer'] as const;
export type VehicleCategoryOption = typeof VEHICLE_CATEGORIES[number];

// Mirrors FleetSheet.tsx's own normalizeCategory - tolerates the legacy
// 'normal'/'walkee' spellings some older seed rows still use.
export function normalizeVehicleCategory(cat: string | undefined | null): string {
  const c = String(cat || '').toLowerCase().trim();
  if (c === 'normal' || c === 'dry') return 'dry';
  if (c === 'walkee') return 'walkes';
  return c;
}

// Maps a raw (possibly legacy-spelled) category value onto one of the 4
// display-case options above, e.g. for pre-selecting a <select>. Falls back
// to 'Dry' only when the value truly matches nothing - never silently masks
// a real Reefer/Hybrid/Walkes vehicle as Dry.
export function matchVehicleCategoryOption(cat: string | undefined | null): VehicleCategoryOption {
  const norm = normalizeVehicleCategory(cat);
  return VEHICLE_CATEGORIES.find(c => normalizeVehicleCategory(c) === norm) || VEHICLE_CATEGORIES[0];
}

// Fleet Maintenance -> Service Schedule's two dedicated cycle tabs (Washing,
// AC Service) - fixed, non-configurable cycle lengths and a fixed 2-day-
// before reminder for both (no per-vehicle override, unlike the retired
// cycleDefaultFor system this replaced). Category scope differs per tab:
// Washing covers Walkes/Reefer/Hybrid; AC Service covers Hybrid/Reefer only
// - Dry never appears in either. Shared here (rather than duplicated in
// ServiceScheduleTab.tsx and server.ts) so the UI's Next Due/Remaining Days
// Left preview and the server's actual reminder-email cron can never
// disagree.
export const REMINDER_DAYS_BEFORE_DUE = 2;

export const WASHING_CYCLE_DAYS = 10;
export const WASHING_CATEGORIES: readonly string[] = ['walkes', 'reefer', 'hybrid'];
export const isWashingEligible = (category: string | undefined | null): boolean =>
  WASHING_CATEGORIES.includes(normalizeVehicleCategory(category));

export const AC_SERVICE_CYCLE_DAYS = 40;
export const AC_SERVICE_CATEGORIES: readonly string[] = ['hybrid', 'reefer'];
export const isAcServiceEligible = (category: string | undefined | null): boolean =>
  AC_SERVICE_CATEGORIES.includes(normalizeVehicleCategory(category));
