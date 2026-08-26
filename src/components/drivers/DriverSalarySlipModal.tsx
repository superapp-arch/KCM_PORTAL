import React, { useState, useEffect } from 'react';
import { X, Download, RefreshCw, AlertTriangle, Loader2, Receipt } from 'lucide-react';
import { DriverEmployee, DriverSalarySlipRecord } from '../../types';
import { resolveOrGenerateDriverSlip, markDriverSlipDownloaded } from '../../utils/driverSalarySlipGenerate';
import { buildDriverSalarySlipFile } from '../../utils/driverSalarySlipPdf';
import { numberToIndianWords } from '../../utils/numberToWords';

interface DriverSalarySlipModalProps {
  driver: DriverEmployee;
  existingSlips: DriverSalarySlipRecord[];
  performedBy: string;
  onClose: () => void;
  onSlipSaved: (slip: DriverSalarySlipRecord) => void; // lets the parent merge the new/updated slip into its own list
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : month;
};
const rupee = (n: number | undefined) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;

// No date pickers, no manual entry - this always reflects whatever's
// already saved in the driver's own Salary Breakup tab (Gross Salary, Other
// Additions, deductions) plus that month's live attendance summary, exactly
// like Salary Breakup itself computes Wages Per Day/LOP Amount/Payable
// Amount. Auto-generates the moment it opens, same as HR's Salary Slip modal.
export default function DriverSalarySlipModal({ driver, existingSlips, performedBy, onClose, onSlipSaved }: DriverSalarySlipModalProps) {
  const [slip, setSlip] = useState<DriverSalarySlipRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const run = async (forceRegenerate: boolean) => {
    setLoading(true);
    setError('');
    try {
      const result = await resolveOrGenerateDriverSlip({ driver, existingSlips, forceRegenerate, performedBy });
      setSlip(result.slip);
      onSlipSaved(result.slip);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate the salary slip.');
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  };

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.id, driver.month]);

  const handleDownload = async () => {
    if (!slip) return;
    setDownloading(true);
    try {
      const file = buildDriverSalarySlipFile(slip);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      await markDriverSlipDownloaded(slip, performedBy);
      onSlipSaved({ ...slip, isDownloaded: true, lastDownloadedDate: new Date().toISOString().slice(0, 10) });
    } finally {
      setDownloading(false);
    }
  };

  const handleRegenerate = () => {
    if (!confirm(`Regenerate ${driver.name}'s ${slip ? monthLabel(slip.month) : ''} slip? This creates a new slip number and audit entry - the old one stays on record.`)) return;
    setRegenerating(true);
    run(true);
  };

  const balance = slip ? slip.netSalary : 0;

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-600 to-purple-700 text-white">
          <h3 className="text-sm font-bold flex items-center gap-1.5"><Receipt className="w-4 h-4" /> Salary Slip - {driver.name} ({driver.id})</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 text-xs">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Generating...</div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          ) : slip ? (
            <div className="space-y-3">
              <div className="text-center border-b border-slate-200 pb-3">
                <p className="font-black text-slate-900 text-base">KCM LOGISTICS</p>
                <p className="text-slate-500">Driver Salary Slip - {monthLabel(slip.month)}</p>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div><span className="text-slate-400">Slip Number: </span><span className="font-semibold font-mono">{slip.slipNumber}</span></div>
                <div><span className="text-slate-400">Vehicle No: </span><span className="font-semibold font-mono">{slip.vehicleNo || '-'}</span></div>
                <div><span className="text-slate-400">Bank: </span><span className="font-semibold font-mono">{slip.bankAccountNumberMasked || '-'}</span></div>
                <div><span className="text-slate-400">IFSC: </span><span className="font-semibold font-mono">{slip.ifscCode || '-'}</span></div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                  <p className="text-slate-400 uppercase text-[9px] font-bold">No. of Days</p>
                  <p className="font-black text-slate-700">{slip.totalDays}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                  <p className="text-emerald-600 uppercase text-[9px] font-bold">Working Days</p>
                  <p className="font-black text-emerald-700">{slip.presentDays}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                  <p className="text-orange-600 uppercase text-[9px] font-bold">LOP</p>
                  <p className="font-black text-orange-700">{slip.lopDays}</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-2 text-center">
                  <p className="text-sky-600 uppercase text-[9px] font-bold">Exemption Lv</p>
                  <p className="font-black text-sky-700">{slip.exemptionLeaveDays}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-emerald-600 text-white px-3 py-1.5 font-bold">Gross Salary &amp; Earnings</div>
                <div className="divide-y divide-slate-100">
                  <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">Gross Salary</span><span className="font-mono font-semibold">{rupee(slip.grossSalary)}</span></div>
                  {(slip.grossEarned ?? slip.grossSalary ?? 0) !== (slip.grossSalary || 0) && (
                    <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">Pro-rated for Working Days ({slip.presentDays}/{slip.totalDays})</span><span className="font-mono font-semibold">{rupee((slip.grossEarned ?? slip.grossSalary ?? 0) - (slip.grossSalary || 0))}</span></div>
                  )}
                  <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">Other Additions</span><span className="font-mono font-semibold">{rupee(slip.otherAdditions)}</span></div>
                  <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 font-bold text-emerald-800"><span>Total Earnings</span><span className="font-mono">{rupee(slip.totalEarnings)}</span></div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-rose-600 text-white px-3 py-1.5 font-bold">Deductions</div>
                <div className="divide-y divide-slate-100">
                  <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">Petty Cash/Advance</span><span className="font-mono font-semibold">{rupee(slip.pettyCashAdvance)}</span></div>
                  <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">Loan Deduction</span><span className="font-mono font-semibold">{rupee(slip.loanDeduction)}</span></div>
                  <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">Recovery Amount</span><span className="font-mono font-semibold">{rupee(slip.recoveryAmount)}</span></div>
                  <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">Driver Welfare</span><span className="font-mono font-semibold">{rupee(slip.driverWelfare)}</span></div>
                  <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">BATA</span><span className="font-mono font-semibold">{rupee(slip.bata)}</span></div>
                  {slip.lopDays > 0 && (
                    <div className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">LOP ({slip.lopDays} day{slip.lopDays === 1 ? '' : 's'})</span><span className="font-mono font-semibold">{rupee(slip.lopAmount)}</span></div>
                  )}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-rose-50 font-bold text-rose-800"><span>Total Deductions</span><span className="font-mono">{rupee(slip.totalDeductions + slip.lopAmount)}</span></div>
                </div>
              </div>

              <div className="bg-purple-900 text-white rounded-lg p-3 flex items-center justify-between">
                <span className="font-bold uppercase tracking-wide">Net Salary</span>
                <span className="font-black text-base">{rupee(balance)}</span>
              </div>
              <p className="text-slate-500 italic text-center">{numberToIndianWords(slip.netSalary)}</p>

              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 flex items-center justify-between">
                <span>Generated: {slip.generatedDate}</span>
                <span>{slip.isDownloaded ? `Last downloaded: ${slip.lastDownloadedDate}` : 'Not yet downloaded'}</span>
              </div>
            </div>
          ) : null}
        </div>

        {slip && !loading && (
          <div className="p-4 border-t border-slate-100 flex items-center gap-2">
            <button onClick={handleRegenerate} disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg font-semibold cursor-pointer disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} /> Regenerate
            </button>
            <button onClick={handleDownload} disabled={downloading}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-all">
              <Download className="w-3.5 h-3.5" /> {downloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
