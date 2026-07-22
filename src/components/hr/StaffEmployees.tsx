import React, { useState } from 'react';
import { StaffEmployee, User as UserType, VehicleDocument } from '../../types';
import {
  User, Plus, Search, CheckCircle2, AlertCircle, Edit2, Trash2, Contact, Shield, X
} from 'lucide-react';
import DocumentAttachment from '../DocumentAttachment';
import DateInput from '../DateInput';

interface StaffEmployeesProps {
  user: UserType;
  employees: StaffEmployee[];
  onAddEmployee: (emp: Omit<StaffEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateEmployee: (id: string, emp: Partial<StaffEmployee>) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
}

const emptyForm = {
  id: '', name: '', email: '', dateOfJoining: '', designation: '', location: '',
  status: 'Active' as StaffEmployee['status'], department: '', reportingManager: '',
  bankAccountNumber: '', ifscCode: '', documents: [] as VehicleDocument[]
};

export default function StaffEmployees({ user, employees, onAddEmployee, onUpdateEmployee, onDeleteEmployee }: StaffEmployeesProps) {
  const [form, setForm] = useState({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const triggerNotif = (message: string, type: 'success' | 'error') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  const activeCount = employees.filter(e => e.status === 'Active').length;
  const onLeaveCount = employees.filter(e => e.status === 'On Leave').length;
  const inactiveCount = employees.filter(e => e.status === 'Inactive').length;

  const filtered = employees.filter(e =>
    !searchTerm ||
    e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.department || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resetForm = () => { setForm({ ...emptyForm }); setEditingId(null); };

  const startEdit = (emp: StaffEmployee) => {
    setForm({
      id: emp.id, name: emp.name, email: emp.email || '', dateOfJoining: emp.dateOfJoining || '',
      designation: emp.designation || '', location: emp.location || '', status: emp.status,
      department: emp.department || '', reportingManager: emp.reportingManager || '',
      bankAccountNumber: emp.bankAccountNumber || '', ifscCode: emp.ifscCode || '', documents: emp.documents || []
    });
    setEditingId(emp.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.name.trim()) {
      triggerNotif('Employee ID and Name are required.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingId) {
        await onUpdateEmployee(editingId, form);
        triggerNotif(`Employee ${form.id} updated.`, 'success');
      } else {
        await onAddEmployee(form);
        triggerNotif(`Employee ${form.id} added.`, 'success');
      }
      resetForm();
    } catch (err) {
      triggerNotif('Failed to save employee record.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete employee ${id}? This cannot be undone.`)) return;
    await onDeleteEmployee(id);
    triggerNotif(`Employee ${id} removed.`, 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Contact className="text-blue-600 w-5 h-5" />
            Employee Master
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Staff directory driving both Attendance and Salary modules</p>
        </div>
      </div>

      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs ${
          notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
          <span>{notif.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider">Total Employees</p>
          <h3 className="text-xl font-black text-slate-800 mt-1">{employees.length}</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider">Active</p>
          <h3 className="text-xl font-black text-emerald-600 mt-1">{activeCount}</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider">On Leave</p>
          <h3 className="text-xl font-black text-amber-600 mt-1">{onLeaveCount}</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-400 uppercase tracking-wider">Inactive</p>
          <h3 className="text-xl font-black text-rose-600 mt-1">{inactiveCount}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit text-xs">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100 flex items-center gap-1.5 font-sans">
            <Plus className="w-4 h-4 text-teal-600" />
            {editingId ? `Edit ${editingId}` : 'Enlist New Employee'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Employee ID*</label>
              <input value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} disabled={!!editingId}
                placeholder="KCM15001" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 disabled:bg-slate-100" required />
            </div>
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Full Name*</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" required />
            </div>
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Date of Joining</label>
                <DateInput value={form.dateOfJoining} onChange={e => setForm({ ...form, dateOfJoining: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as StaffEmployee['status'] })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5">
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Designation</label>
                <input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Department</label>
                <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Location</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Reporting Manager (ID)</label>
                <input value={form.reportingManager} onChange={e => setForm({ ...form, reportingManager: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Bank A/C No.</label>
                <input value={form.bankAccountNumber} onChange={e => setForm({ ...form, bankAccountNumber: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">IFSC Code</label>
                <input value={form.ifscCode} onChange={e => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>

            <DocumentAttachment documents={form.documents} onChange={docs => setForm({ ...form, documents: docs })} label="ID Proof / Offer Letter" />

            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={isSubmitting}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg uppercase text-[11px] cursor-pointer disabled:opacity-50">
                {isSubmitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Employee'}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="px-3 py-2 border border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by ID, name, or department..."
              className="flex-1 text-xs outline-none" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Designation</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-400">No employees found.</td></tr>
                ) : filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{emp.id}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{emp.name}</td>
                    <td className="px-3 py-2.5 text-slate-500">{emp.designation || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{emp.department || '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                        emp.status === 'Active' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                        emp.status === 'On Leave' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                        'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>{emp.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(emp)} className="p-1 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded cursor-pointer">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(emp.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
