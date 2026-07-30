import React, { useState, useEffect } from 'react';
import { X, User, Upload, Wallet } from 'lucide-react';
import { DriverEmployee, DriverLocationCategory, DRIVER_LOCATION_CATEGORIES, VehicleDocument } from '../../types';
import DocumentAttachment from '../DocumentAttachment';
import { authFetch } from '../../authFetch';

interface DriverFormModalProps {
  driver: DriverEmployee | null; // null = creating a new driver
  onAddDriver: (driver: Omit<DriverEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateDriver: (id: string, driver: Partial<DriverEmployee>) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}

type FormTab = 'basic' | 'documents' | 'salary';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DriverFormModal({ driver, onAddDriver, onUpdateDriver, onClose, onSaved }: DriverFormModalProps) {
  const isEditing = !!driver;
  const [tab, setTab] = useState<FormTab>('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [basic, setBasic] = useState({
    id: driver?.id || '', name: driver?.name || '', driverNo: driver?.driverNo || '',
    vehicleNo: driver?.vehicleNo || '', accountNumber: driver?.accountNumber || '', ifscCode: driver?.ifscCode || '',
    reporting: driver?.reporting || '', remark: driver?.remark || '',
    location: driver?.location || DRIVER_LOCATION_CATEGORIES[0] as DriverLocationCategory
  });
  const [basicErrors, setBasicErrors] = useState<{ driverNo?: boolean }>({});
  const [documents, setDocuments] = useState<VehicleDocument[]>(driver?.documents || []);

  const [salaryMonth, setSalaryMonth] = useState(driver?.month || currentMonthKey());
  const [attendanceSummary, setAttendanceSummary] = useState({ totalDays: 0, workingDays: 0, lopDays: 0, exemptionLeaveDays: 0 });
  const [salaryForm, setSalaryForm] = useState({
    grossSalary: driver?.grossSalary != null ? String(driver.grossSalary) : '',
    pettyCashAdvance: driver?.pettyCashAdvance != null ? String(driver.pettyCashAdvance) : '',
    loanDeduction: driver?.loanDeduction != null ? String(driver.loanDeduction) : '',
    recoveryAmount: driver?.recoveryAmount != null ? String(driver.recoveryAmount) : '',
    driverWelfare: driver?.driverWelfare != null ? String(driver.driverWelfare) : '',
    bata: driver?.bata != null ? String(driver.bata) : ''
  });

  // Attendance-derived stat cards, pulled live so they update as attendance is
  // marked - the same "attendance feeds salary" link as HR & Payroll.
  useEffect(() => {
    if (!driver) return;
    authFetch(`/api/drivers/attendance/monthly/${encodeURIComponent(driver.id)}/${salaryMonth}`)
      .then(r => r.json())
      .then(({ data }) => {
        if (data) setAttendanceSummary({ totalDays: data.totalDays, workingDays: data.workingDays, lopDays: data.lopDays, exemptionLeaveDays: data.exemptionLeaveDays });
      })
      .catch(() => {});
  }, [driver, salaryMonth]);

  const num = (v: string) => Number(v) || 0;
  const wagesPerDay = attendanceSummary.totalDays > 0 ? num(salaryForm.grossSalary) / attendanceSummary.totalDays : 0;
  const lopAmount = attendanceSummary.lopDays * wagesPerDay;
  const total = num(salaryForm.grossSalary) - lopAmount;

  const handleSubmit = async () => {
    if (!basic.id.trim() || !basic.name.trim()) {
      setError('Driver ID and Driver Name are required.');
      setTab('basic');
      return;
    }
    const nextBasicErrors = { driverNo: basic.driverNo.length !== 10 };
    setBasicErrors(nextBasicErrors);
    if (nextBasicErrors.driverNo) {
      setError('Please fix the highlighted fields below.');
      setTab('basic');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const payload = {
        ...basic,
        documents,
        month: salaryMonth,
        grossSalary: num(salaryForm.grossSalary) || undefined,
        pettyCashAdvance: num(salaryForm.pettyCashAdvance) || undefined,
        loanDeduction: num(salaryForm.loanDeduction) || undefined,
        recoveryAmount: num(salaryForm.recoveryAmount) || undefined,
        driverWelfare: num(salaryForm.driverWelfare) || undefined,
        bata: num(salaryForm.bata) || undefined,
        lopAmount: parseFloat(lopAmount.toFixed(2)) || undefined
      };
      if (isEditing) {
        await onUpdateDriver(basic.id, payload);
      } else {
        await onAddDriver(payload as DriverEmployee);
      }
      onSaved();
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
                  <label className="block font-semibold text-slate-500 mb-1">Driver No* <span className="text-slate-400 font-normal">(10 digits)</span></label>
                  <input type="text" inputMode="numeric" value={basic.driverNo}
                    onChange={e => setBasic({ ...basic, driverNo: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    autoComplete="off" maxLength={10} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  {basicErrors.driverNo && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Vehicle No</label>
                  <input value={basic.vehicleNo} onChange={e => setBasic({ ...basic, vehicleNo: e.target.value.toUpperCase() })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
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
                    {DRIVER_LOCATION_CATEGORIES.map(loc => <option key={loc} value={loc}>{loc}</option>)}
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
            <DocumentAttachment documents={documents} onChange={setDocuments} label="Attach Driver Documents" />
          )}

          {tab === 'salary' && (
            <div className="space-y-3">
              <input type="month" value={salaryMonth} onChange={e => setSalaryMonth(e.target.value)} autoComplete="off" className="border border-slate-300 rounded-lg px-2.5 py-1.5" />

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                  <p className="text-slate-400 uppercase text-[9px] font-bold">No. of Days</p>
                  <p className="font-black text-slate-700">{attendanceSummary.totalDays}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                  <p className="text-slate-400 uppercase text-[9px] font-bold">Working Days</p>
                  <p className="font-black text-slate-700">{attendanceSummary.workingDays}</p>
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
                    <label className="block text-slate-400 mb-0.5">Petty Cash/Advance</label>
                    <input type="number" value={salaryForm.pettyCashAdvance} onChange={e => setSalaryForm({ ...salaryForm, pettyCashAdvance: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Loan Deduction</label>
                    <input type="number" value={salaryForm.loanDeduction} onChange={e => setSalaryForm({ ...salaryForm, loanDeduction: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Recovery Amount</label>
                    <input type="number" value={salaryForm.recoveryAmount} onChange={e => setSalaryForm({ ...salaryForm, recoveryAmount: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Driver Welfare</label>
                    <input type="number" value={salaryForm.driverWelfare} onChange={e => setSalaryForm({ ...salaryForm, driverWelfare: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">BATA</label>
                    <input type="number" value={salaryForm.bata} onChange={e => setSalaryForm({ ...salaryForm, bata: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                    <p className="text-emerald-600 uppercase text-[9px] font-bold">Wages Per Day (auto = Gross Salary &divide; No. of Days)</p>
                    <p className="font-black text-emerald-700">Rs. {wagesPerDay.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>

              <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 grid grid-cols-2 gap-y-1.5">
                <span className="text-purple-500 font-semibold">LOP Amount</span><span className="text-right font-bold">Rs. {lopAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className="text-purple-700 font-black">Total</span><span className="text-right font-black text-purple-700">Rs. {total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
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
