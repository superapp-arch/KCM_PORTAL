import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';

// Searchable bunk picker (2026-09-25, Mileage tab "Fuel by bunk"). The list
// is always the caller's live bunk master (FuelManagement.tsx's
// bunkOptions: the known location->bunk map plus every bunk actually used),
// never a list of its own. Typing a name that isn't in it offers
// 'Add "<name>" as new bunk (<location>)' instead of silently accepting it.
// Keyboard: type to search, Up/Down to move, Enter to pick, Esc to close.

export interface BunkChoice {
  bunkName: string;
  location: string;
}

interface BunkComboboxProps {
  options: BunkChoice[];
  value: BunkChoice | null;
  isNew: boolean;
  // Location a newly typed bunk is added under - the entry's own location.
  defaultLocation: string;
  locations: string[];
  onChange: (value: BunkChoice | null, isNew: boolean) => void;
  id?: string;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
export const bunkChoiceLabel = (b: BunkChoice) => `${b.bunkName}${b.location ? ` (${b.location})` : ''}`;

type Row = { kind: 'existing'; choice: BunkChoice } | { kind: 'new'; name: string };

export default function BunkCombobox({ options, value, isNew, defaultLocation, locations, onChange, id }: BunkComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const rows: Row[] = useMemo(() => {
    const q = norm(query);
    const words = q.split(' ').filter(Boolean);
    const matches = options.filter(o => {
      const hay = norm(bunkChoiceLabel(o));
      return words.every(w => hay.includes(w));
    });
    const out: Row[] = matches.map(choice => ({ kind: 'existing', choice }));
    const exact = options.some(o => norm(o.bunkName) === q || norm(bunkChoiceLabel(o)) === q);
    if (q && !exact) out.push({ kind: 'new', name: query.trim().replace(/\s+/g, ' ') });
    return out;
  }, [options, query]);

  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (row: Row) => {
    if (row.kind === 'existing') onChange(row.choice, false);
    else onChange({ bunkName: row.name, location: defaultLocation }, true);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, Math.max(0, rows.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      // Never submit the whole fuel entry from inside the picker.
      e.preventDefault();
      if (open && rows[active]) pick(rows[active]);
      else setOpen(true);
    } else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative">
      {value && !open ? (
        <div className="w-full bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-2">
          <button
            type="button"
            id={id}
            onClick={() => setOpen(true)}
            className="flex-1 text-left font-mono font-bold text-slate-800 truncate cursor-pointer"
            title="Change bunk"
          >
            {bunkChoiceLabel(value)}
            {isNew && <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 align-middle">New bunk</span>}
          </button>
          <button type="button" onClick={() => onChange(null, false)} className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer" title="Clear bunk" aria-label="Clear bunk">
            <X className="w-3.5 h-3.5" />
          </button>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </div>
      ) : (
        <div className="w-full bg-white border border-indigo-300 rounded-lg px-2 flex items-center gap-1.5 focus-within:ring-2 focus-within:ring-indigo-100">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            autoComplete="off"
            autoFocus={!!value}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search bunk or location..."
            className="flex-1 py-2 bg-transparent outline-none font-mono font-bold text-slate-800 text-xs"
          />
        </div>
      )}

      {open && (
        <ul ref={listRef} role="listbox" className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl py-1 text-xs">
          {rows.length === 0 && <li className="px-3 py-2 text-slate-400">Type a bunk name to search or add one.</li>}
          {rows.map((row, i) => (
            <li
              key={row.kind === 'existing' ? `${row.choice.location}|||${row.choice.bunkName}` : `new:${row.name}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(row); }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-1.5 cursor-pointer flex items-center gap-1.5 ${i === active ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700'} ${row.kind === 'new' ? 'border-t border-slate-100 font-bold text-amber-700' : ''}`}
            >
              {row.kind === 'existing' ? (
                <><span className="font-semibold">{row.choice.bunkName}</span><span className="text-slate-400">({row.choice.location})</span></>
              ) : (
                <><Plus className="w-3 h-3" /> Add "{row.name}" as new bunk ({defaultLocation || 'choose location'})</>
              )}
            </li>
          ))}
        </ul>
      )}

      {value && isNew && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px]">
          <label className="font-semibold text-slate-600">New bunk location</label>
          <select
            value={value.location}
            onChange={e => onChange({ ...value, location: e.target.value }, true)}
            className="bg-white border border-slate-200 rounded-md px-1.5 py-1 font-mono font-bold text-slate-700"
          >
            <option value="">Select...</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
