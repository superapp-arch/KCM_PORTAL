// GPS / Live Tracking (2026-09-19, WheelsEye integration prep - see
// docs/wheelseye-integration.md). Pure visibility/monitoring screen - reads
// live GPS data through KCM's own /api/gps/* routes (which themselves talk
// to a GpsProvider, never a specific provider's API directly - see
// src/services/gps/). Nothing here writes to or reads from Fuel
// Management/Mileage/Vehicle Mileage Master; GPS distance is never used
// for KCM's own Mileage calculations, by direct instruction.
import React, { useEffect, useMemo, useState } from 'react';
import { User, Vehicle } from '../types';
import { authFetch } from '../authFetch';
import {
  GpsVehicle, GpsDevice, GpsProviderStatus, GpsFleetSummary, GpsRouteHistory, GpsVehicleMapping
} from '../services/gps/gpsTypes';
import {
  Satellite, Search, X, Gauge, Zap, ZapOff, Wifi, WifiOff, MapPin, Clock,
  Navigation, AlertTriangle, Loader2, ChevronRight, Radio, Link2, Trash2, Plus
} from 'lucide-react';

interface Props {
  user: User;
  vehicles: Vehicle[];
}

type MovementFilter = 'All' | 'RUNNING' | 'STOPPED' | 'NO_SIGNAL';
type SortKey = 'vehicle' | 'speed' | 'updated';
type Tab = 'live' | 'devices' | 'mapping';

const regNoOf = (v: Vehicle): string => (v['Reg. No.'] || v.regNo || v.id || '').toString();

