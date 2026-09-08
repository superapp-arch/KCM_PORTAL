import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Check, Filter as FilterIcon, X } from 'lucide-react';
import { SortState, SortDirection } from '../utils/sort';
import { ColumnFilterState, ColumnFilterType, NumberFilterOp, DateFilterOp, IncidentFilterValue, isColumnFilterActive, rawValueKey } from '../utils/columnFilter';

// Reusable Excel-style column-header filter (2026-09-08 direct request,
// GLOBAL UI REQUIREMENT) - a superset of SortHeader.tsx (same shell:
// label + click-to-open dropdown, outside-click-to-close, same visual
// language), extended with a filter funnel icon and a type-appropriate
// filter panel (text/category checkbox list, number operator+value, date
// operator+value, boolean All/Yes/No). SortHeader itself is left untouched -
// a column that only needs sorting (or no filter makes practical sense for
// it - a computed/derived column, an Actions column, ...) keeps using plain
// SortHeader; this component only replaces it on columns that should also
// get Excel-style filtering.
//
// Purely a display component - it owns its own open/closed + in-progress
// "draft" selection state, and only ever calls onChange with a finished
// ColumnFilterState (or undefined to clear) once Apply/Clear is pressed, so
// a caller's row-filtering logic (via ../utils/columnFilter's
// matchesColumnFilter) never re-runs mid-selection.
interface ColumnFilterHeaderProps {
  label: string;
  type: ColumnFilterType;
  // Every row's raw value for this column, straight from the full unfiltered
  // dataset (callers pass e.g. `allRows.map(r => r.field)`, not the
  // currently-filtered list) - so the checkbox list always offers every
  // value that exists, not just what's visible under other active filters.
  // Ignored for 'number'/'date'/'boolean' types.
  values?: unknown[];
  value?: ColumnFilterState;
  onChange: (next: ColumnFilterState | undefined) => void;
  // Optional sort integration - identical contract to SortHeader, shown at
  // the top of the same dropdown when provided.
  sortKey?: string;
  sort?: SortState | null;
  onSort?: (key: string, direction: SortDirection) => void;
  sortType?: 'text' | 'numeric';
  sortLabels?: { asc: string; desc: string };
  align?: 'left' | 'right';
}

const NUMBER_OPS: { value: NumberFilterOp; label: string }[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'gt', label: 'Greater Than' },
  { value: 'lt', label: 'Less Than' },
  { value: 'gte', label: 'Greater Than or Equal' },
  { value: 'lte', label: 'Less Than or Equal' },
  { value: 'between', label: 'Between' },
];

const DATE_OPS: { value: DateFilterOp; label: string }[] = [
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'between', label: 'Between' },
  { value: 'currentMonth', label: 'Current Month' },
];

