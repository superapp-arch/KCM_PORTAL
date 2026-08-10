import React, { useState, useEffect, useMemo } from 'react';
import { Vehicle, TireRecord, MileageReport } from '../../types';
import { CircleDot, Search, Edit2, Trash2, Plus, X, Gauge, AlertTriangle } from 'lucide-react';
import DateInput from '../DateInput';
import { latestOdometerFor, computeAlignmentStatus, nextAlignmentDueKm, ALIGNMENT_INTERVAL_KM, KmStatus } from '../../utils/maintenanceDates';

interface TireAlignmentTabProps {
  vehicles: Vehicle[];
  mileageReports: MileageReport[];
  tireRecords: TireRecord[];
  onSaveTireRecord: (record: TireRecord | Omit<TireRecord, 'id'>) => Promise<void>;
  onDeleteTireRecord: (id: string) => Promise<void>;
}

const emptyForm = (regNo = ''): Omit<TireRecord, 'id'> & { id?: string } => ({
  regNo, position: '', tireBrand: '', tireSerialNumber: '', installedDate: '', installedKm: undefined, lastAlignmentKm: undefined
});

const statusBadge = (status: KmStatus | null) => {
  if (!status) return <span className="text-slate-300">-</span>;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
      status === 'overdue' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
      status === 'due-soon' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
      'bg-emerald-50 text-emerald-700 border border-emerald-200'
    }`}>
      {status === 'ok' ? 'OK' : status}
    </span>
  );
};

export default function TireAlignmentTab({
  vehicles, mileageReports, tireRecords, onSaveTireRecord, onDeleteTireRecord
}: TireAlignmentTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<TireRecord, 'id'> & { id?: string }>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<string | null>(null);
  const [showAlignmentPopup, setShowAlignmentPopup] = useState(false);

  const triggerNotif = (msg: string) => { setNotif(msg); setTimeout(() => setNotif(null), 4000); };

  const vehicleList = Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort();

  const rows = useMemo(() => {
    return [...tireRecords]
      .map(t => {
        const currentKm = latestOdometerFor(t.regNo, mileageReports);
        const dueAt = nextAlignmentDueKm(t.lastAlignmentKm);
        const remaining = dueAt != null && currentKm != null ? dueAt - currentKm : undefined;
        const status = computeAlignmentStatus(t.lastAlignmentKm, currentKm);
        return { tire: t, currentKm, dueAt, remaining, status };
      })
      .sort((a, b) => a.tire.regNo.localeCompare(b.tire.regNo) || a.tire.position.localeCompare(b.tire.position));
  }, [tireRecords, mileageReports]);

  const filteredRows = rows.filter(r =>
    r.tire.regNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.tire.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.tire.tireBrand.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Wheel rotation/alignment pop-up: fires once when this tab is opened
  // (i.e. on mount, not on every re-render) if any tire is currently Due or
  // Overdue - dismissible, doesn't reappear until the tab is closed and
  // reopened. Separate from (and in addition to) the module dashboard's own
  // Wheel Alignment alert card and the 3/5/7-day email.
  useEffect(() => {
    const hasDueOrOverdue = rows.some(r => r.status === 'due-soon' || r.status === 'overdue');
    if (hasDueOrOverdue) setShowAlignmentPopup(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dueOrOverdueRows = rows.filter(r => r.status === 'due-soon' || r.status === 'overdue');

  const resetForm = () => { setForm(emptyForm()); setShowForm(false); };
  const openEdit = (t: TireRecord) => { setForm(t); setShowForm(true); };
  const openAdd = () => { setForm(emptyForm()); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.regNo.trim() || !form.position.trim() || !form.tireBrand.trim()) {
      triggerNotif('Vehicle, Position, and Tire Company/Brand are required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const id = form.id || `${form.regNo.trim().toUpperCase()}-${form.position.trim()}-${Date.now()}`;
      await onSaveTireRecord({ ...form, id, regNo: form.regNo.trim().toUpperCase(), position: form.position.trim(), tireBrand: form.tireBrand.trim() } as TireRecord);
      triggerNotif(form.id ? 'Tire record updated.' : 'Tire record added.');
      resetForm();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (t: TireRecord) => {
    if (!confirm(`Delete the tire record for ${t.regNo} (${t.position})?`)) return;
    await onDeleteTireRecord(t.id);
    triggerNotif('Tire record deleted.');
  };

  return (
    <div className="space-y-4">
      {notif && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">{notif}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <CircleDot className="w-4 h-4 text-slate-600" /> Tire &amp; Alignment Tracking
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative w-48 text-xs">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
              <input type="text" placeholder="Search Reg No, position, brand" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
            </div>
            <button onClick={openAdd} className="bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap">
              <Plus className="w-4 h-4" /> Add Tire
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5">Reg. No.</th>
                <th className="px-3 py-2.5">Position</th>
                <th className="px-3 py-2.5">Company/Brand</th>
                <th className="px-3 py-2.5">Serial No.</th>
                <th className="px-3 py-2.5">Installed</th>
                <th className="px-3 py-2.5 text-right">Current Odometer</th>
                <th className="px-3 py-2.5 text-right">Last Alignment (km)</th>
                <th className="px-3 py-2.5 text-right">Next Due (km)</th>
                <th className="px-3 py-2.5">Alignment Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-slate-400 font-mono">NO TIRE RECORDS FOUND.</td></tr>
              ) : filteredRows.map(({ tire, currentKm, dueAt, status }) => (
                <tr key={tire.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{tire.regNo}</td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{tire.position}</td>
                  <td className="px-3 py-2.5 text-slate-700 font-semibold whitespace-nowrap">{tire.tireBrand}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{tire.tireSerialNumber || '-'}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                    {tire.installedDate || '-'} {tire.installedKm != null && <span className="text-slate-400">({tire.installedKm.toLocaleString('en-IN')} km)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600">{currentKm != null ? currentKm.toLocaleString('en-IN') : '-'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600">{tire.lastAlignmentKm != null ? tire.lastAlignmentKm.toLocaleString('en-IN') : '-'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600">{dueAt != null ? dueAt.toLocaleString('en-IN') : '-'}</td>
                  <td className="px-3 py-2.5">{statusBadge(status)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(tire)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(tire)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 font-mono mt-3 flex items-center gap-1">
          <Gauge className="w-3 h-3" /> Current Odometer is live from Fuel Management's latest Closing KM. Alignment cycle is a fixed {ALIGNMENT_INTERVAL_KM.toLocaleString('en-IN')} km from the last alignment.
        </p>
      </div>

      {/* Add/Edit Tire modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><CircleDot className="w-4 h-4 text-blue-400" /> {form.id ? 'Edit Tire' : 'Add Tire'}</h3>
              <button onClick={resetForm} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Vehicle Registration Number *</label>
                <input type="text" required list="tire-vehicles-datalist" value={form.regNo} onChange={(e) => setForm(f => ({ ...f, regNo: e.target.value.toUpperCase() }))} autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold uppercase text-slate-800" />
                <datalist id="tire-vehicles-datalist">{vehicleList.map(v => <option key={v} value={v} />)}</datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Position *</label>
                  <input type="text" required placeholder="e.g. Front Left" value={form.position} onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))} autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Company/Brand *</label>
                  <input type="text" required placeholder="e.g. MRF, CEAT" value={form.tireBrand} onChange={(e) => setForm(f => ({ ...f, tireBrand: e.target.value }))} autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Tire Serial Number</label>
                <input type="text" value={form.tireSerialNumber || ''} onChange={(e) => setForm(f => ({ ...f, tireSerialNumber: e.target.value }))} autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Installed Date</label>
                  <DateInput value={form.installedDate || ''} onChange={(e) => setForm(f => ({ ...f, installedDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Installed Odometer (km)</label>
                  <input type="number" value={form.installedKm ?? ''} onChange={(e) => setForm(f => ({ ...f, installedKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Last Alignment Odometer (km)</label>
                <input type="number" value={form.lastAlignmentKm ?? ''} onChange={(e) => setForm(f => ({ ...f, lastAlignmentKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                <p className="text-[9px] text-slate-400 font-mono mt-0.5">Next alignment is always this + {ALIGNMENT_INTERVAL_KM.toLocaleString('en-IN')} km - fixed interval, not editable.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={resetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {isSubmitting ? 'Saving...' : form.id ? 'Save Changes' : 'Add Tire'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wheel rotation/alignment pop-up */}
      {showAlignmentPopup && dueOrOverdueRows.length > 0 && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-amber-200 max-w-md w-full">
            <div className="p-4 bg-gradient-to-r from-amber-600 to-rose-700 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Wheel Alignment Attention Needed</h3>
              <button onClick={() => setShowAlignmentPopup(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 text-xs space-y-2 max-h-64 overflow-y-auto">
              <p className="text-slate-600">{dueOrOverdueRows.length} tire{dueOrOverdueRows.length === 1 ? ' is' : 's are'} due or overdue for wheel alignment:</p>
              {dueOrOverdueRows.map(r => (
                <div key={r.tire.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="font-mono font-bold text-slate-800">{r.tire.regNo} <span className="text-slate-400 font-sans font-normal">({r.tire.position})</span></span>
                  {statusBadge(r.status)}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setShowAlignmentPopup(false)} className="w-full bg-gradient-to-r from-amber-600 to-rose-700 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
