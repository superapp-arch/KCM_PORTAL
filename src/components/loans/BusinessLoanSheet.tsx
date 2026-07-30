import React, { useState, useMemo } from 'react';
import { Landmark, Plus, Search, Edit2, Trash2, X } from 'lucide-react';
import { BusinessLoan, LoanStatus } from '../../types';

interface BusinessLoanSheetProps {
  businessLoans: BusinessLoan[];
  onAddBusinessLoan: (loan: Omit<BusinessLoan, 'id'>) => Promise<void>;
  onUpdateBusinessLoan: (id: string, loan: Partial<BusinessLoan>) => Promise<void>;
  onDeleteBusinessLoan: (id: string) => Promise<void>;
}

const FINANCER_SUGGESTIONS = [
  'Sundaram Finance', 'HDFC Bank', 'Kotak Mahindra Bank Ltd', 'SMFG India Credit Co Ltd', 'Oxyzo Financial Services Private Limited'
];

const emptyForm = {
  financer: '', loanType: '', loanNumber: '', sanctionedAmount: '', emiDate: '', emiMonthly: '',
  tenure: '', emiPaid: '', interestRate: '', loanStatus: 'Active' as LoanStatus, remarks: ''
};

const balanceEmi = (loan: BusinessLoan): number | null =>
  loan.tenure != null && loan.emiPaid != null ? loan.tenure - loan.emiPaid : null;

