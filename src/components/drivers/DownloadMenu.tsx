import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';

// Small Excel/PDF dropdown, shared by every download action across Driver
// Salary and Driver Attendance (per-location, per-driver, "download
// everything") so all four surfaces open the same two-option menu instead of
// each reinventing its own button/format choice.
export interface DownloadMenuOption {
  key: string;
  label: string;
  icon: 'excel' | 'pdf';
  onClick: () => void;
}

interface DownloadMenuProps {
  label?: string;
  options: DownloadMenuOption[];
  variant?: 'button' | 'ghost' | 'tab'; // 'ghost' = for use on a colored group header bar; 'tab' = pill styled to match DriverDetails' own module tabs
  className?: string;
}

const ICONS = { excel: FileSpreadsheet, pdf: FileText };

export default function DownloadMenu({ label = 'Download', options, variant = 'button', className = '' }: DownloadMenuProps) {
  const [open, setOpen] = useState(false);

  const triggerClass = variant === 'ghost'
    ? 'text-white/90 hover:text-white hover:bg-white/15 border border-white/30'
    : variant === 'tab'
    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 border border-slate-200 bg-white'
    : 'bg-white border border-slate-300 hover:bg-slate-100 text-slate-700';

  return (
    <div className={`relative inline-block ${className}`} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`px-2.5 py-1 rounded-md font-bold uppercase text-[9.5px] flex items-center gap-1 cursor-pointer transition-all ${triggerClass}`}
      >
        <Download className="w-3 h-3" /> {label} <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-[100] bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[180px] text-[10.5px]">
            {options.map(opt => {
              const Icon = ICONS[opt.icon];
              return (
                <button
                  key={opt.key}
                  onClick={() => { opt.onClick(); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-1.5 text-slate-700 cursor-pointer"
                >
                  <Icon className={`w-3 h-3 ${opt.icon === 'excel' ? 'text-emerald-600' : 'text-rose-600'}`} /> {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
