import React, { useState, useMemo } from 'react';
import { X, Calculator, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { WarehouseEntry } from '../../types';
import { computeWarehouseRates, round2, formatINR } from '../../utils/warehouseRates';

// 12Hr's Km Slab (2000/2500/3000) is the vehicle's whole-MONTH contracted KM
// budget, not a per-entry limit - this tool computes the true cumulative KM
// Utilised across all of a vehicle's 12Hr entries in a chosen month and, if
// it exceeds that month's Km Slab, writes the excess into Add KM on the
// vehicle's last entry that month (same Add KM field/formula that already
// existed - see utils/warehouseRates.ts - this just decides its value for
// this specific case instead of leaving it purely manual).
//
// Deliberately a separate deliberate action, not something that runs live
// per-entry: a single early-month entry being under the slab says nothing
// about whether the vehicle will exceed it by month's end, so the total is
// only meaningful once the office actually runs this for a finished month.
// If entries for that vehicle/month change after closing, the previously
// applied Add KM is left exactly as saved (never silently rewritten) - this
// tool instead shows a "stale" warning so the office can deliberately
// re-run it.

interface CloseMonthKmSlabProps {
  entries: WarehouseEntry[];
  onUpdateEntry: (id: string, entry: Partial<WarehouseEntry>) => Promise<void>;
  onClose: () => void;
}

const currentMonthKey = (): string => new Date().toISOString().slice(0, 7);

export default function CloseMonthKmSlab({ entries, onUpdateEntry, onClose }: CloseMonthKmSlabProps) {
  const vehicleOptions = useMemo(
    () => Array.from(new Set(entries.filter(e => e.fixedHours === 12 && e.vehicleNumber).map(e => e.vehicleNumber))).sort(),
    [entries]
  );
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [month, setMonth] = useState(currentMonthKey());
  const [isApplying, setIsApplying] = useState(false);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Every 12Hr entry for this vehicle in this month, oldest first - Sl.No as
  // a tiebreaker for same-day entries, same ordering convention the rest of
  // this module already uses for "most recent entry" lookups.
  const monthEntries = useMemo(() => {
    if (!vehicleNumber || !month) return [];
    return entries
      .filter(e => e.fixedHours === 12 && (e.vehicleNumber || '').trim().toUpperCase() === vehicleNumber.trim().toUpperCase() && (e.date || '').startsWith(month))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.slNo || 0) - (b.slNo || 0));
  }, [entries, vehicleNumber, month]);

  const totalKmUtilised = useMemo(() => round2(monthEntries.reduce((sum, e) => sum + (e.kmUtilised || 0), 0)), [monthEntries]);
  const targetEntry = monthEntries.length > 0 ? monthEntries[monthEntries.length - 1] : null;
  const kmSlabNumber = parseFloat(targetEntry?.kmSlab || '0') || 0;
  const excess = Math.max(0, round2(totalKmUtilised - kmSlabNumber));

  const isClosed = !!targetEntry?.monthlyKmClosedAt;
  const isStale = isClosed && targetEntry?.monthlyKmSlabTotalAtClose !== totalKmUtilised;

  const handleApply = async () => {
    if (!targetEntry) return;
    setIsApplying(true);
    setNotif(null);
    try {
      const rates = computeWarehouseRates({
        fixedHours: targetEntry.fixedHours,
        scheduledRate: targetEntry.scheduledRate || 0,
        workingDays: targetEntry.workingDays || 1,
        kmSlab: kmSlabNumber,
        variableCostPerKm: targetEntry.variableCostPerKm || 0,
        kmUtilised: targetEntry.kmUtilised || 0,
        addKm: excess,
        ratePerExtraKm: targetEntry.ratePerExtraKm || 0,
        addHour: targetEntry.addHour || 0,
        ratePerExtraHour: targetEntry.ratePerExtraHour || 0,
        tollCharges: targetEntry.tollCharges || 0,
        parkingCost: targetEntry.parkingCost || 0,
        hybridReeferCost: targetEntry.hybridReeferCost || 0,
      });
      // onUpdateEntry ultimately POSTs whatever object it's given straight
      // over the existing stored record (see App.tsx's
      // handleUpdateWarehouseEntry / service.ts's saveWarehouseEntry - there
      // is no server-side merge) - every other caller in this module always
      // sends the entry's full field set for exactly this reason, so this
      // has to spread the whole targetEntry first rather than sending only
      // the handful of fields actually changing here.
      await onUpdateEntry(targetEntry.id, {
        ...targetEntry,
        extraKm: excess,
        additionalKmCost: rates.extraKmAmount,
        baseRate: rates.baseRate,
        fuelCost: rates.fuelCost,
        finalBaseRate: round2(Math.max(0, rates.baseRate + rates.fuelCost)),
        additionalHourCost: rates.extraHourAmount,
        grandTotal: rates.grandTotal,
        monthlyKmSlabMonth: month,
        monthlyKmSlabTotalAtClose: totalKmUtilised,
        monthlyKmSlabExcessApplied: excess,
        monthlyKmClosedAt: new Date().toISOString(),
      });
      setNotif({ message: `Applied ${excess} km to Add KM on the ${targetEntry.date} entry.`, type: 'success' });
    } catch (err) {
      console.error(err);
      setNotif({ message: 'Failed to apply the Close Month adjustment. Please try again.', type: 'error' });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-pink-600 to-purple-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Calculator className="w-4 h-4" /> Close Month - 12Hr KM Slab
          </h3>
          <button onClick={onClose} className="text-purple-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 text-xs">
          <p className="text-slate-500">
            For 12Hr deployments, Km Slab is the vehicle's whole-month KM budget, not a per-entry limit.
            Pick a vehicle and month below to total up its 12Hr entries and, if the total runs over the slab,
            write the excess into Add KM on that vehicle's last entry for the month.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Vehicle Number</label>
              <select value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none">
                <option value="">Select vehicle</option>
                {vehicleOptions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold text-purple-700 mb-1 uppercase tracking-wide">Month</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-full bg-slate-50 border border-purple-100 rounded-lg p-1.5 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none" />
            </div>
          </div>

          {vehicleNumber && (
            monthEntries.length === 0 ? (
              <p className="text-slate-400 italic">No 12Hr entries logged for {vehicleNumber} in this month.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">Entries This Month</span>
                    <span className="text-slate-800 font-bold">{monthEntries.length}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">Km Slab</span>
                    <span className="text-slate-800 font-bold">{kmSlabNumber || '—'} km</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">Total KM Utilised</span>
                    <span className="text-slate-800 font-bold">{totalKmUtilised.toLocaleString('en-IN')} km</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">Excess Over Slab</span>
                    <span className={`font-bold ${excess > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{excess > 0 ? `${excess.toLocaleString('en-IN')} km` : 'None'}</span>
                  </div>
                </div>

                <p className="text-slate-500">
                  Target entry (last that month): <span className="font-semibold text-slate-700">{targetEntry?.date}</span>, current Add KM = <span className="font-mono">{targetEntry?.extraKm || 0}</span>.
                  {excess > 0 && <> Rate/Extra KM for that entry: <span className="font-mono">{formatINR(targetEntry?.ratePerExtraKm || 0)}</span> → Extra KM Amount will become <span className="font-semibold">{formatINR(excess * (targetEntry?.ratePerExtraKm || 0))}</span>.</>}
                </p>

                {isClosed && (
                  isStale ? (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        This vehicle/month was already closed on {new Date(targetEntry!.monthlyKmClosedAt!).toLocaleString('en-IN')}
                        (total was {targetEntry?.monthlyKmSlabTotalAtClose?.toLocaleString('en-IN')} km, excess {targetEntry?.monthlyKmSlabExcessApplied?.toLocaleString('en-IN')} km),
                        but entries have changed since then - the Add KM applied back then is untouched until you re-run Close Month below.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Closed on {new Date(targetEntry!.monthlyKmClosedAt!).toLocaleString('en-IN')} - up to date with the current entries.</span>
                    </div>
                  )
                )}

                {notif && (
                  <div className={`p-2.5 rounded-lg text-[11px] font-semibold ${notif.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>
                    {notif.message}
                  </div>
                )}

                <button
                  onClick={handleApply}
                  disabled={isApplying}
                  className="w-full bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold py-2 rounded-lg uppercase text-[10px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isClosed ? <RotateCcw className="w-3.5 h-3.5" /> : <Calculator className="w-3.5 h-3.5" />}
                  {isApplying ? 'Applying…' : isClosed ? 'Re-run Close Month' : 'Apply to Last Entry'}
                </button>
                <p className="text-[9px] text-slate-400 font-mono">
                  Add KM stays manually editable afterward from the entry's own Edit screen if this needs correcting by hand.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
