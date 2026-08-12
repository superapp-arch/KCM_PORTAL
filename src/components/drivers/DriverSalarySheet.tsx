import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Coins, Plus, Search, Edit2, Trash2, CheckCircle2, AlertCircle, Download, Lock } from 'lucide-react';
import { DriverEmployee, DriverLocationCategory, DRIVER_LOCATION_CATEGORIES } from '../../types';
import DriverFormModal from './DriverFormModal';
import { compareTrailingNumber } from '../../utils/sort';

// Payable Amount = Gross Salary + Other Additions - (Petty Cash/Advance +
// Loan Deduction + Recovery Amount + Driver Welfare + BATA) - LOP Amount -
// mirrors DriverFormModal's Salary Breakup formula exactly, computed from
// the same stored snapshot fields so it's always in sync with the last save.
const payableAmount = (driver: DriverEmployee): number =>
  (driver.grossSalary || 0) + (driver.otherAdditions || 0)
  - (driver.pettyCashAdvance || 0) - (driver.loanDeduction || 0) - (driver.recoveryAmount || 0) - (driver.driverWelfare || 0) - (driver.bata || 0)
  - (driver.lopAmount || 0);

const toDriverRow = (driver: DriverEmployee, i: number) => ({
  'Sl.No': i + 1,
  'Driver Name': driver.name,
  'Driver ID': driver.id,
  'Driver No': driver.driverNo,
  'Vehicle No': driver.vehicleNo || '',
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
  drivers: DriverEmployee[];
  writableLocations: DriverLocationCategory[] | 'ALL'; // locations this user may add/edit/delete drivers in - view is broader, handled server-side
  onAddDriver: (driver: Omit<DriverEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateDriver: (id: string, driver: Partial<DriverEmployee>) => Promise<void>;
  onDeleteDriver: (id: string) => Promise<void>;
}

export default function DriverSalarySheet({ drivers, writableLocations, onAddDriver, onUpdateDriver, onDeleteDriver }: DriverSalarySheetProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [modalDriver, setModalDriver] = useState<DriverEmployee | null | undefined>(undefined); // undefined = closed
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
                        <tr key={driver.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-mono text-slate-500">{runningIndex}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{driver.name}</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">{driver.id}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{driver.driverNo}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{driver.vehicleNo || '-'}</td>
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
          writableLocations={writableLocations}
          onAddDriver={onAddDriver}
          onUpdateDriver={onUpdateDriver}
          onClose={() => setModalDriver(undefined)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
