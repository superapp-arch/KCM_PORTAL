// Shared Excel-style column filter logic (2026-09-08 direct request) - the
// matching/predicate half of the global column-filter feature; the UI half
// is ColumnFilterHeader.tsx (../components/ColumnFilterHeader), which reads
// and writes the ColumnFilterState this file defines. Kept separate from the
// component so a module's own filtering code (the plain .filter(...) calls
// every table here already had before this feature) can import just the
// matching function without pulling in any React/UI code.
//
// Every date comparison here goes through parseFlexibleDate (see
// ../utils/dateFormat) rather than a bare `new Date(str)` - see that file's
// own header comment for why that used to silently misread this app's
// DD-MM-YYYY dates.
import { parseFlexibleDate } from './dateFormat';

export type ColumnFilterType = 'text' | 'number' | 'date' | 'boolean';

export type NumberFilterOp = 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
export type DateFilterOp = 'before' | 'after' | 'between' | 'currentMonth';

// One column's currently-applied filter, however it was built (checkbox
// multi-select for text/category, an operator+value(s) for number/date, a
// tri-state pick for boolean). Every field is optional so a fresh/cleared
// filter is just `{}` - see isColumnFilterActive below for what actually
// counts as "on".
export interface ColumnFilterState {
  // text/category: only rows whose raw value (String(value) exactly) is in
  // this set pass. The sentinel '' (empty string) stands for "blank/empty" -
  // included the same way a real value would be, so a genuinely blank field
  // can be explicitly kept or excluded rather than always showing.
  selectedValues?: string[];
  // number
  numberOp?: NumberFilterOp;
  numberValue?: number;
  numberValue2?: number; // only for 'between'
  // date (values compared as ISO yyyy-mm-dd strings via parseFlexibleDate)
  dateOp?: DateFilterOp;
  dateValue?: string;
  dateValue2?: string; // only for 'between'
  // boolean
  boolValue?: 'yes' | 'no';
}

export type ColumnFiltersMap = Record<string, ColumnFilterState | undefined>;

export function isColumnFilterActive(f?: ColumnFilterState): boolean {
  if (!f) return false;
  if (f.selectedValues && f.selectedValues.length > 0) return true;
  if (f.numberOp && f.numberValue != null) return true;
  if (f.dateOp && (f.dateOp === 'currentMonth' || f.dateValue)) return true;
  if (f.boolValue) return true;
  return false;
}

// Normalizes any raw cell value to the string key used by the text/category
// checkbox list and by selectedValues matching - '' for null/undefined so
// "Blank" is a selectable, matchable value rather than silently dropped.
export const rawValueKey = (value: unknown): string => {
  if (value == null) return '';
  return String(value).trim();
};

function matchesNumber(value: unknown, f: ColumnFilterState): boolean {
  if (!f.numberOp || f.numberValue == null) return true;
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (isNaN(n)) return false;
  switch (f.numberOp) {
    case 'eq': return n === f.numberValue;
    case 'gt': return n > f.numberValue;
    case 'lt': return n < f.numberValue;
    case 'gte': return n >= f.numberValue;
    case 'lte': return n <= f.numberValue;
    case 'between': return f.numberValue2 != null ? n >= f.numberValue && n <= f.numberValue2 : n >= f.numberValue;
    default: return true;
  }
}

function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function matchesDate(value: unknown, f: ColumnFilterState): boolean {
  if (!f.dateOp) return true;
  // A caller may already hold a real Date (e.g. a computed due-date, not a
  // stored string field) - use it directly rather than routing it through
  // parseFlexibleDate, which only recognizes its own string shapes and
  // would otherwise stringify a Date into something unparseable (Date's own
  // default toString, not one of parseFlexibleDate's formats).
  const d = value instanceof Date ? value : parseFlexibleDate(value == null ? undefined : String(value));
  if (!d || isNaN(d.getTime())) return false;
  if (f.dateOp === 'currentMonth') {
    const { start, end } = currentMonthRange();
    return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  }
  const from = f.dateValue ? parseFlexibleDate(f.dateValue) : null;
  if (!from) return true; // operator picked but no date typed yet - don't filter anything out
  if (f.dateOp === 'before') return d.getTime() < from.getTime();
  if (f.dateOp === 'after') return d.getTime() > from.getTime();
  if (f.dateOp === 'between') {
    const to = f.dateValue2 ? parseFlexibleDate(f.dateValue2) : null;
    if (!to) return d.getTime() >= from.getTime();
    return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
  }
  return true;
}

function matchesBoolean(value: unknown, f: ColumnFilterState): boolean {
  if (!f.boolValue) return true;
  const truthy = value === true || value === 'Yes' || value === 'yes' || value === 'true';
  return f.boolValue === 'yes' ? truthy : !truthy;
}

// The single predicate every module's own row-filter calls, one column at a
// time - `value` is that row's raw (unformatted) value for this column.
export function matchesColumnFilter(value: unknown, f: ColumnFilterState | undefined, type: ColumnFilterType): boolean {
  if (!f || !isColumnFilterActive(f)) return true;
  if (type === 'number') return matchesNumber(value, f);
  if (type === 'date') return matchesDate(value, f);
  if (type === 'boolean') return matchesBoolean(value, f);
  // text/category
  if (!f.selectedValues || f.selectedValues.length === 0) return true;
  return f.selectedValues.includes(rawValueKey(value));
}

// Applies every active filter in a ColumnFiltersMap to one row - AND
// semantics across columns, per the "Location = X AND Status = Y" spec.
// `getValue(key, row)` resolves a column's raw value from the row; callers
// pass whatever accessor makes sense for their own row shape.
export function matchesAllColumnFilters<T>(
  row: T,
  filters: ColumnFiltersMap,
  getValue: (key: string, row: T) => unknown,
  types: Record<string, ColumnFilterType>
): boolean {
  for (const key of Object.keys(filters)) {
    const f = filters[key];
    if (!f || !isColumnFilterActive(f)) continue;
    if (!matchesColumnFilter(getValue(key, row), f, types[key] || 'text')) return false;
  }
  return true;
}
