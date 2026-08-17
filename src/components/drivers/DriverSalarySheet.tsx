import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { Coins, Plus, Search, Edit2, Trash2, CheckCircle2, AlertCircle, Download, Lock, ChevronDown, ChevronUp, User as UserIcon, Paperclip, Receipt } from 'lucide-react';
import { DriverEmployee, DriverLocationCategory, DRIVER_LOCATION_CATEGORIES, VehicleDocument, DriverSalarySlipRecord, Vehicle } from '../../types';
import DriverFormModal from './DriverFormModal';
import DriverSalarySlipModal from './DriverSalarySlipModal';
import DocumentAttachment from '../DocumentAttachment';
import { authFetch } from '../../authFetch';
import { compareTrailingNumber } from '../../utils/sort';

// Payable Amount = Gross Salary + Other Additions - (Petty Cash/Advance +
// Loan Deduction + Recovery Amount + Driver Welfare + BATA) - LOP Amount -
// mirrors DriverFormModal's Salary Breakup formula exactly, computed from
// the same stored snapshot fields so it's always in sync with the last save.
const payableAmount = (driver: DriverEmployee): number =>
  (driver.grossSalary || 0) + (driver.otherAdditions || 0)
  - (driver.pettyCashAdvance || 0) - (driver.loanDeduction || 0) - (driver.recoveryAmount || 0) - (driver.driverWelfare || 0) - (driver.bata || 0)
  - (driver.lopAmount || 0);

// A driver can cover more than one vehicle (DriverEmployee.vehicleNos) -
// falls back to the legacy single vehicleNo for a driver saved before that
// field existed. Used everywhere this sheet shows/exports "the" vehicle.
const vehiclesLabel = (driver: DriverEmployee): string =>
  (driver.vehicleNos && driver.vehicleNos.length > 0 ? driver.vehicleNos : (driver.vehicleNo ? [driver.vehicleNo] : [])).join(' / ');

const toDriverRow = (driver: DriverEmployee, i: number) => ({
  'Sl.No': i + 1,
  'Driver Name': driver.name,
  'Driver ID': driver.id,
  'Driver No': driver.driverNo,
  'Vehicle No': vehiclesLabel(driver),
  'A/C No': driver.accountNumber || '',
  'IFSC Code': driver.ifscCode || '',
  'Reporting': driver.reporting || '',
  'Remark': driver.remark || '',
  'LOP Amount': driver.lopAmount || '',
  'Petty Cash/Advance': driver.pettyCashAdvance || '',
  'Month': driver.month || '',
  'Loan Deduction': driver.loanDeduction || '',
  'Recovery Amount': driver.recoveryAmount || '',
  'Driver Welfare': driver.driverWelfare || '',
  'BATA': driver.bata || '',
  'Other Additions': driver.otherAdditions || '',
  'Gross Salary': driver.grossSalary || '',
  'Payable Amount': payableAmount(driver),
  'Location': driver.location
});

interface DriverSalarySheetProps {
  performedBy: string; // current user's username - for the Salary Slip audit trail
  drivers: DriverEmployee[];
  vehicles: Vehicle[]; // Fleet & Vehicles' own live list - source for the Vehicle No dropdown in DriverFormModal
  writableLocations: DriverLocationCategory[] | 'ALL'; // locations this user may add/edit/delete drivers in - view is broader, handled server-side
  onAddDriver: (driver: Omit<DriverEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateDriver: (id: string, driver: Partial<DriverEmployee>) => Promise<void>;
  onDeleteDriver: (id: string) => Promise<void>;
}

export default function DriverSalarySheet({ performedBy, drivers, vehicles, writableLocations, onAddDriver, onUpdateDriver, onDeleteDriver }: DriverSalarySheetProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [modalDriver, setModalDriver] = useState<DriverEmployee | null | undefined>(undefined); // undefined = closed
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
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

  const triggerNotif = (message: string, type: 'success' | 'error') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  // Grouped by location, one colored section header per group, drivers
  // sorted by Driver ID within each group - never by name, never by entry
  // order. Groups themselves stay in DRIVER_LOCATION_CATEGORIES' fixed
  // master order (only locations with at least one matching driver get a
  // section at all - a location-scoped user's drivers already only cover
  // their own assigned location(s), enforced server-side).
  const groupedDrivers = useMemo(() => {
    const base = drivers.filter(d => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || (d.vehicleNo || '').toLowerCase().includes(q);
    });
    const byLocation = new Map<DriverLocationCategory, DriverEmployee[]>();
    for (const d of base) {
      if (!byLocation.has(d.location)) byLocation.set(d.location, []);
      byLocation.get(d.location)!.push(d);
    }
    return DRIVER_LOCATION_CATEGORIES
      .filter(loc => byLocation.has(loc))
      .map(loc => ({
        location: loc,
        drivers: [...byLocation.get(loc)!].sort((a, b) => compareTrailingNumber(a.id, b.id) || a.id.localeCompare(b.id))
      }));
  }, [drivers, searchTerm]);

