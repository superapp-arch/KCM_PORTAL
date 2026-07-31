import React from 'react';
import { X, Landmark } from 'lucide-react';
import { VehicleLoan } from '../../types';
import { computeMonthsCompleted, computeDueDate } from '../../utils/loanDates';

interface LoanDetailsPopoverProps {
  loan: VehicleLoan;
  onClose: () => void;
}

export default function LoanDetailsPopover({ loan, onClose }: LoanDetailsPopoverProps) {
  const monthsCompleted = computeMonthsCompleted(loan.emiStartDate, loan.tenure);
  const bal = loan.tenure != null ? loan.tenure - monthsCompleted : null;
  const dueDate = computeDueDate(loan.emiStartDate, monthsCompleted, loan.tenure);
  const osAmount = bal != null && loan.monthlyEmi != null ? bal * loan.monthlyEmi : null;

  const rows: [string, string][] = [
    ['Ownership', loan.ownership || '-'],
    ['Reg. No', loan.regNo],
    ['Financer', loan.financer],
    ['Loan Number', loan.financeNumber || '-'],
    ['Loan Amount', loan.loanAmount != null ? loan.loanAmount.toLocaleString('en-IN') : '-'],
    ['EMI Start Date', loan.emiStartDate || '-'],
    ['Monthly EMI', loan.monthlyEmi != null ? loan.monthlyEmi.toLocaleString('en-IN') : '-'],
    ['Tenure', loan.tenure != null ? String(loan.tenure) : '-'],
    ['EMI Paid', String(monthsCompleted)],
    ['EMI Pending', bal != null ? String(bal) : '-'],
    ['O/S Amount', osAmount != null ? osAmount.toLocaleString('en-IN') : '-'],
    ['Due Date', dueDate],
    ['Interest', loan.interest != null ? `${loan.interest}%` : '-'],
    ['Loan Status', loan.loanStatus.toUpperCase()],
    ['NOC Status', loan.nocStatus || 'Not received'],
    ['Remarks', loan.remarks || '-']
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 relative overflow-hidden max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-teal-500 to-emerald-600" />
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-teal-600" /> {loan.financeNumber || loan.regNo}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-1.5 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between border-b border-slate-50 py-1.5">
              <span className="text-slate-400 font-semibold uppercase text-[9.5px]">{label}</span>
              <span className="font-bold text-slate-700 text-right">{value}</span>
            </div>
          ))}
        </div>
        {loan.documents && loan.documents.length > 0 && (
          <div className="mt-3">
            <p className="text-[9.5px] font-semibold text-slate-400 uppercase mb-1.5">Documents</p>
            <div className="flex flex-wrap gap-1.5">
              {loan.documents.map((doc, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-[10px] font-bold">
                  {doc.name || `Document ${i + 1}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
