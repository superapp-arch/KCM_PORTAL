import React, { useState } from 'react';
import { BadgeInfo, Pencil, Save, X, RotateCcw } from 'lucide-react';
import {
  RATE_TABLES, RATE_MATRIX_KM_SLABS, RATE_MATRIX_VEHICLE_TYPES, RateTableKey, RateMatrixVehicleType,
  lookupExtraRates, hasExtraRatesConfigured, findRateOverride, buildRateOverrideId
} from '../../utils/warehouseRateMatrix';
import {
  DEDICATED_24HR_TABLES, REEFER_WALKES_TABLE, ADHOC_ROUTES, ADHOC_VEHICLE_COLUMNS,
  ADHOC_DAILY_TABLES, REEFER_WALKES_KEYS, REEFER_WALKES_LOCATIONS, ReeferWalkesKey, ReeferWalkesLocation
} from '../../utils/warehouseRateMatrix24hr';
import { formatINR } from '../../utils/warehouseRates';
import { WarehouseRateOverride } from '../../types';

// "See every current rate at a glance" screen - the actual pain point being
// fixed is that none of the rate cards driving Log Warehouse Deployment's
// auto-fills were ever visible anywhere in the app; office staff had no way
// to check (or change) a rate without asking whoever has the source
// spreadsheet. This reads directly from the same tables/overrides that
// already drive those auto-fills (utils/warehouseRateMatrix.ts and
// warehouseRateMatrix24hr.ts, plus the warehouse_rate_overrides table via the
// `overrides` prop) - it's a view onto that data, not a second copy of it,
// so it can never drift out of sync with what Log Deployment actually uses.
//
// Editing (Super Admin only): the 12Hr Scheduled/Extra, 24Hr Dedicated and
// 24Hr Reefer & Walkes sections below are editable in place - "Edit" opens
// inline number inputs for that row, "Save" writes one WarehouseRateOverride
// per underlying value (a 12Hr row spans 3 km-slab overrides + 1 extra-rate
// override), "Reset" deletes those overrides so the row reverts to the
// hardcoded default. Super Admins also see every vehicle type/location combo
// (not just the ones already configured) so a brand new one can be added -
// everyone else still only sees rows that actually have a rate, exactly as
// before. Ad-hoc Route and Local Adhoc (sections 4 & 5) are NOT part of this
// pass - still fully read-only - see the PendingNote on each.

const GROUP_DISPLAY_LABELS: Record<RateTableKey, string> = {
  blr: 'BLR - ECOM, IM1, IM2, IM3, IM4 & DHL',
  ecomHyd: 'ECOM HYD - IM1, IM2, IM3',
  vizag: 'Vizag',
  hydIm4: 'HYD IM4',
};
const GROUP_ORDER: RateTableKey[] = ['blr', 'ecomHyd', 'vizag', 'hydIm4'];

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {subtitle && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{subtitle}</p>}
    </div>
  );
}

function PendingNote({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] text-amber-600 font-semibold mt-2">
      <BadgeInfo className="w-3 h-3 shrink-0" /> {text}
    </p>
  );
}

function NumField({ value, onChange, width = 'w-20' }: { value: string; onChange: (v: string) => void; width?: string }) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`${width} text-right font-mono text-[11px] border border-purple-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white`}
    />
  );
}

interface RatesSummaryProps {
  overrides: WarehouseRateOverride[];
  isSuperAdmin: boolean;
  onSaveOverride: (override: WarehouseRateOverride) => Promise<void>;
  onDeleteOverride: (id: string) => Promise<void>;
}

