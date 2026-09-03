import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Coins, Plus, Search, Edit2, Trash2, RotateCcw, CheckCircle2, AlertCircle, Lock, ChevronDown, ChevronUp, User as UserIcon, Paperclip, Receipt } from 'lucide-react';
import { DriverEmployee, DriverAttendance, DriverLocationCategory, DRIVER_LOCATION_CATEGORIES, VehicleDocument, DriverSalarySlipRecord, Vehicle } from '../../types';
import DriverFormModal from './DriverFormModal';
import DriverSalarySlipModal from './DriverSalarySlipModal';
import DocumentAttachment from '../DocumentAttachment';
import { authFetch } from '../../authFetch';
import { compareTrailingNumber } from '../../utils/sort';
import { payableAmountLiveCurrentMonth, vehiclesLabel, salarySections, exportDriverSalary } from '../../utils/driverSalaryExport';
import DownloadMenu from './DownloadMenu';
import { SaveConfirmationModal, DeleteConfirmationModal } from '../ConfirmationModal';
import { DriverSalaryAdvanceVoucherSlim, computeDriverPettyCashAdvance, driverPettyCashAdvanceTooltip } from '../../utils/driverPettyCashAdvance';
import { driverAllLocations, isDriverActiveAtLocation } from '../../utils/driverLocations';

const safeFileToken = (s: string): string => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');

// One driver, at ONE of their assigned locations (2026-09-03 multi-location
// support) - a driver covering more than one location produces more than
// one of these, so the same person is listed once per location instead of
// only under a single primary one.
interface LocationDriverRow {
  driver: DriverEmployee;
  location: DriverLocationCategory;
}

