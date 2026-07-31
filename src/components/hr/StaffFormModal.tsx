import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, User, Coins, Landmark, Wallet, Upload } from 'lucide-react';
import { StaffEmployee, StaffSalaryDetail, StaffSalaryHike, StaffAdvanceDeduction, StaffBankDetail, StaffProvidentFund, VehicleDocument } from '../../types';
import DocumentAttachment from '../DocumentAttachment';
import { authFetch } from '../../authFetch';

interface StaffFormModalProps {
  employee: StaffEmployee | null; // null = creating a new employee
  onAddEmployee: (emp: Omit<StaffEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateEmployee: (id: string, emp: Partial<StaffEmployee>) => Promise<void>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

type FormTab = 'basic' | 'documents' | 'salary' | 'pf' | 'bank';

const WORKING_DAYS_DIVISOR = 30.5;

function deriveOrgUnitPreview(empId: string): 'KCM_SUPPLY' | 'KCM_INSTA' {
  return /^KCMI\d+/i.test(empId) ? 'KCM_INSTA' : 'KCM_SUPPLY';
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const emptyPfForm = {
  basic: '', hra: '', conveyance: '', medicalAllowance: '', lta: '', cca: '', fuelAllowance: '', otherAllowances: '', extraDays: '',
  professionalTax: '', epf: '', esi: '', fullAndFinal: '', otherDeductions: '', advances: '', incomeTax: ''
};

export default function StaffFormModal({ employee, onAddEmployee, onUpdateEmployee, onClose, onSaved }: StaffFormModalProps) {
  const isEditing = !!employee;
  const [tab, setTab] = useState<FormTab>('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [basic, setBasic] = useState({
    id: employee?.id || '', name: employee?.name || '', designation: employee?.designation || '',
    dateOfJoining: employee?.dateOfJoining || '', dateOfLeaving: employee?.dateOfLeaving || '',
    location: employee?.location || 'Bangalore', status: employee?.status || 'Active' as StaffEmployee['status'],
    employmentType: employee?.employmentType || 'On-Roll' as StaffEmployee['employmentType'],
    contactNumber: employee?.contactNumber || '', aadharNumber: employee?.aadharNumber || '', panNumber: employee?.panNumber || '',
    remarks: employee?.remarks || ''
  });
  const [basicErrors, setBasicErrors] = useState<{ aadharNumber?: boolean; panNumber?: boolean; contactNumber?: boolean }>({});
  const [aadharDocuments, setAadharDocuments] = useState<VehicleDocument[]>(employee?.aadharDocuments || []);
  const [panDocuments, setPanDocuments] = useState<VehicleDocument[]>(employee?.panDocuments || []);
  const [otherDocuments, setOtherDocuments] = useState<VehicleDocument[]>(employee?.documents || []);

  const [salary, setSalary] = useState({ ctc25: '', annualCtc25: '', advanceAmount: '', remarks: '' });
  const [salaryDetailId, setSalaryDetailId] = useState<string | null>(null);
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [advanceDeductions, setAdvanceDeductions] = useState<StaffAdvanceDeduction[]>([]);
  const [deductionForm, setDeductionForm] = useState({ date: '', amount: '' });
  const [bank, setBank] = useState({ accountNumber: '', ifscCode: '', bankName: '', amount: '' });
  const [bankDetailId, setBankDetailId] = useState<string | null>(null);
  const [hikes, setHikes] = useState<StaffSalaryHike[]>([]);
  const [hikeForm, setHikeForm] = useState({ effectiveDate: '', amount: '' });
  const [revealAccount, setRevealAccount] = useState(false);

  const [pfMonth, setPfMonth] = useState(currentMonthKey());
  const [pfForm, setPfForm] = useState({ ...emptyPfForm });
  const [pfAttendance, setPfAttendance] = useState({ totalDays: 0, presentDays: 0, totalAbsent: 0, lopDays: 0 });

  const loadAdvanceDeductions = () => {
    if (!employee) return;
    authFetch('/api/staff/advance-deductions').then(r => r.json()).then((all: StaffAdvanceDeduction[]) => {
      setAdvanceDeductions(all.filter(d => d.empId === employee.id));
    }).catch(() => {});
  };

  useEffect(() => {
    if (!employee) return;
    authFetch('/api/staff/salary-detail').then(r => r.json()).then((all: (StaffSalaryDetail & { effectiveSalary: number; advanceBalance: number })[]) => {
      const mine = all.find(d => d.empId === employee.id);
      if (mine) {
        setSalaryDetailId(mine.id);
        setSalary({
          ctc25: String(mine.ctc25 ?? ''), annualCtc25: String(mine.annualCtc25 ?? ''),
          advanceAmount: String(mine.advanceAmount ?? ''), remarks: mine.remarks || ''
        });
        setAdvanceBalance(mine.advanceBalance || 0);
      }
    }).catch(() => {});
    authFetch('/api/staff/bank-detail').then(r => r.json()).then((all: StaffBankDetail[]) => {
      const mine = all.find(d => d.empId === employee.id);
      if (mine) {
        setBankDetailId(mine.id);
        setBank({
          accountNumber: mine.accountNumber || '', ifscCode: mine.ifscCode || '',
          bankName: mine.bankName || '', amount: String(mine.amount ?? '')
        });
      }
    }).catch(() => {});
    authFetch('/api/staff/salary-hikes').then(r => r.json()).then((all: StaffSalaryHike[]) => {
      setHikes(all.filter(h => h.empId === employee.id));
    }).catch(() => {});
    loadAdvanceDeductions();
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    authFetch('/api/staff/provident-fund').then(r => r.json()).then((all: (StaffProvidentFund & { totalDays: number; workingDays: number; totalAbsent: number; lopDays: number })[]) => {
      const myRecords = all.filter(r => r.empId === employee.id);
      const mine = myRecords.find(r => r.month === pfMonth);
      if (mine) {
        setPfForm({
          basic: String(mine.basic ?? ''), hra: String(mine.hra ?? ''), conveyance: String(mine.conveyance ?? ''),
          medicalAllowance: String(mine.medicalAllowance ?? ''), lta: String(mine.lta ?? ''),
          cca: String(mine.cca ?? ''), fuelAllowance: String(mine.fuelAllowance ?? ''), otherAllowances: String(mine.otherAllowances ?? ''),
          extraDays: String(mine.extraDays ?? ''), professionalTax: String(mine.professionalTax ?? ''), epf: String(mine.epf ?? ''),
          esi: String(mine.esi ?? ''), fullAndFinal: String(mine.fullAndFinal ?? ''),
          otherDeductions: String(mine.otherDeductions ?? ''), advances: String(mine.advances ?? ''), incomeTax: String(mine.incomeTax ?? '')
        });
      } else {
        // No entry yet for this month - carry forward the recurring, rarely-changing
        // figures (Basic/HRA/Conveyance/Medical/LTA/CCA and Professional Tax/EPF/ESI)
        // from the most recent earlier month so HR doesn't retype them every month.
        // Everything else (Fuel, Other Allowances, Extra Days, F&F, Other Deductions,
        // Advances, Income Tax) varies month to month and stays blank for manual entry.
        const previous = myRecords.filter(r => r.month < pfMonth).sort((a, b) => b.month.localeCompare(a.month))[0];
        setPfForm({
          ...emptyPfForm,
          basic: String(previous?.basic ?? ''), hra: String(previous?.hra ?? ''), conveyance: String(previous?.conveyance ?? ''),
          medicalAllowance: String(previous?.medicalAllowance ?? ''), lta: String(previous?.lta ?? ''), cca: String(previous?.cca ?? ''),
          professionalTax: String(previous?.professionalTax ?? ''), epf: String(previous?.epf ?? ''), esi: String(previous?.esi ?? '')
        });
      }
    }).catch(() => {});
    // Attendance-derived totalDays/presentDays/totalAbsent/lopDays should show even before a PF record exists for this month.
    // presentDays here is Present + Paid Leave (salaryWorkingDays) - both count as "worked" for salary purposes.
    authFetch(`/api/staff/attendance/monthly/${encodeURIComponent(employee.id)}/${pfMonth}`).then(r => r.json()).then(({ data }) => {
      if (data) setPfAttendance({ totalDays: data.totalDays, presentDays: data.salaryWorkingDays, totalAbsent: data.totalAbsent, lopDays: data.lopDays });
    }).catch(() => {});
  }, [employee, pfMonth]);

  const handleDateOfLeavingChange = (value: string) => {
    if (value && !basic.dateOfLeaving) {
      const confirmed = confirm('Setting a Date of Leaving will also mark this employee Inactive. Continue?');
      if (!confirmed) return;
      setBasic({ ...basic, dateOfLeaving: value, status: 'Inactive' });
    } else {
      setBasic({ ...basic, dateOfLeaving: value });
    }
  };

  const handleSubmit = async () => {
    if (!basic.id.trim() || !basic.name.trim()) {
      setError('Employee ID and Name are required.');
      setTab('basic');
      return;
    }
    const nextBasicErrors = {
      aadharNumber: basic.aadharNumber.length !== 12,
      panNumber: basic.panNumber.length !== 10,
      contactNumber: basic.contactNumber.length !== 10
    };
    setBasicErrors(nextBasicErrors);
    if (nextBasicErrors.aadharNumber || nextBasicErrors.panNumber || nextBasicErrors.contactNumber) {
      setError('Please fix the highlighted fields below.');
      setTab('basic');
      return;
    }
    if (aadharDocuments.length === 0 || panDocuments.length === 0) {
      setError('Aadhar Card and PAN Card document uploads are both required.');
      setTab('documents');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const employeePayload = { ...basic, aadharDocuments, panDocuments, documents: otherDocuments };
      if (isEditing) {
        await onUpdateEmployee(basic.id, employeePayload);
      } else {
        await onAddEmployee(employeePayload as StaffEmployee);
      }

      const salaryPayload = {
        id: salaryDetailId || undefined, empId: basic.id,
        ctc25: Number(salary.ctc25) || undefined, annualCtc25: Number(salary.annualCtc25) || undefined,
        advanceAmount: Number(salary.advanceAmount) || undefined, remarks: salary.remarks || undefined
      };
      await authFetch(salaryDetailId ? `/api/staff/salary-detail/${salaryDetailId}` : '/api/staff/salary-detail', {
        method: salaryDetailId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(salaryPayload)
      });

      const pfPayload = {
        id: `${basic.id}-${pfMonth}`, empId: basic.id, month: pfMonth,
        basic: Number(pfForm.basic) || undefined, hra: Number(pfForm.hra) || undefined, conveyance: Number(pfForm.conveyance) || undefined,
        medicalAllowance: Number(pfForm.medicalAllowance) || undefined, lta: Number(pfForm.lta) || undefined,
        cca: Number(pfForm.cca) || undefined, fuelAllowance: Number(pfForm.fuelAllowance) || undefined, otherAllowances: Number(pfForm.otherAllowances) || undefined,
        extraDays: Number(pfForm.extraDays) || undefined, professionalTax: Number(pfForm.professionalTax) || undefined, epf: Number(pfForm.epf) || undefined,
        esi: Number(pfForm.esi) || undefined, fullAndFinal: Number(pfForm.fullAndFinal) || undefined,
        otherDeductions: Number(pfForm.otherDeductions) || undefined, advances: Number(pfForm.advances) || undefined, incomeTax: Number(pfForm.incomeTax) || undefined
      };
      await authFetch('/api/staff/provident-fund', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pfPayload)
      });

      const bankPayload = {
        id: bankDetailId || undefined, empId: basic.id,
        accountNumber: bank.accountNumber || undefined, ifscCode: bank.ifscCode || undefined,
        bankName: bank.bankName || undefined, amount: Number(bank.amount) || undefined
      };
      await authFetch(bankDetailId ? `/api/staff/bank-detail/${bankDetailId}` : '/api/staff/bank-detail', {
        method: bankDetailId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bankPayload)
      });

      await onSaved();
      onClose();
    } catch (err) {
      setError('Something went wrong while saving. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addHike = async () => {
    if (!employee || !hikeForm.effectiveDate || !hikeForm.amount) return;
    const res = await authFetch('/api/staff/salary-hikes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId: employee.id, effectiveDate: hikeForm.effectiveDate, amount: Number(hikeForm.amount) })
    });
    if (res.ok) {
      const { data } = await res.json();
      setHikes(data.filter((h: StaffSalaryHike) => h.empId === employee.id));
      setHikeForm({ effectiveDate: '', amount: '' });
    }
  };

