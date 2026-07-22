import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, User, Coins, Landmark } from 'lucide-react';
import { StaffEmployee, StaffSalaryDetail, StaffSalaryHike, StaffBankDetail } from '../../types';
import DateInput from '../DateInput';

interface StaffFormModalProps {
  employee: StaffEmployee | null; // null = creating a new employee
  onAddEmployee: (emp: Omit<StaffEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateEmployee: (id: string, emp: Partial<StaffEmployee>) => Promise<void>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

type FormTab = 'basic' | 'salary' | 'bank';

function deriveOrgUnitPreview(empId: string): 'KCM_SUPPLY' | 'KCM_INSTA' {
  return /^KCMI\d+/i.test(empId) ? 'KCM_INSTA' : 'KCM_SUPPLY';
}

export default function StaffFormModal({ employee, onAddEmployee, onUpdateEmployee, onClose, onSaved }: StaffFormModalProps) {
  const isEditing = !!employee;
  const [tab, setTab] = useState<FormTab>('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [basic, setBasic] = useState({
    id: employee?.id || '', name: employee?.name || '', designation: employee?.designation || '',
    dateOfJoining: employee?.dateOfJoining || '', dateOfLeaving: employee?.dateOfLeaving || '',
    location: employee?.location || 'Bangalore', status: employee?.status || 'Active' as StaffEmployee['status'],
    remarks: employee?.remarks || ''
  });

  const [salary, setSalary] = useState({ ctc25: '', annualCtc25: '', fuelOtherAddition: '', remarks: '' });
  const [salaryDetailId, setSalaryDetailId] = useState<string | null>(null);
  const [bank, setBank] = useState({ accountNumber: '', ifscCode: '', bankName: '', amount: '' });
  const [bankDetailId, setBankDetailId] = useState<string | null>(null);
  const [hikes, setHikes] = useState<StaffSalaryHike[]>([]);
  const [hikeForm, setHikeForm] = useState({ effectiveDate: '', amount: '' });
  const [revealAccount, setRevealAccount] = useState(false);

  useEffect(() => {
    if (!employee) return;
    fetch('/api/staff/salary-detail').then(r => r.json()).then((all: (StaffSalaryDetail & { effectiveSalary: number })[]) => {
      const mine = all.find(d => d.empId === employee.id);
      if (mine) {
        setSalaryDetailId(mine.id);
        setSalary({
          ctc25: String(mine.ctc25 ?? ''), annualCtc25: String(mine.annualCtc25 ?? ''),
          fuelOtherAddition: String(mine.fuelOtherAddition ?? ''), remarks: mine.remarks || ''
        });
      }
    }).catch(() => {});
    fetch('/api/staff/bank-detail').then(r => r.json()).then((all: StaffBankDetail[]) => {
      const mine = all.find(d => d.empId === employee.id);
      if (mine) {
        setBankDetailId(mine.id);
        setBank({
          accountNumber: mine.accountNumber || '', ifscCode: mine.ifscCode || '',
          bankName: mine.bankName || '', amount: String(mine.amount ?? '')
        });
      }
    }).catch(() => {});
    fetch('/api/staff/salary-hikes').then(r => r.json()).then((all: StaffSalaryHike[]) => {
      setHikes(all.filter(h => h.empId === employee.id));
    }).catch(() => {});
  }, [employee]);

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
    setIsSubmitting(true);
    setError('');
    try {
      if (isEditing) {
        await onUpdateEmployee(basic.id, basic);
      } else {
        await onAddEmployee(basic as StaffEmployee);
      }

      const salaryPayload = {
        id: salaryDetailId || undefined, empId: basic.id,
        ctc25: Number(salary.ctc25) || undefined, annualCtc25: Number(salary.annualCtc25) || undefined,
        fuelOtherAddition: Number(salary.fuelOtherAddition) || undefined, remarks: salary.remarks || undefined
      };
      await fetch(salaryDetailId ? `/api/staff/salary-detail/${salaryDetailId}` : '/api/staff/salary-detail', {
        method: salaryDetailId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(salaryPayload)
      });

      const bankPayload = {
        id: bankDetailId || undefined, empId: basic.id,
        accountNumber: bank.accountNumber || undefined, ifscCode: bank.ifscCode || undefined,
        bankName: bank.bankName || undefined, amount: Number(bank.amount) || undefined
      };
      await fetch(bankDetailId ? `/api/staff/bank-detail/${bankDetailId}` : '/api/staff/bank-detail', {
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
    const res = await fetch('/api/staff/salary-hikes', {
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
    const res = await fetch(`/api/staff/salary-hikes/${id}`, { method: 'DELETE' });
    if (res.ok && employee) {
      const { data } = await res.json();
      setHikes(data.filter((h: StaffSalaryHike) => h.empId === employee.id));
    }
  };

  const maskedAccount = bank.accountNumber && bank.accountNumber.length > 4
    ? `${'•'.repeat(bank.accountNumber.length - 4)}${bank.accountNumber.slice(-4)}`
    : bank.accountNumber;

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{isEditing ? `Edit ${basic.id}` : 'Add Staff'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-1.5 px-5 pt-4 text-xs font-semibold">
          {([['basic', 'Basic Info', User], ['salary', 'Salary Details', Coins], ['bank', 'Bank Details', Landmark]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 cursor-pointer ${tab === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
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
                    placeholder="KCM15001" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 disabled:bg-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Name*</label>
                  <input value={basic.name} onChange={e => setBasic({ ...basic, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Designation</label>
                  <input value={basic.designation} onChange={e => setBasic({ ...basic, designation: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Location</label>
                  <input value={basic.location} onChange={e => setBasic({ ...basic, location: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Date of Joining</label>
                  <DateInput value={basic.dateOfJoining} onChange={e => setBasic({ ...basic, dateOfJoining: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Date of Leaving</label>
                  <DateInput value={basic.dateOfLeaving} onChange={e => handleDateOfLeavingChange(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Status</label>
                  <select value={basic.status} onChange={e => setBasic({ ...basic, status: e.target.value as StaffEmployee['status'] })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Org Unit (auto)</label>
                  <input value={basic.id ? deriveOrgUnitPreview(basic.id) : ''} disabled className="w-full border border-slate-200 bg-slate-100 rounded-lg px-2.5 py-1.5 text-slate-500" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Remarks</label>
                <input value={basic.remarks} onChange={e => setBasic({ ...basic, remarks: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
          )}

          {tab === 'salary' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">CTC (2025)</label>
                  <input type="number" value={salary.ctc25} onChange={e => setSalary({ ...salary, ctc25: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Annual CTC (2025)</label>
                  <input type="number" value={salary.annualCtc25} onChange={e => setSalary({ ...salary, annualCtc25: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Fuel / Other Addition</label>
                <input type="number" value={salary.fuelOtherAddition} onChange={e => setSalary({ ...salary, fuelOtherAddition: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Remarks</label>
                <input value={salary.remarks} onChange={e => setSalary({ ...salary, remarks: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>

              {isEditing ? (
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
                    <input type="date" value={hikeForm.effectiveDate} onChange={e => setHikeForm({ ...hikeForm, effectiveDate: e.target.value })} className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5" />
                    <input type="number" placeholder="Amount" value={hikeForm.amount} onChange={e => setHikeForm({ ...hikeForm, amount: e.target.value })} className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5" />
                    <button onClick={addHike} className="bg-slate-900 hover:bg-slate-800 text-white px-3 rounded-lg cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 italic">Save this employee first to start adding salary hikes.</p>
              )}
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
                  <input value={bank.ifscCode} onChange={e => setBank({ ...bank, ifscCode: e.target.value.toUpperCase() })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Bank Name</label>
                  <input value={bank.bankName} onChange={e => setBank({ ...bank, bankName: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Amount</label>
                <input type="number" value={bank.amount} onChange={e => setBank({ ...bank, amount: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 font-semibold hover:text-slate-700 cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-lg uppercase text-[11px] cursor-pointer disabled:opacity-50">
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
