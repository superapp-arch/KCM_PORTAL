import React, { useState, useEffect, useMemo } from 'react';
import { Coins, Plus, Search, Edit2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { StaffEmployee, StaffSalaryDetail } from '../../types';
import StaffFormModal from './StaffFormModal';
import { authFetch } from '../../authFetch';

interface StaffSalarySheetProps {
  employees: StaffEmployee[];
  onAddEmployee: (emp: Omit<StaffEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateEmployee: (id: string, emp: Partial<StaffEmployee>) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
}

type SalaryDetailWithEffective = StaffSalaryDetail & { effectiveSalary: number; advanceBalance: number };

export default function StaffSalarySheet({ employees, onAddEmployee, onUpdateEmployee, onDeleteEmployee }: StaffSalarySheetProps) {
  const [salaryDetails, setSalaryDetails] = useState<SalaryDetailWithEffective[]>([]);
  const [hikeCounts, setHikeCounts] = useState<Record<string, { count: number; total: number }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState(''); // '' = All Locations
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Inactive' | 'All'>('Active');
  const [modalEmployee, setModalEmployee] = useState<StaffEmployee | null | undefined>(undefined); // undefined = closed
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const triggerNotif = (message: string, type: 'success' | 'error') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  const loadSalaryData = async () => {
    try {
      const detailRes = await authFetch('/api/staff/salary-detail');
      if (detailRes.ok) setSalaryDetails(await detailRes.json());
      const hikeRes = await authFetch('/api/staff/salary-hikes');
      if (hikeRes.ok) {
        const hikes = await hikeRes.json();
        const grouped: Record<string, { count: number; total: number }> = {};
        hikes.forEach((h: any) => {
          if (!grouped[h.empId]) grouped[h.empId] = { count: 0, total: 0 };
          grouped[h.empId].count += 1;
          grouped[h.empId].total += h.amount || 0;
        });
        setHikeCounts(grouped);
      }
    } catch { /* keep prior state on transient failure */ }
  };

  useEffect(() => { loadSalaryData(); }, [employees.length]);

  // Location options are derived from whatever locations staff have actually
  // been entered with, rather than a hardcoded list - a new location shows up
  // in this dropdown automatically as soon as a staff member is saved with it.
  const locationOptions = useMemo(() => {
    const distinct = Array.from(new Set(employees.map(e => (e.location || '').trim()).filter(Boolean)));
    return distinct.sort();
  }, [employees]);

  const filtered = useMemo(() => employees.filter(e => {
    if (statusFilter !== 'All' && e.status !== statusFilter) return false;
    if (locationFilter && (e.location || '').toLowerCase() !== locationFilter.toLowerCase()) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!e.id.toLowerCase().includes(q) && !e.name.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [employees, statusFilter, locationFilter, searchTerm]);

  const handleDelete = async (emp: StaffEmployee) => {
    if (!confirm(`Delete employee ${emp.id} - ${emp.name}? This cannot be undone.`)) return;
    await onDeleteEmployee(emp.id);
    triggerNotif(`Employee ${emp.id} removed.`, 'success');
  };

  const handleSaved = async () => {
    await loadSalaryData();
    triggerNotif('Staff record saved.', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Coins className="text-amber-600 w-5 h-5" />
            Staff Salary
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Master staff record, CTC, hikes &amp; bank details</p>
        </div>
        <button onClick={() => setModalEmployee(null)} className="bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold px-4 py-2 rounded-lg uppercase text-[11px] flex items-center gap-1.5 cursor-pointer transition-all">
          <Plus className="w-3.5 h-3.5" /> Add Staff
        </button>
      </div>

      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notif.message}</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by Name or Emp ID..." autoComplete="off" className="flex-1 outline-none" />
        </div>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 w-40">
          <option value="">All Locations</option>
          {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {(['Active', 'Inactive', 'All'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${statusFilter === s ? 'bg-gradient-to-r from-pink-600 to-purple-700 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-purple-100 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-3 py-2.5">Emp ID</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">DOJ</th>
                <th className="px-3 py-2.5">Designation</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">CTC</th>
                <th className="px-3 py-2.5">Annual CTC</th>
                <th className="px-3 py-2.5">Advance Balance</th>
                <th className="px-3 py-2.5">Hikes</th>
                <th className="px-3 py-2.5">DOL</th>
                <th className="px-3 py-2.5">Remarks</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-10 text-slate-400">No staff records found.</td></tr>
              ) : filtered.map(emp => {
                const detail = salaryDetails.find(d => d.empId === emp.id);
                const hikeInfo = hikeCounts[emp.id];
                return (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{emp.id}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{emp.name}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{emp.dateOfJoining || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{emp.designation || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{emp.location || '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                        emp.status === 'Active' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>{emp.status}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                        emp.employmentType === 'Contract' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-sky-100 text-sky-800 border-sky-300'
                      }`}>{emp.employmentType || 'On-Roll'}</span>
                    </td>
                    <td className="px-3 py-2.5">{detail?.ctc25 != null ? `Rs. ${detail.ctc25.toLocaleString('en-IN')}` : '-'}</td>
                    <td className="px-3 py-2.5">{detail?.annualCtc25 != null ? `Rs. ${detail.annualCtc25.toLocaleString('en-IN')}` : '-'}</td>
                    <td className="px-3 py-2.5">
                      {detail?.advanceAmount ? (
                        <span className="bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 font-bold whitespace-nowrap">
                          Rs. {detail.advanceBalance.toLocaleString('en-IN')}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2.5">{hikeInfo ? `${hikeInfo.count} (+Rs. ${hikeInfo.total.toLocaleString('en-IN')})` : '-'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{emp.dateOfLeaving || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500 max-w-[150px] truncate">{emp.remarks || '-'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => setModalEmployee(emp)} className="p-1 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(emp)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalEmployee !== undefined && (
        <StaffFormModal
          employee={modalEmployee}
          onAddEmployee={onAddEmployee}
          onUpdateEmployee={onUpdateEmployee}
          onClose={() => setModalEmployee(undefined)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
