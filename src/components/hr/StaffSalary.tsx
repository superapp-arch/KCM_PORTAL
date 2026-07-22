import React, { useState, useEffect } from 'react';
import {
  Coins, Plus, Trash2, Edit2, X, FileSpreadsheet, FileDown, Mail, BarChart3, ClipboardList
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { StaffEmployee, StaffSalaryStructure, StaffSalaryDeduction, StaffSalaryHistory } from '../../types';

interface StaffSalaryProps {
  user: { username: string };
  employees: StaffEmployee[];
}

type SubView = 'structure' | 'deductions' | 'process' | 'register' | 'slip' | 'analytics';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function formatINR(n: number): string {
  return `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;
}

export default function StaffSalary({ user, employees }: StaffSalaryProps) {
  const [subView, setSubView] = useState<SubView>('structure');
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const triggerNotif = (message: string, type: 'success' | 'error') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Coins className="text-amber-600 w-5 h-5" />
            Staff Salary
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Structure, processing, slips, register & analytics</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold flex-wrap">
          {([
            ['structure', 'Structure', Coins],
            ['deductions', 'Deductions', ClipboardList],
            ['process', 'Processing', FileSpreadsheet],
            ['register', 'Register', ClipboardList],
            ['slip', 'Salary Slip', FileDown],
            ['analytics', 'Analytics', BarChart3],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setSubView(key)}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                subView === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.message}
        </div>
      )}

      {subView === 'structure' && <StructurePanel employees={employees} triggerNotif={triggerNotif} />}
      {subView === 'deductions' && <DeductionsPanel employees={employees} triggerNotif={triggerNotif} />}
      {subView === 'process' && <ProcessingPanel employees={employees} triggerNotif={triggerNotif} />}
      {subView === 'register' && <RegisterPanel employees={employees} />}
      {subView === 'slip' && <SlipPanel employees={employees} triggerNotif={triggerNotif} />}
      {subView === 'analytics' && <AnalyticsPanel />}
    </div>
  );
}

const emptyStructure = {
  empId: '', ctc2025: '', annualSalary: '', basicSalary: '', hra: '', dearnessAllowance: '',
  specialAllowance: '', otherAdditions: '', salaryHike1May2025: '', salaryHike1Apr2026: '', effectiveFrom: ''
};

function StructurePanel({ employees, triggerNotif }: { employees: StaffEmployee[]; triggerNotif: (m: string, t: 'success' | 'error') => void }) {
  const [structures, setStructures] = useState<StaffSalaryStructure[]>([]);
  const [form, setForm] = useState({ ...emptyStructure });
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => fetch('/api/staff/salary-structure').then(r => r.json()).then(setStructures).catch(() => {});
  useEffect(() => { load(); }, []);

  const startEdit = (s: StaffSalaryStructure) => {
    setEditingId(s.id);
    setForm({
      empId: s.empId, ctc2025: String(s.ctc2025 ?? ''), annualSalary: String(s.annualSalary ?? ''),
      basicSalary: String(s.basicSalary ?? ''), hra: String(s.hra ?? ''), dearnessAllowance: String(s.dearnessAllowance ?? ''),
      specialAllowance: String(s.specialAllowance ?? ''), otherAdditions: String(s.otherAdditions ?? ''),
      salaryHike1May2025: String(s.salaryHike1May2025 ?? ''), salaryHike1Apr2026: String(s.salaryHike1Apr2026 ?? ''),
      effectiveFrom: s.effectiveFrom
    });
  };
  const resetForm = () => { setForm({ ...emptyStructure }); setEditingId(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empId || !form.basicSalary || !form.effectiveFrom) {
      triggerNotif('Employee, Basic Salary, and Effective From are required.', 'error');
      return;
    }
    const payload = {
      empId: form.empId,
      ctc2025: Number(form.ctc2025) || undefined,
      annualSalary: Number(form.annualSalary) || undefined,
      basicSalary: Number(form.basicSalary) || 0,
      hra: Number(form.hra) || undefined,
      dearnessAllowance: Number(form.dearnessAllowance) || undefined,
      specialAllowance: Number(form.specialAllowance) || undefined,
      otherAdditions: Number(form.otherAdditions) || undefined,
      salaryHike1May2025: Number(form.salaryHike1May2025) || undefined,
      salaryHike1Apr2026: Number(form.salaryHike1Apr2026) || undefined,
      effectiveFrom: form.effectiveFrom
    };
    const url = editingId ? `/api/staff/salary-structure/${editingId}` : '/api/staff/salary-structure';
    const res = await fetch(url, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { await load(); resetForm(); triggerNotif('Salary structure saved.', 'success'); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this salary structure record?')) return;
    const res = await fetch(`/api/staff/salary-structure/${id}`, { method: 'DELETE' });
    if (res.ok) { await load(); triggerNotif('Salary structure removed.', 'success'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit text-xs space-y-3">
        <h2 className="text-sm font-bold text-slate-800 uppercase mb-2 flex items-center gap-1.5"><Plus className="w-4 h-4 text-teal-600" /> {editingId ? 'Edit Structure' : 'New Salary Structure'}</h2>
        <select value={form.empId} onChange={e => setForm({ ...form, empId: e.target.value })} disabled={!!editingId} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 disabled:bg-slate-100" required>
          <option value="">Select Employee</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.id} - {e.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="CTC 2025" value={form.ctc2025} onChange={e => setForm({ ...form, ctc2025: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
          <input type="number" placeholder="Annual Salary" value={form.annualSalary} onChange={e => setForm({ ...form, annualSalary: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
        </div>
        <input type="number" placeholder="Basic Salary*" value={form.basicSalary} onChange={e => setForm({ ...form, basicSalary: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" required />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="HRA" value={form.hra} onChange={e => setForm({ ...form, hra: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
          <input type="number" placeholder="Dearness Allowance" value={form.dearnessAllowance} onChange={e => setForm({ ...form, dearnessAllowance: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Special Allowance" value={form.specialAllowance} onChange={e => setForm({ ...form, specialAllowance: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
          <input type="number" placeholder="Other Additions" value={form.otherAdditions} onChange={e => setForm({ ...form, otherAdditions: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Hike (1 May 2025)" value={form.salaryHike1May2025} onChange={e => setForm({ ...form, salaryHike1May2025: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
          <input type="number" placeholder="Hike (1 Apr 2026)" value={form.salaryHike1Apr2026} onChange={e => setForm({ ...form, salaryHike1Apr2026: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
        </div>
        <div>
          <label className="block font-semibold text-slate-500 mb-1">Effective From*</label>
          <input type="date" value={form.effectiveFrom} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" required />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg uppercase text-[11px] cursor-pointer">{editingId ? 'Save Changes' : 'Add Structure'}</button>
          {editingId && <button type="button" onClick={resetForm} className="px-3 border border-slate-300 rounded-lg text-slate-500 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </form>

      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="px-3 py-2.5">Emp ID</th><th className="px-3 py-2.5">Basic</th><th className="px-3 py-2.5">HRA</th><th className="px-3 py-2.5">Effective From</th><th className="px-3 py-2.5"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {structures.map(s => (
              <tr key={s.id}>
                <td className="px-3 py-2.5 font-mono font-bold">{s.empId}</td>
                <td className="px-3 py-2.5">{formatINR(s.basicSalary)}</td>
                <td className="px-3 py-2.5">{formatINR(s.hra || 0)}</td>
                <td className="px-3 py-2.5 font-mono">{s.effectiveFrom}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => startEdit(s)} className="p-1 text-slate-500 hover:text-teal-700 cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(s.id)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeductionsPanel({ employees, triggerNotif }: { employees: StaffEmployee[]; triggerNotif: (m: string, t: 'success' | 'error') => void }) {
  const [deductions, setDeductions] = useState<StaffSalaryDeduction[]>([]);
  const [form, setForm] = useState({ empId: '', month: currentMonthKey(), pfContribution: '', esiContribution: '', incomeTax: '', otherDeductions: '' });

  const load = () => fetch('/api/staff/salary-deductions').then(r => r.json()).then(setDeductions).catch(() => {});
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empId || !form.month) { triggerNotif('Employee and month are required.', 'error'); return; }
    const payload = {
      empId: form.empId, month: form.month,
      pfContribution: Number(form.pfContribution) || undefined,
      esiContribution: Number(form.esiContribution) || undefined,
      incomeTax: Number(form.incomeTax) || undefined,
      otherDeductions: Number(form.otherDeductions) || undefined,
    };
    const res = await fetch('/api/staff/salary-deductions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { await load(); triggerNotif('Deduction record saved.', 'success'); }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/staff/salary-deductions/${id}`, { method: 'DELETE' });
    if (res.ok) { await load(); triggerNotif('Deduction record removed.', 'success'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit text-xs space-y-3">
        <h2 className="text-sm font-bold text-slate-800 uppercase mb-2 flex items-center gap-1.5"><Plus className="w-4 h-4 text-teal-600" /> New Deduction Record</h2>
        <select value={form.empId} onChange={e => setForm({ ...form, empId: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" required>
          <option value="">Select Employee</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.id} - {e.name}</option>)}
        </select>
        <input type="month" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" required />
        <input type="number" placeholder="PF Contribution" value={form.pfContribution} onChange={e => setForm({ ...form, pfContribution: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
        <input type="number" placeholder="ESI Contribution" value={form.esiContribution} onChange={e => setForm({ ...form, esiContribution: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
        <input type="number" placeholder="Income Tax" value={form.incomeTax} onChange={e => setForm({ ...form, incomeTax: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
        <input type="number" placeholder="Other Deductions" value={form.otherDeductions} onChange={e => setForm({ ...form, otherDeductions: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
        <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg uppercase text-[11px] cursor-pointer">Save</button>
      </form>
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="px-3 py-2.5">Emp ID</th><th className="px-3 py-2.5">Month</th><th className="px-3 py-2.5">PF</th><th className="px-3 py-2.5">ESI</th><th className="px-3 py-2.5">Tax</th><th className="px-3 py-2.5"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {deductions.map(d => (
              <tr key={d.id}>
                <td className="px-3 py-2.5 font-mono font-bold">{d.empId}</td>
                <td className="px-3 py-2.5 font-mono">{d.month}</td>
                <td className="px-3 py-2.5">{formatINR(d.pfContribution || 0)}</td>
                <td className="px-3 py-2.5">{formatINR(d.esiContribution || 0)}</td>
                <td className="px-3 py-2.5">{formatINR(d.incomeTax || 0)}</td>
                <td className="px-3 py-2.5 text-right"><button onClick={() => remove(d.id)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProcessingPanel({ employees, triggerNotif }: { employees: StaffEmployee[]; triggerNotif: (m: string, t: 'success' | 'error') => void }) {
  const [month, setMonth] = useState(currentMonthKey());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<StaffSalaryHistory[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadHistory = () => fetch('/api/staff/salary-history').then(r => r.json()).then(setHistory).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const processSelected = async () => {
    if (selected.size === 0) { triggerNotif('Select at least one employee.', 'error'); return; }
    setIsProcessing(true);
    try {
      const res = await fetch('/api/staff/salary/process', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empIds: Array.from(selected), month })
      });
      if (res.ok) { await loadHistory(); triggerNotif(`Processed salary for ${selected.size} employee(s).`, 'success'); }
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStatus = async (historyId: string, status: StaffSalaryHistory['status']) => {
    const paymentMode = status === 'Paid' ? (prompt('Payment mode (NEFT/Cheque/Cash):', 'NEFT') || undefined) : undefined;
    const paymentRef = status === 'Paid' ? (prompt('Payment reference / UTR:') || undefined) : undefined;
    const res = await fetch(`/api/staff/salary/${historyId}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, paymentMode, paymentRef, paidOn: status === 'Paid' ? new Date().toISOString().slice(0, 10) : undefined })
    });
    if (res.ok) { await loadHistory(); triggerNotif(`Marked as ${status}.`, 'success'); }
  };

  const monthHistory = history.filter(h => h.month === month);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-3 text-xs">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
          <button onClick={processSelected} disabled={isProcessing} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-4 rounded-lg uppercase text-[11px] cursor-pointer disabled:opacity-50">
            {isProcessing ? 'Processing...' : `Process Selected (${selected.size})`}
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
          {employees.map(emp => (
            <label key={emp.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggle(emp.id)} />
              <span className="font-mono font-bold">{emp.id}</span>
              <span className="text-slate-600">{emp.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <h2 className="p-4 font-bold text-slate-800 uppercase text-xs border-b border-slate-100">Salary History - {month}</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="px-3 py-2.5">Emp ID</th><th className="px-3 py-2.5">Gross</th><th className="px-3 py-2.5">Deductions</th><th className="px-3 py-2.5">Net</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {monthHistory.map(h => (
              <tr key={h.id}>
                <td className="px-3 py-2.5 font-mono font-bold">{h.empId}</td>
                <td className="px-3 py-2.5">{formatINR(h.grossSalary)}</td>
                <td className="px-3 py-2.5">{formatINR(h.deductionsTotal)}</td>
                <td className="px-3 py-2.5 font-bold">{formatINR(h.netSalary)}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                    h.status === 'Paid' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                    h.status === 'Processed' ? 'bg-sky-100 text-sky-800 border-sky-300' :
                    'bg-slate-200 text-slate-600 border-slate-300'
                  }`}>{h.status}</span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {h.status === 'Draft' && <button onClick={() => updateStatus(h.id, 'Processed')} className="text-sky-700 font-semibold hover:underline cursor-pointer">Mark Processed</button>}
                  {h.status === 'Processed' && <button onClick={() => updateStatus(h.id, 'Paid')} className="text-emerald-700 font-semibold hover:underline cursor-pointer">Mark Paid</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RegisterPanel({ employees }: { employees: StaffEmployee[] }) {
  const [month, setMonth] = useState(currentMonthKey());
  const [register, setRegister] = useState<any[]>([]);
  const [deductionsReport, setDeductionsReport] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/staff/salary/register?month=${month}`).then(r => r.json()).then(({ data }) => setRegister(data || [])).catch(() => setRegister([]));
    fetch(`/api/staff/salary/deductions-report?month=${month}`).then(r => r.json()).then(({ data }) => setDeductionsReport(data || [])).catch(() => setDeductionsReport([]));
  }, [month, employees.length]);

  const totalNet = register.reduce((s, r) => s + r.netSalary, 0);

  return (
    <div className="space-y-6">
      <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs" />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <h2 className="p-4 font-bold text-slate-800 uppercase text-xs border-b border-slate-100">Salary Register - {month} (Total Net: {formatINR(totalNet)})</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="px-3 py-2.5">Emp ID</th><th className="px-3 py-2.5">Name</th><th className="px-3 py-2.5">Department</th><th className="px-3 py-2.5">Gross</th><th className="px-3 py-2.5">Deductions</th><th className="px-3 py-2.5">Net</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {register.map(r => (
              <tr key={r.empId}>
                <td className="px-3 py-2.5 font-mono font-bold">{r.empId}</td>
                <td className="px-3 py-2.5 font-semibold">{r.name}</td>
                <td className="px-3 py-2.5 text-slate-500">{r.department || '-'}</td>
                <td className="px-3 py-2.5">{formatINR(r.grossSalary)}</td>
                <td className="px-3 py-2.5">{formatINR(r.deductionsTotal)}</td>
                <td className="px-3 py-2.5 font-bold">{formatINR(r.netSalary)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <h2 className="p-4 font-bold text-slate-800 uppercase text-xs border-b border-slate-100">Deductions Report - {month}</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="px-3 py-2.5">Emp ID</th><th className="px-3 py-2.5">Name</th><th className="px-3 py-2.5">PF</th><th className="px-3 py-2.5">ESI</th><th className="px-3 py-2.5">Tax</th><th className="px-3 py-2.5">Total</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {deductionsReport.map(d => (
              <tr key={d.empId}>
                <td className="px-3 py-2.5 font-mono font-bold">{d.empId}</td>
                <td className="px-3 py-2.5">{d.name}</td>
                <td className="px-3 py-2.5">{formatINR(d.pfContribution || 0)}</td>
                <td className="px-3 py-2.5">{formatINR(d.esiContribution || 0)}</td>
                <td className="px-3 py-2.5">{formatINR(d.incomeTax || 0)}</td>
                <td className="px-3 py-2.5 font-bold">{formatINR(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SlipPanel({ employees, triggerNotif }: { employees: StaffEmployee[]; triggerNotif: (m: string, t: 'success' | 'error') => void }) {
  const [empId, setEmpId] = useState(employees[0]?.id || '');
  const [month, setMonth] = useState(currentMonthKey());
  const [slip, setSlip] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!empId || !month) return;
    fetch(`/api/staff/salary/slip/${encodeURIComponent(empId)}/${month}`).then(async r => {
      const body = await r.json();
      if (r.ok) { setSlip(body.data); setError(''); } else { setSlip(null); setError(body.error || 'Unable to compute slip.'); }
    }).catch(() => setError('Unable to compute slip.'));
  }, [empId, month]);

  const emailSlip = async () => {
    const res = await fetch('/api/staff/salary/slip/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empId, month })
    });
    const body = await res.json();
    triggerNotif(body.message || body.error, res.ok ? 'success' : 'error');
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex gap-3 text-xs">
        <select value={empId} onChange={e => setEmpId(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 flex-1">
          {employees.map(e => <option key={e.id} value={e.id}>{e.id} - {e.name}</option>)}
        </select>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5" />
      </div>

      {error && <div className="p-3 border rounded-lg text-xs font-semibold bg-rose-50 border-rose-200 text-rose-800">{error}</div>}

      {slip && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-xs space-y-3">
          <h2 className="font-bold text-slate-800 text-sm">{slip.employee.name} - {month}</h2>
          <div className="grid grid-cols-2 gap-y-1.5">
            <span className="text-slate-400">Gross Salary</span><span className="text-right font-semibold">{formatINR(slip.grossSalary)}</span>
            <span className="text-slate-400">Deductions</span><span className="text-right font-semibold">{formatINR(slip.deductionsTotal)}</span>
            <span className="text-slate-800 font-bold">Net Pay</span><span className="text-right font-black text-emerald-700">{formatINR(slip.netSalary)}</span>
            <span className="text-slate-400">Paid Days</span><span className="text-right">{slip.paidDays} / {slip.totalDaysInMonth}</span>
            <span className="text-slate-400">YTD Net</span><span className="text-right">{formatINR(slip.ytdNet)}</span>
          </div>
          <div className="flex gap-2 pt-2">
            <a href={`/api/staff/salary/slip-pdf/${encodeURIComponent(empId)}/${month}`} target="_blank" rel="noopener noreferrer"
              className="flex-1 text-center bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg uppercase text-[11px] flex items-center justify-center gap-1.5">
              <FileDown className="w-3.5 h-3.5" /> Download PDF
            </a>
            <button onClick={emailSlip} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg uppercase text-[11px] flex items-center justify-center gap-1.5 cursor-pointer">
              <Mail className="w-3.5 h-3.5" /> Email Slip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsPanel() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/staff/salary/analytics').then(r => r.json()).then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h2 className="font-bold text-slate-800 uppercase text-xs mb-4">Cost of Employment by Department</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.departmentCost}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="department" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip formatter={(v: number) => formatINR(v)} />
            <Legend />
            <Bar dataKey="total" name="Net Salary Cost" fill="#7c3aed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h2 className="font-bold text-slate-800 uppercase text-xs mb-4">Year-over-Year Salary Cost</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.yearOverYear}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip formatter={(v: number) => formatINR(v)} />
            <Bar dataKey="total" name="Net Salary Cost" fill="#0d9488" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h2 className="font-bold text-slate-800 uppercase text-xs mb-3">Highest Earners ({data.latestMonth})</h2>
        <ul className="text-xs divide-y divide-slate-100">
          {data.highestEarners.map((e: any) => <li key={e.empId} className="py-1.5 flex justify-between"><span>{e.name}</span><span className="font-bold">{formatINR(e.netSalary)}</span></li>)}
        </ul>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h2 className="font-bold text-slate-800 uppercase text-xs mb-3">Lowest Earners ({data.latestMonth})</h2>
        <ul className="text-xs divide-y divide-slate-100">
          {data.lowestEarners.map((e: any) => <li key={e.empId} className="py-1.5 flex justify-between"><span>{e.name}</span><span className="font-bold">{formatINR(e.netSalary)}</span></li>)}
        </ul>
      </div>
    </div>
  );
}
