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

export interface CycleDefault {
  alertType: 'Service Due' | 'Washing Due';
  cycleDays: number;
  reminderDays: number[]; // days-before-due countdown, e.g. [15, 7, 3]
  dateField: 'lastServiceDate' | 'lastWashingDate';
}

// Confirmed defaults: Reefer/Hybrid get a 40-day Service Due cycle with a
// 15/7/3-day countdown; Walkes gets a 15-day Washing Due cycle with a
// 7/5/3-day countdown. Dry has no calendar cycle at all - it only ever gets
// the separate km-based Service Status column in Service Schedule. These are
// fixed in code (not an admin-editable settings panel); a vehicle's own
// VehicleServiceSchedule.cycleDays/reminderDays overrides them per-vehicle
// (see ServiceScheduleTab.tsx).
export const VEHICLE_CYCLE_DEFAULTS: Record<string, CycleDefault | null> = {
  dry: null,
  reefer: { alertType: 'Service Due', cycleDays: 40, reminderDays: [15, 7, 3], dateField: 'lastServiceDate' },
  hybrid: { alertType: 'Service Due', cycleDays: 40, reminderDays: [15, 7, 3], dateField: 'lastServiceDate' },
  walkes: { alertType: 'Washing Due', cycleDays: 15, reminderDays: [7, 5, 3], dateField: 'lastWashingDate' },
};

export function cycleDefaultFor(category: string | undefined | null): CycleDefault | null {
  return VEHICLE_CYCLE_DEFAULTS[normalizeVehicleCategory(category)] ?? null;
}
