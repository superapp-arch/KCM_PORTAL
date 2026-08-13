import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Truck, Plus, Search, Edit2, Trash2, X, ChevronDown, AlertTriangle, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { Vehicle, VehicleLoan, VehicleDocument, LoanStatus, NOCStatus, VEHICLE_LOAN_FINANCERS } from '../../types';
import { computeMonthsCompleted, computeDueDate, computeDueDateRaw, computeLoanStatus, resolveLoanStatus } from '../../utils/loanDates';
import DateInput from '../DateInput';
import DocumentAttachment from '../DocumentAttachment';
import VehicleDetailsPopover from './VehicleDetailsPopover';
import LoanDetailsPopover from './LoanDetailsPopover';
import SortHeader from '../SortHeader';
import { SortState, SortDirection, compareText, compareNumber, extractLeadingNumber } from '../../utils/sort';

interface VehicleLoanSheetProps {
  vehicles: Vehicle[];
  vehicleLoans: VehicleLoan[];
  onAddVehicleLoan: (loan: Omit<VehicleLoan, 'id'> & { id: string }) => Promise<void>;
  onUpdateVehicleLoan: (id: string, loan: Partial<VehicleLoan>) => Promise<void>;
  onDeleteVehicleLoan: (id: string) => Promise<void>;
}

const OWNERSHIP_OPTIONS = ['KCM INSTA', 'KCM SUPPLY'];