interface DriverSalarySheetProps {
  performedBy: string; // current user's username - for the Salary Slip audit trail
  drivers: DriverEmployee[];
  vehicles: Vehicle[]; // Fleet & Vehicles' own live list - source for the Vehicle No dropdown in DriverFormModal
  writableLocations: DriverLocationCategory[] | 'ALL'; // locations this user may add/edit/delete drivers in - view is broader, handled server-side
  onAddDriver: (driver: Omit<DriverEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateDriver: (id: string, driver: Partial<DriverEmployee>) => Promise<void>;
  onDeleteDriver: (id: string) => Promise<void>;
  driverPettyCashAdvanceVouchers: DriverSalaryAdvanceVoucherSlim[];
}

// Real current calendar month (YYYY-MM) - the Petty Cash/Advance and
// Payable Amount columns below must always reflect THIS month, not whatever
// month a driver was last saved in (driver.month), otherwise every driver's
// figures stay pinned to their last-saved month until someone opens and
// re-saves them one by one - see the fix note on payableAmountLiveCurrentMonth.
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DriverSalarySheet({ performedBy, drivers, vehicles, writableLocations, onAddDriver, onUpdateDriver, onDeleteDriver, driverPettyCashAdvanceVouchers }: DriverSalarySheetProps) {
  const thisMonth = currentMonthKey();
  const [searchTerm, setSearchTerm] = useState('');
  // Defaults to Active only (2026-09-02 data-integrity fix) - "Delete
  // Driver" now deactivates rather than removes the record (see server.ts's
  // DELETE /api/drivers/employees/:id), so a driver who's left the company
  // stays in `drivers` forever with status: 'inactive'. Hiding them by
  // default keeps this working list exactly as clean as a real delete used
  // to, without ever throwing away the row their Attendance/Salary history
  // depends on - switch to Inactive/All to find, review, or reactivate one.
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [modalDriver, setModalDriver] = useState<DriverEmployee | null | undefined>(undefined); // undefined = closed
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Big, centered save/delete confirmation (see ConfirmationModal.tsx) for
  // Add/Save Driver. `key` increments on every save/delete so React remounts
  // it fresh each time.
  const [saveConfirmation, setSaveConfirmation] = useState<{ identifier: string; key: number } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ identifier: string; key: number } | null>(null);
  // Click-to-expand on the Driver ID cell (mirrors Fleet & Vehicles' row
  // expand pattern) - shows basic info plus inline document upload, so
  // Aadhar/Driving License/Other docs no longer require opening the full
  // Edit modal just to view or attach them.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  // Driver Salary Slip generation - self-contained data flow (fetched
  // directly here, not threaded through App.tsx's central Promise.all), same
  // pattern the Service Invoice feature already established.
  const [salarySlips, setSalarySlips] = useState<DriverSalarySlipRecord[]>([]);
  const [slipModalDriver, setSlipModalDriver] = useState<DriverEmployee | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/drivers/salary-slips');
        if (res.ok) setSalarySlips(await res.json());
      } catch (err) {
        console.error('Failed to load driver salary slips:', err);
      }
    })();
  }, []);

  // Fetched once so Payable Amount here can be computed LIVE from actual
  // attendance for the real current month (see payableAmountLiveCurrentMonth)
  // - otherwise this list would only ever reflect whatever workingDays/
  // lopAmount snapshot happened to be persisted at a driver's last Salary
  // Breakup save, which can lag behind (and, once the calendar rolls over,
  // permanently disagree with) what the Salary Breakup tab itself computes
  // live for the current month, right up until someone opens and re-saves
  // that driver by hand.
  const [attendance, setAttendance] = useState<DriverAttendance[]>([]);
  useEffect(() => {
    authFetch('/api/drivers/attendance').then(r => r.json()).then(setAttendance).catch(() => {});
  }, []);

  const triggerNotif = (message: string, type: 'success' | 'error') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  // One row per (driver, location) assignment (2026-09-03 multi-location
  // support), then grouped by location - one colored section header per
  // group, rows sorted by Driver ID within each group - never by name,
  // never by entry order. Groups themselves stay in
  // DRIVER_LOCATION_CATEGORIES' fixed master order (only locations with at
  // least one matching row get a section at all - a location-scoped user's
  // drivers already only cover their own assigned location(s), enforced
  // server-side). Active/Inactive/All filters per-location (not per whole
  // driver) via isDriverActiveAtLocation, so a driver active at Vizag but
  // deactivated at Hyderabad shows up correctly in each location's own
  // filtered view.
  const groupedDrivers = useMemo(() => {
    const allRows: LocationDriverRow[] = drivers.flatMap(driver => driverAllLocations(driver).map(location => ({ driver, location })));
    const base = allRows.filter(({ driver, location }) => {
      const isInactive = !isDriverActiveAtLocation(driver, location);
      if (statusFilter === 'active' && isInactive) return false;
      if (statusFilter === 'inactive' && !isInactive) return false;
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return driver.id.toLowerCase().includes(q) || driver.name.toLowerCase().includes(q) || (driver.vehicleNo || '').toLowerCase().includes(q);
    });
    const byLocation = new Map<DriverLocationCategory, LocationDriverRow[]>();
    for (const row of base) {
      if (!byLocation.has(row.location)) byLocation.set(row.location, []);
      byLocation.get(row.location)!.push(row);
    }
    return DRIVER_LOCATION_CATEGORIES
      .filter(loc => byLocation.has(loc))
      .map(loc => ({
        location: loc,
        rows: [...byLocation.get(loc)!].sort((a, b) => compareTrailingNumber(a.driver.id, b.driver.id) || a.driver.id.localeCompare(b.driver.id))
      }));
  }, [drivers, searchTerm, statusFilter]);

  // Flat, grouped-and-sorted order - used for the "no results" check and for
  // Download All, so the exported sheet matches what's on screen.
  const flatFiltered = useMemo(() => groupedDrivers.flatMap(g => g.rows), [groupedDrivers]);

  // e.g. Vinod: view every location's drivers, but only add/edit/delete
  // within his own writableLocations - everyone else's writable set is the
  // same as what they can see, so this is a no-op distinction for them.
  // Checked against ONE specific location (2026-09-03) rather than the
  // driver's primary location, since a scoped user may manage some but not
  // all of a multi-location driver's assignments.
  const canWrite = (location: DriverLocationCategory) => writableLocations === 'ALL' || writableLocations.includes(location);
  const canAddAnywhere = writableLocations === 'ALL' || writableLocations.length > 0;

  // "Delete" now deactivates, not removes (see server.ts) - the confirm
  // copy reflects that so it doesn't read as more destructive than it is.
  // Whole-driver deactivation - used directly for a single-location driver,
  // and offered from the per-location action for a multi-location driver
  // being deactivated at their LAST remaining active location (see
  // handleDeactivateLocation below).
  const handleDelete = async (driver: DriverEmployee) => {
    if (!confirm(`Deactivate driver ${driver.id} - ${driver.name}? They'll no longer appear in the active list or be selectable for new attendance/salary entries, but all their historical records stay exactly as they are.`)) return;
    await onDeleteDriver(driver.id);
    setDeleteConfirmation({ identifier: `${driver.name} (${driver.id})`, key: Date.now() });
  };

  const handleReactivate = async (driver: DriverEmployee) => {
    if (!confirm(`Reactivate driver ${driver.id} - ${driver.name}? They'll appear in the active list again.`)) return;
    try {
      // inactivatedDate is deliberately left as-is - it's just "when this
      // driver was last deactivated", harmless (and a little useful) to
      // keep around even once they're active again.
      await onUpdateDriver(driver.id, { status: 'active' });
      setSaveConfirmation({ identifier: `${driver.name} (${driver.id}) - reactivated`, key: Date.now() });
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to reactivate driver.', 'error');
    }
  };

  // Per-location deactivate/reactivate (2026-09-03) - only ever offered for
  // a driver with more than one assigned location; a single-location driver
  // still just uses the whole-driver handleDelete/handleReactivate above
  // (identical behavior to before multi-location support existed). Only
  // touches inactiveLocations - never the driver's other locations, salary,
  // or history.
  const handleDeactivateLocation = async (driver: DriverEmployee, location: DriverLocationCategory) => {
    const otherActiveLocations = driverAllLocations(driver).filter(l => l !== location && isDriverActiveAtLocation(driver, l));
    if (!confirm(`Deactivate ${driver.name} (${driver.id}) at ${location} only? ${otherActiveLocations.length > 0 ? `They'll remain active at ${otherActiveLocations.join(', ')}.` : ''} Historical attendance at ${location} stays available.`)) return;
    try {
      const inactiveLocations = Array.from(new Set([...(driver.inactiveLocations || []), location]));
      await onUpdateDriver(driver.id, { inactiveLocations });
      setSaveConfirmation({ identifier: `${driver.name} (${driver.id}) - ${location} deactivated`, key: Date.now() });
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to deactivate this location.', 'error');
    }
  };

  const handleReactivateLocation = async (driver: DriverEmployee, location: DriverLocationCategory) => {
    try {
      const inactiveLocations = (driver.inactiveLocations || []).filter(l => l !== location);
      await onUpdateDriver(driver.id, { inactiveLocations });
      setSaveConfirmation({ identifier: `${driver.name} (${driver.id}) - ${location} reactivated`, key: Date.now() });
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to reactivate this location.', 'error');
    }
  };

  const handleSaved = (driver: { id: string; name: string }) => {
    setSaveConfirmation({ identifier: `${driver.name} (${driver.id})`, key: Date.now() });
  };

  // Single-driver download - same shared section builder + export function
  // as "Download All" and per-location below (a one-driver, one-group
  // section), so this row-level button offers the same Excel/PDF choice with
  // guaranteed content parity instead of its own Excel-only shortcut.
  // salarySections still groups by {location, drivers: DriverEmployee[]} -
  // Driver Salary's own figures (Gross Salary, Payable Amount, etc.) are a
  // whole-driver concept, never fragmented per location (unlike Driver
  // Attendance's own exports) - only the grouping/display is location-aware,
  // so a multi-location driver's row is simply repeated, unchanged, under
  // each of their location sections.
  const toDriverGroups = (groups: { location: DriverLocationCategory; rows: LocationDriverRow[] }[]) =>
    groups.map(g => ({ location: g.location, drivers: g.rows.map(r => r.driver) }));

  const handleDownloadAllExcel = () => {
    if (flatFiltered.length === 0) { triggerNotif('No driver records to download.', 'error'); return; }
    exportDriverSalary('KCM_All_Drivers', salarySections(toDriverGroups(groupedDrivers), attendance), 'excel', 'All Locations');
  };

  const handleDownloadAllPdf = () => {
    if (flatFiltered.length === 0) { triggerNotif('No driver records to download.', 'error'); return; }
    exportDriverSalary('KCM_All_Drivers', salarySections(toDriverGroups(groupedDrivers), attendance), 'pdf', 'All Locations');
  };

  // One location's drivers only - the Download control on that group's
  // header row.
  const handleDownloadLocationExcel = (location: DriverLocationCategory, rows: LocationDriverRow[]) =>
    exportDriverSalary(`KCM_Driver_Salary_${safeFileToken(location)}`, salarySections([{ location, drivers: rows.map(r => r.driver) }], attendance), 'excel', location);

  const handleDownloadLocationPdf = (location: DriverLocationCategory, rows: LocationDriverRow[]) =>
    exportDriverSalary(`KCM_Driver_Salary_${safeFileToken(location)}`, salarySections([{ location, drivers: rows.map(r => r.driver) }], attendance), 'pdf', location);

  // Inline document upload from the expand panel - persists immediately
  // (same "no separate Save button" convention DocumentAttachment's callers
  // already use elsewhere) rather than waiting for the full Edit modal.
  const handleUpdateDocs = async (driver: DriverEmployee, field: 'aadharDocuments' | 'drivingLicenseDocuments' | 'otherDocuments', docs: VehicleDocument[]) => {
    try {
      await onUpdateDriver(driver.id, { [field]: docs });
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to save document changes.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Coins className="text-amber-600 w-5 h-5" />
            Driver Salary
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Master driver record, salary and bank details</p>
        </div>
        <div className="flex items-center gap-2">
          <DownloadMenu label="Download All" options={[
            { key: 'excel', label: 'Excel (.xlsx)', icon: 'excel', onClick: handleDownloadAllExcel },
            { key: 'pdf', label: 'PDF', icon: 'pdf', onClick: handleDownloadAllPdf },
          ]} />
          {canAddAnywhere && (
            <button onClick={() => setModalDriver(null)} className="bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold px-4 py-2 rounded-lg uppercase text-[11px] flex items-center gap-1.5 cursor-pointer transition-all">
              <Plus className="w-3.5 h-3.5" /> Add Driver
            </button>
          )}
        </div>
      </div>

      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notif.message}</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by Driver Name, Driver ID, or Vehicle No..." autoComplete="off" className="flex-1 outline-none" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')}
          title="A deactivated driver keeps their full Attendance/Salary history - this only filters this working list"
          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700">
          <option value="active">Active Drivers</option>
          <option value="inactive">Inactive Drivers</option>
          <option value="all">All Drivers</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-purple-100 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-3 py-2.5">Sl.No</th>
                <th className="px-3 py-2.5">Driver Name</th>
                <th className="px-3 py-2.5">Driver ID</th>
                <th className="px-3 py-2.5">Driver No</th>
                <th className="px-3 py-2.5">Vehicle No</th>
                <th className="px-3 py-2.5">A/C No</th>
                <th className="px-3 py-2.5">IFSC Code</th>
                <th className="px-3 py-2.5">Reporting</th>
                <th className="px-3 py-2.5">Petty Cash/Advance</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5 text-right">Gross Salary</th>
                <th className="px-3 py-2.5 text-right">Payable Amount</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flatFiltered.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-10 text-slate-400">No driver records found.</td></tr>
              ) : (() => {
                // Sl.No runs continuously across every group's rows, in the
                // order the groups render - not reset back to 1 per section.
                let runningIndex = 0;
                return groupedDrivers.map(group => (
                  <React.Fragment key={group.location}>
                    <tr className="bg-gradient-to-r from-emerald-600 to-emerald-700">
                      <td colSpan={13} className="px-3 py-2 text-white font-extrabold uppercase tracking-wide text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            {group.location}
                            <span className="ml-2 font-semibold normal-case text-emerald-100 text-[10px]">
                              ({group.rows.length} driver{group.rows.length === 1 ? '' : 's'})
                            </span>
                          </span>
                          <DownloadMenu variant="ghost" label="Download" options={[
                            { key: 'excel', label: 'Excel (.xlsx)', icon: 'excel', onClick: () => handleDownloadLocationExcel(group.location, group.rows) },
                            { key: 'pdf', label: 'PDF', icon: 'pdf', onClick: () => handleDownloadLocationPdf(group.location, group.rows) },
                          ]} />
                        </div>
                      </td>
                    </tr>
                    {group.rows.map(({ driver, location }) => {
                      runningIndex += 1;
                      const rowKey = `${driver.id}-${location}`;
                      const isInactiveHere = !isDriverActiveAtLocation(driver, location);
                      const multiLocation = driverAllLocations(driver).length > 1;
                      return (
                        <React.Fragment key={rowKey}>
                        <tr className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-mono text-slate-500">{runningIndex}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">
                            {driver.name}
                            {isInactiveHere && (
                              <span title={driver.inactivatedDate ? `Deactivated ${driver.inactivatedDate}` : `Deactivated${multiLocation ? ` at ${location}` : ''}`} className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border bg-slate-100 text-slate-500 border-slate-300 align-middle">Inactive</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <button onClick={() => toggleExpand(rowKey)} className="flex items-center gap-1 font-mono font-bold text-slate-800 cursor-pointer hover:text-teal-700" title="Click to view details & documents">
                              {driver.id}
                              {expandedId === rowKey ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{driver.driverNo}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{vehiclesLabel(driver) || '-'}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{driver.accountNumber || '-'}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{driver.ifscCode || '-'}</td>
                          <td className="px-3 py-2.5 text-slate-500">{driver.reporting || '-'}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-600">
                            {(() => {
                              // Auto-fetched live from Petty Cash's own
                              // "DRIVER SALARY ADV" category (see
                              // utils/driverPettyCashAdvance.ts) rather than
                              // the possibly-stale driver.pettyCashAdvance
                              // snapshot - hover shows the breakdown + who
                              // entered each one in Petty Cash. Scoped to the
                              // real current month (thisMonth), not
                              // driver.month - see currentMonthKey above.
                              const advance = computeDriverPettyCashAdvance(driverPettyCashAdvanceVouchers, driver.id, thisMonth);
                              return (
                                <span title={driverPettyCashAdvanceTooltip(advance)}>
                                  {advance.total ? `Rs. ${advance.total.toLocaleString('en-IN')}` : '-'}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[9.5px] font-bold">{location}</span>
                            {multiLocation && <span title={`Also assigned to: ${driverAllLocations(driver).filter(l => l !== location).join(', ')}`} className="ml-1 text-slate-400 font-bold cursor-help">+{driverAllLocations(driver).length - 1}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-700">{driver.grossSalary ? `Rs. ${driver.grossSalary.toLocaleString('en-IN')}` : '-'}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">Rs. {payableAmountLiveCurrentMonth(driver, attendance, driverPettyCashAdvanceVouchers, thisMonth).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <button onClick={() => setSlipModalDriver(driver)} title="Generate Salary Slip" className="p-1 text-slate-400 hover:text-purple-700 hover:bg-slate-100 rounded cursor-pointer"><Receipt className="w-3.5 h-3.5" /></button>
                            {canWrite(location) ? (
                              <>
                                <button onClick={() => setModalDriver(driver)} className="p-1 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded cursor-pointer" title="Edit driver"><Edit2 className="w-3.5 h-3.5" /></button>
                                {multiLocation ? (
                                  isInactiveHere ? (
                                    <button onClick={() => handleReactivateLocation(driver, location)} title={`Reactivate at ${location}`} className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /></button>
                                  ) : (
                                    <button onClick={() => handleDeactivateLocation(driver, location)} title={`Deactivate at ${location} only`} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                                  )
                                ) : (
                                  driver.status === 'inactive' ? (
                                    <button onClick={() => handleReactivate(driver)} title="Reactivate" className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /></button>
                                  ) : (
                                    <button onClick={() => handleDelete(driver)} title="Deactivate" className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                                  )
                                )}
                              </>
                            ) : (
                              <span title="View only - outside your assigned locations" className="inline-flex p-1 text-slate-300"><Lock className="w-3.5 h-3.5" /></span>
                            )}
                          </td>
                        </tr>

                        {expandedId === rowKey && (
                          <tr>
                            <td colSpan={13} className="bg-slate-50/50 p-5 border-t border-slate-100">
                              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-slate-700">
                                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                  <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-3 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                                    <UserIcon className="w-3.5 h-3.5 text-teal-600" /> Basic Info
                                  </h4>
                                  <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs font-sans">
                                    <dt className="text-slate-400">Driver No</dt>
                                    <dd className="font-mono text-slate-800">{driver.driverNo || '-'}</dd>
                                    <dt className="text-slate-400">Vehicle No</dt>
                                    <dd className="font-mono text-slate-800">{vehiclesLabel(driver) || '-'}</dd>
                                    <dt className="text-slate-400">A/C No</dt>
                                    <dd className="font-mono text-slate-800 break-all">{driver.accountNumber || '-'}</dd>
                                    <dt className="text-slate-400">IFSC Code</dt>
                                    <dd className="font-mono text-slate-800">{driver.ifscCode || '-'}</dd>
                                    <dt className="text-slate-400">Reporting</dt>
                                    <dd className="text-slate-800">{driver.reporting || '-'}</dd>
                                    <dt className="text-slate-400">Location{driverAllLocations(driver).length > 1 ? 's' : ''}</dt>
                                    <dd className="text-slate-800">{driverAllLocations(driver).join(', ')}</dd>
                                    <dt className="text-slate-400">Remark</dt>
                                    <dd className="text-slate-800 break-words col-span-2">{driver.remark || '-'}</dd>
                                  </dl>
                                </div>

                                {/* Inline document upload - same DocumentAttachment component the
                                    Edit modal's "Upload Documents" tab uses, wired straight to
                                    onUpdateDriver so changes persist immediately without needing
                                    the full modal, matching Fleet & Vehicles' inline expand pattern. */}
                                <div className="lg:col-span-2 bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                  <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-3 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                                    <Paperclip className="w-3.5 h-3.5 text-teal-600" /> Documents
                                  </h4>
                                  {canWrite(location) ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <DocumentAttachment documents={driver.aadharDocuments} onChange={(docs) => handleUpdateDocs(driver, 'aadharDocuments', docs)} label="Aadhar" hideDropzone maxFiles={1} />
                                      <DocumentAttachment documents={driver.drivingLicenseDocuments} onChange={(docs) => handleUpdateDocs(driver, 'drivingLicenseDocuments', docs)} label="Driving License" hideDropzone maxFiles={1} />
                                      <DocumentAttachment documents={driver.otherDocuments} onChange={(docs) => handleUpdateDocs(driver, 'otherDocuments', docs)} label="Others" />
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <DocumentAttachment documents={driver.aadharDocuments} onChange={() => {}} label="Aadhar" isReadOnly />
                                      <DocumentAttachment documents={driver.drivingLicenseDocuments} onChange={() => {}} label="Driving License" isReadOnly />
                                      <DocumentAttachment documents={driver.otherDocuments} onChange={() => {}} label="Others" isReadOnly />
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {modalDriver !== undefined && (
        <DriverFormModal
          driver={modalDriver}
          vehicles={vehicles}
          writableLocations={writableLocations}
          onAddDriver={onAddDriver}
          onUpdateDriver={onUpdateDriver}
          onClose={() => setModalDriver(undefined)}
          onSaved={handleSaved}
          driverPettyCashAdvanceVouchers={driverPettyCashAdvanceVouchers}
        />
      )}

      {slipModalDriver && (
        <DriverSalarySlipModal
          driver={slipModalDriver}
          existingSlips={salarySlips}
          performedBy={performedBy}
          onClose={() => setSlipModalDriver(null)}
          onSlipSaved={(slip) => setSalarySlips(prev => {
            const idx = prev.findIndex(s => s.id === slip.id);
            if (idx === -1) return [...prev, slip];
            const copy = [...prev]; copy[idx] = slip; return copy;
          })}
        />
      )}

      {/* Big, centered save/delete confirmation for Add/Save Driver (see
          ConfirmationModal.tsx) - keyed by .key so each fully remounts
          (fresh confetti/shake) on every save/delete. */}
      <SaveConfirmationModal
        key={saveConfirmation?.key}
        open={!!saveConfirmation}
        label="Driver"
        identifier={saveConfirmation?.identifier}
        onDone={() => setSaveConfirmation(null)}
      />
      <DeleteConfirmationModal
        key={deleteConfirmation?.key}
        open={!!deleteConfirmation}
        label="Driver"
        identifier={deleteConfirmation?.identifier}
        onDone={() => setDeleteConfirmation(null)}
      />
    </div>
  );
}