function StatusPill({ status }: { status: GpsVehicle['movementStatus'] }) {
  const map: Record<GpsVehicle['movementStatus'], string> = {
    RUNNING: 'bg-emerald-100 text-emerald-700',
    STOPPED: 'bg-amber-100 text-amber-700',
    NO_SIGNAL: 'bg-rose-100 text-rose-700',
    UNKNOWN: 'bg-slate-200 text-slate-500'
  };
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${map[status]}`}>{status.replace('_', ' ')}</span>;
}

function fmtTime(iso?: string): string {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return '-'; }
}

function VehicleCard({ v, selected, onClick }: { v: GpsVehicle; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${selected ? 'border-cyan-400 bg-cyan-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono font-black text-slate-900 text-sm">{v.kcmVehicleNumber}</span>
        <StatusPill status={v.movementStatus} />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono flex-wrap">
        <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> {v.speedKmh != null ? `${v.speedKmh} km/h` : '-'}</span>
        <span className="flex items-center gap-1">{v.ignition === 'ON' ? <Zap className="w-3 h-3 text-emerald-500" /> : <ZapOff className="w-3 h-3 text-slate-400" />} {v.ignition || 'UNKNOWN'}</span>
        <span className="flex items-center gap-1">{v.connectionStatus === 'CONNECTED' ? <Wifi className="w-3 h-3 text-emerald-500" /> : <WifiOff className="w-3 h-3 text-rose-400" />}</span>
      </div>
      {v.currentAddress && (
        <p className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" /> {v.currentAddress}</p>
      )}
      <div className="flex items-center justify-between mt-1.5 text-[9px] text-slate-400 font-mono">
        <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {fmtTime(v.lastUpdatedAt)}</span>
        {v.todayDistanceKm != null && <span>Today: {v.todayDistanceKm} km</span>}
      </div>
    </button>
  );
}

function RouteHistoryPanel({ vehicleNumber }: { vehicleNumber: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [history, setHistory] = useState<GpsRouteHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    authFetch(`/api/gps/vehicles/${encodeURIComponent(vehicleNumber)}/history?date=${date}`)
      .then(async r => {
        if (cancelled) return;
        if (r.status === 404) { setHistory(null); setNotFound(true); return; }
        if (r.ok) setHistory(await r.json());
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vehicleNumber, date]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5"><Navigation className="w-3.5 h-3.5" /> Route History</h4>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs" />
      </div>
      {loading && <div className="flex items-center gap-2 text-xs text-slate-400 font-mono"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>}
      {!loading && notFound && <p className="text-xs text-slate-400 font-mono p-4 text-center bg-slate-50 rounded-lg">No Route History for this vehicle/date yet.</p>}
      {!loading && history && (
        <div className="space-y-2">
          {history.totalDistanceKm != null && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Distance</p><p className="text-sm font-black text-slate-800">{history.totalDistanceKm} km</p></div>
              <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Running</p><p className="text-sm font-black text-emerald-700">{history.totalRunningMinutes ?? '-'} min</p></div>
              <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Stopped</p><p className="text-sm font-black text-amber-700">{history.totalStoppedMinutes ?? '-'} min</p></div>
            </div>
          )}
          <div className="space-y-1.5">
            {history.segments.map((seg, i) => (
              <div key={i} className={`p-2 rounded-lg border text-[11px] font-mono ${seg.type === 'RUNNING' ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-black uppercase text-[9px] ${seg.type === 'RUNNING' ? 'text-emerald-700' : 'text-amber-700'}`}>{seg.type}</span>
                  <span className="text-slate-500">{fmtTime(seg.startTime)} → {seg.endTime ? fmtTime(seg.endTime) : 'now'}</span>
                </div>
                <p className="text-slate-600 mt-0.5">
                  {seg.type === 'RUNNING' ? `Covered ${seg.distanceKm ?? '-'} km` : `Stopped for ${seg.durationMinutes ?? '-'} min`}
                  {seg.startAddress ? ` - ${seg.startAddress}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VehicleDetailPanel({ vehicle, onClose }: { vehicle: GpsVehicle; onClose: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono font-black text-slate-900">{vehicle.kcmVehicleNumber}</h3>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4 text-slate-400" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Status</p><StatusPill status={vehicle.movementStatus} /></div>
        <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Speed</p><p className="font-bold text-slate-800">{vehicle.speedKmh != null ? `${vehicle.speedKmh} km/h` : '-'}</p></div>
        <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Ignition</p><p className="font-bold text-slate-800">{vehicle.ignition || 'UNKNOWN'}</p></div>
        <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Connectivity</p><p className="font-bold text-slate-800">{vehicle.connectionStatus}</p></div>
        <div className="bg-slate-50 rounded-lg p-2 col-span-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Current Location</p><p className="font-bold text-slate-800">{vehicle.currentAddress || 'Not available'}</p></div>
        <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Last Updated</p><p className="font-bold text-slate-800">{fmtTime(vehicle.lastUpdatedAt)}</p></div>
        <div className="bg-slate-50 rounded-lg p-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Today's Distance</p><p className="font-bold text-slate-800">{vehicle.todayDistanceKm != null ? `${vehicle.todayDistanceKm} km` : '-'}</p></div>
        {vehicle.driverName && <div className="bg-slate-50 rounded-lg p-2 col-span-2"><p className="text-[9px] text-slate-400 uppercase font-bold">Driver</p><p className="font-bold text-slate-800">{vehicle.driverName}</p></div>}
      </div>
      <div className="border-t border-slate-100 pt-3">
        <RouteHistoryPanel vehicleNumber={vehicle.kcmVehicleNumber} />
      </div>
    </div>
  );
}

function MappingTab({ vehicles, canWrite }: { vehicles: Vehicle[]; canWrite: boolean }) {
  const [mappings, setMappings] = useState<GpsVehicleMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ kcmVehicleNumber: '', providerVehicleId: '', providerDeviceId: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    authFetch('/api/gps/vehicle-mappings').then(r => r.ok ? r.json() : []).then(setMappings).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.kcmVehicleNumber.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/gps/vehicle-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) { setForm({ kcmVehicleNumber: '', providerVehicleId: '', providerDeviceId: '', notes: '' }); load(); }
    } finally { setSaving(false); }
  };
  const handleDelete = async (id: string) => {
    await authFetch(`/api/gps/vehicle-mappings/${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-[11px] text-cyan-800 flex items-start gap-2">
        <Link2 className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Register which WheelsEye vehicle/device identifier corresponds to each KCM vehicle, ahead of the real API connection - useful to prepare now, has no effect until a real provider is configured.</span>
      </div>
      {canWrite && (
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-5 gap-2 bg-white p-3 rounded-xl border border-slate-200">
          <select required value={form.kcmVehicleNumber} onChange={e => setForm(f => ({ ...f, kcmVehicleNumber: e.target.value }))} className="bg-white border border-slate-200 rounded-lg p-2 font-mono text-xs">
            <option value="">KCM Vehicle...</option>
            {vehicles.filter(v => v.active !== false).map(v => <option key={regNoOf(v)} value={regNoOf(v)}>{regNoOf(v)}</option>)}
          </select>
          <input placeholder="Provider Vehicle ID" value={form.providerVehicleId} onChange={e => setForm(f => ({ ...f, providerVehicleId: e.target.value }))} className="bg-white border border-slate-200 rounded-lg p-2 font-mono text-xs" />
          <input placeholder="Provider Device ID / IMEI" value={form.providerDeviceId} onChange={e => setForm(f => ({ ...f, providerDeviceId: e.target.value }))} className="bg-white border border-slate-200 rounded-lg p-2 font-mono text-xs" />
          <input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="bg-white border border-slate-200 rounded-lg p-2 font-mono text-xs" />
          <button type="submit" disabled={saving} className="flex items-center justify-center gap-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg p-2 text-xs font-bold cursor-pointer disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Add / Update</button>
        </form>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>
      ) : mappings.length === 0 ? (
        <p className="text-xs text-slate-400 font-mono p-6 text-center bg-white rounded-xl border border-slate-200">No vehicle mappings registered yet.</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
          <table className="w-full text-[11px] border-collapse">
            <thead><tr className="bg-slate-50">{['KCM Vehicle', 'Provider Vehicle ID', 'Provider Device ID', 'Notes', ''].map(h => <th key={h} className="text-left px-3 py-2 font-bold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono font-bold">{m.kcmVehicleNumber}</td>
                  <td className="px-3 py-2 font-mono">{m.providerVehicleId || '-'}</td>
                  <td className="px-3 py-2 font-mono">{m.providerDeviceId || '-'}</td>
                  <td className="px-3 py-2 text-slate-500">{m.notes || '-'}</td>
                  <td className="px-3 py-2 text-right">{canWrite && <button type="button" onClick={() => handleDelete(m.id)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function GpsLiveTracking({ user, vehicles }: Props) {
  const canWrite = user.department === 'super_admin' || user.department === 'vehicle_manager' ||
    ['bhagya@kcmlogistics.in', 'finance@kcmlogistics.in', 'vinod@kcmlogistics.in'].includes(user.email || '');

  const [tab, setTab] = useState<Tab>('live');
  const [status, setStatus] = useState<GpsProviderStatus | null>(null);
  const [gpsVehicles, setGpsVehicles] = useState<GpsVehicle[]>([]);
  const [summary, setSummary] = useState<GpsFleetSummary>({ total: 0, running: 0, stopped: 0, noSignal: 0, unknown: 0 });
  const [devices, setDevices] = useState<GpsDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MovementFilter>('All');
  const [sortKey, setSortKey] = useState<SortKey>('vehicle');
  const [selected, setSelected] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      authFetch('/api/gps/status').then(r => r.ok ? r.json() : null),
      authFetch('/api/gps/vehicles').then(r => r.ok ? r.json() : { vehicles: [], summary: { total: 0, running: 0, stopped: 0, noSignal: 0, unknown: 0 } }),
      authFetch('/api/gps/devices').then(r => r.ok ? r.json() : [])
    ]).then(([statusRes, vehiclesRes, devicesRes]) => {
      setStatus(statusRes);
      setGpsVehicles(Array.isArray(vehiclesRes?.vehicles) ? vehiclesRes.vehicles : []);
      setSummary(vehiclesRes?.summary || { total: 0, running: 0, stopped: 0, noSignal: 0, unknown: 0 });
      setDevices(Array.isArray(devicesRes) ? devicesRes : []);
    }).catch(err => console.error('Failed to load GPS data:', err))
      .finally(() => setLoading(false));
  };

  // Initial load, then a light periodic refresh - but ONLY while a real
  // provider is actually configured (see status.configured). Polling an
  // unconfigured/none provider would just be wasted requests forever, and
  // there is nothing "live" to refresh in that state anyway.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!status?.configured) return;
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.configured]);

  const filteredVehicles = useMemo(() => {
    let list = gpsVehicles;
    if (filter !== 'All') list = list.filter(v => v.movementStatus === filter);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(v => v.kcmVehicleNumber.toUpperCase().includes(q));
    }
    const sorted = [...list];
    if (sortKey === 'vehicle') sorted.sort((a, b) => a.kcmVehicleNumber.localeCompare(b.kcmVehicleNumber));
    else if (sortKey === 'speed') sorted.sort((a, b) => (b.speedKmh || 0) - (a.speedKmh || 0));
    else if (sortKey === 'updated') sorted.sort((a, b) => (b.lastUpdatedAt || '').localeCompare(a.lastUpdatedAt || ''));
    return sorted;
  }, [gpsVehicles, filter, search, sortKey]);

  const selectedVehicle = selected ? gpsVehicles.find(v => v.kcmVehicleNumber === selected) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Satellite className="text-cyan-600 w-5 h-5" /> GPS / Live Tracking
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Vehicle visibility &amp; monitoring - separate from Fuel Management/Mileage, never used for KCM Mileage calculations.</p>
        </div>
      </div>

      {status && !status.configured && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">GPS Integration - Status: Not Configured</p>
            <p className="text-xs text-amber-700 mt-1">Provider: WheelsEye</p>
            <p className="text-xs text-amber-700 mt-1">{status.message}</p>
          </div>
        </div>
      )}
      {status && status.configured && status.provider === 'mock' && (
        <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-[11px] text-purple-700 font-bold uppercase tracking-wider text-center">
          DEMO / MOCK DATA - development only, not a real GPS feed
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-slate-200">
        {([['live', 'Live Vehicles'], ['devices', 'Devices'], ['mapping', 'Vehicle Mapping']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`px-4 py-2 text-xs font-bold cursor-pointer border-b-2 -mb-px ${tab === key ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{label}</button>
        ))}
      </div>

      {tab === 'live' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Full class strings kept literal (not template-built from
                `tone`) - Tailwind's build-time scanner only picks up
                classes it can find as complete strings in the source. */}
            {([
              ['All', summary.total, 'bg-slate-50 border-slate-300'],
              ['RUNNING', summary.running, 'bg-emerald-50 border-emerald-300'],
              ['STOPPED', summary.stopped, 'bg-amber-50 border-amber-300'],
              ['NO_SIGNAL', summary.noSignal, 'bg-rose-50 border-rose-300']
            ] as const).map(([key, count, selectedClasses]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as MovementFilter)}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${filter === key ? selectedClasses : 'bg-white border-slate-200 hover:bg-slate-50'}`}
              >
                <p className="text-[9px] text-slate-400 uppercase font-bold">{key === 'All' ? 'All Vehicles' : key.replace('_', ' ')}</p>
                <p className="text-lg font-black text-slate-800">{count}</p>
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Vehicle Number..." className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm font-mono" />
            </div>
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold">
              <option value="vehicle">Sort: Vehicle No.</option>
              <option value="speed">Sort: Speed</option>
              <option value="updated">Sort: Last Updated</option>
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-100 border border-dashed border-slate-300 rounded-2xl h-64 flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <MapPin className="w-6 h-6 mx-auto mb-1.5" />
                  <p className="text-xs font-bold">Map view</p>
                  <p className="text-[10px] font-mono">Available once a real GPS provider is connected</p>
                </div>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading GPS data...</div>
              ) : filteredVehicles.length === 0 ? (
                <p className="text-xs text-slate-400 font-mono p-8 text-center bg-white rounded-xl border border-slate-200">
                  {status?.configured ? 'No vehicles match this filter.' : 'No GPS data - configure a provider to see live vehicles here.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredVehicles.map(v => (
                    <VehicleCard key={v.kcmVehicleNumber} v={v} selected={selected === v.kcmVehicleNumber} onClick={() => setSelected(v.kcmVehicleNumber)} />
                  ))}
                </div>
              )}
            </div>
            <div>
              {selectedVehicle ? (
                <VehicleDetailPanel vehicle={selectedVehicle} onClose={() => setSelected(null)} />
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 border-dashed p-8 text-center text-slate-400">
                  <ChevronRight className="w-5 h-5 mx-auto mb-1.5" />
                  <p className="text-xs font-mono">Select a vehicle to see its details and Route History</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'devices' && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>
          ) : devices.length === 0 ? (
            <p className="text-xs text-slate-400 font-mono p-8 text-center bg-white rounded-xl border border-slate-200 flex flex-col items-center gap-2">
              <Radio className="w-5 h-5 text-slate-300" />
              {status?.configured ? 'No devices reported by the provider.' : 'No device data - configure a GPS provider to see devices here.'}
            </p>
          ) : (
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
              <table className="w-full text-[11px] border-collapse">
                <thead><tr className="bg-slate-50">{['Vehicle', 'Device Model', 'SIM', 'Install Date', 'Connectivity', 'GSM %', 'Battery %', 'Last Location'].map(h => <th key={h} className="text-left px-3 py-2 font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {devices.map((d, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono font-bold">{d.kcmVehicleNumber || '-'}</td>
                      <td className="px-3 py-2">{d.deviceModel || '-'}</td>
                      <td className="px-3 py-2 font-mono">{d.simNumber || '-'}</td>
                      <td className="px-3 py-2 font-mono">{d.installationDate || '-'}</td>
                      <td className="px-3 py-2">{d.connectionStatus || '-'}</td>
                      <td className="px-3 py-2 font-mono">{d.gsmSignalPercent ?? '-'}</td>
                      <td className="px-3 py-2 font-mono">{d.batteryPercent ?? '-'}</td>
                      <td className="px-3 py-2 text-slate-500">{d.lastLocation || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'mapping' && <MappingTab vehicles={vehicles} canWrite={canWrite} />}
    </div>
  );
}
