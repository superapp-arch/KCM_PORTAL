export type SortDirection = 'asc' | 'desc';
export interface SortState { key: string; direction: SortDirection }

export const compareText = (a?: string | null, b?: string | null): number =>
  (a || '').localeCompare(b || '', undefined, { sensitivity: 'base', numeric: true });

export const compareNumber = (a?: number | null, b?: number | null): number => (a ?? 0) - (b ?? 0);

// Reg./Vehicle numbers mix letters and digits (e.g. "KA05AB1234"). "Numeric
// sort" on these means sort by the first digit run in the string (05), not
// plain alphabetical order and not every digit run concatenated together.
export const extractLeadingNumber = (value?: string | null): number => {
  const match = (value || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

export const compareLeadingNumber = (a?: string | null, b?: string | null): number =>
  extractLeadingNumber(a) - extractLeadingNumber(b);

// Entry-number-style codes (e.g. "ENT-2026-2525", "TRIP-000001") should sort
// by their trailing/sequential digit run (2525), not their first one (2026,
// which is just the year and is shared by every entry that year) - this is
// the opposite end from extractLeadingNumber above.
export const extractTrailingNumber = (value?: string | null): number => {
  const match = (value || '').match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
};

export const compareTrailingNumber = (a?: string | null, b?: string | null): number =>
  extractTrailingNumber(a) - extractTrailingNumber(b);
