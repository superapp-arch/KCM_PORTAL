import React, { useState } from 'react';
import { MapPin, Save, X } from 'lucide-react';
import { WarehouseRateOverride } from '../../types';
import { buildRateOverrideId } from '../../utils/warehouseRateMatrix';
import { ADHOC_VEHICLE_COLUMNS, AdHocVehicleColumn, adHocRouteOverrideDims, findAdHocRoute, adHocTripOf } from '../../utils/warehouseRateMatrix24hr';

// Add / edit one 24Hr Ad-hoc route's rates (2026-09-25) - used by Rates ->
// "24Hr Ad-hoc - Route Rates" (Add Route / Edit) and by the import review's
// "Add Rate" for a new route. Saves ONE WarehouseRateOverride (kind
// 'adHocRoute24hr'), the same override store every other editable rate uses;
// Super Admin only, enforced server-side too. A 0/blank vehicle column means
// "no rate for that vehicle on this route", exactly like the built-in table.

interface AdHocRouteRateEditorProps {
  mode: 'add' | 'edit';
  initialFrom?: string;
  initialTo?: string;
  initialTrip?: string;
  initialRates?: Partial<Record<AdHocVehicleColumn, number>>;
  overrides: WarehouseRateOverride[];
  onSave: (override: WarehouseRateOverride) => Promise<void>;
  onClose: () => void;
  onSaved?: (from: string, to: string) => void;
}

export default function AdHocRouteRateEditor({ mode, initialFrom = '', initialTo = '', initialTrip = 'Round Trip', initialRates, overrides, onSave, onClose, onSaved }: AdHocRouteRateEditorProps) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [trip, setTrip] = useState(initialTrip);
  const [rates, setRates] = useState<Record<string, string>>(
    Object.fromEntries(ADHOC_VEHICLE_COLUMNS.map(c => [c, initialRates?.[c] ? String(initialRates[c]) : '']))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!from.trim() || !to.trim()) { setErr('From City and To City are required.'); return; }
    const values = Object.fromEntries(ADHOC_VEHICLE_COLUMNS.map(c => [c, Math.max(0, Number(rates[c]) || 0)]));
    if (!Object.values(values).some(v => v > 0)) { setErr('Enter a rate for at least one vehicle type.'); return; }
    if (mode === 'add') {
      const existing = findAdHocRoute(from, to, overrides);
      if (existing && adHocTripOf(existing) === trip) {
        setErr(`${existing.from} → ${existing.to} (${trip}) already exists - edit it in the route table instead.`);
        return;
      }
    }
    setBusy(true);
    try {
      const dims = adHocRouteOverrideDims(from, to, trip);
      await onSave({ id: buildRateOverrideId('adHocRoute24hr', dims), kind: 'adHocRoute24hr', dims, value: values });
      onSaved?.(dims.from, dims.to);
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Failed to save the route rate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full text-xs">
        <div className="p-4 bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-white flex items-center justify-between rounded-t-2xl">
          <h3 className="font-extrabold text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-pink-300" /> {mode === 'add' ? 'Add 24Hr Ad-hoc Route Rate' : 'Edit 24Hr Ad-hoc Route Rate'}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="block text-[9px] font-bold text-purple-700 uppercase tracking-wide mb-1">From City *</span>
              <input value={from} onChange={e => setFrom(e.target.value)} disabled={mode === 'edit'} placeholder="e.g. Goa"
                className="w-full border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800 disabled:bg-slate-100" />
            </label>
            <label className="block">
              <span className="block text-[9px] font-bold text-purple-700 uppercase tracking-wide mb-1">To City *</span>
              <input value={to} onChange={e => setTo(e.target.value)} disabled={mode === 'edit'} placeholder="e.g. Mumbai"
                className="w-full border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800 disabled:bg-slate-100" />
            </label>
            <label className="block">
              <span className="block text-[9px] font-bold text-purple-700 uppercase tracking-wide mb-1">Trip</span>
              <select value={trip} onChange={e => setTrip(e.target.value)} disabled={mode === 'edit'}
                className="w-full border border-purple-100 rounded-lg p-1.5 font-bold text-slate-800 disabled:bg-slate-100">
                <option>Round Trip</option>
                <option>One Way Trip</option>
              </select>
            </label>
          </div>
          <div>
            <span className="block text-[9px] font-bold text-purple-700 uppercase tracking-wide mb-1">Rate (₹, flat) per vehicle - leave blank where not configured</span>
            <div className="grid grid-cols-3 gap-2">
              {ADHOC_VEHICLE_COLUMNS.map(col => (
                <label key={col} className="block">
                  <span className="block text-[10px] text-slate-500 mb-0.5">{col}</span>
                  <input type="number" min={0} value={rates[col]} onChange={e => setRates(r => ({ ...r, [col]: e.target.value }))} placeholder="-"
                    aria-label={`${col} rate`}
                    className="w-full text-right font-mono border border-purple-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                </label>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-slate-400">Applies to new calculations from now on. Entries already saved keep the Base Rate they were saved with.</p>
          {err && <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-600 cursor-pointer">Cancel</button>
            <button type="submit" disabled={busy} className="px-3 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
              <Save className="w-3.5 h-3.5" /> {busy ? 'Saving...' : 'Save Route Rate'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
