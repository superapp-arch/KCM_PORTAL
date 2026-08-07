import React, { useState } from 'react';
import { Vehicle, VehicleMaintenanceProfile, MileageReport, MaintenanceRecord } from '../../types';
import { Truck, Search, Edit2, X, Plus, Trash2, ShieldCheck, Battery, CircleDot, Wrench, Check } from 'lucide-react';
import DateInput from '../DateInput';
import { computeServiceDueStatus, latestOdometerFor } from '../../utils/maintenanceDates';

interface VehicleProfilesTabProps {
  vehicles: Vehicle[];
  mileageReports: MileageReport[];
  records: MaintenanceRecord[];
  vehicleMaintenanceProfiles: VehicleMaintenanceProfile[];
  onAddVehicleMaintenanceProfile: (profile: Omit<VehicleMaintenanceProfile, 'id'> & { id: string }) => Promise<void>;
  onDeleteVehicleMaintenanceProfile: (id: string) => Promise<void>;
}

const DEFAULT_TOOLS = ['Jack', 'Jack Rod', 'Tommy Bar', 'Spanner'];

const emptyProfile = (regNo: string): VehicleMaintenanceProfile => ({
  id: regNo,
  regNo,
  warrantyStatus: 'Non-Warranty',
  tyres: [],
  toolsChecklist: DEFAULT_TOOLS.map(name => ({ name, present: false }))
});