  // Flat, grouped-and-sorted order - used for the "no results" check and for
  // Download All, so the exported sheet matches what's on screen.
  const flatFiltered = useMemo(() => groupedDrivers.flatMap(g => g.drivers), [groupedDrivers]);

  // e.g. Vinod: view every location's drivers, but only add/edit/delete
  // within his own writableLocations - everyone else's writable set is the
  // same as what they can see, so this is a no-op distinction for them.
  const canWrite = (driver: DriverEmployee) => writableLocations === 'ALL' || writableLocations.includes(driver.location);
  const canAddAnywhere = writableLocations === 'ALL' || writableLocations.length > 0;

  const handleDelete = async (driver: DriverEmployee) => {
    if (!confirm(`Delete driver ${driver.id} - ${driver.name}? This cannot be undone.`)) return;
    await onDeleteDriver(driver.id);
    triggerNotif(`Driver ${driver.id} removed.`, 'success');
  };

  const handleSaved = () => {
    triggerNotif('Driver record saved.', 'success');
  };

  const handleDownloadOne = (driver: DriverEmployee) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([toDriverRow(driver, 0)]), 'Driver');
    XLSX.writeFile(workbook, `KCM_Driver_${driver.id}.xlsx`);
  };

  const handleDownloadAll = () => {
    if (flatFiltered.length === 0) {
      triggerNotif('No driver records to download.', 'error');
      return;
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(flatFiltered.map(toDriverRow)), 'Drivers');
    XLSX.writeFile(workbook, `KCM_All_Drivers.xlsx`);
  };

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
          <button onClick={handleDownloadAll} className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-lg uppercase text-[11px] flex items-center gap-1.5 cursor-pointer transition-all">
            <Download className="w-3.5 h-3.5 text-teal-600" /> Download All
          </button>
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
                        {group.location}
                        <span className="ml-2 font-semibold normal-case text-emerald-100 text-[10px]">
                          ({group.drivers.length} driver{group.drivers.length === 1 ? '' : 's'})
                        </span>
                      </td>
                    </tr>
                    {group.drivers.map(driver => {
                      runningIndex += 1;
                      return (
                        <React.Fragment key={driver.id}>
                        <tr className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-mono text-slate-500">{runningIndex}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{driver.name}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <button onClick={() => toggleExpand(driver.id)} className="flex items-center gap-1 font-mono font-bold text-slate-800 cursor-pointer hover:text-teal-700" title="Click to view details & documents">
                              {driver.id}
                              {expandedId === driver.id ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{driver.driverNo}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{vehiclesLabel(driver) || '-'}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{driver.accountNumber || '-'}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{driver.ifscCode || '-'}</td>
                          <td className="px-3 py-2.5 text-slate-500">{driver.reporting || '-'}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-600">{driver.pettyCashAdvance ? `Rs. ${driver.pettyCashAdvance.toLocaleString('en-IN')}` : '-'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[9.5px] font-bold">{driver.location}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-700">{driver.grossSalary ? `Rs. ${driver.grossSalary.toLocaleString('en-IN')}` : '-'}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">Rs. {payableAmount(driver).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <button onClick={() => setSlipModalDriver(driver)} title="Generate Salary Slip" className="p-1 text-slate-400 hover:text-purple-700 hover:bg-slate-100 rounded cursor-pointer"><Receipt className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDownloadOne(driver)} title="Download this driver" className="p-1 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded cursor-pointer"><Download className="w-3.5 h-3.5" /></button>
                            {canWrite(driver) ? (
                              <>
                                <button onClick={() => setModalDriver(driver)} className="p-1 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDelete(driver)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                              </>
                            ) : (
                              <span title="View only - outside your assigned locations" className="inline-flex p-1 text-slate-300"><Lock className="w-3.5 h-3.5" /></span>
                            )}
                          </td>
                        </tr>

                        {expandedId === driver.id && (
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
                                    <dt className="text-slate-400">Location</dt>
                                    <dd className="text-slate-800">{driver.location}</dd>
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
                                  {canWrite(driver) ? (
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
    </div>
  );
}
