import React from 'react';
import { X, Truck } from 'lucide-react';
import { Vehicle } from '../../types';

interface VehicleDetailsPopoverProps {
  vehicle: Vehicle | null;
  regNo: string;
  onClose: () => void;
}

export default function VehicleDetailsPopover({ vehicle, regNo, onClose }: VehicleDetailsPopoverProps) {
  const rows: [string, string][] = [
    ['Vehicle Type', vehicle?.Type || vehicle?.type || '-'],
    ['Category', vehicle?.Category || vehicle?.category || '-'],
    ['Chassis Number', vehicle?.['Chassis No'] || vehicle?.chassisNo || '-'],
    ['Registration Date', vehicle?.['Reg Date'] || vehicle?.regDate || '-'],
    ['Vehicle OEM Model Name', vehicle?.Model || vehicle?.model || '-']
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 relative overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-teal-500 to-emerald-600" />
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Truck className="w-4 h-4 text-teal-600" /> {regNo}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {vehicle ? (
          <div className="space-y-1.5 text-xs">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-slate-50 py-1.5">
                <span className="text-slate-400 font-semibold uppercase text-[9.5px]">{label}</span>
                <span className="font-bold text-slate-700">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-4 text-center">No matching vehicle found in Fleet &amp; Vehicles for {regNo}.</p>
        )}
      </div>
    </div>
  );
}
