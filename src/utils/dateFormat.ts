// Shared, unambiguous date parsing/formatting for every expiry/registration
// date in the app (Fleet & Vehicles' Insurance/FC/NP/SP/Reg Date, Compliance
// Alerts, etc). Used by server.ts, Administration.tsx and FleetSheet.tsx -
// previously each had its own near-identical (and buggy) copy of this logic.
//
// The bug this replaces: falling back to the bare `new Date(str)`
// constructor for a non-ISO, dash-separated string. Node/V8 parses that
// ambiguously as US-style MM-DD-YYYY, e.g. `new Date('10-09-2026')` ->
// Oct 9 2026 (silently WRONG whenever day <= 12, since this app's own
// convention is DD-MM-YYYY) or Invalid Date entirely whenever day > 12
// (e.g. `new Date('22-09-2026')`) - which silently dropped that vehicle's
// alert from the compliance digest instead of just mis-parsing it. Confirmed
// via `node -e "console.log(new Date('10-09-2026'))"` while investigating
// the 2026-09-07 "wrong days left" report.
//
// Fixed by detecting the shape via regex - which segment is the 4-digit
// year - instead of ever trusting the Date constructor with a non-ISO string.

// Parses "YYYY-MM-DD" (native <input type="date">/ISO, always unambiguous)
// or "DD-MM-YYYY" / "DD.MM.YYYY" / "DD/MM/YYYY" (this app's other canonical
// order - see DateInput.tsx's own dd/mm/yyyy display convention) into a
// local Date at midnight. Returns null for anything else, same fail-open
// behavior as before (just no longer silently wrong).
export function parseFlexibleDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  const dmy = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(trimmed);
  if (dmy) {
    const [, d, m, y] = dmy;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

// Formats any parseable date string (or a Date already in hand) as
// DD-MM-YYYY - the fixed display convention for every expiry/registration
// date shown in the app, regardless of which of the above shapes it was
// stored in. Returns '' when unparseable so callers can `|| '-'` it same as
// they already do for the raw string.
export function formatDateDDMMYYYY(value?: string | Date | null): string {
  const date = value instanceof Date ? value : parseFlexibleDate(value);
  if (!date || isNaN(date.getTime())) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}