  const removeHike = async (id: string) => {
    const res = await authFetch(`/api/staff/salary-hikes/${id}`, { method: 'DELETE' });
    if (res.ok && employee) {
      const { data } = await res.json();
      setHikes(data.filter((h: StaffSalaryHike) => h.empId === employee.id));
    }
  };

  const addDeduction = async () => {
    if (!employee || !deductionForm.date || !deductionForm.amount) return;
    const res = await authFetch('/api/staff/advance-deductions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId: employee.id, date: deductionForm.date, amount: Number(deductionForm.amount) })
    });
    if (res.ok) {
      setDeductionForm({ date: '', amount: '' });
      loadAdvanceDeductions();
      // Refresh the computed balance immediately rather than waiting for the modal to reopen.
      const detailRes = await authFetch('/api/staff/salary-detail');
      const all = await detailRes.json();
      const mine = all.find((d: any) => d.empId === employee.id);
      if (mine) setAdvanceBalance(mine.advanceBalance || 0);
    }
  };

  const removeDeduction = async (id: string) => {
    const res = await authFetch(`/api/staff/advance-deductions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadAdvanceDeductions();
      if (employee) {
        const detailRes = await authFetch('/api/staff/salary-detail');
        const all = await detailRes.json();
        const mine = all.find((d: any) => d.empId === employee.id);
        if (mine) setAdvanceBalance(mine.advanceBalance || 0);
      }
    }
  };

  // Mirrors the server's calculation exactly (see /api/staff/provident-fund) so the
  // form shows live totals while typing, before anything is saved. Per Day Salary is
  // based only on the recurring monthly earnings (excludes extra-days pay, since that
  // pay is itself derived from this figure), and LOP Amount is linked straight from
  // attendance's LOP day count - so attendance and salary stay in sync automatically.
  const num = (v: string) => Number(v) || 0;
  const pfRecurringEarnings = num(pfForm.basic) + num(pfForm.hra) + num(pfForm.conveyance) + num(pfForm.medicalAllowance) +
    num(pfForm.lta) + num(pfForm.cca) + num(pfForm.fuelAllowance) + num(pfForm.otherAllowances);
  const pfPerDaySalary = pfRecurringEarnings / WORKING_DAYS_DIVISOR;
  const pfExtraDaysAmount = num(pfForm.extraDays) * pfPerDaySalary;
  const pfLopAmount = pfAttendance.lopDays * pfPerDaySalary;
  const pfTotalEarnings = pfRecurringEarnings + pfExtraDaysAmount;
  const pfTotalDeductions = num(pfForm.professionalTax) + num(pfForm.epf) + num(pfForm.esi) + pfLopAmount +
    num(pfForm.fullAndFinal) + num(pfForm.otherDeductions) + num(pfForm.advances) + num(pfForm.incomeTax);
  const pfGrossSalary = pfTotalEarnings;
  const pfNetSalary = Math.round(pfGrossSalary - pfTotalDeductions);

  const maskedAccount = bank.accountNumber && bank.accountNumber.length > 4
    ? `${'•'.repeat(bank.accountNumber.length - 4)}${bank.accountNumber.slice(-4)}`
    : bank.accountNumber;

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-pink-500 to-purple-600" />
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{isEditing ? `Edit ${basic.id}` : 'Add Staff'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-1.5 px-5 pt-4 text-xs font-semibold">
          {([['basic', 'Basic Info', User], ['documents', 'Upload Documents', Upload], ['salary', 'Salary Details', Coins], ['pf', 'Salary Breakup', Wallet], ['bank', 'Bank Details', Landmark]] as const).map(([key, label, Icon]) => (
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
                  <label className="block font-semibold text-slate-500 mb-1">Employee ID*</label>
                  <input value={basic.id} onChange={e => setBasic({ ...basic, id: e.target.value.toUpperCase() })} disabled={isEditing}
                    autoComplete="off" placeholder="KCM15001" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 disabled:bg-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Name*</label>
                  <input value={basic.name} onChange={e => setBasic({ ...basic, name: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Designation</label>
                  <input value={basic.designation} onChange={e => setBasic({ ...basic, designation: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Location</label>
                  <input value={basic.location} onChange={e => setBasic({ ...basic, location: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Date of Joining</label>
                  <input value={basic.dateOfJoining} onChange={e => setBasic({ ...basic, dateOfJoining: e.target.value })}
                    autoComplete="off" placeholder="DD/MM/YYYY" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Date of Leaving</label>
                  <input value={basic.dateOfLeaving} onChange={e => handleDateOfLeavingChange(e.target.value)}
                    autoComplete="off" placeholder="DD/MM/YYYY" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Contact Number* <span className="text-slate-400 font-normal">(10 digits)</span></label>
                  <input type="text" inputMode="numeric" value={basic.contactNumber}
                    onChange={e => setBasic({ ...basic, contactNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    autoComplete="off" maxLength={10} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  {basicErrors.contactNumber && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Aadhar Number* <span className="text-slate-400 font-normal">(12 digits)</span></label>
                  <input type="text" inputMode="numeric" value={basic.aadharNumber}
                    onChange={e => setBasic({ ...basic, aadharNumber: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                    autoComplete="off" maxLength={12} placeholder="XXXXXXXXXXXX" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  {basicErrors.aadharNumber && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">PAN Card Number* <span className="text-slate-400 font-normal">(10 characters)</span></label>
                  <input value={basic.panNumber} onChange={e => setBasic({ ...basic, panNumber: e.target.value.toUpperCase().slice(0, 10) })}
                    autoComplete="off" maxLength={10} placeholder="ABCDE1234F" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  {basicErrors.panNumber && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Status</label>
                  <select value={basic.status} onChange={e => setBasic({ ...basic, status: e.target.value as StaffEmployee['status'] })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Type</label>
                  <select value={basic.employmentType} onChange={e => setBasic({ ...basic, employmentType: e.target.value as StaffEmployee['employmentType'] })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
                    <option value="On-Roll">On-Roll</option>
                    <option value="Contract">Contract</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Org Unit (auto)</label>
                  <input value={basic.id ? deriveOrgUnitPreview(basic.id) : ''} disabled className="w-full border border-slate-200 bg-slate-100 rounded-lg px-2.5 py-1.5 text-slate-500" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Remarks</label>
                <input value={basic.remarks} onChange={e => setBasic({ ...basic, remarks: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-slate-600 mb-1.5">Aadhar Card* (one file)</p>
                <DocumentAttachment documents={aadharDocuments} onChange={setAadharDocuments} label="Attach Aadhar Card" hideDropzone maxFiles={1} />
                {aadharDocuments.length === 0 && <p className="text-rose-500 mt-1">Required - please attach the Aadhar document.</p>}
              </div>
              <div>
                <p className="font-semibold text-slate-600 mb-1.5">PAN Card* (one file)</p>
                <DocumentAttachment documents={panDocuments} onChange={setPanDocuments} label="Attach PAN Card" hideDropzone maxFiles={1} />
                {panDocuments.length === 0 && <p className="text-rose-500 mt-1">Required - please attach the PAN document.</p>}
              </div>
              <div>
                <p className="font-semibold text-slate-600 mb-1.5">Other Documents</p>
                <DocumentAttachment documents={otherDocuments} onChange={setOtherDocuments} label="Attach Other Documents" hideDropzone />
              </div>
            </div>
          )}

          {tab === 'salary' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">CTC</label>
                  <input type="number" value={salary.ctc25} onChange={e => setSalary({ ...salary, ctc25: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Annual CTC</label>
                  <input type="number" value={salary.annualCtc25} onChange={e => setSalary({ ...salary, annualCtc25: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Advance</label>
                <input type="number" value={salary.advanceAmount} onChange={e => setSalary({ ...salary, advanceAmount: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                <p className="text-slate-400 mt-1">Amount the staff has taken as an advance from the company.</p>
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Remarks</label>
                <input value={salary.remarks} onChange={e => setSalary({ ...salary, remarks: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>

              {isEditing ? (
                <>
                  <div className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-slate-600 uppercase">Advance Deductions</p>
                      <span className="bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-1 font-bold">
                        Balance: Rs. {advanceBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="space-y-1.5 mb-2">
                      {advanceDeductions.sort((a, b) => b.date.localeCompare(a.date)).map(d => (
                        <div key={d.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5">
                          <span className="font-mono">{d.date}</span>
                          <span className="font-semibold">Rs. {d.amount.toLocaleString('en-IN')}</span>
                          <button onClick={() => removeDeduction(d.id)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                      {advanceDeductions.length === 0 && <p className="text-slate-400 text-center py-2">No deductions recorded yet.</p>}
                    </div>
                    <div className="flex gap-2">
                      <input type="date" value={deductionForm.date} onChange={e => setDeductionForm({ ...deductionForm, date: e.target.value })} autoComplete="off" className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5" />
                      <input type="number" placeholder="Amount" value={deductionForm.amount} onChange={e => setDeductionForm({ ...deductionForm, amount: e.target.value })} autoComplete="off" className="no-spinner flex-1 border border-slate-300 rounded-lg px-2 py-1.5" />
                      <button onClick={addDeduction} className="bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white px-3 rounded-lg cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3">
                    <p className="font-bold text-slate-600 uppercase mb-2">Salary Hikes</p>
                    <div className="space-y-1.5 mb-2">
                      {hikes.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).map(h => (
                        <div key={h.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5">
                          <span className="font-mono">{h.effectiveDate}</span>
                          <span className="font-semibold">Rs. {h.amount.toLocaleString('en-IN')}</span>
                          <button onClick={() => removeHike(h.id)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                      {hikes.length === 0 && <p className="text-slate-400 text-center py-2">No hikes recorded yet.</p>}
                    </div>
                    <div className="flex gap-2">
                      <input type="date" value={hikeForm.effectiveDate} onChange={e => setHikeForm({ ...hikeForm, effectiveDate: e.target.value })} autoComplete="off" className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5" />
                      <input type="number" placeholder="Amount" value={hikeForm.amount} onChange={e => setHikeForm({ ...hikeForm, amount: e.target.value })} autoComplete="off" className="no-spinner flex-1 border border-slate-300 rounded-lg px-2 py-1.5" />
                      <button onClick={addHike} className="bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white px-3 rounded-lg cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-slate-400 italic">Save this employee first to start adding advance deductions and salary hikes.</p>
              )}
            </div>
          )}

          {tab === 'pf' && (
            <div className="space-y-3">
              <input type="month" value={pfMonth} onChange={e => setPfMonth(e.target.value)} autoComplete="off" className="border border-slate-300 rounded-lg px-2.5 py-1.5" />

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                  <p className="text-slate-400 uppercase text-[9px] font-bold">Total Days</p>
                  <p className="font-black text-slate-700">{pfAttendance.totalDays}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                  <p className="text-slate-400 uppercase text-[9px] font-bold">Working Days</p>
                  <p className="font-black text-slate-700">{pfAttendance.presentDays}</p>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-center">
                  <p className="text-rose-600 uppercase text-[9px] font-bold">Absent</p>
                  <p className="font-black text-rose-700">{pfAttendance.totalAbsent}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                  <p className="text-orange-600 uppercase text-[9px] font-bold">LOP Days</p>
                  <p className="font-black text-orange-700">{pfAttendance.lopDays}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-3">
                <p className="font-bold text-emerald-700 uppercase mb-2">Allowances (Earnings)</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['basic', 'Basic Salary'], ['hra', 'HRA'], ['conveyance', 'Conveyance'], ['medicalAllowance', 'Medical Allowance'],
                    ['lta', 'LTA'], ['cca', 'CCA'], ['fuelAllowance', 'Fuel Allowance'], ['otherAllowances', 'Other Allowances']
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-slate-400 mb-0.5">{label}</label>
                      <input type="number" value={pfForm[key]} onChange={e => setPfForm({ ...pfForm, [key]: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-slate-400 mb-0.5">Extra Days (count)</label>
                    <input type="number" value={pfForm.extraDays} onChange={e => setPfForm({ ...pfForm, extraDays: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                    <p className="text-emerald-600 uppercase text-[9px] font-bold">Per Day Salary (auto)</p>
                    <p className="font-black text-emerald-700">Rs. {pfPerDaySalary.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                    <p className="text-emerald-600 uppercase text-[9px] font-bold">Extra Days Amount (auto)</p>
                    <p className="font-black text-emerald-700">Rs. {pfExtraDaysAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-3">
                <p className="font-bold text-rose-700 uppercase mb-2">Deductions</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['professionalTax', 'Professional Tax'], ['epf', 'EPF'], ['esi', 'ESI'], ['fullAndFinal', 'F&F'],
                    ['otherDeductions', 'Other Deductions'], ['advances', 'Advances'], ['incomeTax', 'Income Tax']
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-slate-400 mb-0.5">{label}</label>
                      <input type="number" value={pfForm[key]} onChange={e => setPfForm({ ...pfForm, [key]: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                    </div>
                  ))}
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2">
                    <p className="text-rose-600 uppercase text-[9px] font-bold">LOP Amount (auto = LOP Days &times; Per Day Salary)</p>
                    <p className="font-black text-rose-700">Rs. {pfLopAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>

              <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 grid grid-cols-2 gap-y-1.5">
                <span className="text-purple-500 font-semibold">Total Earnings</span><span className="text-right font-bold">Rs. {pfTotalEarnings.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className="text-purple-500 font-semibold">Total Deductions</span><span className="text-right font-bold">Rs. {pfTotalDeductions.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className="text-purple-500 font-semibold">Gross Salary</span><span className="text-right font-bold">Rs. {pfGrossSalary.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className="text-purple-700 font-black">Net Salary</span><span className="text-right font-black text-purple-700">Rs. {pfNetSalary.toLocaleString('en-IN')}</span>
              </div>
              {!isEditing && <p className="text-slate-400 italic">Save this employee first to record Salary Breakup details.</p>}
            </div>
          )}

          {tab === 'bank' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Account Number</label>
                <div className="flex gap-2">
                  <input
                    type={revealAccount ? 'text' : 'password'}
                    value={revealAccount ? bank.accountNumber : maskedAccount}
                    onChange={e => setBank({ ...bank, accountNumber: e.target.value })}
                    onFocus={() => setRevealAccount(true)}
                    autoComplete="new-password"
                    className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5"
                  />
                  <button type="button" onClick={() => setRevealAccount(!revealAccount)} className="px-2.5 py-1 border border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer">
                    {revealAccount ? 'Hide' : 'Reveal'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">IFSC Code</label>
                  <input value={bank.ifscCode} onChange={e => setBank({ ...bank, ifscCode: e.target.value.toUpperCase() })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Bank Name</label>
                  <input value={bank.bankName} onChange={e => setBank({ ...bank, bankName: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Amount</label>
                <input type="number" value={bank.amount} onChange={e => setBank({ ...bank, amount: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 font-semibold hover:text-slate-700 cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className="bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold px-5 py-2 rounded-lg uppercase text-[11px] cursor-pointer disabled:opacity-50 transition-all">
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
