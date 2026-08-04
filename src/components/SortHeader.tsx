import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { SortState } from '../utils/sort';

interface SortHeaderProps {
  label: string;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
}

// A-Z/Z-A (or ascending/descending for numbers) toggle placed beside a
// column header - click cycles asc -> desc -> unsorted. Reused across every
// sortable table in the app so the interaction is consistent everywhere.
export default function SortHeader({ label, sortKey, sort, onSort, align = 'left' }: SortHeaderProps) {
  const isActive = sort?.key === sortKey;
  const direction = isActive ? sort!.direction : null;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title="Click to sort"
      className={`inline-flex items-center gap-1 cursor-pointer hover:text-white transition-colors ${align === 'right' ? 'flex-row-reverse' : ''} ${isActive ? 'text-white' : ''}`}
    >
      <span>{label}</span>
      <span className="flex flex-col -space-y-1 shrink-0">
        <ChevronUp className={`w-2.5 h-2.5 ${direction === 'asc' ? 'opacity-100' : 'opacity-30'}`} />
        <ChevronDown className={`w-2.5 h-2.5 ${direction === 'desc' ? 'opacity-100' : 'opacity-30'}`} />
      </span>
    </button>
  );
}