const emptyForm = {
  regNo: '', ownership: '', financer: '', financeNumber: '', loanAmount: '',
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

const toLoanRow = (loan: VehicleLoan, i: number) => {
  const monthsCompleted = computeMonthsCompleted(loan.emiStartDate, loan.tenure);
  const bal = loan.tenure != null ? loan.tenure - monthsCompleted : null;
  const osAmount = bal != null && loan.monthlyEmi != null ? bal * loan.monthlyEmi : '';
  return {
    'SL No': i + 1,
    'Reg. No': loan.regNo,
    'Financer': loan.financer,
    'Loan Number': loan.financeNumber || '',
    'Loan Amount': loan.loanAmount || '',
    'EMI Start Date': loan.emiStartDate || '',
    'Monthly EMI': loan.monthlyEmi || '',
    'Tenure': loan.tenure ?? '',
    'EMI Paid': monthsCompleted,
    'EMI Pending': bal ?? '',
    'O/S Amount': osAmount,
    'Due Date': computeDueDate(loan.emiStartDate, monthsCompleted, loan.tenure),
    'Loan Status': resolveLoanStatus(loan.loanStatus, loan.loanStatusManual, monthsCompleted, loan.tenure).toUpperCase(),
    'Remarks': loan.remarks || '',
    'NOC Status': loan.nocStatus || 'Not received',
    'Ownership': loan.ownership || ''
  };
};

export default function VehicleLoanSheet({ vehicles, vehicleLoans, onAddVehicleLoan, onUpdateVehicleLoan, onDeleteVehicleLoan }: VehicleLoanSheetProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [financerFilter, setFinancerFilter] = useState<string[]>([]); // empty = all
  const [showFinancerDropdown, setShowFinancerDropdown] = useState(false);
  const [ownershipFilter, setOwnershipFilter] = useState<string[]>([]); // empty = all
  const [showOwnershipDropdown, setShowOwnershipDropdown] = useState(false);
  const [dueDateFilter, setDueDateFilter] = useState(''); // '' = no date filter
  const [sort, setSort] = useState<SortState | null>(null);
  const handleSort = (key: string, direction: SortDirection) => setSort({ key, direction });
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const triggerNotif = (message: string, type: 'success' | 'error') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  // Loan Status auto-fill: recomputed from EMI Start Date + Tenure whenever
  // either changes, same "auto, editable" convention as Fuel Entry's Amount
  // field (ltrs/rate auto-fill Amount, still user-editable afterward) - an
  // admin can still manually override the dropdown below after this runs.
  useEffect(() => {
    const monthsCompleted = computeMonthsCompleted(form.emiStartDate, parseInt(form.tenure) || undefined);
    setForm(f => ({ ...f, loanStatus: computeLoanStatus(monthsCompleted, parseInt(form.tenure) || undefined) }));
  }, [form.emiStartDate, form.tenure]);
  const [viewVehicleRegNo, setViewVehicleRegNo] = useState<string | null>(null);
  const [viewLoan, setViewLoan] = useState<VehicleLoan | null>(null);

  const vehicleByRegNo = (regNo: string): Vehicle | undefined =>
    vehicles.find(v => (v.regNo || v['Reg. No.'] || '').trim().toUpperCase() === regNo.trim().toUpperCase());

  const vehicleList = Array.from(new Set(vehicles.map(v => v.regNo || v['Reg. No.'] || '').filter(Boolean))).sort();

  // Seed list plus whatever financers already exist in the data, so a
  // financer typed once (see handleSubmit) shows up as a filter option and
  // Add-form suggestion from then on - no separate "manage financers" step.
  const financerOptions = useMemo(
    () => Array.from(new Set([...VEHICLE_LOAN_FINANCERS, ...vehicleLoans.map(l => l.financer).filter(Boolean)])),
    [vehicleLoans]
  );

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
    if (!form.regNo.trim() || !form.financer.trim()) return;
    setIsSubmitting(true);
    try {
      const tenureNum = parseInt(form.tenure) || undefined;
      const monthsCompleted = computeMonthsCompleted(form.emiStartDate, tenureNum);
      // Only flagged manual (sticky override) when the submitted Loan Status
      // actually disagrees with what the system would auto-compute right now
      // - e.g. an employee deliberately forcing Active despite EMI Pending
      // being 0. Otherwise it stays auto and can never go stale - see
      // resolveLoanStatus in loanDates.ts.
      const loanStatusManual = form.loanStatus !== computeLoanStatus(monthsCompleted, tenureNum);
      const payload = {
        regNo: form.regNo.trim().toUpperCase(),
        ownership: form.ownership.trim(),
        financer: form.financer.trim(),
        financeNumber: form.financeNumber.trim(),
        loanAmount: parseFloat(form.loanAmount) || undefined,
        emiStartDate: form.emiStartDate,
        monthlyEmi: parseFloat(form.monthlyEmi) || undefined,
        tenure: tenureNum,
        interest: parseFloat(form.interest) || undefined,
        loanStatus: form.loanStatus,
        loanStatusManual,
        remarks: form.remarks.trim(),
        nocStatus: form.nocStatus,
        documents
      };
      if (editingId) {
        await onUpdateVehicleLoan(editingId, payload);
      } else {
        // A fresh id every time (not the Reg. No.) - a vehicle can have more
        // than one loan record (refinanced, rare multi-loan cases, etc.), so
        // adding a new entry for an already-registered vehicle must never
        // overwrite its existing entry.
        await onAddVehicleLoan({ ...payload, id: String(Date.now()) });
      }
      triggerNotif('Vehicle loan record saved.', 'success');
      resetForm();
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to save vehicle loan record.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (loan: VehicleLoan) => {
    if (!window.confirm(`Delete the loan record for ${loan.regNo}? This cannot be undone.`)) return;
    try {
      await onDeleteVehicleLoan(loan.id);
      triggerNotif('Loan record deleted.', 'success');
    } catch (err) {
      console.error(err);
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete loan record.', 'error');
    }
  };

  const handleDownloadOne = (loan: VehicleLoan) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([toLoanRow(loan, 0)]), 'Vehicle Loan');
    XLSX.writeFile(workbook, `KCM_Vehicle_Loan_${loan.regNo}.xlsx`);
  };

  // Downloads whatever is currently visible - respects the Financer,
  // Ownership, and Due Date filters and search term, so "download based on
  // financer" is just: filter by financer, then download.
  const handleDownloadAll = () => {
    if (filtered.length === 0) return;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(filtered.map(toLoanRow)), 'Vehicle Loans');
    const financerLabel = financerFilter.length === 1 ? financerFilter[0].replace(/\s+/g, '_') : financerFilter.length > 1 ? 'Selected_Financers' : 'AllFinancers';
    XLSX.writeFile(workbook, `KCM_Vehicle_Loans_${financerLabel}.xlsx`);
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
    if (dueDateFilter) {
      const due = computeDueDateRaw(l.emiStartDate, l.tenure);
      if (!due) return false;
      const [fy, fm, fd] = dueDateFilter.split('-').map(Number);
      if (due.getFullYear() !== fy || due.getMonth() !== fm - 1 || due.getDate() !== fd) return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!l.regNo.toLowerCase().includes(q) && !(l.financeNumber || '').toLowerCase().includes(q) && !l.financer.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [vehicleLoans, financerFilter, ownershipFilter, dueDateFilter, searchTerm]);

  // EMI Paid, EMI Pending, and O/S Amount aren't stored fields - they're
  // always computed live from emiStartDate/tenure/monthlyEmi (see types.ts),
  // so sorting by any of them must recompute per row rather than reading a
  // column value.
  const emiPaidOf = (loan: VehicleLoan): number => computeMonthsCompleted(loan.emiStartDate, loan.tenure);

  const emiPendingOf = (loan: VehicleLoan): number | null => {
    const monthsCompleted = emiPaidOf(loan);
    return loan.tenure != null ? loan.tenure - monthsCompleted : null;
  };

  const osAmountOf = (loan: VehicleLoan): number | null => {
    const bal = emiPendingOf(loan);
    return bal != null && loan.monthlyEmi != null ? bal * loan.monthlyEmi : null;
  };

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'regNo': cmp = extractLeadingNumber(a.regNo) - extractLeadingNumber(b.regNo); break;
        case 'financer': cmp = compareText(a.financer, b.financer); break;
        case 'loanAmount': cmp = compareNumber(a.loanAmount, b.loanAmount); break;
        case 'monthlyEmi': cmp = compareNumber(a.monthlyEmi, b.monthlyEmi); break;
        case 'emiPaid': cmp = compareNumber(emiPaidOf(a), emiPaidOf(b)); break;
        case 'emiPending': cmp = compareNumber(emiPendingOf(a), emiPendingOf(b)); break;
        case 'osAmount': cmp = compareNumber(osAmountOf(a), osAmountOf(b)); break;
      }
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const suggestedClosing = form.emiStartDate && form.tenure ? monthYearFromStart(form.emiStartDate, parseInt(form.tenure) || 0) : '';

  return (
    <div className="space-y-4">
      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notif.message}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 flex-1 min-w-45 bg-white text-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by Reg. No, Loan Number, or Financer..." autoComplete="off" className="flex-1 outline-none" />
        </div>

        <div className="relative">
          <button onClick={() => setShowFinancerDropdown(!showFinancerDropdown)}
            className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap">
            Financer {financerFilter.length > 0 ? `(${financerFilter.length})` : '(All)'} <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showFinancerDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowFinancerDropdown(false)} />
              <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 text-xs max-h-72 overflow-y-auto">
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer font-bold border-b border-slate-100 mb-1">
                  <input type="checkbox" checked={financerFilter.length === 0} onChange={() => setFinancerFilter([])} />
                  Select All
                </label>
                {financerOptions.map(f => (
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

        <div className="flex items-center gap-1.5">
          <DateInput value={dueDateFilter} onChange={e => setDueDateFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs" />
          {dueDateFilter && (
            <button onClick={() => setDueDateFilter('')} title="Clear date filter" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button onClick={handleDownloadAll} title="Download the currently filtered loans"
          className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-lg uppercase text-[11px] flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap">
          <Download className="w-3.5 h-3.5 text-teal-600" /> Download
        </button>

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
                <th className="px-3 py-2.5"><SortHeader label="Reg. No" sortKey="regNo" sort={sort} onSort={handleSort} type="numeric" /></th>
                <th className="px-3 py-2.5"><SortHeader label="Financer" sortKey="financer" sort={sort} onSort={handleSort} /></th>
                <th className="px-3 py-2.5">Loan Number</th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Loan Amount" sortKey="loanAmount" sort={sort} onSort={handleSort} align="right" type="numeric" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="Monthly EMI" sortKey="monthlyEmi" sort={sort} onSort={handleSort} align="right" type="numeric" /></th>
                <th className="px-3 py-2.5 text-right">Tenure</th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="EMI Paid" sortKey="emiPaid" sort={sort} onSort={handleSort} align="right" type="numeric" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="EMI Pending" sortKey="emiPending" sort={sort} onSort={handleSort} align="right" type="numeric" /></th>
                <th className="px-3 py-2.5 text-right"><SortHeader label="O/S Amount" sortKey="osAmount" sort={sort} onSort={handleSort} align="right" type="numeric" /></th>
                <th className="px-3 py-2.5">Due Date</th>
                <th className="px-3 py-2.5">Loan Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-10 text-slate-400">No vehicle loan records found.</td></tr>
              ) : sorted.map((loan, i) => {
                const monthsCompleted = computeMonthsCompleted(loan.emiStartDate, loan.tenure);
                const bal = loan.tenure != null ? loan.tenure - monthsCompleted : null;
                const osAmount = bal != null && loan.monthlyEmi != null ? bal * loan.monthlyEmi : null;
                const dueDate = computeDueDate(loan.emiStartDate, monthsCompleted, loan.tenure);
                const displayStatus = resolveLoanStatus(loan.loanStatus, loan.loanStatusManual, monthsCompleted, loan.tenure);
                const nearing = isNearingCompletion(monthsCompleted, loan.tenure, displayStatus);
                return (
                  <tr key={loan.id} className={`hover:bg-slate-50 ${nearing ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button onClick={() => setViewVehicleRegNo(loan.regNo)} className="font-mono font-bold text-teal-700 hover:underline cursor-pointer">
                        {loan.regNo}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{loan.financer}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                      <button onClick={() => setViewLoan(loan)} className="hover:underline cursor-pointer">
                        {loan.financeNumber || '-'}
                      </button>
                    </td>
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
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{osAmount != null ? osAmount.toLocaleString('en-IN') : '-'}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-red-600 whitespace-nowrap">{dueDate}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block border rounded px-2 py-0.5 font-bold text-[10px] ${displayStatus === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-300'}`}>
                        {displayStatus.toUpperCase()}
                      </span>
                      {loan.loanStatusManual && (
                        <span title="Manually overridden by an employee - won't auto-change until edited again" className="ml-1 text-[9px] text-amber-600 font-bold align-middle">●</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => handleDownloadOne(loan)} title="Download this loan" className="p-1 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded cursor-pointer"><Download className="w-3.5 h-3.5" /></button>
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

      {viewLoan && (
        <LoanDetailsPopover loan={viewLoan} onClose={() => setViewLoan(null)} />
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
                    <input value={form.regNo} onChange={e => handleRegNoChange(e.target.value.toUpperCase())}
                      list="loan-vehicles-datalist" autoComplete="off" placeholder="e.g. KA53AA0069"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono uppercase" />
                    <datalist id="loan-vehicles-datalist">{vehicleList.map(v => <option key={v} value={v} />)}</datalist>
                    {vehicleLoans.some(l => l.regNo.trim().toUpperCase() === form.regNo.trim().toUpperCase()) && !editingId && (
                      <p className="text-[9px] text-amber-600 font-semibold mt-1">This vehicle already has a loan on record - saving will add another entry, not replace it.</p>
                    )}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Ownership</label>
                    <input value={form.ownership} onChange={e => setForm({ ...form, ownership: e.target.value })} autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Financer*</label>
                    <input value={form.financer} onChange={e => setForm({ ...form, financer: e.target.value })}
                      list="loan-financers-datalist" autoComplete="off" placeholder="Search or type a new financer"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                    <datalist id="loan-financers-datalist">{financerOptions.map(f => <option key={f} value={f} />)}</datalist>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Loan Number</label>
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
                      <p className="text-emerald-600 uppercase text-[9px] font-bold">EMI Paid (auto)</p>
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
                    <label className="block font-semibold text-slate-500 mb-1">Loan Status (auto, editable)</label>
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
