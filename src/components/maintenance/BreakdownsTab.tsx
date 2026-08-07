import React, { useState, useEffect } from 'react';
import {
  BreakdownReport, Vehicle, DriverEmployee, MaintenanceServiceStation, MaintenanceRecord, MaintenanceWorkItem
} from '../../types';
import { AlertTriangle, Plus, X, Wrench, CheckCircle2, Trash2 } from 'lucide-react';
import DateInput from '../DateInput';

interface BreakdownsTabProps {
  breakdownReports: BreakdownReport[];
  onAddBreakdownReport: (report: Omit<BreakdownReport, 'id'>) => Promise<void>;
  onUpdateBreakdownReport: (id: string, report: Partial<BreakdownReport>) => Promise<void>;
  onDeleteBreakdownReport: (id: string) => Promise<void>;
  vehicles: Vehicle[];
  drivers: DriverEmployee[];
  serviceStations: MaintenanceServiceStation[];
  onAddServiceStation: (station: Omit<MaintenanceServiceStation, 'id'>) => Promise<void>;
  onAddRecord: (record: Omit<MaintenanceRecord, 'id'>) => Promise<void>;
}

export default function BreakdownsTab({
  breakdownReports, onAddBreakdownReport, onUpdateBreakdownReport, onDeleteBreakdownReport,
  vehicles, drivers, serviceStations, onAddServiceStation, onAddRecord
}: BreakdownsTabProps) {
  const [notif, setNotif] = useState<string | null>(null);
  const triggerNotif = (msg: string) => { setNotif(msg); setTimeout(() => setNotif(null), 4000); };

  const vehicleList = Array.from(new Set(vehicles.map(v => v.regNo || v['Reg. No.'] || '').filter(Boolean))).sort();
  const driverNameList = Array.from(new Set(drivers.map(d => d.name).filter(Boolean))).sort();

  // Report Breakdown form
  const [showReportForm, setShowReportForm] = useState(false);
  const [regNo, setRegNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverId, setDriverId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const matchedDriver = (() => {
    const names = driverName.split('/').map(n => n.trim()).filter(Boolean);
    if (names.length !== 1) return undefined;
    const matches = drivers.filter(d => (d.name || '').trim().toLowerCase() === names[0].toLowerCase());
    return matches.length === 1 ? matches[0] : undefined;
  })();
  useEffect(() => { if (matchedDriver) setDriverId(matchedDriver.id); }, [matchedDriver]);

  const resetReportForm = () => {
    setRegNo(''); setDate(new Date().toISOString().slice(0, 10)); setLocation(''); setDescription('');
    setDriverName(''); setDriverId(''); setShowReportForm(false);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNo.trim()) { triggerNotif('Vehicle Number is required.'); return; }
    setIsSubmitting(true);
    try {
      await onAddBreakdownReport({
        regNo: regNo.trim().toUpperCase(), date, location: location.trim(), description: description.trim(),
        driverName: driverName.trim() || undefined, driverId: driverId.trim() || undefined, status: 'Open'
      });
      triggerNotif('🚨 Breakdown reported.');
      resetReportForm();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReport = async (b: BreakdownReport) => {
    if (!confirm(`Delete the breakdown report for ${b.regNo}?`)) return;
    await onDeleteBreakdownReport(b.id);
    triggerNotif('Breakdown report deleted.');
  };

  // Log Workshop Visit modal - links a new MaintenanceRecord (breakdownReportId
  // set) back to the breakdown it resolves, then marks it Resolved.
  const [visitFor, setVisitFor] = useState<BreakdownReport | null>(null);
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [visitStationId, setVisitStationId] = useState('');
  const [newStationName, setNewStationName] = useState('');
  const [visitWorkItems, setVisitWorkItems] = useState<MaintenanceWorkItem[]>([{ description: '', cost: 0 }]);
  const [visitSubmitting, setVisitSubmitting] = useState(false);

  const openVisitModal = (b: BreakdownReport) => {
    setVisitFor(b);
    setVisitDate(new Date().toISOString().slice(0, 10));
    setVisitStationId('');
    setVisitWorkItems([{ description: b.description || '', cost: 0 }]);
  };

  const updateVisitItem = (idx: number, patch: Partial<MaintenanceWorkItem>) =>
    setVisitWorkItems(items => items.map((w, i) => i === idx ? { ...w, ...patch } : w));
  const addVisitItem = () => setVisitWorkItems(items => [...items, { description: '', cost: 0 }]);
  const removeVisitItem = (idx: number) => setVisitWorkItems(items => items.filter((_, i) => i !== idx));

  const handleAddStationInline = async () => {
    if (!newStationName.trim()) return;
    await onAddServiceStation({ name: newStationName.trim() });
    setNewStationName('');
  };

  const handleLogWorkshopVisit = async () => {
    if (!visitFor) return;
    const validItems = visitWorkItems.filter(w => w.description.trim() || w.cost);
    if (!visitStationId || validItems.length === 0) {
      triggerNotif('Pick a Service Station and at least one work item.');
      return;
    }
    setVisitSubmitting(true);
    try {
      const station = serviceStations.find(s => s.id === visitStationId);
      const workshopVisitId = String(Date.now());
      await onAddRecord({
        id: workshopVisitId,
        regNo: visitFor.regNo,
        date: visitDate,
        serviceType: 'Breakdown Repair',
        description: validItems.map(w => w.description).filter(Boolean).join('; '),
        cost: validItems.reduce((s, w) => s + (w.cost || 0), 0),
        garageName: station?.name || '',
        serviceStationId: visitStationId,
        workItems: validItems,
        driverName: visitFor.driverName,
        driverId: visitFor.driverId,
        breakdownReportId: visitFor.id
      } as any);
      await onUpdateBreakdownReport(visitFor.id, { status: 'Resolved', workshopVisitId });
      triggerNotif('🔧 Workshop visit logged - breakdown marked resolved.');
      setVisitFor(null);
    } catch (err) {
      console.error(err);
    } finally {
      setVisitSubmitting(false);
    }
  };

  const openReports = breakdownReports.filter(b => b.status === 'Open').sort((a, b) => a.date < b.date ? 1 : -1);
  const resolvedReports = breakdownReports.filter(b => b.status === 'Resolved').sort((a, b) => a.date < b.date ? 1 : -1);

  return (
    <div className="space-y-4">
      {notif && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />{notif}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-600" /> Breakdown Reports
          </h2>
          <button onClick={() => setShowReportForm(true)} className="bg-gradient-to-r from-rose-600 to-slate-800 hover:shadow-md text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer">
            <Plus className="w-4 h-4" /> Report Breakdown
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Reg. No.</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5">Driver</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {breakdownReports.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400 font-mono">NO BREAKDOWN REPORTS LOGGED.</td></tr>
              ) : [...openReports, ...resolvedReports].map(b => (
                <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{b.date}</td>
                  <td className="px-3 py-2.5 font-bold font-mono text-slate-900 uppercase whitespace-nowrap">{b.regNo}</td>
                  <td className="px-3 py-2.5 text-slate-600">{b.location || '-'}</td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[200px] truncate" title={b.description}>{b.description || '-'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{b.driverName || '-'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${b.status === 'Open' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {b.status === 'Open' && (
                        <button onClick={() => openVisitModal(b)} className="text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer flex items-center gap-1">
                          <Wrench className="w-3 h-3" /> Log Workshop Visit
                        </button>
                      )}
                      <button onClick={() => handleDeleteReport(b)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report Breakdown modal */}
      {showReportForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full">
            <div className="p-4 bg-gradient-to-r from-rose-700 to-slate-900 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Report Breakdown</h3>
              <button onClick={resetReportForm} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleReportSubmit} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Vehicle Registration Number *</label>
                <input type="text" required list="breakdown-vehicles-datalist" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} autoComplete="off"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold uppercase text-slate-800" />
                <datalist id="breakdown-vehicles-datalist">{vehicleList.map(v => <option key={v} value={v} />)}</datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Date *</label>
                  <DateInput required value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Location</label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} autoComplete="off" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Driver Name</label>
                  <input type="text" list="breakdown-driver-names-datalist" value={driverName} onChange={(e) => setDriverName(e.target.value)} autoComplete="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800" />
                  <datalist id="breakdown-driver-names-datalist">{driverNameList.map((n, i) => <option key={i} value={n} />)}</datalist>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Driver ID</label>
                  <input type="text" value={driverId} onChange={(e) => setDriverId(e.target.value)} autoComplete="off" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-16 text-slate-800" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={resetReportForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-rose-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {isSubmitting ? 'Saving...' : 'Log Breakdown'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Workshop Visit modal */}
      {visitFor && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-teal-700 to-slate-900 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Log Workshop Visit - {visitFor.regNo}</h3>
              <button onClick={() => setVisitFor(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Visit Date</label>
                <DateInput value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Authorised Service Station *</label>
                <select value={visitStationId} onChange={(e) => setVisitStationId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold">
                  <option value="">Select station...</option>
                  {serviceStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="flex gap-1.5 mt-1.5">
                  <input type="text" placeholder="Or add a new station" value={newStationName} onChange={(e) => setNewStationName(e.target.value)} autoComplete="off"
                    className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-800" />
                  <button type="button" onClick={handleAddStationInline} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-3 text-[10px] font-bold uppercase cursor-pointer">Save</button>
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Work Items *</span>
                  <button type="button" onClick={addVisitItem} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer">+ Add Item</button>
                </div>
                {visitWorkItems.map((w, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input type="text" placeholder="Work done" value={w.description} onChange={(e) => updateVisitItem(idx, { description: e.target.value })} autoComplete="off"
                      className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-800" />
                    <input type="number" step="0.01" placeholder="₹" value={w.cost || ''} onChange={(e) => updateVisitItem(idx, { cost: parseFloat(e.target.value) || 0 })}
                      className="w-24 bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-mono font-bold text-slate-800" />
                    {visitWorkItems.length > 1 && (
                      <button type="button" onClick={() => removeVisitItem(idx)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-mono">
                  <span className="text-[9px] text-slate-400 uppercase font-bold">Total Cost</span>
                  <span className="text-sm font-black text-slate-800">₹{visitWorkItems.reduce((s, w) => s + (w.cost || 0), 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
              <button type="button" onClick={() => setVisitFor(null)} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
              <button type="button" onClick={handleLogWorkshopVisit} disabled={visitSubmitting}
                className="flex-1 bg-gradient-to-r from-teal-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                {visitSubmitting ? 'Saving...' : 'Log Visit & Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
