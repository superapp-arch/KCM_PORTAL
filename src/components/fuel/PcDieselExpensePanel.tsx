import React, { useEffect, useMemo, useState } from 'react';
import { X, CheckCircle2, Circle, Search, RefreshCw } from 'lucide-react';
import DateInput from '../DateInput';
import { authFetch } from '../../authFetch';
import { getPeriodDateRange } from '../../utils/periodRange';
import { PETTY_CASH_USERS } from '../../utils/pettyCashUsers';

// PC Diesel Expense (2026-09-23 direct request) - a read-only, live view of
// Petty Cash's "DIESEL EXPENSES" entries inside Fuel Management, so staff can
// cross-check each one against the fuel entry they create for it (Vehicle
// Number is the key they match on). Data comes straight from Petty Cash on
// every open via GET /api/fuel/pc-diesel-expenses - never copied. Nothing
// here can add/edit/delete a Petty Cash entry.
//
// The only writable thing is the per-entry "Done" mark, which is kept in this
// browser's localStorage (per login) - deliberately NOT on the Petty Cash
// entry itself, and not in the database (no new table, per direct
// instruction). So Done marks are per user, per browser/device.
interface PcDieselExpenseRow {
  id: string;
  date: string;
  entryNo: string;
  location: string;
  cashPaid: number;
  vehicleNumber: string;
  vendorVehicleNumber?: string;
  receiver: string;
  driverId?: string;
  enteredBy?: string;
}

interface Props {
  username: string;
  canToggleDone: boolean;
  onClose: () => void;
}

type Period = 'all' | 'day' | 'month' | 'year';

const doneStorageKey = (username: string) => `kcm_pc_diesel_done:${username}`;

function readDoneIds(username: string): Set<string> {
  try {
    const raw = localStorage.getItem(doneStorageKey(username));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeDoneIds(username: string, ids: Set<string>): void {
  try {
    localStorage.setItem(doneStorageKey(username), JSON.stringify(Array.from(ids)));
  } catch {
    // Storage unavailable (private window, blocked site data) - the mark
    // still shows for this session, it just won't survive a reload.
  }
}

const enteredByLabel = (username?: string) =>
  username ? (PETTY_CASH_USERS.find(u => u.username === username)?.label || username) : '-';

export default function PcDieselExpensePanel({ username, canToggleDone, onClose }: Props) {
  const [rows, setRows] = useState<PcDieselExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Default = current month (Month Till Date as of today); older entries are
  // one click away via Year Till Date / All / a different date.
  const [period, setPeriod] = useState<Period>('month');
  const [refDate, setRefDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [doneIds, setDoneIds] = useState<Set<string>>(() => readDoneIds(username));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/fuel/pc-diesel-expenses');
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load Petty Cash diesel expenses.');
      setRows(await res.json());
    } catch (err: any) {
      setError(err.message || 'Failed to load Petty Cash diesel expenses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleDone = (id: string) => {
    if (!canToggleDone) return;
    setDoneIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      writeDoneIds(username, next);
      return next;
    });
  };

  const { start, end } = period === 'all' ? { start: '', end: '' } : getPeriodDateRange(period, refDate);
  const search = vehicleSearch.trim().toUpperCase().replace(/\s+/g, '');
  const visibleRows = useMemo(() => rows.filter(r => {
    if (period !== 'all' && (r.date < start || r.date > end)) return false;
    if (search) {
      const vehicle = `${r.vehicleNumber || ''} ${r.vendorVehicleNumber || ''}`.toUpperCase().replace(/\s+/g, '');
      if (!vehicle.includes(search)) return false;
    }
    return true;
  }), [rows, period, start, end, search]);

  const doneCount = visibleRows.filter(r => doneIds.has(r.id)).length;
  const totalCash = visibleRows.reduce((sum, r) => sum + (Number(r.cashPaid) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start sm:items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-black text-slate-900">PC Diesel Expense</h3>
            <p className="text-[10px] text-slate-500">Live from Petty Cash (category: Diesel Expenses) - view only. Mark Done once the fuel entry is created.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} title="Refresh" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onClose} title="Close" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
            {([['day', 'Day'], ['month', 'Month Till Date'], ['year', 'Year Till Date'], ['all', 'All']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${period === key ? 'bg-white shadow-xs text-emerald-700' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {period !== 'all' && (
            <div className="w-40">
              <DateInput
                value={refDate}
                onChange={(e) => setRefDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-mono text-slate-800"
              />
            </div>
          )}
          <div className="relative w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={vehicleSearch}
              onChange={(e) => setVehicleSearch(e.target.value)}
              placeholder="Search vehicle no..."
              autoComplete="off"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-[11px] font-mono uppercase focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {visibleRows.length} entries · {doneCount} done · ₹{totalCash.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="overflow-auto flex-1">
          {error ? (
            <p className="text-center text-rose-600 text-xs py-10">{error}</p>
          ) : loading && rows.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-10">Loading...</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px] sticky top-0">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Entry No</th>
                  <th className="px-3 py-2.5">Location</th>
                  <th className="px-3 py-2.5 text-right">Cash Paid</th>
                  <th className="px-3 py-2.5">Vehicle Number</th>
                  <th className="px-3 py-2.5">Receiver</th>
                  <th className="px-3 py-2.5">Driver ID</th>
                  <th className="px-3 py-2.5">Entered By</th>
                  <th className="px-3 py-2.5 text-center">Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center text-slate-400 py-10">No Diesel Expense entries for this period.</td></tr>
                ) : visibleRows.map(r => {
                  const done = doneIds.has(r.id);
                  const vehicle = r.vehicleNumber || r.vendorVehicleNumber || '';
                  return (
                    <tr key={r.id} className={done ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">{r.entryNo || '-'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.location || '-'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">₹{(Number(r.cashPaid) || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 font-black font-mono text-slate-900 uppercase tracking-wider whitespace-nowrap text-[12px]">
                        {vehicle || '-'}
                        {!r.vehicleNumber && r.vendorVehicleNumber && (
                          <span className="ml-1 text-[8px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1 py-0.5 align-middle normal-case tracking-normal">vendor</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.receiver || '-'}</td>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">{r.driverId || '-'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{enteredByLabel(r.enteredBy)}</td>
                      <td className="px-3 py-2.5 text-center">
                        {canToggleDone ? (
                          <button
                            type="button"
                            onClick={() => toggleDone(r.id)}
                            title={done ? 'Marked Done - click to undo' : 'Mark Done once the fuel entry is created'}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer border ${done ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                          >
                            {done ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                            {done ? 'Done' : 'Mark Done'}
                          </button>
                        ) : (
                          <span className={`text-[10px] font-bold ${done ? 'text-emerald-600' : 'text-slate-400'}`}>{done ? 'Done' : '-'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="px-5 py-2 border-t border-slate-100 text-[9px] text-slate-400">
          Done marks are saved in this browser for your login only - they don't change the Petty Cash entry.
        </p>
      </div>
    </div>
  );
}
