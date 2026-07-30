import React, { useState, useMemo } from 'react';
import { Truck, Plus, Search, Edit2, Trash2, X, ChevronDown, AlertTriangle } from 'lucide-react';
import { Vehicle, VehicleLoan, VehicleDocument, LoanStatus, NOCStatus, VEHICLE_LOAN_FINANCERS } from '../../types';
import { computeMonthsCompleted, computeDueDate } from '../../utils/loanDates';
import DateInput from '../DateInput';
import DocumentAttachment from '../DocumentAttachment';
import VehicleDetailsPopover from './VehicleDetailsPopover';

interface VehicleLoanSheetProps {
  vehicles: Vehicle[];
  vehicleLoans: VehicleLoan[];
  onAddVehicleLoan: (loan: Omit<VehicleLoan, 'id'> & { id: string }) => Promise<void>;
  onUpdateVehicleLoan: (id: string, loan: Partial<VehicleLoan>) => Promise<void>;
  onDeleteVehicleLoan: (id: string) => Promise<void>;
}

const OWNERSHIP_OPTIONS = ['KCM INSTA', 'KCM SUPPLY'];

const emptyForm = {
  regNo: '', ownership: '', financer: VEHICLE_LOAN_FINANCERS[0], financeNumber: '', loanAmount: '',
  emiStartDate: '', monthlyEmi: '', tenure: '', interest: '',
  loanStatus: 'Active' as LoanStatus, remarks: '', nocStatus: 'Not received' as NOCStatus
};

const isNearingCompletion = (monthsCompleted: number, tenure: number | undefined, loanStatus: LoanStatus): boolean => {
  if (tenure == null || loanStatus !== 'Active') return false;
  const bal = tenure - monthsCompleted;
  return bal <= 2 && bal >= 0;
};

