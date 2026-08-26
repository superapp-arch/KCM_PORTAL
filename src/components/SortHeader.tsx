import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Check } from 'lucide-react';
import { SortState, SortDirection } from '../utils/sort';

interface SortHeaderProps {
  label: string;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string, direction: SortDirection) => void;
  // 'text' -> "Sort A to Z / Sort Z to A", 'numeric' -> "Sort Ascending / Sort
  // Descending" (used for true numbers and for alphanumeric reg/vehicle
  // numbers sorted by their leading digit run). Ignored when `labels` is
  // given.
  type?: 'text' | 'numeric';
  align?: 'left' | 'right';
  // Overrides the two dropdown option labels entirely - for a categorical
  // column where "Ascending/Descending" or "A to Z/Z to A" wouldn't make
  // sense (e.g. Type: Credit/Debit isn't an alphabetic or numeric order, so
  // the two choices are named after the actual values instead).
  // labels.asc names the 'asc' direction's option, labels.desc the 'desc'
  // direction's - onSort still only ever receives 'asc' | 'desc'.
  labels?: { asc: string; desc: string };
}

// Click-to-open sort dropdown placed beside a column header. Never sorts on
// the icon click itself - only picking an option in the dropdown applies a
// sort, and clicking anywhere outside closes it without changing anything.
export default function SortHeader({ label, sortKey, sort, onSort, type = 'text', align = 'left', labels }: SortHeaderProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const isActive = sort?.key === sortKey;
  const direction = isActive ? sort!.direction : null;

  const options: { direction: SortDirection; label: string }[] = labels
    ? [{ direction: 'asc', label: labels.asc }, { direction: 'desc', label: labels.desc }]
    : type === 'numeric'
    ? [{ direction: 'asc', label: 'Sort Ascending' }, { direction: 'desc', label: 'Sort Descending' }]
    : [{ direction: 'asc', label: 'Sort A to Z' }, { direction: 'desc', label: 'Sort Z to A' }];

  const choose = (dir: SortDirection) => {
    onSort(sortKey, dir);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={`relative inline-flex items-center gap-1 normal-case tracking-normal font-bold ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Sort options"
        className={`inline-flex items-center cursor-pointer hover:text-white transition-colors ${isActive ? 'text-white' : ''}`}
      >
        <span className="flex flex-col -space-y-1 shrink-0">
          <ChevronUp className={`w-2.5 h-2.5 ${direction === 'asc' ? 'opacity-100' : 'opacity-30'}`} />
          <ChevronDown className={`w-2.5 h-2.5 ${direction === 'desc' ? 'opacity-100' : 'opacity-30'}`} />
        </span>
      </button>
      {open && (
        <div className={`absolute top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-xl py-1 w-40 text-[11px] font-semibold text-slate-700 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {options.map(opt => (
            <button
              key={opt.direction}
              type="button"
              onClick={() => choose(opt.direction)}
              className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 cursor-pointer flex items-center justify-between ${isActive && direction === opt.direction ? 'text-pink-600 font-black' : ''}`}
            >
              {opt.label}
              {isActive && direction === opt.direction && <Check className="w-3 h-3 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