export default function ColumnFilterHeader({
  label, type, values, value, onChange,
  sortKey, sort, onSort, sortType = 'text', sortLabels, align = 'left'
}: ColumnFilterHeaderProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Draft state - seeded from `value` whenever the panel opens, discarded on
  // close-without-Apply.
  const [draftSelected, setDraftSelected] = useState<Set<string>>(new Set());
  const [draftSearch, setDraftSearch] = useState('');
  const [draftNumberOp, setDraftNumberOp] = useState<NumberFilterOp>('eq');
  const [draftNumberValue, setDraftNumberValue] = useState('');
  const [draftNumberValue2, setDraftNumberValue2] = useState('');
  const [draftDateOp, setDraftDateOp] = useState<DateFilterOp>('after');
  const [draftDateValue, setDraftDateValue] = useState('');
  const [draftDateValue2, setDraftDateValue2] = useState('');
  const [draftBool, setDraftBool] = useState<'yes' | 'no' | undefined>(undefined);
  const [draftIncident, setDraftIncident] = useState<IncidentFilterValue | undefined>(undefined);

  const openPanel = () => {
    setDraftSelected(new Set(value?.selectedValues || []));
    setDraftSearch('');
    setDraftNumberOp(value?.numberOp || 'eq');
    setDraftNumberValue(value?.numberValue != null ? String(value.numberValue) : '');
    setDraftNumberValue2(value?.numberValue2 != null ? String(value.numberValue2) : '');
    setDraftDateOp(value?.dateOp || 'after');
    setDraftDateValue(value?.dateValue || '');
    setDraftDateValue2(value?.dateValue2 || '');
    setDraftBool(value?.boolValue);
    setDraftIncident(value?.incidentValue);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const isSortActive = !!sortKey && sort?.key === sortKey;
  const sortDirection = isSortActive ? sort!.direction : null;
  const sortOptions: { direction: SortDirection; label: string }[] = sortLabels
    ? [{ direction: 'asc', label: sortLabels.asc }, { direction: 'desc', label: sortLabels.desc }]
    : sortType === 'numeric'
    ? [{ direction: 'asc', label: 'Sort Ascending' }, { direction: 'desc', label: 'Sort Descending' }]
    : [{ direction: 'asc', label: 'Sort A to Z' }, { direction: 'desc', label: 'Sort Z to A' }];

  const chooseSort = (dir: SortDirection) => {
    if (sortKey && onSort) onSort(sortKey, dir);
  };

  // Unique values for text/category, sorted with "Blank" (the '' sentinel)
  // always last so it doesn't scatter alphabetically among real values.
  const uniqueValues = useMemo(() => {
    if (type === 'number' || type === 'date' || type === 'boolean' || type === 'incidentStatus') return [];
    const set = new Set<string>();
    (values || []).forEach(v => set.add(rawValueKey(v)));
    const arr = Array.from(set);
    arr.sort((a, b) => {
      if (a === '' && b === '') return 0;
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    return arr;
  }, [values, type]);

  const searchedValues = draftSearch.trim()
    ? uniqueValues.filter(v => (v || '(Blank)').toLowerCase().includes(draftSearch.trim().toLowerCase()))
    : uniqueValues;

  const active = isColumnFilterActive(value);

  const toggleValue = (v: string) => {
    setDraftSelected(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };
  const selectAll = () => setDraftSelected(new Set(uniqueValues));
  const clearAll = () => setDraftSelected(new Set());

  const applyText = () => {
    onChange(draftSelected.size > 0 ? { selectedValues: Array.from(draftSelected) } : undefined);
    setOpen(false);
  };
  const applyNumber = () => {
    const n = parseFloat(draftNumberValue);
    if (isNaN(n)) { onChange(undefined); setOpen(false); return; }
    const n2 = draftNumberOp === 'between' ? parseFloat(draftNumberValue2) : undefined;
    onChange({ numberOp: draftNumberOp, numberValue: n, numberValue2: isNaN(n2 as number) ? undefined : n2 });
    setOpen(false);
  };
  const applyDate = () => {
    if (draftDateOp === 'currentMonth') { onChange({ dateOp: 'currentMonth' }); setOpen(false); return; }
    if (!draftDateValue) { onChange(undefined); setOpen(false); return; }
    onChange({ dateOp: draftDateOp, dateValue: draftDateValue, dateValue2: draftDateOp === 'between' ? draftDateValue2 : undefined });
    setOpen(false);
  };
  const applyBool = (v: 'yes' | 'no' | undefined) => {
    setDraftBool(v);
    onChange(v ? { boolValue: v } : undefined);
    setOpen(false);
  };
  const applyIncident = (v: IncidentFilterValue | undefined) => {
    setDraftIncident(v);
    onChange(v ? { incidentValue: v } : undefined);
    setOpen(false);
  };
  const clearFilter = () => {
    onChange(undefined);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={`relative inline-flex items-center gap-1 normal-case tracking-normal font-bold ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span>{label}</span>
      {sortKey && (
        <button
          type="button"
          onClick={() => { const next: SortDirection = isSortActive && sortDirection === 'asc' ? 'desc' : 'asc'; chooseSort(next); }}
          title="Sort"
          className={`inline-flex items-center cursor-pointer hover:text-white transition-colors ${isSortActive ? 'text-white' : ''}`}
        >
          <span className="flex flex-col -space-y-1 shrink-0">
            <ChevronUp className={`w-2.5 h-2.5 ${sortDirection === 'asc' ? 'opacity-100' : 'opacity-30'}`} />
            <ChevronDown className={`w-2.5 h-2.5 ${sortDirection === 'desc' ? 'opacity-100' : 'opacity-30'}`} />
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        title="Filter"
        className={`inline-flex items-center cursor-pointer transition-colors ${active ? 'text-amber-400' : 'hover:text-white opacity-60 hover:opacity-100'}`}
      >
        <FilterIcon className="w-2.5 h-2.5" fill={active ? 'currentColor' : 'none'} />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-xl py-2 w-64 text-[11px] font-semibold text-slate-700 normal-case ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {sortKey && onSort && (
            <>
              <div className="px-3 pb-1.5 space-y-0.5">
                {sortOptions.map(opt => (
                  <button
                    key={opt.direction}
                    type="button"
                    onClick={() => { chooseSort(opt.direction); setOpen(false); }}
                    className={`w-full text-left px-2 py-1 rounded hover:bg-slate-100 cursor-pointer flex items-center justify-between ${isSortActive && sortDirection === opt.direction ? 'text-pink-600 font-black' : ''}`}
                  >
                    {opt.label}
                    {isSortActive && sortDirection === opt.direction && <Check className="w-3 h-3 shrink-0" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-slate-100 my-1" />
            </>
          )}

          {type === 'text' && (
            <div className="px-3 space-y-2">
              <input
                type="text"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                placeholder="Search..."
                autoComplete="off"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
              <div className="flex items-center justify-between text-[10px] text-blue-600 font-bold">
                <button type="button" onClick={selectAll} className="hover:underline cursor-pointer">Select All</button>
                <button type="button" onClick={clearAll} className="hover:underline cursor-pointer">Clear All</button>
              </div>
              <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                {searchedValues.length === 0 ? (
                  <p className="text-center text-slate-400 py-3">No values</p>
                ) : searchedValues.map(v => (
                  <label key={v || '__blank__'} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={draftSelected.has(v)} onChange={() => toggleValue(v)} />
                    <span className="truncate">{v === '' ? <span className="text-slate-400 italic">(Blank)</span> : v}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={clearFilter} className="flex-1 bg-white border border-slate-200 rounded-lg py-1 hover:bg-slate-50 cursor-pointer">Clear Filter</button>
                <button type="button" onClick={applyText} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-1 cursor-pointer">Apply</button>
              </div>
            </div>
          )}

          {type === 'number' && (
            <div className="px-3 space-y-2">
              <select
                value={draftNumberOp}
                onChange={(e) => setDraftNumberOp(e.target.value as NumberFilterOp)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px]"
              >
                {NUMBER_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                type="number"
                value={draftNumberValue}
                onChange={(e) => setDraftNumberValue(e.target.value)}
                placeholder="Value"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono"
              />
              {draftNumberOp === 'between' && (
                <input
                  type="number"
                  value={draftNumberValue2}
                  onChange={(e) => setDraftNumberValue2(e.target.value)}
                  placeholder="and..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono"
                />
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={clearFilter} className="flex-1 bg-white border border-slate-200 rounded-lg py-1 hover:bg-slate-50 cursor-pointer">Clear Filter</button>
                <button type="button" onClick={applyNumber} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-1 cursor-pointer">Apply</button>
              </div>
            </div>
          )}

          {type === 'date' && (
            <div className="px-3 space-y-2">
              <div className="grid grid-cols-2 gap-1">
                {DATE_OPS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setDraftDateOp(o.value)}
                    className={`px-2 py-1 rounded-lg border text-[10px] cursor-pointer ${draftDateOp === o.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {draftDateOp !== 'currentMonth' && (
                <input
                  type="date"
                  value={draftDateValue}
                  onChange={(e) => setDraftDateValue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono"
                />
              )}
              {draftDateOp === 'between' && (
                <input
                  type="date"
                  value={draftDateValue2}
                  onChange={(e) => setDraftDateValue2(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono"
                />
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={clearFilter} className="flex-1 bg-white border border-slate-200 rounded-lg py-1 hover:bg-slate-50 cursor-pointer">Clear Filter</button>
                <button type="button" onClick={applyDate} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-1 cursor-pointer">Apply</button>
              </div>
            </div>
          )}

          {type === 'boolean' && (
            <div className="px-3 space-y-1">
              {([[undefined, 'All'], ['yes', 'Yes'], ['no', 'No']] as const).map(([v, l]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => applyBool(v)}
                  className={`w-full text-left px-2 py-1 rounded hover:bg-slate-100 cursor-pointer flex items-center justify-between ${draftBool === v ? 'text-pink-600 font-black' : ''}`}
                >
                  {l}
                  {draftBool === v && <Check className="w-3 h-3 shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {type === 'incidentStatus' && (
            <div className="px-3 space-y-1">
              {([
                [undefined, 'All'],
                ['with', 'With Incidents'],
                ['without', 'Without Incidents'],
                ['claimed', 'Claimed'],
                ['notClaimed', 'Not Claimed'],
                ['hasNotClaimed', 'Has Not Claimed Incident'],
              ] as const).map(([v, l]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => applyIncident(v)}
                  className={`w-full text-left px-2 py-1 rounded hover:bg-slate-100 cursor-pointer flex items-center justify-between ${draftIncident === v ? 'text-pink-600 font-black' : ''}`}
                >
                  {l}
                  {draftIncident === v && <Check className="w-3 h-3 shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {active && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                onClick={clearFilter}
                className="w-full text-left px-3 py-1 text-rose-600 hover:bg-rose-50 cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Remove this filter
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
