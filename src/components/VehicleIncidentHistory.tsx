import React, { useState } from 'react';
import { CheckCircle2, XCircle, Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { VehicleIncident, VEHICLE_INCIDENT_CLAIM_STATUSES } from '../types';
import { parseFlexibleDate, formatDateDDMMYYYY } from '../utils/dateFormat';
import DateInput from './DateInput';

// Fleet & Vehicles > Incidents & Claims (2026-09-08 incident history +
// claimed/not-claimed indicator direct request). Renders the FULL incident
// history for one vehicle (newest first) plus an "+ Add New Incident" form
// that reuses the exact same fields the old single-incident tab had -
// "Claim Number" here is the field that used to be labelled "Insurance
// Claim Voucher Code". Each Add/Edit/Delete is its own immediate API call
// (via onAdd/onUpdate/onDelete) - independent of the vehicle's own Save
// button and of every other incident, so editing Incident #2 never touches
// #1 or #3 (see the GLOBAL UI REQUIREMENT test scenarios 9 & 10).
//
// CLAIMED/NOT CLAIMED is derived purely from whether claimNumber holds a
// non-blank (post-trim) value - never from claimStatus (added 2026-09-08
// follow-up) - that's a separate, purely informational per-incident field,
// same spirit as BreakdownReport's own status but with no bearing at all on
// the Fleet list's green/red indicator (see types.ts's own comment).

type IncidentFormState = {
  accidentDate: string;
  accidentTime: string;
  accidentPlace: string;
  driverName: string;
  driverLicenseNo: string;
  claimNumber: string;
  claimStatus: string;
  policeFirNo: string;
  firDate: string;
  policeStationAddress: string;
  accidentIncidentDetails: string;
  claimAmount: string;
};

const BLANK_FORM: IncidentFormState = {
  accidentDate: '', accidentTime: '', accidentPlace: '', driverName: '', driverLicenseNo: '',
  claimNumber: '', claimStatus: '', policeFirNo: '', firDate: '', policeStationAddress: '', accidentIncidentDetails: '', claimAmount: ''
};

const isClaimed = (inc: VehicleIncident) => !!(inc.claimNumber && inc.claimNumber.trim());

interface Props {
  regNo: string;
  incidents: VehicleIncident[]; // already filtered to this vehicle
  readOnly?: boolean;
  onAdd: (incident: Omit<VehicleIncident, 'id' | 'createdAt'>) => Promise<void>;
  onUpdate: (id: string, incident: Partial<VehicleIncident>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function VehicleIncidentHistory({ regNo, incidents, readOnly, onAdd, onUpdate, onDelete }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Preserved across an edit and sent back on update - the PUT route
  // replaces the whole record (same pattern as every other id+data-JSON-
  // blob table in this app), so without this an edit would silently reset
  // createdAt to "now" and disturb the newest-first ordering's tiebreaker.
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<IncidentFormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Chronological (oldest first) numbering - Incident #1 is the oldest -
  // then reversed for "newest first" display, matching the GLOBAL UI
  // REQUIREMENT's worked example exactly (Incident #3 newest at the top,
  // #1 oldest at the bottom).
  const compareChronological = (a: VehicleIncident, b: VehicleIncident) => {
    const da = parseFlexibleDate(a.accidentDate)?.getTime();
    const db = parseFlexibleDate(b.accidentDate)?.getTime();
    if (da != null && db != null && da !== db) return da - db;
    if (da != null && db == null) return -1;
    if (da == null && db != null) return 1;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  };
  const numbered = [...incidents].sort(compareChronological).map((inc, i) => ({ ...inc, __num: i + 1 }));
  const displayList = [...numbered].reverse();

  const openAddForm = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setError(null);
    setFormOpen(true);
  };
  const openEditForm = (inc: VehicleIncident) => {
    setEditingId(inc.id);
    setEditingCreatedAt(inc.createdAt);
    setForm({
      accidentDate: inc.accidentDate || '',
      accidentTime: inc.accidentTime || '',
      accidentPlace: inc.accidentPlace || '',
      driverName: inc.driverName || '',
      driverLicenseNo: inc.driverLicenseNo || '',
      claimNumber: inc.claimNumber || '',
      claimStatus: inc.claimStatus || '',
      policeFirNo: inc.policeFirNo || '',
      firDate: inc.firDate || '',
      policeStationAddress: inc.policeStationAddress || '',
      accidentIncidentDetails: inc.accidentIncidentDetails || '',
      claimAmount: inc.claimAmount || ''
    });
    setError(null);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setEditingCreatedAt(undefined);
    setForm(BLANK_FORM);
    setError(null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await onUpdate(editingId, { ...form, regNo, createdAt: editingCreatedAt });
      } else {
        await onAdd({ ...form, regNo });
      }
      closeForm();
    } catch (e: any) {
      setError(e?.message || 'Failed to save the incident. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inc: VehicleIncident & { __num: number }) => {
    if (!window.confirm(`Delete Incident #${inc.__num} (${formatDateDDMMYYYY(inc.accidentDate) || 'no date'})? This cannot be undone.`)) return;
    try {
      await onDelete(inc.id);
    } catch (e: any) {
      alert(e?.message || 'Failed to delete the incident.');
    }
  };

  const field = (key: keyof IncidentFormState, value: string) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Incident History</h3>
        {!readOnly && !formOpen && (
          <button
            type="button"
            onClick={openAddForm}
            disabled={!regNo.trim()}
            title={!regNo.trim() ? "Enter and save the vehicle's Reg. No. first" : undefined}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[11px] uppercase px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add New Incident
          </button>
        )}
      </div>

      {!regNo.trim() && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Save the vehicle's Registration Number on the Primary Details tab before recording an incident.
        </p>
      )}

      {formOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            {editingId ? 'Edit Incident' : 'Add New Incident'}
          </h4>

          {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Accident Incident Date</label>
              <DateInput
                value={form.accidentDate}
                onChange={(e) => field('accidentDate', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Accident Time</label>
              <input
                type="text"
                value={form.accidentTime}
                onChange={(e) => field('accidentTime', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
                placeholder="e.g. 11.30 pm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Accident Location / Place</label>
              <input
                type="text"
                value={form.accidentPlace}
                onChange={(e) => field('accidentPlace', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
                placeholder="Highway location"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Assign Driver Name at Incident</label>
              <input
                type="text"
                value={form.driverName}
                onChange={(e) => field('driverName', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
                placeholder="Driver Name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Driver License Number</label>
              <input
                type="text"
                value={form.driverLicenseNo}
                onChange={(e) => field('driverLicenseNo', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                placeholder="TN68..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Claim Number</label>
              <input
                type="text"
                value={form.claimNumber}
                onChange={(e) => field('claimNumber', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                placeholder="e.g. C23002... (leave blank until claimed)"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Claim Status</label>
              <select
                value={form.claimStatus}
                onChange={(e) => field('claimStatus', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
              >
                <option value="">Not set</option>
                {VEHICLE_INCIDENT_CLAIM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Police FIR Case Number</label>
              <input
                type="text"
                value={form.policeFirNo}
                onChange={(e) => field('policeFirNo', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                placeholder="0186/2024"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">FIR Date</label>
              <DateInput
                value={form.firDate}
                onChange={(e) => field('firDate', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Claim Amount (₹)</label>
              <input
                type="text"
                value={form.claimAmount}
                onChange={(e) => field('claimAmount', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-mono"
                placeholder="e.g. 45000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Police Station Address</label>
            <input
              type="text"
              value={form.policeStationAddress}
              onChange={(e) => field('policeStationAddress', e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800"
              placeholder="e.g. Walayar Police Station, Palakkad, Kerala"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Accident Event Incident Details / Garage Report</label>
            <textarea
              value={form.accidentIncidentDetails}
              onChange={(e) => field('accidentIncidentDetails', e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 h-20 focus:ring-1 focus:ring-teal-500"
              placeholder="Describe chronological event details, damage metrics, and towing status..."
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase bg-teal-600 hover:bg-teal-700 text-white cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update Incident' : 'Save Incident'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {displayList.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-6 bg-white border border-dashed border-slate-200 rounded-xl">
            No incidents recorded for this vehicle.
          </p>
        ) : (
          displayList.map(inc => {
            const claimed = isClaimed(inc);
            const expanded = expandedId === inc.id;
            return (
              <div key={inc.id} className="bg-white border border-slate-200 rounded-xl p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold text-slate-800">Incident #{inc.__num}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {formatDateDDMMYYYY(inc.accidentDate) || 'No date recorded'}
                      {inc.accidentPlace ? ` · ${inc.accidentPlace}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-extrabold uppercase border ${
                    claimed ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-red-100 text-red-800 border-red-300'
                  }`}>
                    {claimed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {claimed ? 'Claimed' : 'Not Claimed'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 mt-2">
                  <span className="text-slate-400">Claim Number: </span>
                  <span className="font-mono font-semibold">{inc.claimNumber?.trim() || 'Not entered'}</span>
                  {inc.claimStatus && (
                    <span className="ml-2 text-slate-400">
                      · Claim Status: <span className="font-semibold text-slate-700">{inc.claimStatus}</span>
                    </span>
                  )}
                </p>

                {expanded && (
                  <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-[11px] mt-3 pt-3 border-t border-slate-100">
                    <dt className="text-slate-400">Claim Status</dt>
                    <dd className="text-slate-800 font-semibold">{inc.claimStatus || '-'}</dd>
                    <dt className="text-slate-400">Accident Time</dt>
                    <dd className="text-slate-800 font-mono">{inc.accidentTime || '-'}</dd>
                    <dt className="text-slate-400">Driver Name</dt>
                    <dd className="text-slate-800">{inc.driverName || '-'}</dd>
                    <dt className="text-slate-400">Driver License No</dt>
                    <dd className="text-slate-800 font-mono">{inc.driverLicenseNo || '-'}</dd>
                    <dt className="text-slate-400">Police FIR No</dt>
                    <dd className="text-slate-800 font-mono">{inc.policeFirNo || '-'}</dd>
                    <dt className="text-slate-400">FIR Date</dt>
                    <dd className="text-slate-800 font-mono">{formatDateDDMMYYYY(inc.firDate) || '-'}</dd>
                    <dt className="text-slate-400">Claim Amount</dt>
                    <dd className="text-slate-800 font-mono">{inc.claimAmount ? `₹${inc.claimAmount}` : '-'}</dd>
                    <dt className="text-slate-400 col-span-2">Police Station Address</dt>
                    <dd className="text-slate-800 col-span-2">{inc.policeStationAddress || '-'}</dd>
                    <dt className="text-slate-400 col-span-2">Incident Details / Garage Report</dt>
                    <dd className="text-slate-800 col-span-2 whitespace-pre-wrap">{inc.accidentIncidentDetails || '-'}</dd>
                  </dl>
                )}

                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-slate-50">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : inc.id)}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {expanded ? 'Hide Details' : 'View Details'}
                  </button>
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditForm(inc)}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase text-teal-600 hover:text-teal-800 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(inc)}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase text-red-500 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
