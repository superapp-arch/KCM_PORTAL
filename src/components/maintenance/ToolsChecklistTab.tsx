import React, { useState } from 'react';
import { Vehicle, ToolsChecklistRecord } from '../../types';
import { Wrench, Search, Trash2, Plus, X, Check, CheckCircle2, AlertCircle } from 'lucide-react';
import DateInput from '../DateInput';
import SortHeader from '../SortHeader';
import { SortState, compareText } from '../../utils/sort';

interface ToolsChecklistTabProps {
  vehicles: Vehicle[];
  toolsChecklistRecords: ToolsChecklistRecord[];
  onSaveToolsChecklistRecord: (record: Omit<ToolsChecklistRecord, 'id'>) => Promise<void>;
  onDeleteToolsChecklistRecord: (id: string) => Promise<void>;
}

const TOOL_FIELDS: { key: 'hasJack' | 'hasJackRod' | 'hasTommyBar' | 'hasSpanner'; label: string }[] = [
  { key: 'hasJack', label: 'Jack' },
  { key: 'hasJackRod', label: 'Jack Rod' },
  { key: 'hasTommyBar', label: 'Tommy Bar' },
  { key: 'hasSpanner', label: 'Spanner' }
];

const emptyForm = (regNo = '') => ({
  regNo, checkDate: new Date().toISOString().slice(0, 10),
  hasJack: false, hasJackRod: false, hasTommyBar: false, hasSpanner: false,
  checkedBy: '', remarks: ''
});

export default function ToolsChecklistTab({ vehicles, toolsChecklistRecords, onSaveToolsChecklistRecord, onDeleteToolsChecklistRecord }: ToolsChecklistTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Newest-first by Check Date was already this table's default - now
  // exposed as the same Sort By dropdown convention used elsewhere.
  const [sort, setSort] = useState<SortState | null>({ key: 'checkDate', direction: 'desc' });
  const handleSort = (key: string, direction: SortState['direction']) => setSort({ key, direction });

  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => { setNotif({ message, type }); setTimeout(() => setNotif(null), 4000); };

  const vehicleList = Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort();

  const rows = sort
    ? [...toolsChecklistRecords].sort((a, b) => {
        let cmp = 0;
        switch (sort.key) {
          case 'regNo': cmp = compareText(a.regNo, b.regNo); break;
          // Ties (same date) break on Reg No so the order stays stable.
          case 'checkDate': cmp = (a.checkDate || '') === (b.checkDate || '') ? compareText(a.regNo, b.regNo) : ((a.checkDate || '') < (b.checkDate || '') ? -1 : 1); break;
          default: cmp = 0;
        }
        return sort.direction === 'asc' ? cmp : -cmp;
      })
    : [...toolsChecklistRecords].sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || '') || a.regNo.localeCompare(b.regNo));
  const filteredRows = rows.filter(r =>
    r.regNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.checkedBy || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resetForm = () => { setForm(emptyForm()); setShowForm(false); };
  const openAdd = () => { setForm(emptyForm()); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.regNo.trim() || !form.checkDate) {
      triggerNotif('Vehicle and Check Date are required.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSaveToolsChecklistRecord({ ...form, regNo: form.regNo.trim().toUpperCase(), checkedBy: form.checkedBy.trim() || undefined, remarks: form.remarks.trim() || undefined });
      triggerNotif('Tools checklist logged.');
      resetForm();
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save tools checklist entry.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (r: ToolsChecklistRecord) => {
    if (!confirm(`Delete the tools checklist entry for ${r.regNo} on ${r.checkDate}?`)) return;
    try {
      await onDeleteToolsChecklistRecord(r.id);
      triggerNotif('Tools checklist entry deleted.');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete tools checklist entry.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {notif.message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Wrench className="w-4 h-4 text-slate-600" /> Tools Checklist Log
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative w-48 text-xs">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
              <input type="text" placeholder="Search Reg No, checked by" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
            </div>
            <select
              value={sort?.key === 'checkDate' && sort.direction === 'asc' ? 'oldest' : 'newest'}
              onChange={(e) => setSort({ key: 'checkDate', direction: e.target.value === 'oldest' ? 'asc' : 'desc' })}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <button onClick={openAdd} className="bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap">
              <Plus className="w-4 h-4" /> Log Check
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5"><SortHeader label="Check Date" sortKey="checkDate" sort={sort} onSort={handleSort} type="numeric" /></th>
                <th className="px-3 py-2.5"><SortHeader label="Reg. No." sortKey="regNo" sort={sort} onSort={handleSort} /></th>
                {TOOL_FIELDS.map(t => <th key={t.key} className="px-3 py-2.5 text-center">{t.label}</th>)}
                <th className="px-3 py-2.5">Checked By</th>
                <th className="px-3 py-2.5">Remarks</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={7 + TOOL_FIELDS.length - 2} className="text-center py-10 text-slate-400 font-mono">NO TOOLS CHECKLIST ENTRIES FOUND.</td></tr>
              ) : filteredRows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{r.checkDate}</td>
                  <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{r.regNo}</td>
                  {TOOL_FIELDS.map(t => (
                    <td key={t.key} className="px-3 py-2.5 text-center">
                      {r[t.key] ? <Check className="w-3.5 h-3.5 text-emerald-600 inline" /> : <X className="w-3.5 h-3.5 text-rose-400 inline" />}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.checkedBy || '-'}</td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[180px] truncate" title={r.remarks}>{r.remarks || '-'}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => handleDelete(r)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-400" /> Log Tools Check</h3>
              <button onClick={resetForm} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Vehicle Registration Number *</label>
                  <input type="text" required list="tools-vehicles-datalist" value={form.regNo} onChange={(e) => setForm(f => ({ ...f, regNo: e.target.value.toUpperCase() }))} autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold uppercase text-slate-800" />
                  <datalist id="tools-vehicles-datalist">{vehicleList.map(v => <option key={v} value={v} />)}</datalist>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Check Date *</label>
                  <DateInput required value={form.checkDate} onChange={(e) => setForm(f => ({ ...f, checkDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-1.5">
                {TOOL_FIELDS.map(t => (
                  <label key={t.key} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer">
                    <span className="text-slate-700 font-semibold">{t.label}</span>
                    <input type="checkbox" checked={form[t.key]} onChange={(e) => setForm(f => ({ ...f, [t.key]: e.target.checked }))} />
                  </label>
                ))}
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Checked By</label>
                <input type="text" value={form.checkedBy} onChange={(e) => setForm(f => ({ ...f, checkedBy: e.target.value }))} autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Remarks</label>
                <textarea value={form.remarks} onChange={(e) => setForm(f => ({ ...f, remarks: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-14 text-slate-800" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={resetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {isSubmitting ? 'Saving...' : 'Log Check'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