export default function RatesSummary({ overrides, isSuperAdmin, onSaveOverride, onDeleteOverride }: RatesSummaryProps) {
  // Only one row editable at a time across the whole screen - simplest state
  // shape, and there's no real workflow that needs two rows open at once.
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startEdit = (key: string, initial: Record<string, string>) => {
    setEditKey(key);
    setDraft(initial);
    setErr(null);
  };
  const cancelEdit = () => {
    setEditKey(null);
    setDraft({});
    setErr(null);
  };
  const setField = (field: string, value: string) => setDraft(d => ({ ...d, [field]: value }));

  // --- Section 1: 12Hr Scheduled + Extra Km/Hr, per Warehouse Group ---

  const sec1Key = (group: RateTableKey, vt: RateMatrixVehicleType) => `s1:${group}:${vt}`;

  const sec1Overridden = (group: RateTableKey, vt: RateMatrixVehicleType) =>
    RATE_MATRIX_KM_SLABS.some(slab => !!findRateOverride(overrides, 'scheduled12hr', { group, vehicleType: vt, kmSlab: String(slab) })) ||
    !!findRateOverride(overrides, 'extra12hr', { group, vehicleType: vt });

  const startEditSec1 = (group: RateTableKey, vt: RateMatrixVehicleType) => {
    const initial: Record<string, string> = {};
    RATE_MATRIX_KM_SLABS.forEach(slab => {
      const o = findRateOverride(overrides, 'scheduled12hr', { group, vehicleType: vt, kmSlab: String(slab) });
      initial[`slab_${slab}`] = String(o ? (o.value.rate ?? 0) : (RATE_TABLES[group][vt]?.[slab] ?? 0));
    });
    const extra = lookupExtraRates(group, vt, overrides);
    initial.extraKm = String(extra?.extraKm ?? 0);
    initial.extraHr = String(extra?.extraHr ?? 0);
    startEdit(sec1Key(group, vt), initial);
  };

  const saveSec1 = async (group: RateTableKey, vt: RateMatrixVehicleType) => {
    setBusy(true); setErr(null);
    try {
      for (const slab of RATE_MATRIX_KM_SLABS) {
        const dims = { group, vehicleType: vt, kmSlab: String(slab) };
        await onSaveOverride({
          id: buildRateOverrideId('scheduled12hr', dims),
          kind: 'scheduled12hr',
          dims,
          value: { rate: Number(draft[`slab_${slab}`]) || 0 },
        });
      }
      const extraDims = { group, vehicleType: vt };
      await onSaveOverride({
        id: buildRateOverrideId('extra12hr', extraDims),
        kind: 'extra12hr',
        dims: extraDims,
        value: { extraKm: Number(draft.extraKm) || 0, extraHr: Number(draft.extraHr) || 0 },
      });
      cancelEdit();
    } catch (e: any) {
      setErr(e?.message || 'Failed to save rate.');
    } finally {
      setBusy(false);
    }
  };

  const resetSec1 = async (group: RateTableKey, vt: RateMatrixVehicleType) => {
    setBusy(true); setErr(null);
    try {
      for (const slab of RATE_MATRIX_KM_SLABS) {
        if (findRateOverride(overrides, 'scheduled12hr', { group, vehicleType: vt, kmSlab: String(slab) })) {
          await onDeleteOverride(buildRateOverrideId('scheduled12hr', { group, vehicleType: vt, kmSlab: String(slab) }));
        }
      }
      if (findRateOverride(overrides, 'extra12hr', { group, vehicleType: vt })) {
        await onDeleteOverride(buildRateOverrideId('extra12hr', { group, vehicleType: vt }));
      }
      if (editKey === sec1Key(group, vt)) cancelEdit();
    } catch (e: any) {
      setErr(e?.message || 'Failed to reset rate.');
    } finally {
      setBusy(false);
    }
  };

  // --- Section 2: 24Hr Dedicated, per Warehouse Group ---

  const sec2Key = (group: string, vt: RateMatrixVehicleType) => `s2:${group}:${vt}`;
  const sec2Overridden = (group: string, vt: RateMatrixVehicleType) => !!findRateOverride(overrides, 'dedicated24hr', { group, vehicleType: vt });

  const startEditSec2 = (group: string, vt: RateMatrixVehicleType, table: Partial<Record<RateMatrixVehicleType, { fixed: number; variable: number }>>) => {
    const o = findRateOverride(overrides, 'dedicated24hr', { group, vehicleType: vt });
    const row = o ? { fixed: o.value.fixed ?? 0, variable: o.value.variable ?? 0 } : (table[vt] || { fixed: 0, variable: 0 });
    startEdit(sec2Key(group, vt), { fixed: String(row.fixed), variable: String(row.variable) });
  };

  const saveSec2 = async (group: string, vt: RateMatrixVehicleType) => {
    setBusy(true); setErr(null);
    try {
      const dims = { group, vehicleType: vt };
      await onSaveOverride({
        id: buildRateOverrideId('dedicated24hr', dims),
        kind: 'dedicated24hr',
        dims,
        value: { fixed: Number(draft.fixed) || 0, variable: Number(draft.variable) || 0 },
      });
      cancelEdit();
    } catch (e: any) {
      setErr(e?.message || 'Failed to save rate.');
    } finally {
      setBusy(false);
    }
  };

  const resetSec2 = async (group: string, vt: RateMatrixVehicleType) => {
    setBusy(true); setErr(null);
    try {
      await onDeleteOverride(buildRateOverrideId('dedicated24hr', { group, vehicleType: vt }));
      if (editKey === sec2Key(group, vt)) cancelEdit();
    } catch (e: any) {
      setErr(e?.message || 'Failed to reset rate.');
    } finally {
      setBusy(false);
    }
  };

  // --- Section 3: 24Hr Reefer & Walkes, per Location + Vehicle Key ---

  const sec3Key = (location: ReeferWalkesLocation, key: ReeferWalkesKey) => `s3:${location}:${key}`;
  const sec3Overridden = (location: ReeferWalkesLocation, key: ReeferWalkesKey) => !!findRateOverride(overrides, 'reeferWalkes24hr', { location, vehicleKey: key });

  const startEditSec3 = (location: ReeferWalkesLocation, key: ReeferWalkesKey) => {
    const o = findRateOverride(overrides, 'reeferWalkes24hr', { location, vehicleKey: key });
    const row = o ? { fc: o.value.fc ?? 0, vc: o.value.vc ?? 0 } : (REEFER_WALKES_TABLE[location][key] || { fc: 0, vc: 0 });
    startEdit(sec3Key(location, key), { fc: String(row.fc), vc: String(row.vc) });
  };

  const saveSec3 = async (location: ReeferWalkesLocation, key: ReeferWalkesKey) => {
    setBusy(true); setErr(null);
    try {
      const dims = { location, vehicleKey: key };
      await onSaveOverride({
        id: buildRateOverrideId('reeferWalkes24hr', dims),
        kind: 'reeferWalkes24hr',
        dims,
        value: { fc: Number(draft.fc) || 0, vc: Number(draft.vc) || 0 },
      });
      cancelEdit();
    } catch (e: any) {
      setErr(e?.message || 'Failed to save rate.');
    } finally {
      setBusy(false);
    }
  };

  const resetSec3 = async (location: ReeferWalkesLocation, key: ReeferWalkesKey) => {
    setBusy(true); setErr(null);
    try {
      await onDeleteOverride(buildRateOverrideId('reeferWalkes24hr', { location, vehicleKey: key }));
      if (editKey === sec3Key(location, key)) cancelEdit();
    } catch (e: any) {
      setErr(e?.message || 'Failed to reset rate.');
    } finally {
      setBusy(false);
    }
  };

  function RowActions({ editing, overridden, onEdit, onSave, onCancel, onReset }: {
    editing: boolean; overridden: boolean;
    onEdit: () => void; onSave: () => void; onCancel: () => void; onReset: () => void;
  }) {
    if (!isSuperAdmin) return null;
    if (editing) {
      return (
        <span className="inline-flex items-center gap-1">
          <button type="button" disabled={busy} onClick={onSave} title="Save" className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            <Save className="w-3 h-3" />
          </button>
          <button type="button" disabled={busy} onClick={onCancel} title="Cancel" className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-50">
            <X className="w-3 h-3" />
          </button>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" disabled={busy} onClick={onEdit} title="Edit" className="p-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50">
          <Pencil className="w-3 h-3" />
        </button>
        {overridden && (
          <button type="button" disabled={busy} onClick={onReset} title="Reset to default" className="p-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-[11px] text-amber-800">
        <BadgeInfo className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Every rate currently used to auto-fill Log Warehouse Deployment.
          {isSuperAdmin
            ? ' As Super Admin you can Edit any row below, or add a new vehicle type/location that isn\'t configured yet - changes apply immediately to the deployment form. Ad-hoc Route and Local Adhoc (sections 4-5) are still read-only.'
            : ' Read-only - ask a Super Admin to add or change a rate.'}
        </span>
      </div>
      {err && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-700 font-semibold">{err}</div>
      )}

      {/* 1. 12Hr Dedicated Vehicle Cost, per Warehouse Group */}
      <section>
        <SectionHeading title="12Hr Dedicated Vehicle Cost" subtitle="Scheduled Rate by Vehicle Type x Km Slab; Extra Km/Hr Rate by Vehicle Type" />
        <div className="space-y-5">
          {GROUP_ORDER.map(groupKey => {
            const table = RATE_TABLES[groupKey];
            const rows = isSuperAdmin
              ? RATE_MATRIX_VEHICLE_TYPES
              : RATE_MATRIX_VEHICLE_TYPES.filter(vt => table[vt] || sec1Overridden(groupKey, vt));
            if (rows.length === 0) return null;
            const hasExtraRates = hasExtraRatesConfigured(groupKey);
            return (
              <div key={groupKey} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 px-3 py-2">
                  <span className="text-purple-100 font-extrabold uppercase tracking-wide text-[11px]">{GROUP_DISPLAY_LABELS[groupKey]}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9.5px] tracking-wide">
                      <tr>
                        <th className="px-3 py-2">Vehicle Type</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Fixed Hr</th>
                        {RATE_MATRIX_KM_SLABS.map(slab => <th key={slab} className="px-3 py-2 text-right">Sch. Rate @ {slab} km</th>)}
                        <th className="px-3 py-2 text-right">Extra Km Rate</th>
                        <th className="px-3 py-2 text-right">Extra Hr Rate</th>
                        {isSuperAdmin && <th className="px-3 py-2 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(vt => {
                        const row = table[vt];
                        const extra = lookupExtraRates(groupKey, vt, overrides);
                        const key = sec1Key(groupKey, vt);
                        const editing = editKey === key;
                        const configured = !!row || sec1Overridden(groupKey, vt);
                        return (
                          <tr key={vt} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{vt}</td>
                            <td className="px-3 py-2 text-slate-500">Dry</td>
                            <td className="px-3 py-2 text-slate-500">12</td>
                            {RATE_MATRIX_KM_SLABS.map(slab => (
                              <td key={slab} className="px-3 py-2 text-right font-mono text-slate-700">
                                {editing
                                  ? <NumField value={draft[`slab_${slab}`] ?? '0'} onChange={v => setField(`slab_${slab}`, v)} />
                                  : (row ? formatINR(row[slab]) : (findRateOverride(overrides, 'scheduled12hr', { group: groupKey, vehicleType: vt, kmSlab: String(slab) }) ? formatINR(findRateOverride(overrides, 'scheduled12hr', { group: groupKey, vehicleType: vt, kmSlab: String(slab) })!.value.rate) : <span className="text-slate-300">—</span>))}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right font-mono text-slate-700">
                              {editing ? <NumField value={draft.extraKm ?? '0'} onChange={v => setField('extraKm', v)} /> : (extra ? formatINR(extra.extraKm) : <span className="text-slate-300">—</span>)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">
                              {editing ? <NumField value={draft.extraHr ?? '0'} onChange={v => setField('extraHr', v)} /> : (extra ? formatINR(extra.extraHr) : <span className="text-slate-300">—</span>)}
                            </td>
                            {isSuperAdmin && (
                              <td className="px-3 py-2 text-center">
                                <RowActions
                                  editing={editing}
                                  overridden={sec1Overridden(groupKey, vt)}
                                  onEdit={() => startEditSec1(groupKey, vt)}
                                  onSave={() => saveSec1(groupKey, vt)}
                                  onCancel={cancelEdit}
                                  onReset={() => resetSec1(groupKey, vt)}
                                />
                                {!configured && !editing && <span className="ml-1 text-[9px] text-slate-400 italic">not set</span>}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!hasExtraRates && !isSuperAdmin && <div className="px-3 pb-2"><PendingNote text="Extra Km/Extra Hr rates not yet provided for this group." /></div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. 24Hr Dedicated - one card per configured warehouse group */}
      <section>
        <SectionHeading title="24Hr Dedicated Vehicle Cost" subtitle="Fixed/Variable by Vehicle Type - effective 1st Feb" />
        <div className="space-y-5">
          {Object.entries(DEDICATED_24HR_TABLES).map(([groupLabel, table]) => {
            const rows = isSuperAdmin
              ? RATE_MATRIX_VEHICLE_TYPES
              : RATE_MATRIX_VEHICLE_TYPES.filter(vt => table[vt] || sec2Overridden(groupLabel, vt));
            if (rows.length === 0) return null;
            return (
              <div key={groupLabel} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 px-3 py-2">
                  <span className="text-purple-100 font-extrabold uppercase tracking-wide text-[11px]">{groupLabel} Dedicated</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9.5px] tracking-wide">
                      <tr>
                        <th className="px-3 py-2">Vehicle Type</th>
                        <th className="px-3 py-2 text-right">Fixed</th>
                        <th className="px-3 py-2 text-right">Variable (₹/km)</th>
                        {isSuperAdmin && <th className="px-3 py-2 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(vt => {
                        const override = findRateOverride(overrides, 'dedicated24hr', { group: groupLabel, vehicleType: vt });
                        const row = override ? { fixed: override.value.fixed ?? 0, variable: override.value.variable ?? 0 } : table[vt];
                        const key = sec2Key(groupLabel, vt);
                        const editing = editKey === key;
                        return (
                          <tr key={vt} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{vt}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">
                              {editing ? <NumField value={draft.fixed ?? '0'} onChange={v => setField('fixed', v)} /> : (row ? formatINR(row.fixed) : <span className="text-slate-300">—</span>)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">
                              {editing ? <NumField value={draft.variable ?? '0'} onChange={v => setField('variable', v)} /> : (row ? formatINR(row.variable) : <span className="text-slate-300">—</span>)}
                            </td>
                            {isSuperAdmin && (
                              <td className="px-3 py-2 text-center">
                                <RowActions
                                  editing={editing}
                                  overridden={sec2Overridden(groupLabel, vt)}
                                  onEdit={() => startEditSec2(groupLabel, vt, table)}
                                  onSave={() => saveSec2(groupLabel, vt)}
                                  onCancel={cancelEdit}
                                  onReset={() => resetSec2(groupLabel, vt)}
                                />
                                {!row && !editing && <span className="ml-1 text-[9px] text-slate-400 italic">not set</span>}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!isSuperAdmin && rows.length < RATE_MATRIX_VEHICLE_TYPES.length && (
                  <div className="px-3 pb-2"><PendingNote text={`Only ${rows.join(', ')} configured for ${groupLabel} so far - other vehicle types pending.`} /></div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. 24Hr Reefer & Walkes */}
      <section>
        <SectionHeading title="24Hr Reefer & Walkes" subtitle="Monthly FC (Fixed Cost) / VC (Variable Cost) by Location + Vehicle - effective 1st Jul'26" />
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-purple-100 uppercase text-[9.5px] tracking-wide">
                <tr>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Vehicle</th>
                  <th className="px-3 py-2 text-right">FC</th>
                  <th className="px-3 py-2 text-right">VC</th>
                  {isSuperAdmin && <th className="px-3 py-2 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(isSuperAdmin ? REEFER_WALKES_LOCATIONS : (Object.keys(REEFER_WALKES_TABLE) as ReeferWalkesLocation[])).flatMap(location =>
                  (isSuperAdmin ? REEFER_WALKES_KEYS : REEFER_WALKES_KEYS.filter(k => REEFER_WALKES_TABLE[location][k] || sec3Overridden(location, k))).map(vehicleKey => {
                    const override = findRateOverride(overrides, 'reeferWalkes24hr', { location, vehicleKey });
                    const row = override ? { fc: override.value.fc ?? 0, vc: override.value.vc ?? 0 } : REEFER_WALKES_TABLE[location][vehicleKey];
                    const key = sec3Key(location, vehicleKey);
                    const editing = editKey === key;
                    if (!isSuperAdmin && !row) return null;
                    return (
                      <tr key={`${location}-${vehicleKey}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{location}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{vehicleKey}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">
                          {editing ? <NumField value={draft.fc ?? '0'} onChange={v => setField('fc', v)} /> : (row ? formatINR(row.fc) : <span className="text-slate-300">—</span>)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">
                          {editing ? <NumField value={draft.vc ?? '0'} onChange={v => setField('vc', v)} /> : (row ? formatINR(row.vc) : <span className="text-slate-300">—</span>)}
                        </td>
                        {isSuperAdmin && (
                          <td className="px-3 py-2 text-center">
                            <RowActions
                              editing={editing}
                              overridden={sec3Overridden(location, vehicleKey)}
                              onEdit={() => startEditSec3(location, vehicleKey)}
                              onSave={() => saveSec3(location, vehicleKey)}
                              onCancel={cancelEdit}
                              onReset={() => resetSec3(location, vehicleKey)}
                            />
                            {!row && !editing && <span className="ml-1 text-[9px] text-slate-400 italic">not set</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 4. Ad-hoc - Route table (read-only) */}
      <section>
        <SectionHeading title="24Hr Ad-hoc - Route Rates" subtitle="Flat round-trip rate by From City → To City → Vehicle" />
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-purple-100 uppercase text-[9.5px] tracking-wide">
                <tr>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  {ADHOC_VEHICLE_COLUMNS.map(col => <th key={col} className="px-3 py-2 text-right whitespace-nowrap">{col}</th>)}
                  <th className="px-3 py-2 whitespace-nowrap">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ADHOC_ROUTES.map(route => (
                  <tr key={`${route.from}-${route.to}-${route.remarks || 'Round Trip'}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{route.from}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{route.to}</td>
                    {ADHOC_VEHICLE_COLUMNS.map(col => (
                      <td key={col} className="px-3 py-2 text-right font-mono text-slate-700">
                        {route.rates[col] > 0 ? formatINR(route.rates[col]) : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{route.remarks || 'Round Trip'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-2">
            <PendingNote text="— means no rate configured for that route/vehicle combination. Editing this table isn't supported yet - only the sections above are." />
          </div>
        </div>
      </section>

      {/* 5. Ad-hoc - Daily/Local rate table (read-only) - one card per configured group */}
      <section>
        <SectionHeading title="Local Adhoc" subtitle="Per-vehicle-type day rate (Kms/Hrs included) + Extra Km/Hr overage - a separate Ad-hoc pricing model from the Route table above, for local use with no fixed route. Effective 1st Feb." />
        <div className="space-y-5">
          {Object.entries(ADHOC_DAILY_TABLES).map(([groupLabel, table]) => {
            const rows = RATE_MATRIX_VEHICLE_TYPES.filter(vt => table[vt]);
            if (rows.length === 0) return null;
            return (
              <div key={groupLabel} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 px-3 py-2">
                  <span className="text-purple-100 font-extrabold uppercase tracking-wide text-[11px]">{groupLabel}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9.5px] tracking-wide">
                      <tr>
                        <th className="px-3 py-2">Vehicle Type</th>
                        <th className="px-3 py-2 text-right">Daily Kms</th>
                        <th className="px-3 py-2 text-right">Hrs</th>
                        <th className="px-3 py-2 text-right">Ad Hoc Rate</th>
                        <th className="px-3 py-2 text-right">Extra Km</th>
                        <th className="px-3 py-2 text-right">Extra Hr</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(vt => {
                        const row = table[vt]!;
                        return (
                          <tr key={vt} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{vt}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{row.dailyKms}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{row.hrs}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.rate)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.extraKm)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.extraHr)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <PendingNote text="Not yet wired into the Add/Edit Entry form - Ad-hoc there still only offers the Route table above. Editing this table isn't supported yet either." />
        </div>
      </section>
    </div>
  );
}