export default function VehicleProfilesTab({
  vehicles, mileageReports, records, vehicleMaintenanceProfiles,
  onAddVehicleMaintenanceProfile, onDeleteVehicleMaintenanceProfile
}: VehicleProfilesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRegNo, setEditingRegNo] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleMaintenanceProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notif, setNotif] = useState<string | null>(null);

  const triggerNotif = (msg: string) => {
    setNotif(msg);
    setTimeout(() => setNotif(null), 4000);
  };

  const vehicleList = Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort();
  const filteredVehicles = vehicleList.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()));

  const profileFor = (regNo: string) => vehicleMaintenanceProfiles.find(p => p.regNo === regNo);

  const openEdit = (regNo: string) => {
    setEditingRegNo(regNo);
    setForm(profileFor(regNo) || emptyProfile(regNo));
  };

  const closeEdit = () => {
    setEditingRegNo(null);
    setForm(null);
  };

  const handleSave = async () => {
    if (!form) return;
    setIsSubmitting(true);
    try {
      await onAddVehicleMaintenanceProfile({ ...form, id: form.regNo });
      triggerNotif(`Maintenance profile saved for ${form.regNo}.`);
      closeEdit();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addTyreRow = () => setForm(f => f && ({ ...f, tyres: [...f.tyres, { brand: '', kmRun: 0, position: '' }] }));
  const removeTyreRow = (idx: number) => setForm(f => f && ({ ...f, tyres: f.tyres.filter((_, i) => i !== idx) }));
  const updateTyre = (idx: number, patch: Partial<{ brand: string; kmRun: number; position?: string }>) =>
    setForm(f => f && ({ ...f, tyres: f.tyres.map((t, i) => i === idx ? { ...t, ...patch } : t) }));

  const toggleTool = (idx: number) => setForm(f => f && ({ ...f, toolsChecklist: f.toolsChecklist.map((t, i) => i === idx ? { ...t, present: !t.present } : t) }));
  const removeTool = (idx: number) => setForm(f => f && ({ ...f, toolsChecklist: f.toolsChecklist.filter((_, i) => i !== idx) }));
  const [newToolName, setNewToolName] = useState('');
  const addTool = () => {
    if (!newToolName.trim()) return;
    setForm(f => f && ({ ...f, toolsChecklist: [...f.toolsChecklist, { name: newToolName.trim(), present: false }] }));
    setNewToolName('');
  };

  const dueStatusFor = (regNo: string, profile: VehicleMaintenanceProfile | undefined) => {
    if (!profile) return null;
    const vehicleRecords = records.filter(r => (r.regNo || '').trim().toUpperCase() === regNo).sort((a, b) => a.date < b.date ? 1 : -1);
    const currentKm = latestOdometerFor(regNo, mileageReports);
    return computeServiceDueStatus(vehicleRecords[0]?.date, profile.serviceIntervalDays, profile.serviceLastOdometerKm, currentKm, profile.serviceIntervalKm);
  };

  const alignmentStatusFor = (regNo: string, profile: VehicleMaintenanceProfile | undefined) => {
    if (!profile) return null;
    const currentKm = latestOdometerFor(regNo, mileageReports);
    return computeServiceDueStatus(profile.wheelAlignmentLastDate, profile.wheelAlignmentIntervalDays, profile.wheelAlignmentLastOdometerKm, currentKm, profile.wheelAlignmentIntervalKm);
  };

  const statusBadge = (status: 'ok' | 'due-soon' | 'overdue' | null) => {
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

  return (
    <div className="space-y-4">
      {notif && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">{notif}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-slate-600" /> Vehicle Maintenance Profiles
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
                <th className="px-3 py-2.5">Service Due</th>
                <th className="px-3 py-2.5">Alignment Due</th>
                <th className="px-3 py-2.5">Battery No.</th>
                <th className="px-3 py-2.5">Tyres</th>
                <th className="px-3 py-2.5">Tools Present</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredVehicles.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400 font-mono">NO VEHICLES FOUND.</td></tr>
              ) : filteredVehicles.map(regNo => {
                const profile = profileFor(regNo);
                return (
                  <tr key={regNo} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{regNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {profile ? (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${profile.warrantyStatus === 'Under Warranty' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-500 border border-slate-300'}`}>
                          {profile.warrantyStatus}
                        </span>
                      ) : <span className="text-slate-300">Not set</span>}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(dueStatusFor(regNo, profile))}</td>
                    <td className="px-3 py-2.5">{statusBadge(alignmentStatusFor(regNo, profile))}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">{profile?.batteryNumber || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{profile?.tyres.length ? `${profile.tyres.length} tracked` : '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {profile?.toolsChecklist.length ? `${profile.toolsChecklist.filter(t => t.present).length}/${profile.toolsChecklist.length}` : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => openEdit(regNo)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit profile"><Edit2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingRegNo && form && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Truck className="w-4 h-4 text-blue-400" /> Maintenance Profile - {editingRegNo}</h3>
              <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Warranty + Battery */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Warranty Status</label>
                  <select value={form.warrantyStatus} onChange={(e) => setForm(f => f && ({ ...f, warrantyStatus: e.target.value as any }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
                    <option value="Under Warranty">Under Warranty</option>
                    <option value="Non-Warranty">Non-Warranty</option>
                  </select>
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">Even under warranty, scheduled service is still mandatory.</p>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1 flex items-center gap-1"><Battery className="w-3.5 h-3.5" /> Battery Number</label>
                  <input type="text" value={form.batteryNumber || ''} onChange={(e) => setForm(f => f && ({ ...f, batteryNumber: e.target.value }))} autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
              </div>

              {/* Service interval */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Service Interval (either/both - whichever comes first)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Every (days)</label>
                    <input type="number" value={form.serviceIntervalDays ?? ''} onChange={(e) => setForm(f => f && ({ ...f, serviceIntervalDays: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Every (km)</label>
                    <input type="number" value={form.serviceIntervalKm ?? ''} onChange={(e) => setForm(f => f && ({ ...f, serviceIntervalKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                </div>
                {form.serviceIntervalKm != null && (
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Odometer at last service (km)</label>
                    <input type="number" value={form.serviceLastOdometerKm ?? ''} onChange={(e) => setForm(f => f && ({ ...f, serviceLastOdometerKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                )}
              </div>

              {/* Wheel alignment */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><CircleDot className="w-3.5 h-3.5" /> Wheel Alignment</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Last Alignment Date</label>
                    <DateInput value={form.wheelAlignmentLastDate || ''} onChange={(e) => setForm(f => f && ({ ...f, wheelAlignmentLastDate: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Odometer at last alignment (km)</label>
                    <input type="number" value={form.wheelAlignmentLastOdometerKm ?? ''} onChange={(e) => setForm(f => f && ({ ...f, wheelAlignmentLastOdometerKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Every (days)</label>
                    <input type="number" value={form.wheelAlignmentIntervalDays ?? ''} onChange={(e) => setForm(f => f && ({ ...f, wheelAlignmentIntervalDays: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Every (km)</label>
                    <input type="number" value={form.wheelAlignmentIntervalKm ?? ''} onChange={(e) => setForm(f => f && ({ ...f, wheelAlignmentIntervalKm: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  </div>
                </div>
              </div>

              {/* Tyres */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Tyre Entries</span>
                  <button type="button" onClick={addTyreRow} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer">+ Add Tyre</button>
                </div>
                {form.tyres.length === 0 ? (
                  <p className="text-slate-400 text-[11px]">No tyres tracked yet.</p>
                ) : form.tyres.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input type="text" placeholder="Position (e.g. Front Left)" value={t.position || ''} onChange={(e) => updateTyre(idx, { position: e.target.value })}
                      className="w-32 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-800" />
                    <input type="text" placeholder="Brand/Company" value={t.brand} onChange={(e) => updateTyre(idx, { brand: e.target.value })}
                      className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-800" />
                    <input type="number" placeholder="KM run" value={t.kmRun || ''} onChange={(e) => updateTyre(idx, { kmRun: parseInt(e.target.value) || 0 })}
                      className="w-24 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-mono text-slate-800" />
                    <button type="button" onClick={() => removeTyreRow(idx)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>

              {/* Tools checklist */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> Tools Checklist</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {form.toolsChecklist.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="text-slate-700 font-semibold">{t.name}</span>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => toggleTool(idx)}
                          className={`w-5 h-5 rounded flex items-center justify-center cursor-pointer border ${t.present ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent'}`}>
                          <Check className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={() => removeTool(idx)} className="text-rose-300 hover:text-rose-500 cursor-pointer"><X className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 pt-1">
                  <input type="text" placeholder="Add another tool" value={newToolName} onChange={(e) => setNewToolName(e.target.value)} autoComplete="off"
                    className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-800" />
                  <button type="button" onClick={addTool} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-3 text-[10px] font-bold uppercase cursor-pointer flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 sticky bottom-0">
              <button type="button" onClick={closeEdit} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">Cancel</button>
              <button type="button" onClick={handleSave} disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
                {isSubmitting ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
