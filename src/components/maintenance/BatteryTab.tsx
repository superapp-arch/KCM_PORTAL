import React, { useState } from 'react';
import { Vehicle, BatteryRecord } from '../../types';
import { Battery, Search, Edit2, Trash2, Plus, X, CheckCircle2 } from 'lucide-react';
import DateInput from '../DateInput';

interface BatteryTabProps {
  vehicles: Vehicle[];
  batteryRecords: BatteryRecord[];
  onSaveBatteryRecord: (record: BatteryRecord | Omit<BatteryRecord, 'id'>) => Promise<void>;
  onDeleteBatteryRecord: (id: string) => Promise<void>;
}

const emptyForm = (regNo = ''): Omit<BatteryRecord, 'id'> & { id?: string } => ({
  regNo, batteryNumber: '', make: '', installedKm: undefined, installedDate: '', warrantyExpiryDate: '', isCurrent: true
});

export default function BatteryTab({ vehicles, batteryRecords, onSaveBatteryRecord, onDeleteBatteryRecord }: BatteryTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<BatteryRecord, 'id'> & { id?: string }>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<string | null>(null);

  const triggerNotif = (msg: string) => { setNotif(msg); setTimeout(() => setNotif(null), 4000); };

  const vehicleList = Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort();

  const rows = [...batteryRecords].sort((a, b) => {
    if (a.regNo !== b.regNo) return a.regNo.localeCompare(b.regNo);
    // Current battery first within a vehicle, then most recently installed.
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return (b.installedDate || '').localeCompare(a.installedDate || '');
  });

  const filteredRows = rows.filter(r =>
    r.regNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.batteryNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.make || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resetForm = () => { setForm(emptyForm()); setShowForm(false); };
  const openEdit = (b: BatteryRecord) => { setForm(b); setShowForm(true); };
  const openAdd = () => { setForm(emptyForm()); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.regNo.trim() || !form.batteryNumber.trim()) {
      triggerNotif('Vehicle and Battery Number are required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const id = form.id || `${form.regNo.trim().toUpperCase()}-${Date.now()}`;
      await onSaveBatteryRecord({ ...form, id, regNo: form.regNo.trim().toUpperCase(), batteryNumber: form.batteryNumber.trim() } as BatteryRecord);
      triggerNotif(form.id ? 'Battery record updated.' : 'Battery record added.');
      resetForm();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkCurrent = async (b: BatteryRecord) => {
    await onSaveBatteryRecord({ ...b, isCurrent: true });
    triggerNotif(`${b.batteryNumber} marked as the current battery for ${b.regNo}.`);
  };

  const handleDelete = async (b: BatteryRecord) => {
    if (!confirm(`Delete the battery record ${b.batteryNumber} for ${b.regNo}?`)) return;
    await onDeleteBatteryRecord(b.id);
    triggerNotif('Battery record deleted.');
  };

  return (
    <div className="space-y-4">
      {notif && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">{notif}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Battery className="w-4 h-4 text-slate-600" /> Battery Tracker
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative w-48 text-xs">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
              <input type="text" placeholder="Search Reg No, battery, make" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
            </div>
            <button onClick={openAdd} className="bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap">
              <Plus className="w-4 h-4" /> Add Battery
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5">Reg. No.</th>
                <th className="px-3 py-2.5">Battery Number</th>
                <th className="px-3 py-2.5">Make</th>
                <th className="px-3 py-2.5">Installed</th>
                <th className="px-3 py-2.5">Warranty Expiry</th>
                <th className="px-3 py-2.5">Current</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400 font-mono">NO BATTERY RECORDS FOUND.</td></tr>
              ) : filteredRows.map(b => (
                <tr key={b.id} className={`hover:bg-slate-50/50 transition-colors ${!b.isCurrent ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{b.regNo}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-slate-800 whitespace-nowrap">{b.batteryNumber}</td>
                  <td className="px-3 py-2.5 text-slate-600">{b.make || '-'}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                    {b.installedDate || '-'} {b.installedKm != null && <span className="text-slate-400">({b.installedKm.toLocaleString('en-IN')} km)</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{b.warrantyExpiryDate || '-'}</td>
                  <td className="px-3 py-2.5">
                    {b.isCurrent ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" /> Current</span>
                    ) : (
                      <button onClick={() => handleMarkCurrent(b)} className="text-[9px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer uppercase">Mark Current</button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(b)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(b)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
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
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Battery className="w-4 h-4 text-blue-400" /> {form.id ? 'Edit Battery' : 'Add Battery'}</h3>
              <button onClick={resetForm} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Vehicle Registration Number *</label>
                <input type="text" required list="battery-vehicles-datalist" value={form.regNo} onChange={(e) => setForm(f => ({ ...f, regNo: e.target.value.toUpperCase() }))} autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold uppercase text-slate-800" />
                <datalist id="battery-vehicles-datalist">{vehicleList.map(v => <option key={v} value={v} />)}</datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Battery Number *</label>
                  <input type="text" required value={form.batteryNumber} onChange={(e) => setForm(f => ({ ...f, batteryNumber: e.target.value }))} autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Make</label>
                  <input type="text" value={form.make || ''} onChange={(e) => setForm(f => ({ ...f, make: e.target.value }))} autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
                </div>
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
                <label className="block font-semibold text-slate-600 mb-1">Warranty Expiry Date</label>
                <DateInput value={form.warrantyExpiryDate || ''} onChange={(e) => setForm(f => ({ ...f, warrantyExpiryDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
              </div>
              <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 cursor-pointer">
                <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm(f => ({ ...f, isCurrent: e.target.checked }))} />
                <span className="font-semibold text-slate-700">This is the currently-fitted battery</span>
              </label>
              <p className="text-[9px] text-slate-400 font-mono">Checking this un-marks any other battery on this vehicle as current.</p>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={resetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {isSubmitting ? 'Saving...' : form.id ? 'Save Changes' : 'Add Battery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
