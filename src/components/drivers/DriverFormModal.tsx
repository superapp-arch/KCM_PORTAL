import React, { useState, useEffect } from 'react';
import { X, User, Upload, Wallet, AlertTriangle } from 'lucide-react';
import { DriverEmployee, DriverLocationCategory, DRIVER_LOCATION_CATEGORIES, VehicleDocument, Vehicle } from '../../types';
import DocumentAttachment from '../DocumentAttachment';
import { authFetch } from '../../authFetch';
import { computeDriverEarnings } from '../../utils/driverSalaryExport';
import { DriverSalaryAdvanceVoucherSlim, computeDriverPettyCashAdvance, driverPettyCashAdvanceTooltip } from '../../utils/driverPettyCashAdvance';

interface DriverFormModalProps {
  driver: DriverEmployee | null; // null = creating a new driver
  vehicles: Vehicle[]; // Fleet & Vehicles' own live list - source for the Vehicle No dropdown/search below
  writableLocations: DriverLocationCategory[] | 'ALL'; // locations this user may save a driver into
  onAddDriver: (driver: Omit<DriverEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateDriver: (id: string, driver: Partial<DriverEmployee>) => Promise<void>;
  onClose: () => void;
  onSaved: (driver: { id: string; name: string }) => void;
  driverPettyCashAdvanceVouchers: DriverSalaryAdvanceVoucherSlim[];
}

type FormTab = 'basic' | 'documents' | 'salary';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DriverFormModal({ driver, vehicles, writableLocations, onAddDriver, onUpdateDriver, onClose, onSaved, driverPettyCashAdvanceVouchers }: DriverFormModalProps) {
  const isEditing = !!driver;
  const [tab, setTab] = useState<FormTab>('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Only offer locations this user can actually save into - if editing a
  // driver whose existing location falls outside that scope (shouldn't
  // normally happen, since DriverSalarySheet only opens Edit for writable
  // rows), keep it in the list so an unrelated field edit can't silently
  // reassign the driver's location.
  const locationOptions: DriverLocationCategory[] = writableLocations === 'ALL'
    ? DRIVER_LOCATION_CATEGORIES
    : (driver && !writableLocations.includes(driver.location) ? [driver.location, ...writableLocations] : writableLocations);

  const [basic, setBasic] = useState({
    id: driver?.id || '', name: driver?.name || '', driverNo: driver?.driverNo || '',
    accountNumber: driver?.accountNumber || '', ifscCode: driver?.ifscCode || '',
    reporting: driver?.reporting || '', remark: driver?.remark || '',
    location: driver?.location || (locationOptions[0] || DRIVER_LOCATION_CATEGORIES[0]) as DriverLocationCategory
  });
  // A driver can legitimately cover more than one vehicle - chips instead of
  // a single text field. Falls back to the legacy single vehicleNo for a
  // driver saved before vehicleNos existed.
  const [vehicleNos, setVehicleNos] = useState<string[]>(
    driver?.vehicleNos && driver.vehicleNos.length > 0 ? driver.vehicleNos : (driver?.vehicleNo ? [driver.vehicleNo] : [])
  );
  const [vehicleInput, setVehicleInput] = useState('');
  const addVehicleNo = () => {
    const v = vehicleInput.trim().toUpperCase();
    if (!v || vehicleNos.includes(v)) { setVehicleInput(''); return; }
    setVehicleNos(prev => [...prev, v]);
    setVehicleInput('');
  };
  const removeVehicleNo = (v: string) => setVehicleNos(prev => prev.filter(x => x !== v));
  // Live from Fleet & Vehicles (not a separate/hardcoded list) - the input
  // below is a searchable dropdown via this datalist, but a vehicle not yet
  // in Fleet & Vehicles can still be typed in manually and added, same
  // "search first, manual entry still allowed" convention every other
  // vehicle picker in this app already uses.
  const vehicleList = Array.from(new Set(vehicles.map(v => v.regNo || v['Reg. No.'] || '').filter(Boolean))).sort();
  const [aadharDocuments, setAadharDocuments] = useState<VehicleDocument[]>(driver?.aadharDocuments || []);
  const [drivingLicenseDocuments, setDrivingLicenseDocuments] = useState<VehicleDocument[]>(driver?.drivingLicenseDocuments || []);
  const [otherDocuments, setOtherDocuments] = useState<VehicleDocument[]>(driver?.otherDocuments || []);

  const [salaryMonth, setSalaryMonth] = useState(driver?.month || currentMonthKey());
  const [attendanceSummary, setAttendanceSummary] = useState({ totalDays: 0, presentDays: 0, lopDays: 0, exemptionLeaveDays: 0 });
  const [salaryForm, setSalaryForm] = useState({
    grossSalary: driver?.grossSalary != null ? String(driver.grossSalary) : '',
    otherAdditions: driver?.otherAdditions != null ? String(driver.otherAdditions) : '',
    pettyCashAdvance: driver?.pettyCashAdvance != null ? String(driver.pettyCashAdvance) : '',
    loanDeduction: driver?.loanDeduction != null ? String(driver.loanDeduction) : '',
    recoveryAmount: driver?.recoveryAmount != null ? String(driver.recoveryAmount) : '',
    driverWelfare: driver?.driverWelfare != null ? String(driver.driverWelfare) : '',
    bata: driver?.bata != null ? String(driver.bata) : ''
  });

  // Petty Cash/Advance (2026-08-29) - auto-fetched from Petty Cash's own
  // "DRIVER SALARY ADV" category entries against this Driver ID, scoped to
  // salaryMonth, instead of being typed by hand - see
  // utils/driverPettyCashAdvance.ts. No longer user-editable (see the
  // Salary tab's own input below); recomputes live if salaryMonth changes
  // or a new Petty Cash entry lands. Falls back to whatever was last saved
  // when creating a brand-new driver (driver is null, so there's no Driver
  // ID yet to match against).
  const pettyCashAdvanceResult = driver
    ? computeDriverPettyCashAdvance(driverPettyCashAdvanceVouchers, driver.id, salaryMonth)
    : { total: 0, entries: [] };
  useEffect(() => {
    if (!driver) return;
    setSalaryForm(f => ({ ...f, pettyCashAdvance: pettyCashAdvanceResult.total ? String(pettyCashAdvanceResult.total) : '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver, salaryMonth, driverPettyCashAdvanceVouchers]);

  // Attendance-derived stat cards, pulled live so they update as attendance is
  // marked - the same "attendance feeds salary" link as HR & Payroll.
  useEffect(() => {
    if (!driver) return;
    authFetch(`/api/drivers/attendance/monthly/${encodeURIComponent(driver.id)}/${salaryMonth}`)
      .then(r => r.json())
      .then(({ data }) => {
        // presentDays here is Present + Paid Leave (salaryWorkingDays) - both count as "worked" for salary purposes.
        if (data) setAttendanceSummary({ totalDays: data.totalDays, presentDays: data.salaryWorkingDays, lopDays: data.lopDays, exemptionLeaveDays: data.exemptionLeaveDays });
      })
      .catch(() => {});
  }, [driver, salaryMonth]);

  const num = (v: string) => Number(v) || 0;
  // Per Day Salary -> Gross Earned -> LOP Deduction -> Total Deductions ->
  // Payable Amount, all computed through the one shared formula (see
  // utils/driverSalaryExport.ts's computeDriverEarnings) so this tab, Driver
  // Salary/Attendance's downloads and the Salary Slip can never disagree.
  const earnings = computeDriverEarnings({
    grossSalary: num(salaryForm.grossSalary), otherAdditions: num(salaryForm.otherAdditions),
    pettyCashAdvance: num(salaryForm.pettyCashAdvance), loanDeduction: num(salaryForm.loanDeduction),
    recoveryAmount: num(salaryForm.recoveryAmount), driverWelfare: num(salaryForm.driverWelfare), bata: num(salaryForm.bata),
    totalDays: attendanceSummary.totalDays, workingDays: attendanceSummary.presentDays, lopDays: attendanceSummary.lopDays
  });
  const { perDaySalary, grossEarned, lopDeduction: lopAmount, totalDeductions, payableAmount } = earnings;
  // Working Days + LOP can't legitimately exceed the days in the month -
  // shown as a non-blocking inline warning (the underlying attendance is
  // edited in Driver Attendance, not here, so this tab can flag it but
  // shouldn't lock Save over data it doesn't own).
  const attendanceDaysExceeded = attendanceSummary.totalDays > 0
    && (attendanceSummary.presentDays + attendanceSummary.lopDays) > attendanceSummary.totalDays;

  const handleSubmit = async () => {
    if (!basic.id.trim() || !basic.name.trim()) {
      setError('Driver ID and Driver Name are required.');
      setTab('basic');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const payload = {
        ...basic,
        vehicleNos,
        vehicleNo: vehicleNos[0] || undefined, // kept in sync for old readers that only need "a" vehicle to show
        aadharDocuments,
        drivingLicenseDocuments,
        otherDocuments,
        month: salaryMonth,
        grossSalary: num(salaryForm.grossSalary) || undefined,
        otherAdditions: num(salaryForm.otherAdditions) || undefined,
        pettyCashAdvance: num(salaryForm.pettyCashAdvance) || undefined,
        loanDeduction: num(salaryForm.loanDeduction) || undefined,
        recoveryAmount: num(salaryForm.recoveryAmount) || undefined,
        driverWelfare: num(salaryForm.driverWelfare) || undefined,
        bata: num(salaryForm.bata) || undefined,
        lopAmount: lopAmount || undefined,
        workingDays: isEditing ? attendanceSummary.presentDays : undefined
      };
      if (isEditing) {
        await onUpdateDriver(basic.id, payload);
      } else {
        await onAddDriver(payload as DriverEmployee);
      }
      onSaved({ id: basic.id, name: basic.name });
      onClose();
    } catch (err) {
      setError('Something went wrong while saving. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-pink-500 to-purple-600" />
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{isEditing ? `Edit ${basic.id}` : 'Add Driver'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-1.5 px-5 pt-4 text-xs font-semibold">
          {([['basic', 'Basic Info', User], ['documents', 'Upload Documents', Upload], ['salary', 'Salary Breakup', Wallet]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 cursor-pointer ${tab === key ? 'bg-gradient-to-r from-pink-600 to-purple-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {error && <div className="mx-5 mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">{error}</div>}

        <div className="p-5 overflow-y-auto flex-1 text-xs space-y-3">
          {tab === 'basic' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Driver ID*</label>
                  <input value={basic.id} onChange={e => setBasic({ ...basic, id: e.target.value.toUpperCase() })} disabled={isEditing}
                    autoComplete="off" placeholder="KCMDRV19102" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 disabled:bg-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Driver Name*</label>
                  <input value={basic.name} onChange={e => setBasic({ ...basic, name: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Driver No <span className="text-slate-400 font-normal">(10 digits)</span></label>
                  <input type="text" inputMode="numeric" value={basic.driverNo}
                    onChange={e => setBasic({ ...basic, driverNo: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    autoComplete="off" maxLength={10} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">
                    Vehicle No <span className="text-slate-400 font-normal">(search Fleet &amp; Vehicles, or type a new one - add more than one if this driver covers several)</span>
                  </label>
                  <div className="flex gap-1.5">
                    <input value={vehicleInput} onChange={e => setVehicleInput(e.target.value.toUpperCase())} autoComplete="off"
                      list="driver-form-vehicle-datalist"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVehicleNo(); } }}
                      placeholder="Search or type e.g. KA05AB1234" className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5" />
                    <button type="button" onClick={addVehicleNo} className="px-3 border border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 font-bold text-slate-600 cursor-pointer">Add</button>
                  </div>
                  <datalist id="driver-form-vehicle-datalist">
                    {vehicleList.map(v => <option key={v} value={v} />)}
                  </datalist>
                  {vehicleNos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {vehicleNos.map(v => (
                        <span key={v} className="inline-flex items-center gap-1 bg-pink-50 border border-pink-200 text-pink-800 font-mono font-bold text-[11px] px-2 py-1 rounded-full">
                          {v}
                          <button type="button" onClick={() => removeVehicleNo(v)} title={`Remove ${v}`} className="hover:text-rose-600 cursor-pointer"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">A/C No</label>
                  <input value={basic.accountNumber} onChange={e => setBasic({ ...basic, accountNumber: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">IFSC Code</label>
                  <input value={basic.ifscCode} onChange={e => setBasic({ ...basic, ifscCode: e.target.value.toUpperCase() })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Reporting</label>
                  <input value={basic.reporting} onChange={e => setBasic({ ...basic, reporting: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Location</label>
                  <select value={basic.location} onChange={e => setBasic({ ...basic, location: e.target.value as DriverLocationCategory })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
                    {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Remark</label>
                <textarea value={basic.remark} onChange={e => setBasic({ ...basic, remark: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 h-16" />
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Aadhar</label>
                <DocumentAttachment documents={aadharDocuments} onChange={setAadharDocuments} label="Attach Aadhar Card" hideDropzone maxFiles={1} />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Driving License</label>
                <DocumentAttachment documents={drivingLicenseDocuments} onChange={setDrivingLicenseDocuments} label="Attach Driving License" hideDropzone maxFiles={1} />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Others</label>
                <DocumentAttachment documents={otherDocuments} onChange={setOtherDocuments} label="Attach Other Documents" />
              </div>
            </div>
          )}

          {tab === 'salary' && (
            <div className="space-y-3">
              <input type="month" value={salaryMonth} onChange={e => setSalaryMonth(e.target.value)} autoComplete="off" className="border border-slate-300 rounded-lg px-2.5 py-1.5" />

              {attendanceDaysExceeded && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Working Days ({attendanceSummary.presentDays}) + LOP ({attendanceSummary.lopDays}) exceed No. of Days ({attendanceSummary.totalDays}) for this month - check Driver Attendance for a double-marked or misdated entry.</span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                  <p className="text-slate-400 uppercase text-[9px] font-bold">No. of Days</p>
                  <p className="font-black text-slate-700">{attendanceSummary.totalDays}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                  <p className="text-slate-400 uppercase text-[9px] font-bold">Working Days</p>
                  <p className="font-black text-slate-700">{attendanceSummary.presentDays}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                  <p className="text-orange-600 uppercase text-[9px] font-bold">LOP</p>
                  <p className="font-black text-orange-700">{attendanceSummary.lopDays}</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-2 text-center">
                  <p className="text-sky-600 uppercase text-[9px] font-bold">Exemption Leave</p>
                  <p className="font-black text-sky-700">{attendanceSummary.exemptionLeaveDays}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-3">
                <p className="font-bold text-emerald-700 uppercase mb-2">Salary Inputs</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-0.5">Gross Salary</label>
                    <input type="number" value={salaryForm.grossSalary} onChange={e => setSalaryForm({ ...salaryForm, grossSalary: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Other Additions <span className="text-emerald-500 font-normal">(+)</span></label>
                    <input type="number" value={salaryForm.otherAdditions} onChange={e => setSalaryForm({ ...salaryForm, otherAdditions: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Petty Cash/Advance <span className="text-rose-500 font-normal">(-)</span></label>
                    <input
                      type="number" readOnly disabled value={salaryForm.pettyCashAdvance}
                      title={driver ? driverPettyCashAdvanceTooltip(pettyCashAdvanceResult) : undefined}
                      className="w-full border border-slate-200 bg-slate-100 text-slate-600 rounded-lg px-2 py-1.5 cursor-not-allowed"
                    />
                    <p className="text-[9.5px] text-slate-400 mt-0.5">Auto-fetched from Petty Cash's "DRIVER SALARY ADV" entries for {salaryMonth} - hover to see the breakdown.</p>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Loan Deduction <span className="text-rose-500 font-normal">(-)</span></label>
                    <input type="number" value={salaryForm.loanDeduction} onChange={e => setSalaryForm({ ...salaryForm, loanDeduction: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Recovery Amount <span className="text-rose-500 font-normal">(-)</span></label>
                    <input type="number" value={salaryForm.recoveryAmount} onChange={e => setSalaryForm({ ...salaryForm, recoveryAmount: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Driver Welfare <span className="text-rose-500 font-normal">(-)</span></label>
                    <input type="number" value={salaryForm.driverWelfare} onChange={e => setSalaryForm({ ...salaryForm, driverWelfare: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">BATA <span className="text-rose-500 font-normal">(-)</span></label>
                    <input type="number" value={salaryForm.bata} onChange={e => setSalaryForm({ ...salaryForm, bata: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                    <p className="text-emerald-600 uppercase text-[9px] font-bold">Per Day Salary (auto = Gross Salary &divide; No. of Days)</p>
                    <p className="font-black text-emerald-700">Rs. {perDaySalary.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>

              {/* Full breakdown, in the order it's actually derived, so the
                  final Payable Amount is always verifiable at a glance
                  rather than a single opaque number. */}
              <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 grid grid-cols-2 gap-y-1.5">
                <span className="text-purple-500 font-semibold">Per Day Salary</span><span className="text-right font-bold">Rs. {perDaySalary.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className="text-purple-500 font-semibold">Gross Earned <span className="font-normal text-[10px]">(&times; {attendanceSummary.presentDays} Working Days)</span></span><span className="text-right font-bold">Rs. {grossEarned.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className="text-purple-500 font-semibold">LOP Deduction <span className="font-normal text-[10px]">(&times; {attendanceSummary.lopDays} LOP days)</span></span><span className="text-right font-bold">Rs. {lopAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className="text-purple-500 font-semibold">Total Deductions <span className="font-normal text-[10px]">(incl. LOP)</span></span><span className="text-right font-bold">Rs. {totalDeductions.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className="text-purple-700 font-black border-t border-purple-200 pt-1.5 mt-0.5">Payable Amount</span><span className="text-right font-black text-purple-700 border-t border-purple-200 pt-1.5 mt-0.5">Rs. {payableAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              {!isEditing && <p className="text-slate-400 italic">Save this driver first to record attendance-linked Salary Breakup details.</p>}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Driver' : 'Save Driver'}
          </button>
        </div>
      </div>
    </div>
  );
}
