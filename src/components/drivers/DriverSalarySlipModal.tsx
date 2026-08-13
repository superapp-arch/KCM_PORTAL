import React, { useState, useEffect } from 'react';
import { X, Download, RefreshCw, AlertTriangle, Loader2, Receipt } from 'lucide-react';
import { DriverEmployee, DriverSalarySlipRecord } from '../../types';
import DateInput from '../DateInput';
import {
  fetchDriverAttendanceRange, resolveOrGenerateDriverSlip, markDriverSlipDownloaded,
  DriverAttendanceRangeSummary, DriverSlipManualEntries
} from '../../utils/driverSalarySlipGenerate';
import { buildDriverSalarySlipFile } from '../../utils/driverSalarySlipPdf';
import { numberToIndianWords } from '../../utils/numberToWords';

interface DriverSalarySlipModalProps {
  driver: DriverEmployee;
  existingSlips: DriverSalarySlipRecord[];
  performedBy: string;
  onClose: () => void;
  onSlipSaved: (slip: DriverSalarySlipRecord) => void; // lets the parent merge the new/updated slip into its own list
}

const rupee = (n: number | undefined) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;
const num = (v: string) => Number(v) || 0;

const emptyManual = { otherAdditions: '', pettyCashAdvance: '', loanDeduction: '', recoveryAmount: '', driverWelfare: '', bata: '' };

