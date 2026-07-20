import React from 'react';

interface DateInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
}

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
  return (
    <div className="relative">
      <div className={className}>
        {value ? formatDisplayDate(value) : <span className="text-slate-400">dd/mm/yyyy</span>}
      </div>
      <input
        type="date"
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        value={value}
        onChange={onChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  );
}