function monthYearFromStart(emiStartDate: string, tenure: number): string {
  const [y, m] = emiStartDate.split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(y, m - 1 + tenure, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export default function VehicleLoanSheet({ vehicles, vehicleLoans, onAddVehicleLoan, onUpdateVehicleLoan, onDeleteVehicleLoan }: VehicleLoanSheetProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [financerFilter, setFinancerFilter] = useState<string[]>([]); // empty = all
  const [showFinancerDropdown, setShowFinancerDropdown] = useState(false);
  const [ownershipFilter, setOwnershipFilter] = useState<string[]>([]); // empty = all
  const [showOwnershipDropdown, setShowOwnershipDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [viewVehicleRegNo, setViewVehicleRegNo] = useState<string | null>(null);

  const vehicleByRegNo = (regNo: string): Vehicle | undefined =>
    vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo.trim().toUpperCase());

  const vehicleList = Array.from(new Set(vehicles.map(v => v.regNo || v['Reg. No.'] || '').filter(Boolean))).sort();

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDocuments([]);
    setShowModal(false);
  };

  const startEdit = (loan: VehicleLoan) => {
    setEditingId(loan.id);
    setForm({
      regNo: loan.regNo, ownership: loan.ownership || '', financer: loan.financer,
      financeNumber: loan.financeNumber || '', loanAmount: loan.loanAmount != null ? String(loan.loanAmount) : '',
      emiStartDate: loan.emiStartDate || '', monthlyEmi: loan.monthlyEmi != null ? String(loan.monthlyEmi) : '',
      tenure: loan.tenure != null ? String(loan.tenure) : '',
      interest: loan.interest != null ? String(loan.interest) : '', loanStatus: loan.loanStatus,
      remarks: loan.remarks || '', nocStatus: loan.nocStatus || 'Not received'
    });
    setDocuments(loan.documents || []);
    setShowModal(true);
  };

  const handleRegNoChange = (regNo: string) => {
    const matched = vehicleByRegNo(regNo);
    setForm(f => ({ ...f, regNo, ownership: matched ? (matched.Ownership || matched.ownership || f.ownership) : f.ownership }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.regNo.trim() || !form.financer) return;
    setIsSubmitting(true);
    try {
      const payload = {
        regNo: form.regNo.trim().toUpperCase(),
        ownership: form.ownership.trim(),
        financer: form.financer,
        financeNumber: form.financeNumber.trim(),
        loanAmount: parseFloat(form.loanAmount) || undefined,
        emiStartDate: form.emiStartDate,
        monthlyEmi: parseFloat(form.monthlyEmi) || undefined,
        tenure: parseInt(form.tenure) || undefined,
        interest: parseFloat(form.interest) || undefined,
        loanStatus: form.loanStatus,
        remarks: form.remarks.trim(),
        nocStatus: form.nocStatus,
        documents
      };
      if (editingId) {
        await onUpdateVehicleLoan(editingId, payload);
      } else {
        await onAddVehicleLoan({ ...payload, id: payload.regNo });
      }
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (loan: VehicleLoan) => {
    if (window.confirm(`Delete the loan record for ${loan.regNo}? This cannot be undone.`)) {
      await onDeleteVehicleLoan(loan.id);
    }
  };

  const toggleFinancerFilter = (financer: string) => {
    setFinancerFilter(prev => prev.includes(financer) ? prev.filter(f => f !== financer) : [...prev, financer]);
  };

  const toggleOwnershipFilter = (ownership: string) => {
    setOwnershipFilter(prev => prev.includes(ownership) ? prev.filter(o => o !== ownership) : [...prev, ownership]);
  };

  const filtered = useMemo(() => vehicleLoans.filter(l => {
    if (financerFilter.length > 0 && !financerFilter.includes(l.financer)) return false;
    if (ownershipFilter.length > 0 && !ownershipFilter.includes((l.ownership || '').toUpperCase())) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!l.regNo.toLowerCase().includes(q) && !(l.financeNumber || '').toLowerCase().includes(q) && !l.financer.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [vehicleLoans, financerFilter, ownershipFilter, searchTerm]);

  const suggestedClosing = form.emiStartDate && form.tenure ? monthYearFromStart(form.emiStartDate, parseInt(form.tenure) || 0) : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px] bg-white text-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by Reg. No, Finance Number, or Financer..." autoComplete="off" className="flex-1 outline-none" />
        </div>

        <div className="relative">
          <button onClick={() => setShowFinancerDropdown(!showFinancerDropdown)}
            className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap">
            Financer {financerFilter.length > 0 ? `(${financerFilter.length})` : '(All)'} <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showFinancerDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowFinancerDropdown(false)} />
              <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 text-xs">
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer font-bold border-b border-slate-100 mb-1">
                  <input type="checkbox" checked={financerFilter.length === 0} onChange={() => setFinancerFilter([])} />
                  Select All
                </label>
                {VEHICLE_LOAN_FINANCERS.map(f => (
                  <label key={f} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                    <input type="checkbox" checked={financerFilter.includes(f)} onChange={() => toggleFinancerFilter(f)} />
                    {f}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button onClick={() => setShowOwnershipDropdown(!showOwnershipDropdown)}
            className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap">
            Ownership {ownershipFilter.length > 0 ? `(${ownershipFilter.length})` : '(All)'} <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showOwnershipDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowOwnershipDropdown(false)} />
              <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 text-xs">
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer font-bold border-b border-slate-100 mb-1">
                  <input type="checkbox" checked={ownershipFilter.length === 0} onChange={() => setOwnershipFilter([])} />
                  Select All
                </label>
                {OWNERSHIP_OPTIONS.map(o => (
                  <label key={o} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                    <input type="checkbox" checked={ownershipFilter.includes(o)} onChange={() => toggleOwnershipFilter(o)} />
                    {o}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={() => { resetForm(); setShowModal(true); }}
          className="bg-gradient-to-r from-teal-600 to-emerald-700 hover:shadow-md text-white font-bold px-4 py-2 rounded-lg uppercase text-[11px] flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap">
          <Plus className="w-3.5 h-3.5" /> Add Vehicle Loan
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gradient-to-r from-teal-900 via-slate-900 to-emerald-900 text-teal-100 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-3 py-2.5">SL No</th>
                <th className="px-3 py-2.5">Ownership</th>
                <th className="px-3 py-2.5">Reg. No</th>
                <th className="px-3 py-2.5">Financer</th>
                <th className="px-3 py-2.5">Finance Number</th>
                <th className="px-3 py-2.5 text-right">Loan Amount</th>
                <th className="px-3 py-2.5 text-right">Monthly EMI</th>
                <th className="px-3 py-2.5 text-right">Tenure</th>
                <th className="px-3 py-2.5 text-right">Months Completed</th>
                <th className="px-3 py-2.5 text-right">Balance EMI</th>
                <th className="px-3 py-2.5">Due Date</th>
                <th className="px-3 py-2.5 text-right">Interest</th>
                <th className="px-3 py-2.5">Loan Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-10 text-slate-400">No vehicle loan records found.</td></tr>
              ) : filtered.map((loan, i) => {
                const monthsCompleted = computeMonthsCompleted(loan.emiStartDate, loan.tenure);
                const bal = loan.tenure != null ? loan.tenure - monthsCompleted : null;
                const dueDate = computeDueDate(loan.emiStartDate, monthsCompleted, loan.tenure);
                const nearing = isNearingCompletion(monthsCompleted, loan.tenure, loan.loanStatus);
                return (
                  <tr key={loan.id} className={`hover:bg-slate-50 ${nearing ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{loan.ownership || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button onClick={() => setViewVehicleRegNo(loan.regNo)} className="font-mono font-bold text-teal-700 hover:underline cursor-pointer">
                        {loan.regNo}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{loan.financer}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{loan.financeNumber || '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{loan.loanAmount ? loan.loanAmount.toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{loan.monthlyEmi ? loan.monthlyEmi.toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{loan.tenure ?? '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{monthsCompleted}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold">
                      {bal != null ? (
                        <span className={nearing ? 'text-amber-700 flex items-center justify-end gap-1' : 'text-slate-700'}>
                          {nearing && <AlertTriangle className="w-3 h-3" />}{bal}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{dueDate}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{loan.interest != null ? `${loan.interest}%` : '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block border rounded px-2 py-0.5 font-bold text-[10px] ${loan.loanStatus === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-300'}`}>
                        {loan.loanStatus.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(loan)} className="p-1 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(loan)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewVehicleRegNo && (
        <VehicleDetailsPopover regNo={viewVehicleRegNo} vehicle={vehicleByRegNo(viewVehicleRegNo) || null} onClose={() => setViewVehicleRegNo(null)} />
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto relative">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-teal-500 to-emerald-600" />
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-teal-600" /> {editingId ? `Edit Loan - ${editingId}` : 'Add Vehicle Loan'}
                </h3>
                <button onClick={resetForm} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 text-xs" autoComplete="off">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Reg. No*</label>
                    <input value={form.regNo} onChange={e => handleRegNoChange(e.target.value.toUpperCase())} disabled={!!editingId}
                      list="loan-vehicles-datalist" autoComplete="off" placeholder="e.g. KA53AA0069"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono uppercase disabled:bg-slate-100" />
                    <datalist id="loan-vehicles-datalist">{vehicleList.map(v => <option key={v} value={v} />)}</datalist>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Ownership</label>
                    <input value={form.ownership} onChange={e => setForm({ ...form, ownership: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Financer*</label>
                    <select value={form.financer} onChange={e => setForm({ ...form, financer: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
                      {VEHICLE_LOAN_FINANCERS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Finance Number</label>
                    <input value={form.financeNumber} onChange={e => setForm({ ...form, financeNumber: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Loan Amount</label>
                    <input type="number" step="0.01" value={form.loanAmount} onChange={e => setForm({ ...form, loanAmount: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">EMI Start Date</label>
                    <DateInput value={form.emiStartDate} onChange={e => setForm({ ...form, emiStartDate: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Monthly EMI</label>
                    <input type="number" step="0.01" value={form.monthlyEmi} onChange={e => setForm({ ...form, monthlyEmi: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Interest (%)</label>
                    <input type="number" step="0.01" value={form.interest} onChange={e => setForm({ ...form, interest: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Tenure (months)</label>
                  <input type="number" value={form.tenure} onChange={e => setForm({ ...form, tenure: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>

                {form.emiStartDate && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-emerald-600 uppercase text-[9px] font-bold">Months Completed (auto)</p>
                      <p className="font-black text-emerald-700">{computeMonthsCompleted(form.emiStartDate, parseInt(form.tenure) || undefined)}</p>
                    </div>
                    <div>
                      <p className="text-emerald-600 uppercase text-[9px] font-bold">Due Date (auto)</p>
                      <p className="font-black text-emerald-700">{computeDueDate(form.emiStartDate, computeMonthsCompleted(form.emiStartDate, parseInt(form.tenure) || undefined), parseInt(form.tenure) || undefined)}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Loan Status</label>
                    <select value={form.loanStatus} onChange={e => setForm({ ...form, loanStatus: e.target.value as LoanStatus })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
                      <option value="Active">Active</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">NOC Status</label>
                    <select value={form.nocStatus} onChange={e => setForm({ ...form, nocStatus: e.target.value as NOCStatus })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
                      <option value="Not received">Not received</option>
                      <option value="Received">Received</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Remarks <span className="text-slate-400 font-normal">(e.g. closing month/year)</span></label>
                  <textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })}
                    placeholder={suggestedClosing ? `Suggested: Closing ${suggestedClosing}` : ''}
                    autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 h-16" />
                </div>

                <DocumentAttachment documents={documents} onChange={setDocuments} label="Attach Loan Documents" />

                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button type="button" onClick={resetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting}
                    className="flex-1 bg-gradient-to-r from-teal-600 to-emerald-700 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
                    {isSubmitting ? 'Saving...' : editingId ? 'Update Loan' : 'Save Loan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
