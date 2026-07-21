import React from 'react';
import { Calendar } from 'lucide-react';

interface DateInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
}

// Native <input type="date"> only accepts an exact yyyy-mm-dd value - anything
// else (e.g. legacy records stored as dd.mm.yyyy, dd-mm-yyyy, dd/mm/yyyy) is
// silently treated as empty by the browser, which made every existing
// vehicle's date fields look blank/broken when editing. This normalizes any
// of those formats to yyyy-mm-dd so the picker opens pre-filled with the
// vehicle's actual stored date.
const normalizeToISO = (raw: string): string => {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw.trim());
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
};

// Native <input type="date"> displays in the browser/OS locale format, which
// is not guaranteed to be dd/mm/yyyy. This wraps a real date input (kept for
// native picker + keyboard support) with a dd/mm/yyyy formatted overlay so the
// displayed format is consistent regardless of locale, while the underlying
// value stays in the standard yyyy-mm-dd form used throughout the app.
const formatDisplayDate = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!match) return '';
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
};

export default function DateInput({ value, onChange, className, required, disabled, id, name }: DateInputProps) {
  const isoValue = normalizeToISO(value);
  return (
    <div className="relative">
      <div className={`${className} flex items-center pr-7`}>
        {isoValue ? formatDisplayDate(isoValue) : <span className="text-slate-400">dd/mm/yyyy</span>}
      </div>
      <Calendar className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="date"
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        value={isoValue}
        onChange={onChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  );
}
