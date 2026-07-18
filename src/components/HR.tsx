import React, { useState, useRef } from 'react';
import { HREmployee, User as UserType, DriverSalary, DriverSalaryAuditLog, VehicleDocument } from '../types';
import { 
  User, Plus, Search, CheckCircle2, FileText, BadgeAlert, Contact, 
  CreditCard, History, Trash2, Edit2, Lock, Shield, Sparkles, Check, 
  AlertCircle, ChevronRight, Coins, RefreshCw, Landmark, Paperclip, X, Upload, Download
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';

interface HRProps {
  user: UserType;
  employees: HREmployee[];
  onAddEmployee: (emp: Omit<HREmployee, 'id'>) => Promise<void>;
  onUpdateEmployee: (id: string, emp: Partial<HREmployee>) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
  driverSalaries: DriverSalary[];
  driverSalaryAuditLogs: DriverSalaryAuditLog[];
  onAddDriverSalary: (record: Omit<DriverSalary, 'id' | 'createdAt' | 'createdBy'>) => Promise<void>;
  onUpdateDriverSalary: (id: string, record: Partial<DriverSalary>) => Promise<void>;
  onDeleteDriverSalary: (id: string) => Promise<void>;
}

export default function HR({ 
  user,
  employees, 
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  driverSalaries = [],
  driverSalaryAuditLogs = [],
  onAddDriverSalary,
  onUpdateDriverSalary,
  onDeleteDriverSalary
}: HRProps) {
  // Tab Navigation: 'personnel' or 'driver-salary'
  const [subTab, setSubTab] = useState<'personnel' | 'driver-salary'>('personnel');

  const [attendanceDate, setAttendanceDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsUpdating] = useState(false);

  // New Employee State
  const [name, setName] = useState('');
  const [role, setRole] = useState<HREmployee['role']>('Driver');
  const [licenseNo, setLicenseNo] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [salary, setSalary] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState<HREmployee['attendanceStatus']>('Present');
  const [newEmployeeDocs, setNewEmployeeDocs] = useState<VehicleDocument[]>([]);

  // New / Edit Driver Salary State
  const [editingSalId, setEditingSalId] = useState<string | null>(null);
  const [drvId, setDrvId] = useState('');
  const [drvName, setDrvName] = useState('');
  const [accNo, setAccNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [netSal, setNetSal] = useState('');
  const [remarks, setRemarks] = useState('');
  const [newSalaryDocs, setNewSalaryDocs] = useState<VehicleDocument[]>([]);
  
  // Search and Filter state for Driver Salaries
  const [salarySearch, setSalarySearch] = useState('');

  // Notification Banner State
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal / Manage State for Employee
  const [selectedEmployeeForManage, setSelectedEmployeeForManage] = useState<HREmployee | null>(null);
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpRole, setEditEmpRole] = useState<HREmployee['role']>('Driver');
  const [editEmpLicenseNo, setEditEmpLicenseNo] = useState('');
  const [editEmpLicenseExpiry, setEditEmpLicenseExpiry] = useState('');
  const [editEmpSalary, setEditEmpSalary] = useState('');
  const [editEmpAttendanceStatus, setEditEmpAttendanceStatus] = useState<HREmployee['attendanceStatus']>('Present');
  const [editEmpStatus, setEditEmpStatus] = useState<'Active' | 'Inactive'>('Active');

  // Modal / Manage State for Driver Salary
  const [selectedSalaryForManage, setSelectedSalaryForManage] = useState<DriverSalary | null>(null);
  const [editSalDriverId, setEditSalDriverId] = useState('');
  const [editSalDriverName, setEditSalDriverName] = useState('');
  const [editSalAccountNumber, setEditSalAccountNumber] = useState('');
  const [editSalIfscCode, setEditSalIfscCode] = useState('');
  const [editSalNetSalary, setEditSalNetSalary] = useState('');
  const [editSalRemarks, setEditSalRemarks] = useState('');

  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  // Access Control Helpers
  const canCreateUpdateSalary = true;
  const canDeleteSalary = true;

  const validateIFSC = (code: string): boolean => {
    const regex = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
    return regex.test(code);
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !salary) {
      triggerNotif('Please fill in mandatory employee fields.', 'error');
      return;
    }

    setIsUpdating(true);
    try {
      await onAddEmployee({
        name,
        role,
        licenseNo: role === 'Driver' ? licenseNo : undefined,
        licenseExpiry: role === 'Driver' ? licenseExpiry : undefined,
        salary: parseFloat(salary),
        attendanceStatus,
        status: 'Active',
        documents: newEmployeeDocs
      });

      // Reset
      setName('');
      setLicenseNo('');
      setLicenseExpiry('');
      setSalary('');
      setNewEmployeeDocs([]);
      triggerNotif('👥 Employee registry record established & synced with HR node!', 'success');
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to register employee.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  // Driver Salary submit (Add/Edit)
  const handleSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canCreateUpdateSalary) {
      triggerNotif('Access Denied: You do not have HR Executive / Payroll Staff clearance to record entries.', 'error');
      return;
    }

    // Mandatory checks
    if (!drvId.trim() || !drvName.trim() || !accNo.trim() || !ifsc.trim() || !netSal.trim()) {
      triggerNotif('Please fill in all mandatory account and salary fields.', 'error');
      return;
    }

    // Numeric checks
    const parsedSalary = parseFloat(netSal);
    if (isNaN(parsedSalary) || parsedSalary <= 0) {
      triggerNotif('Validation Error: Net Salary must be a positive numeric value.', 'error');
      return;
    }

    // Account check: must be digits
    if (!/^\d+$/.test(accNo.trim())) {
      triggerNotif('Validation Error: Account Number must contain numeric digits only.', 'error');
      return;
    }

    // IFSC validation
    if (!validateIFSC(ifsc.trim())) {
      triggerNotif('Validation Error: Invalid IFSC Code format (Expected e.g. SBIN0001234 — 4 letters + 0 + 6 alphanumeric).', 'error');
      return;
    }

    setIsUpdating(true);
    try {
      if (editingSalId) {
        // Edit flow
        await onUpdateDriverSalary(editingSalId, {
          driverId: drvId.trim(),
          driverName: drvName.trim(),
          accountNumber: accNo.trim(),
          ifscCode: ifsc.trim().toUpperCase(),
          netSalary: parsedSalary,
          remarks: remarks.trim() || undefined
        });
        triggerNotif(`💳 Updated driver salary record for ${drvName} (${drvId}) successfully!`, 'success');
        setEditingSalId(null);
      } else {
        // Create flow
        // Check if driverId already exists
        const exists = driverSalaries.some(s => (s?.driverId || '').toLowerCase() === drvId.trim().toLowerCase());
        if (exists) {
          triggerNotif(`Driver ID "${drvId}" already has a payroll salary profile configured!`, 'error');
          setIsUpdating(false);
          return;
        }

        await onAddDriverSalary({
          driverId: drvId.trim(),
          driverName: drvName.trim(),
          accountNumber: accNo.trim(),
          ifscCode: ifsc.trim().toUpperCase(),
          netSalary: parsedSalary,
          remarks: remarks.trim() || undefined,
          documents: newSalaryDocs
        });
        triggerNotif(`💳 Configured new driver salary account for ${drvName} successfully!`, 'success');
      }

      // Reset form
      setDrvId('');
      setDrvName('');
      setAccNo('');
      setIfsc('');
      setNetSal('');
      setRemarks('');
      setNewSalaryDocs([]);
    } catch (err) {
      console.error(err);
      triggerNotif('Error processing driver salary request.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartEditSalary = (s: DriverSalary) => {
    setEditingSalId(s.id);
    setDrvId(s.driverId);
    setDrvName(s.driverName);
    setAccNo(s.accountNumber);
    setIfsc(s.ifscCode);
    setNetSal(String(s.netSalary));
    setRemarks(s.remarks || '');
    triggerNotif(`Loaded details for driver ${s.driverName} into edit pane.`, 'success');
  };

  const handleCancelEditSalary = () => {
    setEditingSalId(null);
    setDrvId('');
    setDrvName('');
    setAccNo('');
    setIfsc('');
    setNetSal('');
    setRemarks('');
  };

  const handleDeleteSalaryClick = async (s: DriverSalary) => {
    if (!canDeleteSalary) {
      triggerNotif('Action Restricted: Only Administrative Managers or HR Managers may delete records.', 'error');
      return;
    }

    if (window.confirm(`Are you sure you want to delete the payroll configuration for ${s.driverName} (${s.driverId})?`)) {
      try {
        await onDeleteDriverSalary(s.id);
        triggerNotif(`Successfully deleted payroll profile for ${s.driverName}.`, 'success');
        if (editingSalId === s.id) {
          handleCancelEditSalary();
        }
      } catch (err) {
        console.error(err);
        triggerNotif('Failed to delete salary profile.', 'error');
      }
    }
  };

  const generateAutoDriverId = () => {
    const existingNums = driverSalaries
      .map(s => {
        const m = s.driverId.match(/DRV-(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(n => n > 0);
    
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 101;
    setDrvId(`DRV-${nextNum}`);
    triggerNotif(`Generated auto-identifier: DRV-${nextNum}`, 'success');
  };

  // EMPLOYEE MANAGEMENT HANDLERS
  const handleOpenManageEmployeeModal = (emp: HREmployee) => {
    setSelectedEmployeeForManage(emp);
    setEditEmpName(emp.name);
    setEditEmpRole(emp.role);
    setEditEmpLicenseNo(emp.licenseNo || '');
    setEditEmpLicenseExpiry(emp.licenseExpiry || '');
    setEditEmpSalary(String(emp.salary));
    setEditEmpAttendanceStatus(emp.attendanceStatus);
    setEditEmpStatus(emp.status || 'Active');
  };

  const handleUpdateEmployeeDocs = async (updatedDocs: VehicleDocument[]) => {
    if (!selectedEmployeeForManage) return;
    try {
      await onUpdateEmployee(selectedEmployeeForManage.id, { documents: updatedDocs });
      setSelectedEmployeeForManage({
        ...selectedEmployeeForManage,
        documents: updatedDocs
      });
      triggerNotif('📎 Employee documents updated successfully.', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveEmployeeEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeForManage) return;

    setIsUpdating(true);
    try {
      const updatedData: Partial<HREmployee> = {
        name: editEmpName,
        role: editEmpRole,
        licenseNo: editEmpRole === 'Driver' ? editEmpLicenseNo : undefined,
        licenseExpiry: editEmpRole === 'Driver' ? editEmpLicenseExpiry : undefined,
        salary: parseFloat(editEmpSalary),
        attendanceStatus: editEmpAttendanceStatus,
        status: editEmpStatus
      };

      await onUpdateEmployee(selectedEmployeeForManage.id, updatedData);

      setSelectedEmployeeForManage({
        ...selectedEmployeeForManage,
        ...updatedData
      });

      triggerNotif('✏️ Employee record updated successfully!', 'success');
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to update employee.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteEmployeeClick = async (id: string, empName: string) => {
    if (!confirm(`Are you sure you want to delete employee ${empName}? This action is irreversible.`)) return;
    try {
      await onDeleteEmployee(id);
      triggerNotif('🗑️ Employee record successfully deleted from directory.', 'success');
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to delete employee record.', 'error');
    }
  };

  // DRIVER SALARY MANAGE HANDLERS
  const handleOpenManageSalaryModal = (s: DriverSalary) => {
    setSelectedSalaryForManage(s);
    setEditSalDriverId(s.driverId);
    setEditSalDriverName(s.driverName);
    setEditSalAccountNumber(s.accountNumber);
    setEditSalIfscCode(s.ifscCode);
    setEditSalNetSalary(String(s.netSalary));
    setEditSalRemarks(s.remarks || '');
  };

  const handleUpdateSalaryDocs = async (updatedDocs: VehicleDocument[]) => {
    if (!selectedSalaryForManage) return;
    try {
      await onUpdateDriverSalary(selectedSalaryForManage.id, { documents: updatedDocs });
      setSelectedSalaryForManage({
        ...selectedSalaryForManage,
        documents: updatedDocs
      });
      triggerNotif('📎 Bank vouchers updated successfully.', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSalaryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSalaryForManage) return;

    // Numerical checks
    const parsedSalary = parseFloat(editSalNetSalary);
    if (isNaN(parsedSalary) || parsedSalary <= 0) {
      triggerNotif('Validation Error: Net Salary must be a positive numeric value.', 'error');
      return;
    }

    // Account check: must be digits
    if (!/^\d+$/.test(editSalAccountNumber.trim())) {
      triggerNotif('Validation Error: Account Number must contain numeric digits only.', 'error');
      return;
    }

    // IFSC validation
    if (!validateIFSC(editSalIfscCode.trim())) {
      triggerNotif('Validation Error: Invalid IFSC Code format (Expected e.g. SBIN0001234).', 'error');
      return;
    }

    setIsUpdating(true);
    try {
      const updatedData: Partial<DriverSalary> = {
        driverId: editSalDriverId.trim(),
        driverName: editSalDriverName.trim(),
        accountNumber: editSalAccountNumber.trim(),
        ifscCode: editSalIfscCode.trim().toUpperCase(),
        netSalary: parsedSalary,
        remarks: editSalRemarks.trim() || undefined
      };

      await onUpdateDriverSalary(selectedSalaryForManage.id, updatedData);

      setSelectedSalaryForManage({
        ...selectedSalaryForManage,
        ...updatedData
      });

      triggerNotif('✏️ Driver salary profile updated successfully!', 'success');
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to update driver salary record.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  // Filter Personnel Directory
  const filteredEmployees = employees.filter(emp =>
    (emp?.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (emp?.role || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  // Filter Driver Salaries
  const filteredDriverSalaries = driverSalaries.filter(s =>
    (s?.driverId || '').toLowerCase().includes((salarySearch || '').toLowerCase()) ||
    (s?.driverName || '').toLowerCase().includes((salarySearch || '').toLowerCase())
  );

  const getEmpAttendanceForDate = (emp: HREmployee, dateStr: string): 'Present' | 'Absent' | 'On Leave' => {
    if (emp.dailyAttendance && emp.dailyAttendance[dateStr]) {
      return emp.dailyAttendance[dateStr];
    }
    return emp.attendanceStatus || 'Present';
  };

  const handleToggleAttendance = async (emp: HREmployee, status: 'Present' | 'Absent') => {
    setIsUpdating(true);
    try {
      const dailyAttendance = { ...(emp.dailyAttendance || {}) };
      dailyAttendance[attendanceDate] = status;
      
      const todayStr = new Date().toISOString().split('T')[0];
      const isToday = attendanceDate === todayStr;
      
      await onUpdateEmployee(emp.id, {
        dailyAttendance,
        ...(isToday ? { attendanceStatus: status } : {})
      });
      triggerNotif(`Updated muster for ${emp.name} to ${status} on ${attendanceDate}!`, 'success');
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to update attendance status.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const activeDriversCount = employees.filter(emp => emp.role === 'Driver').length;
  const presentEmployeesCount = employees.filter(emp => getEmpAttendanceForDate(emp, attendanceDate) === 'Present').length;

  return (
    <div className="space-y-6" id="hr-view-wrapper">
      {/* Module Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Contact className="text-blue-600 w-5 h-5" />
            KCM HR & Employee Directory
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Departmental view: corporate payroll registry, driver roster compliance, and live attendance metrics
          </p>
        </div>

        {/* Sub-tab Toggle buttons */}
        <div className="flex items-center gap-1.5 mt-4 md:mt-0 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => { setSubTab('personnel'); setSearchTerm(''); }}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
              subTab === 'personnel' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Personnel Directory
          </button>
          <button
            onClick={() => { setSubTab('driver-salary'); setSearchTerm(''); }}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
              subTab === 'driver-salary' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            Driver Salary Registry
          </button>
        </div>
      </div>

      {/* Access Status Header Alert */}
      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-slate-600">
        <div className="flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-slate-500" />
          <span>OPERATOR DEPT: <strong className="text-blue-700 uppercase">{user.departmentLabel || user.department}</strong></span>
          <span className="text-slate-300">|</span>
          <span>USER SESSION: <strong className="text-slate-800">{user.username}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${canCreateUpdateSalary ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {canCreateUpdateSalary ? 'HR WRITING ACCESS GRANTED' : 'READ ONLY WORKSPACE'}
          </span>
          <span className="text-slate-300">|</span>
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${canDeleteSalary ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {canDeleteSalary ? 'MANAGER DELETION SIGN-OFF ALLOWED' : 'DELETIONS BLOCKED'}
          </span>
        </div>
      </div>

      {/* Notification Toast */}
      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs transition-all animate-pulse ${
          notif.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notif.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{notif.message}</span>
        </div>
      )}

      {/* PERSONNEL DIRECTORY TAB VIEW */}
      {subTab === 'personnel' && (
        <>
          {/* KPI Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-xs">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-wider">Active Logistics Drivers</p>
                <h3 className="text-lg font-bold text-slate-800 mt-1">{activeDriversCount} Licensed Drivers</h3>
                <p className="text-slate-400 mt-0.5">Rostered to operational heavy fleet</p>
              </div>
              <div className="p-2.5 bg-slate-100 rounded-lg text-slate-600">
                <User className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-wider text-teal-600 font-sans">Muster Attendance Roster</p>
                <h3 className="text-lg font-bold text-teal-700 mt-1">{presentEmployeesCount} / {employees.length} Present</h3>
                <p className="text-slate-400 mt-0.5 font-mono">Date: {attendanceDate}</p>
              </div>
              <div className="p-2.5 bg-teal-50 rounded-lg text-teal-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-wider text-amber-600 font-sans">License Verification Status</p>
                <h3 className="text-lg font-bold text-amber-700 mt-1">100% Compliant</h3>
                <p className="text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
                  <BadgeAlert className="w-3.5 h-3.5 text-emerald-500" />
                  All active rosters cleared
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Form: Add Employee */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit text-xs">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100 flex items-center gap-1.5 font-sans">
                <Plus className="w-4 h-4 text-teal-600" />
                Enlist New Employee
              </h2>
              <form onSubmit={handleEmployeeSubmit} className="space-y-3.5">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Full Employee Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rajender Prasad"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-semibold focus:border-blue-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Organizational Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-medium"
                    >
                      <option value="Driver">Heavy Fleet Driver</option>
                      <option value="Vehicle Manager">Vehicle Data Manager</option>
                      <option value="Billing Clerk">Billing Officer</option>
                      <option value="Finance Officer">Finance Analyst</option>
                      <option value="Admin Support">Admin Support</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Assigned Base Salary (₹) *</label>
                    <input
                      type="number"
                      required
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      placeholder="e.g. 24000"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono focus:border-blue-400"
                    />
                  </div>
                </div>

                {role === 'Driver' && (
                  <div className="grid grid-cols-2 gap-3 p-2 bg-slate-100/50 rounded-lg border border-slate-200">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Commercial License No *</label>
                      <input
                        type="text"
                        required={role === 'Driver'}
                        value={licenseNo}
                        onChange={(e) => setLicenseNo(e.target.value)}
                        placeholder="KA502008..."
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">License Expiry Date *</label>
                      <input
                        type="date"
                        required={role === 'Driver'}
                        value={licenseExpiry}
                        onChange={(e) => setLicenseExpiry(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono focus:border-blue-400"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Attendance Status Today</label>
                  <select
                    value={attendanceStatus}
                    onChange={(e) => setAttendanceStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-medium"
                  >
                    <option value="Present">Present (Active Muster)</option>
                    <option value="On Leave">On Approved Leave</option>
                    <option value="Absent">Absent (Unexcused)</option>
                  </select>
                </div>

                <DocumentAttachment
                  documents={newEmployeeDocs}
                  onChange={setNewEmployeeDocs}
                  label="Attach Compliance Credentials / ID Copy"
                />

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs mt-3 cursor-pointer"
                >
                  {isSubmitting ? 'Syncing HR Node...' : 'Commit Employee Record'}
                </button>
              </form>
            </div>

            {/* Right Panel: Employee Grid */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 lg:col-span-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                    <Contact className="w-4 h-4 text-teal-600" />
                    Active KCM Logistics Roster
                  </h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">Click P (Present) or A (Absent) to record daily muster</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Attendance Date Selector */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                    <span className="font-bold text-slate-500 text-[10px] uppercase font-mono">Date:</span>
                    <input
                      type="date"
                      value={attendanceDate}
                      onChange={(e) => setAttendanceDate(e.target.value)}
                      className="bg-transparent font-mono font-bold text-slate-800 focus:outline-none cursor-pointer"
                    />
                  </div>
                  <div className="relative w-full sm:w-40 text-xs">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search Employee Name"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                    <tr>
                      <th className="px-3 py-2.5">UID</th>
                      <th className="px-3 py-2.5">Employee Name</th>
                      <th className="px-3 py-2.5">Rostered Role</th>
                      <th className="px-3 py-2.5">Compliance Docs</th>
                      <th className="px-3 py-2.5 text-center">Muster Status</th>
                      <th className="px-3 py-2.5 text-right">Compensation (₹)</th>
                      <th className="px-3 py-2.5 text-center">Docs</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-slate-400 font-mono uppercase">
                          NO ACTIVE ROSTER DISCOVERED IN SECURITY DIRECTORY.
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-2.5 font-mono text-slate-400">#E-{emp.id}</td>
                          <td className="px-3 py-2.5 font-bold text-slate-900">{emp.name}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-600">{emp.role}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500">
                            {emp.role === 'Driver' ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-slate-700 break-all">{emp.licenseNo}</span>
                                <span className="text-[10px] text-slate-400">Expires: {emp.licenseExpiry}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Operational Cleared</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            {(() => {
                              const currentStatus = getEmpAttendanceForDate(emp, attendanceDate);
                              return (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleToggleAttendance(emp, 'Present')}
                                    className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-black transition-all cursor-pointer border ${
                                      currentStatus === 'Present'
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200'
                                    }`}
                                    title="Mark Present"
                                  >
                                    P
                                  </button>
                                  <button
                                    onClick={() => handleToggleAttendance(emp, 'Absent')}
                                    className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-black transition-all cursor-pointer border ${
                                      currentStatus === 'Absent'
                                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
                                    }`}
                                    title="Mark Absent"
                                  >
                                    A
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">
                            ₹{(emp.salary || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {emp.documents && emp.documents.length > 0 ? (
                              <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
                                <Paperclip className="w-2.5 h-2.5 mr-0.5" />
                                {emp.documents.length}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleOpenManageEmployeeModal(emp)}
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded cursor-pointer"
                                title="Edit employee & manage credentials"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteEmployeeClick(emp.id, emp.name)}
                                className="p-1 text-slate-400 hover:text-pink-600 hover:bg-slate-100 rounded cursor-pointer"
                                title="Delete employee record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* DRIVER SALARY REGISTRY TAB VIEW */}
      {subTab === 'driver-salary' && (
        <div className="space-y-6">
          {/* Section Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2 text-xs">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-wider font-sans">Total Driver Accounts</p>
                <h3 className="text-lg font-bold text-slate-800 mt-1">{driverSalaries.length} Configured</h3>
                <p className="text-slate-400 mt-0.5">Registered bank salary profiles</p>
              </div>
              <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
                <Landmark className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-wider text-rose-600 font-sans">Average Net Salary</p>
                <h3 className="text-lg font-bold text-rose-700 mt-1">
                  ₹{driverSalaries.length > 0 
                    ? Math.round(driverSalaries.reduce((sum, s) => sum + (s.netSalary || 0), 0) / driverSalaries.length).toLocaleString('en-IN') 
                    : '0'
                  } / mo
                </h3>
                <p className="text-slate-400 mt-0.5">Average monthly disbursement rate</p>
              </div>
              <div className="p-2.5 bg-rose-50 rounded-lg text-rose-600">
                <Coins className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-400 uppercase tracking-wider text-teal-600 font-sans">Monthly Outflow Volume</p>
                <h3 className="text-lg font-bold text-teal-700 mt-1">
                  ₹{driverSalaries.reduce((sum, s) => sum + (s.netSalary || 0), 0).toLocaleString('en-IN')}
                </h3>
                <p className="text-slate-400 mt-0.5">Total committed payroll volume</p>
              </div>
              <div className="p-2.5 bg-teal-50 rounded-lg text-teal-600">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left side: Driver Account Form */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit text-xs">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  {editingSalId ? (
                    <>
                      <Edit2 className="w-4 h-4 text-blue-600 animate-bounce" />
                      Modify Salary Profile
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-emerald-600" />
                      Configure Salary Profile
                    </>
                  )}
                </h2>
                
                {editingSalId && (
                  <button 
                    onClick={handleCancelEditSalary}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {!canCreateUpdateSalary ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-lg flex flex-col items-center text-center gap-2">
                  <Lock className="w-6 h-6 text-amber-600 shrink-0" />
                  <span className="font-semibold text-amber-800">HR Writing Locked</span>
                  <span className="text-[10px] text-amber-700">
                    Your account does not belong to the HR, Accounts & Finance, or Admin support nodes. You cannot register or edit driver salaries.
                  </span>
                </div>
              ) : (
                <form onSubmit={handleSalarySubmit} className="space-y-4">
                  
                  {/* Driver ID */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700">Driver ID *</label>
                      {!editingSalId && (
                        <button
                          type="button"
                          onClick={generateAutoDriverId}
                          className="text-[9px] text-blue-600 hover:text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors flex items-center gap-0.5"
                        >
                          <Sparkles className="w-2.5 h-2.5 text-blue-500" />
                          Auto-Generate ID
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      disabled={!!editingSalId}
                      value={drvId}
                      onChange={(e) => setDrvId(e.target.value.toUpperCase())}
                      placeholder="e.g. DRV-103"
                      className={`w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-semibold font-mono focus:border-blue-400 ${
                        editingSalId ? 'opacity-70 cursor-not-allowed bg-slate-100' : ''
                      }`}
                    />
                    <p className="text-[9px] text-slate-400 mt-1 font-mono">Unique workforce index token</p>
                  </div>

                  {/* Driver Name Select/Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700">Driver Name *</label>
                      {/* Show active driver count in directory */}
                      <span className="text-[9px] text-slate-400">
                        {employees.filter(e => e.role === 'Driver').length} rostered drivers available
                      </span>
                    </div>
                    
                    {/* Auto Suggest Dropdown */}
                    <div className="relative">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            setDrvName(e.target.value);
                            // Auto populate matching driver salary if present in employees salary field
                            const match = employees.find(emp => emp.name === e.target.value);
                            if (match && !netSal) {
                              setNetSal(String(match.salary));
                            }
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-semibold mb-2"
                      >
                        <option value="">-- Choose registered driver to autofill --</option>
                        {employees
                          .filter(e => e.role === 'Driver')
                          .map((e, idx) => (
                            <option key={idx} value={e.name}>{e.name} (Base: ₹{(e.salary || 0).toLocaleString('en-IN')})</option>
                          ))
                        }
                      </select>

                      <input
                        type="text"
                        required
                        value={drvName}
                        onChange={(e) => setDrvName(e.target.value)}
                        placeholder="Or enter driver legal name manually"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-semibold focus:border-blue-400"
                      />
                    </div>
                  </div>

                  {/* Account Number */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Bank Account Number *</label>
                    <input
                      type="text"
                      required
                      value={accNo}
                      onChange={(e) => setAccNo(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter bank account digits"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono font-semibold focus:border-blue-400"
                    />
                    <p className="text-[9px] text-slate-400 mt-1 font-mono">Numeric format validation applied</p>
                  </div>

                  {/* IFSC Code */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-700">Bank IFSC Code *</label>
                      {ifsc && (
                        <span className={`text-[9px] font-bold px-1 rounded ${
                          validateIFSC(ifsc) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}>
                          {validateIFSC(ifsc) ? 'VALID IFSC' : 'INVALID IFSC'}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono font-semibold focus:border-blue-400"
                    />
                    <p className="text-[9px] text-slate-400 mt-1 font-mono">Format: 4 letters + 0 + 6 alphanumeric digits</p>
                  </div>

                  {/* Net Salary */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Monthly Net Salary (₹) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={netSal}
                      onChange={(e) => setNetSal(e.target.value)}
                      placeholder="e.g. 25000"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 font-mono font-semibold focus:border-blue-400"
                    />
                    <p className="text-[9px] text-slate-400 mt-1 font-mono">Must be positive numeric value</p>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Remarks (Optional)</label>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="e.g. Base incentive included, long route bonus"
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none text-slate-800 focus:border-blue-400"
                    />
                  </div>

                  <DocumentAttachment
                    documents={newSalaryDocs}
                    onChange={setNewSalaryDocs}
                    label="Attach Cancelled Cheque / Signed Bank Mandate Form"
                  />

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2.5 font-bold tracking-wide uppercase transition-colors shadow-xs mt-3 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Writing ledger...
                      </span>
                    ) : editingSalId ? (
                      'Save Bank Config Changes'
                    ) : (
                      'Commit Driver Payroll'
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Right side: Driver Salaries Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 lg:col-span-2 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  <Landmark className="w-4 h-4 text-blue-600" />
                  Driver Salary & Bank Accounts Directory
                </h2>
                <div className="relative w-full sm:w-64 text-xs">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search by Driver ID or Name"
                    value={salarySearch}
                    onChange={(e) => setSalarySearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none text-slate-800 font-medium"
                  />
                </div>
              </div>

              {/* Grid / Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                    <tr>
                      <th className="px-3 py-2.5">Driver ID</th>
                      <th className="px-3 py-2.5">Driver Name</th>
                      <th className="px-3 py-2.5 font-mono">Bank Account No</th>
                      <th className="px-3 py-2.5 font-mono">IFSC Code</th>
                      <th className="px-3 py-2.5 text-right">Net Salary</th>
                      <th className="px-3 py-2.5 text-center">Docs</th>
                      <th className="px-3 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredDriverSalaries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-400 font-mono uppercase">
                          No driver payroll salaries configured matching search.
                        </td>
                      </tr>
                    ) : (
                      filteredDriverSalaries.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-all text-[11px]">
                          <td className="px-3 py-3 font-mono font-black text-blue-600">{s.driverId}</td>
                          <td className="px-3 py-3 font-bold text-slate-950">
                            <div>{s.driverName}</div>
                            {s.remarks && <div className="text-[9px] text-slate-400 font-normal truncate max-w-[150px]" title={s.remarks}>{s.remarks}</div>}
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600 font-semibold">{s.accountNumber}</td>
                          <td className="px-3 py-3 font-mono text-slate-700 font-black">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] tracking-wider border border-slate-200">
                              {s.ifscCode}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-black text-rose-700 bg-rose-50/10">
                            ₹{(s.netSalary || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {s.documents && s.documents.length > 0 ? (
                              <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
                                <Paperclip className="w-2.5 h-2.5 mr-0.5" />
                                {s.documents.length}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Edit / Manage Button */}
                              <button
                                onClick={() => handleOpenManageSalaryModal(s)}
                                disabled={!canCreateUpdateSalary}
                                className={`px-2 py-1 font-bold text-[10px] rounded-md transition-colors ${
                                  canCreateUpdateSalary 
                                    ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer' 
                                    : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                                }`}
                                title={canCreateUpdateSalary ? "Manage details & upload bank copy" : "Manage locked"}
                              >
                                Manage
                              </button>
                              
                              {/* Delete Button */}
                              <button
                                onClick={() => handleDeleteSalaryClick(s)}
                                disabled={!canDeleteSalary}
                                className={`px-2 py-1 font-bold text-[10px] rounded-md transition-colors ${
                                  canDeleteSalary 
                                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer' 
                                    : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                                }`}
                                title={canDeleteSalary ? "Delete configuration" : "Delete action restricted to Managers"}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Audit Trail Log panel */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-1.5 mb-2.5 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                  <History className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Sub-Module Payroll Audit Trail</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500 lowercase font-normal italic font-mono">{driverSalaryAuditLogs.length} logs active</span>
                </div>
                
                <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {driverSalaryAuditLogs.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 font-mono text-[10px]">
                      NO LOG RECORDED YET. SYSTEM READY TO JOURNAL ENTRIES.
                    </div>
                  ) : (
                    [...driverSalaryAuditLogs].reverse().map((log) => (
                      <div key={log.id} className="p-2.5 flex items-start gap-2.5 text-[10.5px] hover:bg-slate-50/50 transition-colors">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0 font-mono ${
                          log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          log.action === 'UPDATE' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}>
                          {log.action}
                        </span>
                        
                        <div className="flex-1 space-y-0.5 text-slate-700">
                          <div className="font-semibold text-slate-900">
                            Driver: <span className="text-blue-700 font-bold">{log.driverName}</span> ({log.driverId})
                          </div>
                          <div className="text-slate-500 font-mono leading-relaxed">{log.details}</div>
                          <div className="text-[9px] text-slate-400 flex items-center gap-1.5">
                            <span>Operator: <strong className="text-slate-600">{log.username}</strong></span>
                            <span>•</span>
                            <span>Timestamp: {log.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* PERSOONNEL / EMPLOYEE MANAGE & DOCUMENT MODAL */}
      {selectedEmployeeForManage && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <Contact className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-sm">Manage Employee Profile</h3>
                  <p className="text-[10px] font-mono text-slate-500">Employee: {selectedEmployeeForManage.name} | UID: #E-{selectedEmployeeForManage.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEmployeeForManage(null)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Left Column: Edit Form */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  Edit Employee Details
                </h4>
                <form onSubmit={handleSaveEmployeeEdit} className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Employee Legal Name *</label>
                    <input
                      type="text"
                      required
                      value={editEmpName}
                      onChange={(e) => setEditEmpName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Organizational Role</label>
                      <select
                        value={editEmpRole}
                        onChange={(e) => setEditEmpRole(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                      >
                        <option value="Driver">Heavy Fleet Driver</option>
                        <option value="Vehicle Manager">Vehicle Data Manager</option>
                        <option value="Billing Clerk">Billing Officer</option>
                        <option value="Finance Officer">Finance Analyst</option>
                        <option value="Admin Support">Admin Support</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Base Salary (₹) *</label>
                      <input
                        type="number"
                        required
                        value={editEmpSalary}
                        onChange={(e) => setEditEmpSalary(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono font-bold"
                      />
                    </div>
                  </div>

                  {editEmpRole === 'Driver' && (
                    <div className="grid grid-cols-2 gap-3 p-2 bg-slate-100/50 rounded-lg border border-slate-200">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Commercial License No *</label>
                        <input
                          type="text"
                          required={editEmpRole === 'Driver'}
                          value={editEmpLicenseNo}
                          onChange={(e) => setEditEmpLicenseNo(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">License Expiry Date *</label>
                        <input
                          type="date"
                          required={editEmpRole === 'Driver'}
                          value={editEmpLicenseExpiry}
                          onChange={(e) => setEditEmpLicenseExpiry(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Attendance Muster</label>
                      <select
                        value={editEmpAttendanceStatus}
                        onChange={(e) => setEditEmpAttendanceStatus(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                      >
                        <option value="Present">Present (Active Muster)</option>
                        <option value="On Leave">On Approved Leave</option>
                        <option value="Absent">Absent (Unexcused)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Status</label>
                      <select
                        value={editEmpStatus}
                        onChange={(e) => setEditEmpStatus(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs cursor-pointer"
                  >
                    {isSubmitting ? 'Saving changes...' : 'Save Employee Changes'}
                  </button>
                </form>
              </div>

              {/* Right Column: Credentials Upload & List */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                <DocumentAttachment
                  documents={selectedEmployeeForManage.documents}
                  onChange={handleUpdateEmployeeDocs}
                  label="Employee Compliance Credentials"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRIVER SALARY MANAGE & DOCUMENT MODAL */}
      {selectedSalaryForManage && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <Landmark className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-sm">Manage Driver Salary & Bank Profile</h3>
                  <p className="text-[10px] font-mono text-slate-500">Driver: {selectedSalaryForManage.driverName} | ID: {selectedSalaryForManage.driverId}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedSalaryForManage(null)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Left Column: Edit Form */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  Edit Bank & Salary configuration
                </h4>
                <form onSubmit={handleSaveSalaryEdit} className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Driver ID</label>
                    <input
                      type="text"
                      disabled
                      value={editSalDriverId}
                      className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 text-slate-500 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Driver Legal Name *</label>
                    <input
                      type="text"
                      required
                      value={editSalDriverName}
                      onChange={(e) => setEditSalDriverName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Bank Account Number *</label>
                    <input
                      type="text"
                      required
                      value={editSalAccountNumber}
                      onChange={(e) => setEditSalAccountNumber(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">IFSC Code *</label>
                      <input
                        type="text"
                        required
                        value={editSalIfscCode}
                        onChange={(e) => setEditSalIfscCode(e.target.value.toUpperCase())}
                        maxLength={11}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Monthly Net Salary (₹) *</label>
                      <input
                        type="number"
                        required
                        value={editSalNetSalary}
                        onChange={(e) => setEditSalNetSalary(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Remarks (Optional)</label>
                    <textarea
                      value={editSalRemarks}
                      onChange={(e) => setEditSalRemarks(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                      rows={2}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2 font-semibold tracking-wide uppercase transition-colors shadow-xs cursor-pointer"
                  >
                    {isSubmitting ? 'Saving changes...' : 'Save Salary Configuration'}
                  </button>
                </form>
              </div>

              {/* Right Column: Bank Copy Upload & List */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                <DocumentAttachment
                  documents={selectedSalaryForManage.documents}
                  onChange={handleUpdateSalaryDocs}
                  label="Driver Bank Verification Files"
                />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
