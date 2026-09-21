// Shared Location canonicalization (2026-09-18 direct request, extended
// 2026-09-21 to Fuel Management) - the same real place kept getting logged
// under several different spellings/casings depending on who typed it
// freehand (e.g. "BANGALURE"/"bangalure"/"Bangalure" all meant to be one
// place, or Fuel Management's own "Vljayawada" typo for "Vijayawada"),
// which fragmented a module's Location column/filter into near-duplicate
// values instead of one clean one - and, for Fuel Management specifically,
// silently split one bunk's entries across two different Location filter
// values, making entries genuinely saved under the typo'd spelling look
// like they'd vanished/never saved when viewed under the correct one.
// Despite the filename (kept for git history/import-path stability), this
// is shared across every module that logs a free-typed Location, not
// Petty-Cash-specific - used by PettyCash.tsx and FuelManagement.tsx
// (autocomplete suggestions + auto-correct on blur, for new entries going
// forward) and src/db/service.ts's normalizePettyCashLocationNames /
// normalizeFuelLocationNames migrations (one-time cleanup of already-saved
// rows) - kept in one place so none of them can ever drift on what counts
// as "the same place."
//
// Intentionally a plain, non-restrictive list: a genuinely new place typed
// in still saves exactly as typed (normalizeLocationName only rewrites a
// value that matches a KNOWN alias or canonical name - it never touches an
// unrecognized one). Add more canonical names/aliases here as new variants
// turn up.
export const PETTY_CASH_CANONICAL_LOCATIONS = [
  "Bengaluru", "Hoskote", "Medahalli", "Vizag", "Vijayawada", "Hyderabad",
  "Chennai", "Nelamangala", "Nidagatta", "DHL Attibele", "Service Station",
  "Goa", "Belgaum",
];

// Known real misspellings/variant spellings (not just casing) -> canonical
// name, keyed lowercase+trimmed. Pure casing variants of an already-listed
// canonical name (e.g. "HOSKOTE") don't need an entry here - see
// normalizeLocationName's own case-insensitive canonical-list match below.
export const LOCATION_NAME_ALIASES: Record<string, string> = {
  "bangalore": "Bengaluru",
  "bangalure": "Bengaluru",
  "bengaluru": "Bengaluru",
  "medahali": "Medahalli",
  "medagalli": "Medahalli",
  "medahalli": "Medahalli",
  // Fuel Management typo (2026-09-21 direct request) - "Vljayawada" (typed
  // via the Location "Other" field) silently split that bunk's entries away
  // from the real "Vijayawada" already in PETTY_CASH_CANONICAL_LOCATIONS.
  "vljayawada": "Vijayawada",
};

// Normalizes a typed/stored Location to its canonical spelling/casing when
// it matches a known alias or an existing canonical name case-insensitively
// - e.g. "BANGALURE"/"bangalure"/"Bangalure" all become "Bengaluru", and
// "HOSKOTE" becomes "Hoskote". Returns the input unchanged (just trimmed)
// for anything not recognized - never invents a canonical name for a
// genuinely new place.
export function normalizeLocationName(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return trimmed;
  const key = trimmed.toLowerCase();
  if (LOCATION_NAME_ALIASES[key]) return LOCATION_NAME_ALIASES[key];
  const canonicalMatch = PETTY_CASH_CANONICAL_LOCATIONS.find(l => l.toLowerCase() === key);
  return canonicalMatch || trimmed;
}