export default function DriverSalarySlipModal({ driver, existingSlips, performedBy, onClose, onSlipSaved }: DriverSalarySlipModalProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [manual, setManual] = useState(emptyManual);

  const [preview, setPreview] = useState<DriverAttendanceRangeSummary | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [slip, setSlip] = useState<DriverSalarySlipRecord | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [reusedNotice, setReusedNotice] = useState(false);

  const validRange = !!dateFrom && !!dateTo && dateTo >= dateFrom;

  // Live preview of attendance for the chosen period, refetched whenever the
  // range changes - lets the office see Days/Present/LOP before committing
  // to actually generating (and saving) a slip.
  useEffect(() => {
    if (!validRange) { setPreview(null); return; }
    setPreviewLoading(true);
    setPreviewError('');
    fetchDriverAttendanceRange(driver.id, dateFrom, dateTo)
      .then(setPreview)
      .catch(err => { setPreview(null); setPreviewError(err?.message || 'Failed to load attendance for this period.'); })
      .finally(() => setPreviewLoading(false));
  }, [driver.id, dateFrom, dateTo, validRange]);

  const wagesPerDay = preview && preview.daysInFromMonth > 0 ? (driver.grossSalary || 0) / preview.daysInFromMonth : 0;
  const earnedAmount = preview ? wagesPerDay * preview.presentDays : 0;
  const lopAmount = preview ? wagesPerDay * preview.lopDays : 0;
  const totalEarnings = earnedAmount + num(manual.otherAdditions);
  const totalDeductions = num(manual.pettyCashAdvance) + num(manual.loanDeduction) + num(manual.recoveryAmount) + num(manual.driverWelfare) + num(manual.bata);
  const netSalary = totalEarnings - totalDeductions;

  const buildManualEntries = (): DriverSlipManualEntries => ({
    otherAdditions: num(manual.otherAdditions),
    pettyCashAdvance: num(manual.pettyCashAdvance),
    loanDeduction: num(manual.loanDeduction),
    recoveryAmount: num(manual.recoveryAmount),
    driverWelfare: num(manual.driverWelfare),
    bata: num(manual.bata)
  });

  const run = async (forceRegenerate: boolean) => {
    if (!validRange) { setGenError('Pick a valid Date From and Date To first.'); return; }
    setGenerating(true);
    setGenError('');
    setReusedNotice(false);
    try {
      const result = await resolveOrGenerateDriverSlip({
        driver, dateFrom, dateTo, manual: buildManualEntries(), existingSlips, forceRegenerate, performedBy
      });
      setSlip(result.slip);
      setReusedNotice(!result.isNew);
      onSlipSaved(result.slip);
    } catch (err: any) {
      setGenError(err?.message || 'Failed to generate the salary slip.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = () => {
    if (!confirm(`Regenerate ${driver.name}'s slip for ${dateFrom} to ${dateTo}? This creates a new slip number and audit entry - the old one stays on record.`)) return;
    run(true);
  };

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

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-600 to-purple-700 text-white">
          <h3 className="text-sm font-bold flex items-center gap-1.5"><Receipt className="w-4 h-4" /> Salary Slip - {driver.name} ({driver.id})</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 text-xs space-y-4">
          {/* Date range + manual entries form - stays visible even after a
              slip is generated, so the office can tweak and Regenerate. */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Date From *</label>
                <DateInput required value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setSlip(null); }} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Date To *</label>
                <DateInput required value={dateTo} onChange={(e) => { setDateTo(e.target.value); setSlip(null); }} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
              </div>
            </div>
            {dateFrom && dateTo && !validRange && (
              <p className="text-rose-600 font-semibold">Date To must be on or after Date From.</p>
            )}

            {previewLoading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading attendance...</div>}
            {previewError && <p className="text-rose-600 font-semibold">{previewError}</p>}
            {preview && (
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                  <p className="text-slate-400 uppercase text-[9px] font-bold">Days in Period</p>
                  <p className="font-black text-slate-700">{preview.totalDaysInRange}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                  <p className="text-emerald-600 uppercase text-[9px] font-bold">Present/Paid Lv</p>
                  <p className="font-black text-emerald-700">{preview.presentDays}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                  <p className="text-orange-600 uppercase text-[9px] font-bold">LOP</p>
                  <p className="font-black text-orange-700">{preview.lopDays}</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-2 text-center">
                  <p className="text-sky-600 uppercase text-[9px] font-bold">Exemption Lv</p>
                  <p className="font-black text-sky-700">{preview.exemptionLeaveDays}</p>
                </div>
              </div>
            )}

            <div className="border border-slate-200 rounded-lg p-3">
              <p className="font-bold text-purple-700 uppercase mb-2">Additions / Deductions for this period</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-0.5">Other Additions <span className="text-emerald-500 font-normal">(+)</span></label>
                  <input type="number" value={manual.otherAdditions} onChange={e => setManual({ ...manual, otherAdditions: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                </div>
                <div>
                  <label className="block text-slate-400 mb-0.5">Petty Cash/Advance <span className="text-rose-500 font-normal">(-)</span></label>
                  <input type="number" value={manual.pettyCashAdvance} onChange={e => setManual({ ...manual, pettyCashAdvance: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                </div>
                <div>
                  <label className="block text-slate-400 mb-0.5">Loan Deduction <span className="text-rose-500 font-normal">(-)</span></label>
                  <input type="number" value={manual.loanDeduction} onChange={e => setManual({ ...manual, loanDeduction: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                </div>
                <div>
                  <label className="block text-slate-400 mb-0.5">Recovery Amount <span className="text-rose-500 font-normal">(-)</span></label>
                  <input type="number" value={manual.recoveryAmount} onChange={e => setManual({ ...manual, recoveryAmount: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                </div>
                <div>
                  <label className="block text-slate-400 mb-0.5">Driver Welfare <span className="text-rose-500 font-normal">(-)</span></label>
                  <input type="number" value={manual.driverWelfare} onChange={e => setManual({ ...manual, driverWelfare: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                </div>
                <div>
                  <label className="block text-slate-400 mb-0.5">BATA <span className="text-rose-500 font-normal">(-)</span></label>
                  <input type="number" value={manual.bata} onChange={e => setManual({ ...manual, bata: e.target.value })} autoComplete="off" className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5" />
                </div>
              </div>
              <p className="text-[9px] text-slate-400 mt-2">These apply to just this period, not the driver's whole-month Salary Breakup figures - enter what's actually due for {dateFrom || '...'} to {dateTo || '...'}.</p>
            </div>

            {preview && (
              <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 grid grid-cols-2 gap-y-1.5">
                <span className="text-purple-500 font-semibold">Wages Per Day</span><span className="text-right font-bold">{rupee(wagesPerDay)}</span>
                <span className="text-purple-500 font-semibold">Earned Pay ({preview.presentDays} days)</span><span className="text-right font-bold">{rupee(earnedAmount)}</span>
                {preview.lopDays > 0 && <><span className="text-orange-500 font-semibold">LOP (unpaid, {preview.lopDays} days)</span><span className="text-right font-bold text-orange-600">{rupee(lopAmount)}</span></>}
                <span className="text-purple-500 font-semibold">Total Deductions</span><span className="text-right font-bold">{rupee(totalDeductions)}</span>
                <span className="text-purple-700 font-black">Net Payable (preview)</span><span className="text-right font-black text-purple-700">{rupee(netSalary)}</span>
              </div>
            )}

            {genError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{genError}</span>
              </div>
            )}

            <button onClick={() => run(false)} disabled={!validRange || generating}
              className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold px-4 py-2.5 rounded-lg cursor-pointer disabled:opacity-50 transition-all uppercase text-[10px]">
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />} {generating ? 'Generating...' : 'Generate Slip'}
            </button>
          </div>

          {/* Generated slip result */}
          {slip && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              {reusedNotice && (
                <p className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  Reused the existing slip for this exact period ({slip.slipNumber}) - use Regenerate below for a fresh one with the values above.
                </p>
              )}
              <div className="text-center border-b border-slate-200 pb-3">
                <p className="font-black text-slate-900 text-base">KCM LOGISTICS</p>
                <p className="text-slate-500">Driver Salary Slip - {slip.dateFrom} to {slip.dateTo}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div><span className="text-slate-400">Slip Number: </span><span className="font-semibold font-mono">{slip.slipNumber}</span></div>
                <div><span className="text-slate-400">Vehicle No: </span><span className="font-semibold font-mono">{slip.vehicleNo || '-'}</span></div>
                <div><span className="text-slate-400">Bank: </span><span className="font-semibold font-mono">{slip.bankAccountNumberMasked || '-'}</span></div>
                <div><span className="text-slate-400">IFSC: </span><span className="font-semibold font-mono">{slip.ifscCode || '-'}</span></div>
              </div>
              <div className="bg-purple-900 text-white rounded-lg p-3 flex items-center justify-between">
                <span className="font-bold uppercase tracking-wide">Net Payable</span>
                <span className="font-black text-base">{rupee(slip.netSalary)}</span>
              </div>
              <p className="text-slate-500 italic text-center">{numberToIndianWords(slip.netSalary)}</p>
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Generated: {slip.generatedDate}</span>
                <span>{slip.isDownloaded ? `Last downloaded: ${slip.lastDownloadedDate}` : 'Not yet downloaded'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleRegenerate} disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg font-semibold cursor-pointer disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} /> Regenerate
                </button>
                <button onClick={handleDownload} disabled={downloading}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-all">
                  <Download className="w-3.5 h-3.5" /> {downloading ? 'Downloading...' : 'Download'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
