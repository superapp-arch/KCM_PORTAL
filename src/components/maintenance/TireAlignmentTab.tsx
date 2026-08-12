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

// Fixed positions for the bulk "one vehicle, all tires" entry screen - not
// user-typed. The last two are optional (dual-rear-wheel vehicles only);
// since Fleet & Vehicles has no field recording a vehicle's axle/tire
// configuration, both are always shown and simply left blank for vehicles
// that don't have them (confirmed with the user).
const REQUIRED_POSITIONS = ['Front Left', 'Front Right', 'Back Right 1', 'Back Left 1'];
const OPTIONAL_POSITIONS = ['Back Right 2', 'Back Left 2'];
const ALL_POSITIONS = [...REQUIRED_POSITIONS, ...OPTIONAL_POSITIONS];

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

interface TireRowForm {
  position: string;
  existingId?: string;
  existingSerial?: string;
  tireBrand: string;
  tireSerialNumber: string;
  installedDate: string;
  installedKm: string;
  lastAlignmentKm: string;
  error?: string;
}

const emptyRow = (position: string): TireRowForm => ({
  position, tireBrand: '', tireSerialNumber: '', installedDate: '', installedKm: '', lastAlignmentKm: ''
});

export default function TireAlignmentTab({
  vehicles, mileageReports, tireRecords, onSaveTireRecord, onDeleteTireRecord
}: TireAlignmentTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [notif, setNotif] = useState<string | null>(null);
  const [showAlignmentPopup, setShowAlignmentPopup] = useState(false);

  const triggerNotif = (msg: string) => { setNotif(msg); setTimeout(() => setNotif(null), 4000); };

  const vehicleList = Array.from(new Set(vehicles.map(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase()).filter(Boolean))).sort();

  // Tracking table only ever shows the currently-fitted tire per position -
  // replaced/removed tires stay on record (see isCurrent) but out of this
  // primary view, same spirit as BatteryRecord's isCurrent-scoped table.
  const rows = useMemo(() => {
    return tireRecords
      .filter(t => t.isCurrent !== false)
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

  // --- Bulk "one vehicle, all tires, one save" configuration form ---
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [vehicleInput, setVehicleInput] = useState('');
  const [configRows, setConfigRows] = useState<TireRowForm[]>(ALL_POSITIONS.map(emptyRow));
  const [configSubmitting, setConfigSubmitting] = useState(false);

  // Only a real, exact (case-insensitive) match against Fleet & Vehicles
  // counts as "selected" - typing something that doesn't match a real
  // vehicle just leaves the rest of the form unavailable, since this is
  // meant to be a searchable-select against that master list, not free text.
  const matchedVehicle = vehicleList.find(v => v.toLowerCase() === vehicleInput.trim().toLowerCase());
  // Single shared read of the vehicle's current odometer (Fuel Management's
  // latest Closing KM, same source every other Fleet Maintenance figure
  // uses) - computed once per vehicle selection and reused by every row's
  // KM Run/Remaining calc below, so they can never drift apart from
  // separate per-row lookups.
  const currentOdometer = matchedVehicle ? latestOdometerFor(matchedVehicle, mileageReports) : undefined;

  useEffect(() => {
    if (!matchedVehicle) { setConfigRows(ALL_POSITIONS.map(emptyRow)); return; }
    const currentTiresForVehicle = tireRecords.filter(t => t.regNo === matchedVehicle && t.isCurrent !== false);
    setConfigRows(ALL_POSITIONS.map(pos => {
      const existing = currentTiresForVehicle.find(t => t.position === pos);
      if (!existing) return emptyRow(pos);
      return {
        position: pos,
        existingId: existing.id,
        existingSerial: existing.tireSerialNumber || '',
        tireBrand: existing.tireBrand || '',
        tireSerialNumber: existing.tireSerialNumber || '',
        installedDate: existing.installedDate || '',
        installedKm: existing.installedKm != null ? String(existing.installedKm) : '',
        lastAlignmentKm: existing.lastAlignmentKm != null ? String(existing.lastAlignmentKm) : ''
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedVehicle]);

  const updateConfigRow = (index: number, patch: Partial<TireRowForm>) =>
    setConfigRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch, error: undefined } : r));

  const resetConfigForm = () => {
    setShowConfigForm(false);
    setVehicleInput('');
    setConfigRows(ALL_POSITIONS.map(emptyRow));
  };

  const openAddConfig = () => { setVehicleInput(''); setConfigRows(ALL_POSITIONS.map(emptyRow)); setShowConfigForm(true); };
  const openEditConfigForVehicle = (regNo: string) => { setVehicleInput(regNo); setShowConfigForm(true); };

  // Validates every row up front - if anything required fails, nothing is
  // saved at all (the "atomic" bulk save the spec asks for isn't a real DB
  // transaction, since every save still goes through the same per-record
  // endpoint every other tire edit already uses - but no network call fires
  // until every row has already passed, so a validation failure can never
  // leave a partial save behind).
  const validateConfigRows = (): { rows: TireRowForm[]; valid: boolean } => {
    let valid = true;
    const validated = configRows.map((row, idx) => {
      const isRequiredPosition = REQUIRED_POSITIONS.includes(row.position);
      const hasAnyField = row.tireBrand.trim() || row.tireSerialNumber.trim() || row.installedDate || row.installedKm;
      if (!isRequiredPosition && !hasAnyField) return { ...row, error: undefined };

      let error: string | undefined;
      if (!row.tireBrand.trim()) error = 'Brand/Company is required.';
      else if (!row.tireSerialNumber.trim()) error = 'Serial Number is required.';
      else if (!row.installedDate) error = 'Installed Date is required.';
      else if (!row.installedKm) error = 'Installed Odometer is required.';
      else {
        const installedKmNum = parseInt(row.installedKm, 10);
        if (currentOdometer != null && installedKmNum > currentOdometer) {
          error = `Current Odometer (${currentOdometer.toLocaleString('en-IN')} km) cannot be less than Installed Odometer (${installedKmNum.toLocaleString('en-IN')} km).`;
        } else {
          const serial = row.tireSerialNumber.trim();
          const dupElsewhere = tireRecords.some(t => t.isCurrent !== false && t.id !== row.existingId && (t.tireSerialNumber || '').trim().toLowerCase() === serial.toLowerCase());
          const dupInThisForm = configRows.some((r, i) => i !== idx && r.tireSerialNumber.trim().toLowerCase() === serial.toLowerCase() && serial !== '');
          if (dupElsewhere || dupInThisForm) error = `Serial Number "${serial}" is already in use on another tire.`;
        }
      }
      if (error) valid = false;
      return { ...row, error };
    });
    return { rows: validated, valid };
  };

  const handleSaveConfiguration = async () => {
    if (!matchedVehicle) { triggerNotif('Select a valid vehicle from Fleet & Vehicles first.'); return; }
    const { rows: validated, valid } = validateConfigRows();
    setConfigRows(validated);
    if (!valid) { triggerNotif('Please fix the highlighted row(s) before saving - nothing has been saved yet.'); return; }

    setConfigSubmitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      for (const row of validated) {
        if (!row.tireBrand.trim() && !row.tireSerialNumber.trim()) continue; // blank optional row - nothing to save

        // A replacement (existing tire's serial actually changed) preserves
        // the old tire as history instead of overwriting it.
        const isReplacement = !!row.existingId && !!row.existingSerial && row.existingSerial.trim() !== row.tireSerialNumber.trim();
        if (isReplacement) {
          const oldRecord = tireRecords.find(t => t.id === row.existingId);
          if (oldRecord) {
            await onSaveTireRecord({ ...oldRecord, isCurrent: false, removedDate: today, removedKm: currentOdometer });
          }
        }

        await onSaveTireRecord({
          id: isReplacement ? `${matchedVehicle}-${row.position}-${Date.now()}` : (row.existingId || `${matchedVehicle}-${row.position}-${Date.now()}`),
          regNo: matchedVehicle,
          position: row.position,
          tireBrand: row.tireBrand.trim(),
          tireSerialNumber: row.tireSerialNumber.trim() || undefined,
          installedDate: row.installedDate || undefined,
          installedKm: row.installedKm ? parseInt(row.installedKm, 10) : undefined,
          lastAlignmentKm: row.lastAlignmentKm ? parseInt(row.lastAlignmentKm, 10) : undefined,
          isCurrent: true
        });
      }
      triggerNotif(`Tire configuration saved for ${matchedVehicle}.`);
      resetConfigForm();
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to save the tire configuration - please retry.');
    } finally {
      setConfigSubmitting(false);
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
            <button onClick={openAddConfig} className="bg-gradient-to-r from-blue-600 to-slate-800 hover:shadow-md text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap">
              <Plus className="w-4 h-4" /> Add / Manage Tires
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
                      <button onClick={() => openEditConfigForVehicle(tire.regNo)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit this vehicle's tires"><Edit2 className="w-3.5 h-3.5" /></button>
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

      {/* Bulk "one vehicle, all tires, one save" configuration modal */}
      {showConfigForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl md:max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><CircleDot className="w-4 h-4 text-blue-400" /> Tire Configuration</h3>
              <button onClick={resetConfigForm} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Vehicle (search Fleet &amp; Vehicles) *</label>
                <input
                  type="text" list="tire-config-vehicles-datalist" placeholder="Search or select a vehicle..."
                  value={vehicleInput} onChange={(e) => setVehicleInput(e.target.value.toUpperCase())} autoComplete="off"
                  className={`w-full border rounded-lg p-2 font-mono font-bold uppercase text-slate-800 ${vehicleInput.trim() && !matchedVehicle ? 'border-rose-300 bg-rose-50' : 'border-slate-300 bg-slate-50'}`}
                />
                <datalist id="tire-config-vehicles-datalist">{vehicleList.map(v => <option key={v} value={v} />)}</datalist>
                {vehicleInput.trim() && !matchedVehicle && (
                  <p className="text-rose-600 font-semibold mt-1">Not a registered vehicle - pick one from the list.</p>
                )}
                {matchedVehicle && (
                  <p className="text-slate-500 font-mono mt-1 flex items-center gap-1"><Gauge className="w-3 h-3" /> Current Odometer (Fuel Mgmt Closing KM): <span className="font-bold text-slate-700">{currentOdometer != null ? `${currentOdometer.toLocaleString('en-IN')} km` : 'No fuel/mileage entries yet'}</span></p>
                )}
              </div>

              {matchedVehicle && (() => {
                // Shared per-row calc, reused by both the desktop table and
                // the mobile card fallback below so the two views can never
                // drift out of sync with each other.
                const computedRows = configRows.map((row, idx) => {
                  const isRequiredPosition = REQUIRED_POSITIONS.includes(row.position);
                  const installedKmNum = row.installedKm ? parseInt(row.installedKm, 10) : undefined;
                  const kmRun = currentOdometer != null && installedKmNum != null ? currentOdometer - installedKmNum : undefined;
                  const lastAlignNum = row.lastAlignmentKm ? parseInt(row.lastAlignmentKm, 10) : undefined;
                  const nextDue = nextAlignmentDueKm(lastAlignNum);
                  const status = computeAlignmentStatus(lastAlignNum, currentOdometer);
                  return { row, idx, isRequiredPosition, kmRun, nextDue, status };
                });

                const positionLabel = (row: TireRowForm, isRequiredPosition: boolean) => (
                  <>
                    {row.position}
                    {isRequiredPosition
                      ? <span className="text-rose-500"> *</span>
                      : <span className="text-slate-400 font-normal normal-case text-[9px]"> (optional)</span>}
                  </>
                );

                return (
                  <div className="pt-1">
                    {/* Desktop/tablet: compact all-positions-visible table, tabbable left-to-right then down a row */}
                    <div className="hidden md:block border border-slate-200 rounded-xl overflow-x-auto">
                      <table className="w-full text-left text-[11px] min-w-[880px]">
                        <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                          <tr>
                            <th className="px-2.5 py-2">Position</th>
                            <th className="px-2.5 py-2">Brand</th>
                            <th className="px-2.5 py-2">Serial No.</th>
                            <th className="px-2.5 py-2">Installed Date</th>
                            <th className="px-2.5 py-2">Installed Odo</th>
                            <th className="px-2.5 py-2">Last Alignment</th>
                            <th className="px-2.5 py-2 text-right">Next Due</th>
                            <th className="px-2.5 py-2 text-right">KM Run</th>
                            <th className="px-2.5 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {computedRows.map(({ row, idx, isRequiredPosition, kmRun, nextDue, status }) => (
                            <React.Fragment key={row.position}>
                              <tr className={row.error ? 'bg-rose-50/60' : 'hover:bg-slate-50/60'}>
                                <td className="px-2.5 py-1.5 align-top font-bold text-slate-700 whitespace-nowrap">
                                  {positionLabel(row, isRequiredPosition)}
                                </td>
                                <td className="px-2.5 py-1.5 align-top">
                                  <input type="text" value={row.tireBrand} onChange={(e) => updateConfigRow(idx, { tireBrand: e.target.value })} autoComplete="off"
                                    className="w-full min-w-[90px] border border-slate-300 rounded-lg px-2 py-1.5" />
                                </td>
                                <td className="px-2.5 py-1.5 align-top">
                                  <input type="text" value={row.tireSerialNumber} onChange={(e) => updateConfigRow(idx, { tireSerialNumber: e.target.value })} autoComplete="off"
                                    className="w-full min-w-[100px] border border-slate-300 rounded-lg px-2 py-1.5 font-mono" />
                                </td>
                                <td className="px-2.5 py-1.5 align-top">
                                  <DateInput value={row.installedDate} onChange={(e) => updateConfigRow(idx, { installedDate: e.target.value })} className="w-full min-w-[100px] border border-slate-300 rounded-lg px-2 py-1.5 font-mono" />
                                </td>
                                <td className="px-2.5 py-1.5 align-top">
                                  <input type="number" value={row.installedKm} onChange={(e) => updateConfigRow(idx, { installedKm: e.target.value })} autoComplete="off"
                                    className="no-spinner w-full min-w-[90px] border border-slate-300 rounded-lg px-2 py-1.5 font-mono" />
                                </td>
                                <td className="px-2.5 py-1.5 align-top">
                                  <input type="number" value={row.lastAlignmentKm} onChange={(e) => updateConfigRow(idx, { lastAlignmentKm: e.target.value })} autoComplete="off"
                                    className="no-spinner w-full min-w-[90px] border border-slate-300 rounded-lg px-2 py-1.5 font-mono" />
                                </td>
                                <td className="px-2.5 py-1.5 align-top text-right font-mono text-slate-600 whitespace-nowrap">{nextDue != null ? nextDue.toLocaleString('en-IN') : '-'}</td>
                                <td className="px-2.5 py-1.5 align-top text-right font-mono text-slate-600 whitespace-nowrap">{kmRun != null ? kmRun.toLocaleString('en-IN') : '-'}</td>
                                <td className="px-2.5 py-1.5 align-top">{statusBadge(status)}</td>
                              </tr>
                              {row.error && (
                                <tr className="bg-rose-50/60">
                                  <td colSpan={9} className="px-2.5 pb-2 text-rose-600 font-semibold">
                                    <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" /> {row.error}</span>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Small/mobile screens: same fields as a stacked card per position, since a 9-column table doesn't fit */}
                    <div className="md:hidden space-y-3">
                      {computedRows.map(({ row, idx, isRequiredPosition, kmRun, nextDue, status }) => (
                        <div key={row.position} className={`border rounded-xl p-3 ${row.error ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}>
                          <div className="font-bold text-slate-700 mb-2">{positionLabel(row, isRequiredPosition)}</div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div>
                              <label className="block text-slate-400 mb-0.5">Brand/Company{isRequiredPosition && ' *'}</label>
                              <input type="text" value={row.tireBrand} onChange={(e) => updateConfigRow(idx, { tireBrand: e.target.value })} autoComplete="off"
                                className="w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                            </div>
                            <div>
                              <label className="block text-slate-400 mb-0.5">Serial Number{isRequiredPosition && ' *'}</label>
                              <input type="text" value={row.tireSerialNumber} onChange={(e) => updateConfigRow(idx, { tireSerialNumber: e.target.value })} autoComplete="off"
                                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div>
                              <label className="block text-slate-400 mb-0.5">Installed Date{isRequiredPosition && ' *'}</label>
                              <DateInput value={row.installedDate} onChange={(e) => updateConfigRow(idx, { installedDate: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono" />
                            </div>
                            <div>
                              <label className="block text-slate-400 mb-0.5">Installed Odometer (km){isRequiredPosition && ' *'}</label>
                              <input type="number" value={row.installedKm} onChange={(e) => updateConfigRow(idx, { installedKm: e.target.value })} autoComplete="off"
                                className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono" />
                            </div>
                          </div>
                          <div className="mb-2">
                            <label className="block text-slate-400 mb-0.5">Last Alignment Odometer (km)</label>
                            <input type="number" value={row.lastAlignmentKm} onChange={(e) => updateConfigRow(idx, { lastAlignmentKm: e.target.value })} autoComplete="off"
                              className="no-spinner w-full max-w-[calc(50%-4px)] border border-slate-300 rounded-lg px-2 py-1.5 font-mono" />
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5">
                              <p className="text-slate-400 uppercase text-[8px] font-bold">Next Due (km)</p>
                              <p className="font-black text-slate-700">{nextDue != null ? nextDue.toLocaleString('en-IN') : '-'}</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5">
                              <p className="text-slate-400 uppercase text-[8px] font-bold">KM Run</p>
                              <p className="font-black text-slate-700">{kmRun != null ? kmRun.toLocaleString('en-IN') : '-'}</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 flex flex-col items-center justify-center">
                              <p className="text-slate-400 uppercase text-[8px] font-bold mb-0.5">Status</p>
                              {statusBadge(status)}
                            </div>
                          </div>

                          {row.error && (
                            <p className="text-rose-600 font-semibold mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" /> {row.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 sticky bottom-0">
              <button type="button" onClick={resetConfigForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
              <button type="button" onClick={handleSaveConfiguration} disabled={!matchedVehicle || configSubmitting}
                className="flex-1 bg-gradient-to-r from-blue-600 to-slate-800 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer disabled:opacity-50">
                {configSubmitting ? 'Saving...' : 'Save Tire Configuration'}
              </button>
            </div>
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
