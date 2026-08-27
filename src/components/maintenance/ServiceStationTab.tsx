import React, { useState } from 'react';
import { Vehicle, ServiceStationSparePart, ServiceStationInspection } from '../../types';
import { Boxes, ClipboardCheck, Search, Trash2, Plus, X, CheckCircle2, AlertCircle } from 'lucide-react';
import DateInput from '../DateInput';
import SortHeader from '../SortHeader';
import { SortState, compareText } from '../../utils/sort';
import { SaveConfirmationModal, DeleteConfirmationModal } from '../ConfirmationModal';

interface ServiceStationTabProps {
  vehicles: Vehicle[];
  spareParts: ServiceStationSparePart[];
  onSaveSparePart: (record: Omit<ServiceStationSparePart, 'id'>) => Promise<void>;
  onDeleteSparePart: (id: string) => Promise<void>;
  inspections: ServiceStationInspection[];
  onSaveInspection: (record: Omit<ServiceStationInspection, 'id'>) => Promise<void>;
  onDeleteInspection: (id: string) => Promise<void>;
}

type SubTab = 'spareparts' | 'inspection';

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptySparePartForm = () => ({
  date: todayIso(), regNo: '', partName: '', partNumber: '', qty: ''
});

const emptyInspectionForm = () => ({
  date: todayIso(), regNo: '', details: '', status: 'Pending' as 'Completed' | 'Pending', inspectedBy: ''
});

