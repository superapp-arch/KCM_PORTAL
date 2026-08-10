import React, { useState } from 'react';
import { Vehicle, VehicleServiceSchedule, MileageReport } from '../../types';
import { CalendarClock, Search, Edit2, X, ShieldCheck, Gauge } from 'lucide-react';
import DateInput from '../DateInput';
import { latestOdometerFor, computeKmStatus, computeWarrantyStatus, KmStatus } from '../../utils/maintenanceDates';

interface ServiceScheduleTabProps {
  vehicles: Vehicle[];
  mileageReports: MileageReport[];
  vehicleServiceSchedules: VehicleServiceSchedule[];
  onSaveVehicleServiceSchedule: (schedule: VehicleServiceSchedule) => Promise<void>;
}

const regDateOf = (v: Vehicle) => v.regDate || v['Reg Date'] || '';

const emptySchedule = (regNo: string): VehicleServiceSchedule => ({
  id: regNo,
  regNo,
  serviceIntervalKm: 10000,
  warrantyStatus: 'InWarranty'
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

export default function ServiceScheduleTab({
  vehicles, mileageReports, vehicleServiceSchedules, onSaveVehicleServiceSchedule
}: ServiceScheduleTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRegNo, setEditingRegNo] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleServiceSchedule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<string | null>(null);

  const triggerNotif = (msg: string) => { setNotif(msg); setTimeout(() => setNotif(null), 4000); };

  const vehicleList = Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort();
  const filteredVehicles = vehicleList.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()));

  const scheduleFor = (regNo: string) => vehicleServiceSchedules.find(s => s.regNo === regNo);
  const vehicleFor = (regNo: string) => vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo);

  const openEdit = (regNo: string) => {
    setEditingRegNo(regNo);
    setForm(scheduleFor(regNo) || emptySchedule(regNo));
  };
  const closeEdit = () => { setEditingRegNo(null); setForm(null); };

  const handleSave = async () => {
    if (!form) return;
    setIsSubmitting(true);
    try {
      await onSaveVehicleServiceSchedule({ ...form, id: form.regNo });
      triggerNotif(`Service schedule saved for ${form.regNo}.`);
      closeEdit();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {notif && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">{notif}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4 text-slate-600" /> Vehicle Service Schedule
          </h2>
          <div className="relative w-48 text-xs">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none"><Search className="w-3.5 h-3.5" /></span>
            <input type="text" placeholder="Search Reg No" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5">Reg. No.</th>
                <th className="px-3 py-2.5">Warranty</th>
                <th className="px-3 py-2.5 text-right">Current Odometer</th>
                <th className="px-3 py-2.5">Last Service</th>
                <th className="px-3 py-2.5 text-right">Interval (km)</th>
                <th className="px-3 py-2.5 text-right">Next Due (km)</th>
                <th className="px-3 py-2.5 text-right">Remaining</th>
                <th className="px-3 py-2.5">Service Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredVehicles.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400 font-mono">NO VEHICLES FOUND.</td></tr>
              ) : filteredVehicles.map(regNo => {
                const schedule = scheduleFor(regNo);
                const currentKm = latestOdometerFor(regNo, mileageReports);
                const nextDueKm = schedule?.lastServiceKm != null ? schedule.lastServiceKm + (schedule.serviceIntervalKm || 10000) : undefined;
                const remaining = nextDueKm != null && currentKm != null ? nextDueKm - currentKm : undefined;
                const status = computeKmStatus(remaining);
                const effectiveWarranty = schedule
                  ? computeWarrantyStatus(schedule.warrantyStatus, currentKm, regDateOf(vehicleFor(regNo) || {}))
                  : null;
                return (
                  <tr key={regNo} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{regNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {effectiveWarranty ? (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${effectiveWarranty === 'InWarranty' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-500 border border-slate-300'}`}>
                          {effectiveWarranty === 'InWarranty' ? 'In Warranty' : 'Out of Warranty'}
                        </span>
                      ) : <span className="text-slate-300">Not set</span>}
                      {schedule && schedule.warrantyStatus === 'InWarranty' && effectiveWarranty === 'OutOfWarranty' && (
                        <div className="text-[9px] text-amber-600 font-mono mt-0.5">Auto-expired (km/age)</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{currentKm != null ? currentKm.toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {schedule?.lastServiceDate || '-'} {schedule?.lastServiceKm != null && <span className="text-slate-400">({schedule.lastServiceKm.toLocaleString('en-IN')} km)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{(schedule?.serviceIntervalKm ?? 10000).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{nextDueKm != null ? nextDueKm.toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{remaining != null ? remaining.toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2.5">{statusBadge(status)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => openEdit(regNo)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit schedule"><Edit2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 font-mono mt-3 flex items-center gap-1"><Gauge className="w-3 h-3" /> Current Odometer is always read live from Fuel Management's latest Closing KM - never entered manually here.</p>
      </div>

      {editingRegNo && form && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4 text-blue-400" /> Service Schedule - {editingRegNo}</h3>
              <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Last Service</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Date</label>
                    <DateInput value={form.lastServiceDate || ''} onChange={(e) => setForm(f => f && ({ ...f, lastServiceDate: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Odometer (km)</label>
                    <input type="number" value={form.lastServiceKm ?? ''} onChange={(e) => setForm(f => f && ({ ...f, lastServiceKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Service Interval (km)</label>
                  <input type="number" value={form.serviceIntervalKm} onChange={(e) => setForm(f => f && ({ ...f, serviceIntervalKm: parseInt(e.target.value) || 10000 }))}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">Default 10,000 km. Service Status: &gt;3000 km remaining = OK, 0-3000 = Due Soon, &le;0 = Overdue.</p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Warranty</span>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Status</label>
                  <select value={form.warrantyStatus} onChange={(e) => setForm(f => f && ({ ...f, warrantyStatus: e.target.value as any }))} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
                    <option value="InWarranty">In Warranty</option>
                    <option value="OutOfWarranty">Out of Warranty</option>
                  </select>
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                    Auto-forced to Out of Warranty once the vehicle crosses 3,00,000 km or 3 years from its Fleet &amp; Vehicles Registration Date, whichever first - this only ever floors towards Out of Warranty, it never auto-reverts a manual Out of Warranty back.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Warranty Expiry Date</label>
                    <DateInput value={form.warrantyExpiryDate || ''} onChange={(e) => setForm(f => f && ({ ...f, warrantyExpiryDate: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Warranty Expiry (km)</label>
                    <input type="number" value={form.warrantyExpiryKm ?? ''} onChange={(e) => setForm(f => f && ({ ...f, warrantyExpiryKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Remarks</label>
                <textarea value={form.remarks || ''} onChange={(e) => setForm(f => f && ({ ...f, remarks: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 text-slate-800" />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 sticky bottom-0">
              <button type="button" onClick={closeEdit} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">Cancel</button>
              <button type="button" onClick={handleSave} disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
                {isSubmitting ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