export default function BusinessLoanSheet({ businessLoans, onAddBusinessLoan, onUpdateBusinessLoan, onDeleteBusinessLoan }: BusinessLoanSheetProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(false);
  };

  const startEdit = (loan: BusinessLoan) => {
    setEditingId(loan.id);
    setForm({
      financer: loan.financer, loanType: loan.loanType, loanNumber: loan.loanNumber,
      sanctionedAmount: loan.sanctionedAmount != null ? String(loan.sanctionedAmount) : '',
      emiDate: loan.emiDate || '', emiMonthly: loan.emiMonthly != null ? String(loan.emiMonthly) : '',
      tenure: loan.tenure != null ? String(loan.tenure) : '', emiPaid: loan.emiPaid != null ? String(loan.emiPaid) : '',
      interestRate: loan.interestRate != null ? String(loan.interestRate) : '', loanStatus: loan.loanStatus,
      remarks: loan.remarks || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.financer.trim() || !form.loanNumber.trim()) return;
    setIsSubmitting(true);
    try {
      const payload = {
        financer: form.financer.trim(),
        loanType: form.loanType.trim(),
        loanNumber: form.loanNumber.trim(),
        sanctionedAmount: parseFloat(form.sanctionedAmount) || undefined,
        emiDate: form.emiDate.trim(),
        emiMonthly: parseFloat(form.emiMonthly) || undefined,
        tenure: parseInt(form.tenure) || undefined,
        emiPaid: parseInt(form.emiPaid) || undefined,
        interestRate: parseFloat(form.interestRate) || undefined,
        loanStatus: form.loanStatus,
        remarks: form.remarks.trim()
      };
      if (editingId) {
        await onUpdateBusinessLoan(editingId, payload);
      } else {
        await onAddBusinessLoan(payload);
      }
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (loan: BusinessLoan) => {
    if (window.confirm(`Delete the business loan "${loan.loanNumber}"? This cannot be undone.`)) {
      await onDeleteBusinessLoan(loan.id);
    }
  };

  const filtered = useMemo(() => businessLoans.filter(l => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return l.financer.toLowerCase().includes(q) || l.loanNumber.toLowerCase().includes(q) || l.loanType.toLowerCase().includes(q);
  }), [businessLoans, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px] bg-white text-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by Financer, Loan Number, or Loan Type..." autoComplete="off" className="flex-1 outline-none" />
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }}
          className="bg-gradient-to-r from-indigo-600 to-sky-700 hover:shadow-md text-white font-bold px-4 py-2 rounded-lg uppercase text-[11px] flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap">
          <Plus className="w-3.5 h-3.5" /> Add Business Loan
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gradient-to-r from-indigo-900 via-slate-900 to-sky-900 text-indigo-100 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-3 py-2.5">SL No</th>
                <th className="px-3 py-2.5">Financer</th>
                <th className="px-3 py-2.5">Loan Type</th>
                <th className="px-3 py-2.5">Loan Number</th>
                <th className="px-3 py-2.5 text-right">Sanctioned Amount</th>
                <th className="px-3 py-2.5">EMI Date</th>
                <th className="px-3 py-2.5 text-right">EMI Monthly</th>
                <th className="px-3 py-2.5 text-right">Tenure</th>
                <th className="px-3 py-2.5 text-right">EMI Paid</th>
                <th className="px-3 py-2.5 text-right">Balance EMI</th>
                <th className="px-3 py-2.5 text-right">Interest Rate</th>
                <th className="px-3 py-2.5">Loan Status</th>
                <th className="px-3 py-2.5 max-w-[160px]">Remarks</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-10 text-slate-400">No business loan records found.</td></tr>
              ) : filtered.map((loan, i) => {
                const bal = balanceEmi(loan);
                return (
                  <tr key={loan.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{loan.financer}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{loan.loanType || '-'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{loan.loanNumber}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{loan.sanctionedAmount ? `Rs. ${loan.sanctionedAmount.toLocaleString('en-IN')}` : '-'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{loan.emiDate || '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{loan.emiMonthly ? `Rs. ${loan.emiMonthly.toLocaleString('en-IN')}` : '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{loan.tenure ?? '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{loan.emiPaid ?? '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-700">{bal ?? '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{loan.interestRate != null ? `${loan.interestRate}%` : '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block border rounded px-2 py-0.5 font-bold text-[10px] ${loan.loanStatus === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-300'}`}>
                        {loan.loanStatus.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 max-w-[160px] truncate" title={loan.remarks}>{loan.remarks || '-'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(loan)} className="p-1 text-slate-500 hover:text-indigo-700 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(loan)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto relative">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-indigo-500 to-sky-600" />
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-indigo-600" /> {editingId ? 'Edit Business Loan' : 'Add Business Loan'}
                </h3>
                <button onClick={resetForm} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 text-xs" autoComplete="off">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Financer*</label>
                  <input value={form.financer} onChange={e => setForm({ ...form, financer: e.target.value })}
                    list="business-financer-datalist" autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  <datalist id="business-financer-datalist">{FINANCER_SUGGESTIONS.map(f => <option key={f} value={f} />)}</datalist>
                </div>

                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Loan Type</label>
                  <input value={form.loanType} onChange={e => setForm({ ...form, loanType: e.target.value })}
                    placeholder="e.g. SME Enterprises Business Loan" autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Loan Number*</label>
                    <input value={form.loanNumber} onChange={e => setForm({ ...form, loanNumber: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Sanctioned Amount</label>
                    <input type="number" step="0.01" value={form.sanctionedAmount} onChange={e => setForm({ ...form, sanctionedAmount: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">EMI Date <span className="text-slate-400 font-normal">(DD-MM-YYYY or day of month)</span></label>
                    <input value={form.emiDate} onChange={e => setForm({ ...form, emiDate: e.target.value })} placeholder="e.g. 05 or 05-08-2026" autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">EMI Monthly</label>
                    <input type="number" step="0.01" value={form.emiMonthly} onChange={e => setForm({ ...form, emiMonthly: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Tenure (months)</label>
                    <input type="number" value={form.tenure} onChange={e => setForm({ ...form, tenure: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">EMI Paid</label>
                    <input type="number" value={form.emiPaid} onChange={e => setForm({ ...form, emiPaid: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                </div>

                {form.tenure && form.emiPaid && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                    <p className="text-emerald-600 uppercase text-[9px] font-bold">Balance EMI (auto = Tenure &minus; EMI Paid)</p>
                    <p className="font-black text-emerald-700">{(parseInt(form.tenure) || 0) - (parseInt(form.emiPaid) || 0)}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Interest Rate (%)</label>
                    <input type="number" step="0.01" value={form.interestRate} onChange={e => setForm({ ...form, interestRate: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Loan Status</label>
                    <select value={form.loanStatus} onChange={e => setForm({ ...form, loanStatus: e.target.value as LoanStatus })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
                      <option value="Active">Active</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Remarks</label>
                  <textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 h-16" />
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button type="button" onClick={resetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting}
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-sky-600 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
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
