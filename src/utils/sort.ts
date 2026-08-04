export type SortDirection = 'asc' | 'desc';
export interface SortState { key: string; direction: SortDirection }

export const compareText = (a?: string | null, b?: string | null): number =>
  (a || '').localeCompare(b || '', undefined, { sensitivity: 'base', numeric: true });

export const compareNumber = (a?: number | null, b?: number | null): number => (a ?? 0) - (b ?? 0);

// Clicking a column header: first click sorts ascending, second click flips
// to descending, third click clears back to the table's natural order.
export function nextSortState(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}
