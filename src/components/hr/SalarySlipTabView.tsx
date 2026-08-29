import React, { useState } from 'react';
import { FileText, Users, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { StaffEmployee, StaffBankDetail, SalarySlipRecord } from '../../types';
import { EnrichedPfRecord, resolveOrGenerateSlip } from '../../utils/salarySlipGenerate';
import { authFetch } from '../../authFetch';
import SalarySlipModal from './SalarySlipModal';

interface SalarySlipTabViewProps {
  employees: StaffEmployee[];
  pfRecords: EnrichedPfRecord[];
  bankDetails: StaffBankDetail[];
  salarySlips: SalarySlipRecord[];
  performedBy: string;
  onSlipSaved: (slip: SalarySlipRecord) => void;
  // Refetches pfRecords in the parent (StaffSalarySheet) after a bulk
  // finalize - a full refresh rather than an optimistic local update, since
  // every active employee's own PF record potentially just changed status
  // at once, not just one.
  onPfRecordsRefresh: () => Promise<void>;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function SalarySlipTabView({ employees, pfRecords, bankDetails, salarySlips, performedBy, onSlipSaved, onPfRecordsRefresh }: SalarySlipTabViewProps) {
  const [empId, setEmpId] = useState('');
  const [month, setMonth] = useState(currentMonthKey());
  const [viewing, setViewing] = useState<{ employee: StaffEmployee; month: string } | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ generated: number; reused: number; skippedDraft: number; skippedNoRecord: number } | null>(null);
  const [finalizeRunning, setFinalizeRunning] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<{ finalized: number; alreadyFinalized: number; skippedNoRecord: number } | null>(null);

  const activeEmployees = employees.filter(e => e.status === 'Active').sort((a, b) => a.name.localeCompare(b.name));
  const selectedEmployee = employees.find(e => e.id === empId) || null;

  const handleGenerateOrView = () => {
    if (!selectedEmployee) return;
    setViewing({ employee: selectedEmployee, month });
  };

  const handleBulkGenerate = async () => {
    if (!confirm(`Generate slips for every active employee for ${month}? Anyone whose Salary Breakup for this month isn't Finalized yet will be skipped automatically (no warning per-employee).`)) return;
    setBulkRunning(true);
    setBulkResult(null);
    let generated = 0, reused = 0, skippedDraft = 0, skippedNoRecord = 0;
    // Local running copy so slip numbers within this batch stay sequential
    // instead of colliding (state updates from onSlipSaved won't land until
    // after this loop finishes).
    let runningSlips = [...salarySlips];

    for (const emp of activeEmployees) {
      const pfRecord = pfRecords.find(p => p.empId === emp.id && p.month === month);
      const alreadyExists = runningSlips.some(s => s.empId === emp.id && s.month === month);
      if (!alreadyExists) {
        if (!pfRecord) { skippedNoRecord++; continue; }
        if (pfRecord.status !== 'Finalized') { skippedDraft++; continue; }
      }
      try {
        const bankDetail = bankDetails.find(b => b.empId === emp.id);
        const result = await resolveOrGenerateSlip({ employee: emp, month, pfRecord, bankDetail, existingSlips: runningSlips, forceRegenerate: false, performedBy });
        if (result.isNew) { generated++; runningSlips = [...runningSlips, result.slip]; } else { reused++; }
        onSlipSaved(result.slip);
      } catch {
        skippedNoRecord++;
      }
    }

    setBulkResult({ generated, reused, skippedDraft, skippedNoRecord });
    setBulkRunning(false);
  };

  // Bulk equivalent of Salary Breakup's own per-employee "Mark as Finalized"
  // (StaffFormModal.tsx's handleFinalizePf) - an employee can't be marked
  // Finalized one at a time for the whole staff list every month, so this
  // does it for every active employee's existing Salary Breakup record in
  // one action, right next to Generate for All Employees. Only re-POSTs
  // status: 'Finalized' onto whatever's already saved for that employee/
  // month - it never invents or edits any of the actual figures. Anyone
  // with no Salary Breakup record yet for this month is skipped (nothing to
  // finalize) - same as Generate for All Employees' own skippedNoRecord.
  const handleBulkFinalize = async () => {
    if (!confirm(`Finalize every active employee's ${month} Salary Breakup? This is what allows their Salary Slip to be generated without a warning.`)) return;
    setFinalizeRunning(true);
    setFinalizeResult(null);
    let finalized = 0, alreadyFinalized = 0, skippedNoRecord = 0;

    for (const emp of activeEmployees) {
      const pfRecord = pfRecords.find(p => p.empId === emp.id && p.month === month);
      if (!pfRecord) { skippedNoRecord++; continue; }
      if (pfRecord.status === 'Finalized') { alreadyFinalized++; continue; }
      try {
        await authFetch('/api/staff/provident-fund', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...pfRecord, status: 'Finalized' })
        });
        finalized++;
      } catch {
        skippedNoRecord++;
      }
    }

    await onPfRecordsRefresh();
    setFinalizeResult({ finalized, alreadyFinalized, skippedNoRecord });
    setFinalizeRunning(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 mb-4">
          <FileText className="w-4 h-4 text-purple-600" /> Generate a Single Salary Slip
        </h2>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <div className="flex-1 min-w-[240px]">
            <label className="block font-semibold text-slate-500 mb-1">Employee Name (Employee ID)</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
              <option value="">Select an employee...</option>
              {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-500 mb-1">Month / Year</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
          </div>
          <button onClick={handleGenerateOrView} disabled={!selectedEmployee}
            className="bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold px-4 py-2 rounded-lg uppercase text-[11px] cursor-pointer disabled:opacity-50 transition-all">
            Generate / View Slip
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 mb-2">
          <Users className="w-4 h-4 text-purple-600" /> Generate for All Employees
        </h2>
        <p className="text-slate-500 text-xs mb-3">
          Generates (or reuses an already-issued) slip for every Active employee for <span className="font-bold">{month}</span> - skips anyone whose Salary Breakup for that month isn't Finalized yet, or who has no Salary Breakup record at all. Slips are generated and stored only - nothing is emailed automatically.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleBulkGenerate} disabled={bulkRunning}
            className="bg-purple-800 hover:bg-purple-900 text-white font-bold px-4 py-2 rounded-lg uppercase text-[11px] cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5">
            {bulkRunning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</> : `Generate for All Employees (${month})`}
          </button>
          <button onClick={handleBulkFinalize} disabled={finalizeRunning}
            title="Marks every active employee's existing Salary Breakup record for this month Finalized, without opening each one individually"
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-lg uppercase text-[11px] cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5">
            {finalizeRunning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Finalizing...</> : <><ShieldCheck className="w-3.5 h-3.5" /> Mark as Finalized for All Employees</>}
          </button>
        </div>
        {bulkResult && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {bulkResult.generated} newly generated, {bulkResult.reused} already existed (reused), {bulkResult.skippedDraft} skipped (Salary Breakup not Finalized), {bulkResult.skippedNoRecord} skipped (no Salary Breakup record for this month).
            </span>
          </div>
        )}
        {finalizeResult && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {finalizeResult.finalized} newly finalized, {finalizeResult.alreadyFinalized} already were, {finalizeResult.skippedNoRecord} skipped (no Salary Breakup record for this month).
            </span>
          </div>
        )}
      </div>

      {viewing && (
        <SalarySlipModal
          employee={viewing.employee}
          month={viewing.month}
          pfRecord={pfRecords.find(p => p.empId === viewing.employee.id && p.month === viewing.month)}
          bankDetail={bankDetails.find(b => b.empId === viewing.employee.id)}
          existingSlips={salarySlips}
          performedBy={performedBy}
          onClose={() => setViewing(null)}
          onSlipSaved={onSlipSaved}
        />
      )}
    </div>
  );
}