const statusBadge = (status: 'Completed' | 'Pending') => (
  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
    status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
  }`}>
    {status}
  </span>
);

// ---------------------------------------------------------------------------
export default function ServiceStationTab({
  vehicles, spareParts, onSaveSparePart, onDeleteSparePart, inspections, onSaveInspection, onDeleteInspection
}: ServiceStationTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('spareparts');
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => { setNotif({ message, type }); setTimeout(() => setNotif(null), 4000); };
  const [saveConfirmation, setSaveConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);

  // Vehicle dropdown - live from Fleet & Vehicles, shared by both sub-tabs.
  // A real <select> (not a datalist/free-text field) so an entry can only
  // ever reference a vehicle Fleet & Vehicles actually has, per spec.
  const vehicleList = Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort();

  // --- Spare Parts state ---
  const [spSearchTerm, setSpSearchTerm] = useState('');
  const [spShowForm, setSpShowForm] = useState(false);
  const [spForm, setSpForm] = useState(emptySparePartForm());
  const [spSubmitting, setSpSubmitting] = useState(false);
  const [spSort, setSpSort] = useState<SortState | null>({ key: 'date', direction: 'desc' });

  const spRows = spSort
    ? [...spareParts].sort((a, b) => {
        let cmp = 0;
        switch (spSort.key) {
          case 'regNo': cmp = compareText(a.regNo, b.regNo); break;
          case 'partName': cmp = compareText(a.partName, b.partName); break;
          case 'date': cmp = (a.date || '') === (b.date || '') ? compareText(a.regNo, b.regNo) : ((a.date || '') < (b.date || '') ? -1 : 1); break;
          default: cmp = 0;
        }
        return spSort.direction === 'asc' ? cmp : -cmp;
      })
    : [...spareParts].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.regNo.localeCompare(b.regNo));
  const spFilteredRows = spRows.filter(r =>
    r.regNo.toLowerCase().includes(spSearchTerm.toLowerCase()) ||
    (r.partName || '').toLowerCase().includes(spSearchTerm.toLowerCase()) ||
    (r.partNumber || '').toLowerCase().includes(spSearchTerm.toLowerCase())
  );

  const spResetForm = () => { setSpForm(emptySparePartForm()); setSpShowForm(false); };
  const spOpenAdd = () => { setSpForm(emptySparePartForm()); setSpShowForm(true); };

  const handleSpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spForm.date || !spForm.regNo.trim() || !spForm.partName.trim() || !spForm.qty) {
      triggerNotif('Date, Vehicle Number, Part Name, and Qty are required.', 'error');
      return;
    }
    setSpSubmitting(true);
    try {
      await onSaveSparePart({
        date: spForm.date,
        regNo: spForm.regNo.trim().toUpperCase(),
        partName: spForm.partName.trim(),
        partNumber: spForm.partNumber.trim(),
        qty: parseInt(spForm.qty, 10) || 0
      });
      setSaveConfirmation({ label: 'Spare part entry', identifier: `${spForm.partName.trim()} - ${spForm.regNo.trim().toUpperCase()}`, key: Date.now() });
      spResetForm();
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save spare part entry.', 'error');
    } finally {
      setSpSubmitting(false);
    }
  };

  const handleSpDelete = async (r: ServiceStationSparePart) => {
    if (!confirm(`Delete the spare part entry "${r.partName}" for ${r.regNo} on ${r.date}?`)) return;
    try {
      await onDeleteSparePart(r.id);
      setDeleteConfirmation({ label: 'Spare part entry', identifier: `${r.partName} - ${r.regNo}`, key: Date.now() });
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete spare part entry.', 'error');
    }
  };

  // --- Inspection state ---
  const [inSearchTerm, setInSearchTerm] = useState('');
  const [inShowForm, setInShowForm] = useState(false);
  const [inForm, setInForm] = useState(emptyInspectionForm());
  const [inSubmitting, setInSubmitting] = useState(false);
  const [inSort, setInSort] = useState<SortState | null>({ key: 'date', direction: 'desc' });

  const inRows = inSort
    ? [...inspections].sort((a, b) => {
        let cmp = 0;
        switch (inSort.key) {
          case 'regNo': cmp = compareText(a.regNo, b.regNo); break;
          case 'status': cmp = compareText(a.status, b.status); break;
          case 'date': cmp = (a.date || '') === (b.date || '') ? compareText(a.regNo, b.regNo) : ((a.date || '') < (b.date || '') ? -1 : 1); break;
          default: cmp = 0;
        }
        return inSort.direction === 'asc' ? cmp : -cmp;
      })
    : [...inspections].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.regNo.localeCompare(b.regNo));
  const inFilteredRows = inRows.filter(r =>
    r.regNo.toLowerCase().includes(inSearchTerm.toLowerCase()) ||
    (r.details || '').toLowerCase().includes(inSearchTerm.toLowerCase()) ||
    (r.inspectedBy || '').toLowerCase().includes(inSearchTerm.toLowerCase())
  );

  const inResetForm = () => { setInForm(emptyInspectionForm()); setInShowForm(false); };
  const inOpenAdd = () => { setInForm(emptyInspectionForm()); setInShowForm(true); };

  const handleInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inForm.date || !inForm.regNo.trim() || !inForm.details.trim()) {
      triggerNotif('Date, Vehicle, and Inspection Details are required.', 'error');
      return;
    }
    setInSubmitting(true);
    try {
      await onSaveInspection({
        date: inForm.date,
        regNo: inForm.regNo.trim().toUpperCase(),
        details: inForm.details.trim(),
        status: inForm.status,
        inspectedBy: inForm.inspectedBy.trim() || undefined
      });
      setSaveConfirmation({ label: 'Inspection entry', identifier: `${inForm.regNo.trim().toUpperCase()} (${inForm.date})`, key: Date.now() });
      inResetForm();
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save inspection entry.', 'error');
    } finally {
      setInSubmitting(false);
    }
  };

  const handleInDelete = async (r: ServiceStationInspection) => {
    if (!confirm(`Delete the inspection entry for ${r.regNo} on ${r.date}?`)) return;
    try {
      await onDeleteInspection(r.id);
      setDeleteConfirmation({ label: 'Inspection entry', identifier: `${r.regNo} (${r.date})`, key: Date.now() });
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete inspection entry.', 'error');
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

      <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
        {([
          ['spareparts', 'Spare Parts', Boxes],
          ['inspection', 'Inspection', ClipboardCheck],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === key ? 'bg-gradient-to-r from-blue-600 to-slate-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {subTab === 'spareparts' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Boxes className="w-4 h-4 text-slate-600" /> Spare Parts Log
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative w-48 text-xs">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
                <input type="text" placeholder="Search vehicle, part" value={spSearchTerm} onChange={(e) => setSpSearchTerm(e.target.value)} autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
              </div>
              <select
                value={spSort?.key === 'date' && spSort.direction === 'asc' ? 'oldest' : 'newest'}
                onChange={(e) => setSpSort({ key: 'date', direction: e.target.value === 'oldest' ? 'asc' : 'desc' })}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
              <button onClick={spOpenAdd} className="bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap">
                <Plus className="w-4 h-4" /> Log Spare Part
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                <tr>
                  <th className="px-3 py-2.5"><SortHeader label="Date" sortKey="date" sort={spSort} onSort={(k, d) => setSpSort({ key: k, direction: d })} type="numeric" /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Vehicle Number" sortKey="regNo" sort={spSort} onSort={(k, d) => setSpSort({ key: k, direction: d })} /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Part Name" sortKey="partName" sort={spSort} onSort={(k, d) => setSpSort({ key: k, direction: d })} /></th>
                  <th className="px-3 py-2.5">Part Number</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {spFilteredRows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400 font-mono">NO SPARE PART ENTRIES FOUND.</td></tr>
                ) : spFilteredRows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{r.regNo}</td>
                    <td className="px-3 py-2.5 text-slate-800 font-semibold whitespace-nowrap">{r.partName}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{r.partNumber || '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{r.qty}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => handleSpDelete(r)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'inspection' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4 text-slate-600" /> Inspection Log
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative w-48 text-xs">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
                <input type="text" placeholder="Search vehicle, details, inspector" value={inSearchTerm} onChange={(e) => setInSearchTerm(e.target.value)} autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
              </div>
              <select
                value={inSort?.key === 'date' && inSort.direction === 'asc' ? 'oldest' : 'newest'}
                onChange={(e) => setInSort({ key: 'date', direction: e.target.value === 'oldest' ? 'asc' : 'desc' })}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
              <button onClick={inOpenAdd} className="bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap">
                <Plus className="w-4 h-4" /> Log Inspection
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                <tr>
                  <th className="px-3 py-2.5"><SortHeader label="Date" sortKey="date" sort={inSort} onSort={(k, d) => setInSort({ key: k, direction: d })} type="numeric" /></th>
                  <th className="px-3 py-2.5"><SortHeader label="Vehicle" sortKey="regNo" sort={inSort} onSort={(k, d) => setInSort({ key: k, direction: d })} /></th>
                  <th className="px-3 py-2.5">Inspection Details</th>
                  <th className="px-3 py-2.5"><SortHeader label="Status" sortKey="status" sort={inSort} onSort={(k, d) => setInSort({ key: k, direction: d })} /></th>
                  <th className="px-3 py-2.5">Inspection By</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {inFilteredRows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400 font-mono">NO INSPECTION ENTRIES FOUND.</td></tr>
                ) : inFilteredRows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{r.regNo}</td>
                    <td className="px-3 py-2.5 text-slate-600 max-w-[260px] truncate" title={r.details}>{r.details}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{statusBadge(r.status)}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.inspectedBy || '-'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => handleInDelete(r)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Spare Part modal */}
      {spShowForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Boxes className="w-4 h-4 text-blue-400" /> Log Spare Part</h3>
              <button onClick={spResetForm} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSpSubmit} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Date *</label>
                  <DateInput required value={spForm.date} onChange={(e) => setSpForm(f => ({ ...f, date: e.target.value }))} max={todayIso()} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Vehicle Number *</label>
                  <select required value={spForm.regNo} onChange={(e) => setSpForm(f => ({ ...f, regNo: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold uppercase text-slate-800">
                    <option value="">Select vehicle...</option>
                    {vehicleList.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Part Name *</label>
                <input type="text" required value={spForm.partName} onChange={(e) => setSpForm(f => ({ ...f, partName: e.target.value }))} autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Part Number</label>
                  <input type="text" value={spForm.partNumber} onChange={(e) => setSpForm(f => ({ ...f, partNumber: e.target.value }))} autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Qty *</label>
                  <input type="number" min="1" required value={spForm.qty} onChange={(e) => setSpForm(f => ({ ...f, qty: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={spResetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={spSubmitting} className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {spSubmitting ? 'Saving...' : 'Log Spare Part'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Inspection modal */}
      {inShowForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-blue-400" /> Log Inspection</h3>
              <button onClick={inResetForm} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleInSubmit} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Date *</label>
                  <DateInput required value={inForm.date} onChange={(e) => setInForm(f => ({ ...f, date: e.target.value }))} max={todayIso()} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Vehicle *</label>
                  <select required value={inForm.regNo} onChange={(e) => setInForm(f => ({ ...f, regNo: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold uppercase text-slate-800">
                    <option value="">Select vehicle...</option>
                    {vehicleList.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Inspection Details *</label>
                <textarea required value={inForm.details} onChange={(e) => setInForm(f => ({ ...f, details: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 text-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Status</label>
                  <select value={inForm.status} onChange={(e) => setInForm(f => ({ ...f, status: e.target.value as 'Completed' | 'Pending' }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
                    <option value="Pending">Pending</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Inspection By</label>
                  <input type="text" value={inForm.inspectedBy} onChange={(e) => setInForm(f => ({ ...f, inspectedBy: e.target.value }))} autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={inResetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={inSubmitting} className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {inSubmitting ? 'Saving...' : 'Log Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SaveConfirmationModal key={saveConfirmation?.key} open={!!saveConfirmation} label={saveConfirmation?.label || 'Entry'} identifier={saveConfirmation?.identifier} onDone={() => setSaveConfirmation(null)} />
      <DeleteConfirmationModal key={deleteConfirmation?.key} open={!!deleteConfirmation} label={deleteConfirmation?.label || 'Entry'} identifier={deleteConfirmation?.identifier} onDone={() => setDeleteConfirmation(null)} />
    </div>
  );
}
