import React, { useState, useEffect } from 'react';
import { X, Download, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { StaffEmployee, StaffBankDetail, SalarySlipRecord } from '../../types';
import { EnrichedPfRecord, resolveOrGenerateSlip, markSlipDownloaded } from '../../utils/salarySlipGenerate';
import { buildSalarySlipFile } from '../../utils/salarySlipPdf';
import { numberToIndianWords } from '../../utils/numberToWords';
import kcmLogo from '../../assets/images/logo.png';

interface SalarySlipModalProps {
  employee: StaffEmployee;
  month: string; // YYYY-MM
  pfRecord: EnrichedPfRecord | undefined;
  bankDetail: StaffBankDetail | undefined;
  existingSlips: SalarySlipRecord[];
  performedBy: string;
  onClose: () => void;
  onSlipSaved: (slip: SalarySlipRecord) => void; // lets the parent merge the new/updated slip into its own list
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : month;
};
const rupee = (n: number | undefined) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;

export default function SalarySlipModal({ employee, month, pfRecord, bankDetail, existingSlips, performedBy, onClose, onSlipSaved }: SalarySlipModalProps) {
  const [slip, setSlip] = useState<SalarySlipRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const run = async (forceRegenerate: boolean) => {
    setLoading(true);
    setError('');
    try {
      // Warn-and-confirm on a non-Finalized month, only when this would
      // actually generate something new (reusing an already-issued slip
      // never needs re-confirming, even if the source month has since gone
      // back to Draft for some reason).
      const alreadyExists = !forceRegenerate && existingSlips.some(s => s.empId === employee.id && s.month === month);
      if (!alreadyExists && pfRecord?.status !== 'Finalized') {
        const proceed = confirm(
          `${monthLabel(month)}'s Salary Breakup for ${employee.name} is still ${pfRecord ? 'Draft' : 'missing'} - not Finalized. Generate the slip anyway?`
        );
        if (!proceed) {
          setLoading(false);
          onClose();
          return;
        }
      }
      const result = await resolveOrGenerateSlip({ employee, month, pfRecord, bankDetail, existingSlips, forceRegenerate, performedBy });
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
  }, [employee.id, month]);

  const handleDownload = async () => {
    if (!slip) return;
    setDownloading(true);
    try {
      const file = await buildSalarySlipFile(slip);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      await markSlipDownloaded(slip, performedBy);
      onSlipSaved({ ...slip, isDownloaded: true, lastDownloadedDate: new Date().toISOString().slice(0, 10) });
    } finally {
      setDownloading(false);
    }
  };

  const handleRegenerate = () => {
    if (!confirm(`Regenerate ${employee.name}'s ${monthLabel(month)} slip? This creates a new slip number and audit entry - the old one stays on record.`)) return;
    setRegenerating(true);
    run(true);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-800 to-indigo-900 text-white">
          <h3 className="text-sm font-bold">Salary Slip - {employee.name} ({monthLabel(month)})</h3>
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
                <img src={kcmLogo} alt="KCM Logistics" className="h-12 mx-auto mb-1" />
                <p className="text-slate-500">Salary Slip - {monthLabel(slip.month)}</p>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div><span className="text-slate-400">Employee Name: </span><span className="font-semibold">{slip.employeeName}</span></div>
                <div><span className="text-slate-400">Employee ID: </span><span className="font-semibold font-mono">{slip.empId}</span></div>
                <div><span className="text-slate-400">Department: </span><span className="font-semibold">{slip.department}</span></div>
                <div><span className="text-slate-400">Slip Number: </span><span className="font-semibold font-mono">{slip.slipNumber}</span></div>
                <div><span className="text-slate-400">Bank: </span><span className="font-semibold">{slip.bankName || '-'}</span></div>
                <div><span className="text-slate-400">Account: </span><span className="font-semibold font-mono">{slip.bankAccountNumberMasked || '-'}</span></div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-emerald-600 text-white px-3 py-1.5 font-bold">Earnings</div>
                <div className="divide-y divide-slate-100">
                  {[
                    ['Basic Salary', slip.basic], ['HRA', slip.hra], ['Conveyance', slip.conveyance], ['Medical Allowance', slip.medicalAllowance],
                    ['LTA', slip.lta], ['CCA', slip.cca], ['Fuel Allowance', slip.fuelAllowance], ['Other Allowances', slip.otherAllowances],
                    ...(slip.extraDays ? [[`Extra Days (${slip.extraDays})`, slip.extraDaysAmount]] as [string, number | undefined][] : [])
                  ].map(([label, val], i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">{label}</span><span className="font-mono font-semibold">{rupee(val as number)}</span></div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 font-bold text-emerald-800"><span>Total Earnings</span><span className="font-mono">{rupee(slip.totalEarnings)}</span></div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-rose-600 text-white px-3 py-1.5 font-bold">Deductions</div>
                <div className="divide-y divide-slate-100">
                  {[
                    ['Professional Tax', slip.professionalTax], ['EPF', slip.epf], ['ESI', slip.esi],
                    ...(slip.lopDays ? [[`LOP (${slip.lopDays} day${slip.lopDays === 1 ? '' : 's'})`, slip.lopAmount]] as [string, number | undefined][] : []),
                    ['Full & Final', slip.fullAndFinal], ['Other Deductions', slip.otherDeductions], ['Advances', slip.advances], ['Income Tax', slip.incomeTax]
                  ].map(([label, val], i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1"><span className="text-slate-600">{label}</span><span className="font-mono font-semibold">{rupee(val as number)}</span></div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-rose-50 font-bold text-rose-800"><span>Total Deductions</span><span className="font-mono">{rupee(slip.totalDeductions)}</span></div>
                </div>
              </div>

              <div className="bg-purple-900 text-white rounded-lg p-3 flex items-center justify-between">
                <span className="font-bold uppercase tracking-wide">Net Salary</span>
                <span className="font-black text-base">{rupee(slip.netSalary)}</span>
              </div>
              <p className="text-slate-500 italic text-center">{numberToIndianWords(slip.netSalary)}</p>

              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 flex items-center justify-between">
                <span>Generated: {slip.generatedDate}</span>
                <span>This is a system-generated slip and does not require a signature.</span>
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
