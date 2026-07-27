import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  User as UserType,
  Vehicle,
  FuelLog,
  BillingInvoice,
  PettyCashVoucher,
  MaintenanceRecord,
  AccountsEntry,
  StaffEmployee,
  DashboardNotification,
  WarehouseEntry,
  MileageReport,
  FuelVendor,
  VehicleMileage
} from '../types';
import FleetSheet from './FleetSheet';
import FuelManagement from './FuelManagement';
import Billing from './Billing';
import PettyCash from './PettyCash';
import Maintenance from './Maintenance';
import Accounts from './Accounts';
import HR from './HR';
import WarehouseDetails from './WarehouseDetails';
import MileageReportModule from './MileageReport';
import kcmLogo from '../assets/images/logo.png';
import Watermark from './Watermark';
import companyTruck from '../assets/images/kcm_vehicle_cutout.png';
import {
  LogOut, ShieldAlert, FileSpreadsheet, Fuel, FileText, Landmark,
  Settings, DollarSign, Contact, Bell, Mail, RefreshCw, CheckCircle, Clock,
  KeyRound, Cpu, Terminal, Copy, Check, Eye, EyeOff, Warehouse, Gauge, X,
  Truck
} from 'lucide-react';

// Displays the live header clock in Indian Standard Time regardless of the
// device/browser's own timezone, so the portal reads consistently for an
// India-based team.
const formatISTClock = (date: Date): string => {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);
  return `${formatted} IST`;
};

interface AdministrationProps {
  user: UserType;
  token: string | null;
  onLogout: () => void;
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  invoices: BillingInvoice[];
  vouchers: PettyCashVoucher[];
  records: MaintenanceRecord[];
  entries: AccountsEntry[];
  employees: StaffEmployee[];
  notifications: DashboardNotification[];
  warehouseEntries: WarehouseEntry[];
  onUpdateVehicle: (vehicle: Vehicle) => Promise<void>;
  onDeleteVehicle: (id: string) => Promise<void>;
  onAddFuelLog: (log: Omit<FuelLog, 'id'>) => Promise<void>;
  onUpdateFuelLog: (id: string, log: Partial<FuelLog>) => Promise<void>;
  onDeleteFuelLog: (id: string) => Promise<void>;
  onAddInvoice: (inv: Omit<BillingInvoice, 'id'>) => Promise<void>;
  onUpdateInvoice: (id: string, inv: Partial<BillingInvoice>) => Promise<void>;
  onDeleteInvoice: (id: string) => Promise<void>;
  onAddVoucher: (voucher: Omit<PettyCashVoucher, 'id'>) => Promise<void>;
  onUpdateVoucher: (id: string, voucher: Partial<PettyCashVoucher>) => Promise<void>;
  onDeleteVoucher: (id: string) => Promise<void>;
  onAddMaintenanceRecord: (record: Omit<MaintenanceRecord, 'id'>) => Promise<void>;
  onUpdateMaintenanceRecord: (id: string, record: Partial<MaintenanceRecord>) => Promise<void>;
  onDeleteMaintenanceRecord: (id: string) => Promise<void>;
  onAddAccountsEntry: (entry: Omit<AccountsEntry, 'id'>) => Promise<void>;
  onUpdateAccountsEntry: (id: string, entry: Partial<AccountsEntry>) => Promise<void>;
  onDeleteAccountsEntry: (id: string) => Promise<void>;
  onAddEmployee: (emp: Omit<StaffEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateEmployee: (id: string, emp: Partial<StaffEmployee>) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
  onResolveNotification: (notifId: string) => Promise<void>;
  onSendComplianceDigestNow: () => Promise<{ success: boolean; sent?: boolean; message?: string; error?: string }>;
  onAddWarehouseEntry: (entry: Omit<WarehouseEntry, 'id'>) => Promise<void>;
  onUpdateWarehouseEntry: (id: string, entry: Partial<WarehouseEntry>) => Promise<void>;
  onDeleteWarehouseEntry: (id: string) => Promise<void>;
  mileageReports: MileageReport[];
  onAddMileageReport: (report: Omit<MileageReport, 'id'>) => Promise<void>;
  onUpdateMileageReport: (id: string, report: Partial<MileageReport>) => Promise<void>;
  onDeleteMileageReport: (id: string) => Promise<void>;
  onClearImportedPettyCash: () => Promise<void>;
  fuelVendors: FuelVendor[];
  onAddFuelVendor: (vendor: Omit<FuelVendor, 'id'>) => Promise<void>;
  onDeleteFuelVendor: (id: string) => Promise<void>;
  vehicleMileages: VehicleMileage[];
  onAddVehicleMileage: (entry: Omit<VehicleMileage, 'id'>) => Promise<void>;
  onDeleteVehicleMileage: (id: string) => Promise<void>;
}

export default function Administration({
  user,
  token,
  onLogout,
  vehicles,
  fuelLogs,
  invoices,
  vouchers,
  records,
  entries,
  employees,
  notifications,
  onUpdateVehicle,
  onDeleteVehicle,
  onAddFuelLog,
  onUpdateFuelLog,
  onDeleteFuelLog,
  onAddInvoice,
  onUpdateInvoice,
  onDeleteInvoice,
  onAddVoucher,
  onUpdateVoucher,
  onDeleteVoucher,
  onAddMaintenanceRecord,
  onUpdateMaintenanceRecord,
  onDeleteMaintenanceRecord,
  onAddAccountsEntry,
  onUpdateAccountsEntry,
  onDeleteAccountsEntry,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onResolveNotification,
  onSendComplianceDigestNow,
  warehouseEntries,
  onAddWarehouseEntry,
  onUpdateWarehouseEntry,
  onDeleteWarehouseEntry,
  mileageReports,
  onAddMileageReport,
  onUpdateMileageReport,
  onDeleteMileageReport,
  onClearImportedPettyCash,
  fuelVendors,
  onAddFuelVendor,
  onDeleteFuelVendor,
  vehicleMileages,
  onAddVehicleMileage,
  onDeleteVehicleMileage
}: AdministrationProps) {
  
  // Tab Management
  const getInitialTab = (): string => {
    switch (user.department) {
      case 'vehicle_manager': return 'fleet';
      case 'fuel_management': return 'fuel';
      case 'billing': return 'billing';
      case 'petty_cash': return 'pettycash';
      case 'maintenance': return 'maintenance';
      case 'accounts_finance': return 'accounts';
      case 'hr': return 'hr';
      case 'super_admin': return 'admin-overview';
      default: return 'unauthorized';
    }
  };

  const [activeTab, setActiveTab] = useState<string>(getInitialTab());
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [time, setTime] = useState(formatISTClock(new Date()));
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [sendDigestMessage, setSendDigestMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Password editing state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassInputs, setShowPassInputs] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Employee-toggled fleet status modal (Fleet Status box "Inactive" count)
  const [showInactiveFleetModal, setShowInactiveFleetModal] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(formatISTClock(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogoutClick = async () => {
    setIsLoggingOut(true);
    try {
      const res = await fetch('/api/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (res.ok) {
        onLogout();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 5) {
      setPasswordError('New password must be at least 5 characters long.');
      return;
    }
    setPasswordError(null);
    setPasswordSuccess(null);
    setIsUpdatingPassword(true);

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPasswordSuccess('Your security password has been changed successfully!');
        setOldPassword('');
        setNewPassword('');
        setTimeout(() => {
          setIsChangingPassword(false);
          setPasswordSuccess(null);
        }, 2200);
      } else {
        setPasswordError(data.error || 'Failed to update password. Verify current password.');
      }
    } catch (err) {
      setPasswordError('Failed to communicate with authentication services.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Safe tab filter based on department constraint
  const hasAccess = (tabName: string): boolean => {
    if (user.department === 'super_admin') return true;
    if (tabName === 'warehouse') return true; // Accessible to all roles for operational logging
    if ((tabName === 'fuel' || tabName === 'mileage') && (user.email === 'chandanreddy@kcmlogistics.in' || user.email === 'praveenkumar@kcmlogistics.in')) return true;
    if (tabName === 'fleet' && (user.department === 'vehicle_manager' || user.email === 'bhagya@kcmlogistics.in')) return true;
    if (tabName === 'billing' && (user.department === 'billing' || user.email === 'bhagya@kcmlogistics.in')) return true;
    if (tabName === 'pettycash' && user.department === 'petty_cash') return true;
    if (tabName === 'maintenance' && user.department === 'maintenance') return true;
    if (tabName === 'accounts' && user.department === 'accounts_finance') return true;
    if (tabName === 'hr' && user.email === 'bhagya@kcmlogistics.in') return true;
    return false;
  };

  return (
    <>
      <Watermark src={kcmLogo} />
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900 overflow-hidden relative z-10" id="admin-main-stage">

      {/* Vibrant Pink & Purple Bento Sidebar */}
      <aside className="w-full md:w-64 bg-gradient-to-b from-purple-950 via-indigo-950 to-pink-950 text-slate-100 flex flex-col border-r border-pink-900/30 shrink-0" id="admin-sidebar">
        
        {/* Sidebar Brand Header */}
        <div className="p-4 bg-purple-900/40 text-white flex items-center gap-3 border-b border-pink-500/20">
          <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shadow-md shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold tracking-tight text-sm text-white block leading-tight">KCM Logistics</span>
            <span className="text-[9px] text-pink-300 font-bold uppercase tracking-widest block mt-0.5">Official Portal</span>
          </div>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <div className="text-pink-300/60 text-[10px] uppercase tracking-widest font-black mb-3 px-2">Workspace Modules</div>
          
          {/* Super Admin Dashboard tab */}
          {user.department === 'super_admin' && (
            <button
              onClick={() => setActiveTab('admin-overview')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center justify-between transition-all rounded-xl cursor-pointer ${
                activeTab === 'admin-overview' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 text-pink-400" />
                Super Admin Terminal
              </span>
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="bg-pink-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full animate-bounce">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>
          )}

          {/* Department tabs with access control checks */}
          {hasAccess('fleet') && (
            <button
              onClick={() => setActiveTab('fleet')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center gap-2.5 transition-all rounded-xl cursor-pointer ${
                activeTab === 'fleet' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0 text-pink-400" />
              Fleet & Vehicles
            </button>
          )}

          {hasAccess('fuel') && (
            <button
              onClick={() => setActiveTab('fuel')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center gap-2.5 transition-all rounded-xl cursor-pointer ${
                activeTab === 'fuel' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Fuel className="w-4 h-4 shrink-0 text-pink-400" />
              Fuel Management
            </button>
          )}

          {hasAccess('billing') && (
            <button
              onClick={() => setActiveTab('billing')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center gap-2.5 transition-all rounded-xl cursor-pointer ${
                activeTab === 'billing' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0 text-pink-400" />
              Customer Billings
            </button>
          )}

          {hasAccess('pettycash') && (
            <button
              onClick={() => setActiveTab('pettycash')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center gap-2.5 transition-all rounded-xl cursor-pointer ${
                activeTab === 'pettycash' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Landmark className="w-4 h-4 shrink-0 text-pink-400" />
              Petty cash
            </button>
          )}

          {hasAccess('maintenance') && (
            <button
              onClick={() => setActiveTab('maintenance')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center gap-2.5 transition-all rounded-xl cursor-pointer ${
                activeTab === 'maintenance' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0 text-pink-400" />
              Fleet Maintenance
            </button>
          )}

          {hasAccess('accounts') && (
            <button
              onClick={() => setActiveTab('accounts')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center gap-2.5 transition-all rounded-xl cursor-pointer ${
                activeTab === 'accounts' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <DollarSign className="w-4 h-4 shrink-0 text-pink-400" />
              Accounts and Finance
            </button>
          )}

          {hasAccess('hr') && (
            <button
              onClick={() => setActiveTab('hr')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center gap-2.5 transition-all rounded-xl cursor-pointer ${
                activeTab === 'hr' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Contact className="w-4 h-4 shrink-0 text-pink-400" />
              HR & Payroll
            </button>
          )}

          {hasAccess('warehouse') && (
            <button
              onClick={() => setActiveTab('warehouse')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center gap-2.5 transition-all rounded-xl cursor-pointer ${
                activeTab === 'warehouse' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Warehouse className="w-4 h-4 shrink-0 text-pink-400" />
              Warehouse Details
            </button>
          )}

          {hasAccess('mileage') && (
            <button
              onClick={() => setActiveTab('mileage')}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 flex items-center gap-2.5 transition-all rounded-xl cursor-pointer ${
                activeTab === 'mileage' 
                  ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500' 
                  : 'text-purple-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Gauge className="w-4 h-4 shrink-0 text-pink-400" />
              Mileage Report
            </button>
          )}

        </nav>



        {/* User profile footer in sidebar */}
        <div className="p-4 border-t border-purple-500/20 bg-purple-950/50">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 border border-pink-400/40 flex items-center justify-center text-xs text-white font-black shrink-0 shadow-sm">
              {user.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{user.name}</p>
              <p className="text-[9.5px] text-pink-300 capitalize truncate font-semibold">{user.departmentLabel || user.department.replace('_', ' ')}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setIsChangingPassword(true);
                setPasswordError(null);
                setPasswordSuccess(null);
              }}
              className="bg-white/5 hover:bg-white/10 text-[10px] font-bold text-pink-200 py-1.5 px-2 rounded-lg border border-pink-500/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <KeyRound className="w-3 h-3" />
              Password
            </button>
            <button
              onClick={handleLogoutClick}
              disabled={isLoggingOut}
              className="bg-pink-600/10 hover:bg-pink-600/20 text-[10px] font-bold text-pink-300 py-1.5 px-2 rounded-lg border border-pink-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3 h-3 text-pink-400" />
              Exit
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 relative" id="admin-workspace-grid">
        
        {/* Permanent light green logo watermark */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden opacity-[0.03] select-none z-0">
          <svg viewBox="0 0 500 500" className="w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] md:w-[500px] md:h-[500px] text-emerald-600 fill-current">
            <path d="M 50,250 C 60,150 180,70 340,60 C 370,58 410,48 440,30 C 420,70 390,110 330,120 C 270,130 180,150 120,220 C 100,240 80,250 50,250 Z" />
            <path d="M 450,250 C 440,350 320,430 160,440 C 130,442 90,452 60,470 C 80,430 110,390 170,380 C 230,370 320,350 380,280 C 400,260 420,250 450,250 Z" />
            <circle cx="250" cy="250" r="100" stroke="currentColor" strokeWidth="8" fill="none" />
            <line x1="150" y1="250" x2="350" y2="250" stroke="currentColor" strokeWidth="6" />
            <path d="M 170,200 Q 250,220 330,200" stroke="currentColor" strokeWidth="6" fill="none" />
            <path d="M 170,300 Q 250,280 330,300" stroke="currentColor" strokeWidth="6" fill="none" />
            <path d="M 195,170 Q 250,185 305,170" stroke="currentColor" strokeWidth="6" fill="none" />
            <path d="M 195,330 Q 250,315 305,330" stroke="currentColor" strokeWidth="6" fill="none" />
            <line x1="250" y1="150" x2="250" y2="350" stroke="currentColor" strokeWidth="6" />
            <path d="M 250,150 Q 200,250 250,350" stroke="currentColor" strokeWidth="6" fill="none" />
            <path d="M 250,150 Q 300,250 250,350" stroke="currentColor" strokeWidth="6" fill="none" />
            <path d="M 250,150 Q 170,250 250,350" stroke="currentColor" strokeWidth="6" fill="none" />
            <path d="M 250,150 Q 330,250 250,350" stroke="currentColor" strokeWidth="6" fill="none" />
          </svg>
        </div>
        
        {/* Sticky Sub-Header Bar */}
        <header className="h-16 bg-white border-b border-pink-100 flex items-center justify-between px-6 shrink-0 shadow-xs" id="admin-global-header">
          <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-600">
            <span className="capitalize text-purple-800 font-extrabold">{activeTab.replace('-', ' ').replace('pettycash', 'petty cash')}</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-black">KCM Enterprise Dashboard</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Active alerts count in visual badge */}
            {notifications.filter(n => !n.read).length > 0 && (
              <div className="relative flex items-center gap-2 bg-pink-50 border border-pink-100 text-pink-700 px-3 py-1.5 rounded-full text-[11px] font-bold animate-pulse">
                <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                <span>Compliance alerts: {notifications.filter(n => !n.read).length}</span>
              </div>
            )}
            <span className="text-xs text-purple-700 font-bold font-mono bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-xl hidden md:inline-block">
              {time}
            </span>
          </div>
        </header>

        {/* Scrollable Workspace Panel */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">

          {/* Change Password Modal Overlay */}
          {isChangingPassword && (
            <div className="fixed inset-0 bg-purple-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl border border-pink-100 max-w-sm w-full p-6 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-pink-500 to-purple-600" />
                <h3 className="text-base font-black text-slate-800 mb-2 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-pink-600" />
                  Change Account Password
                </h3>
                <p className="text-xs text-slate-500 leading-normal mb-4">
                  Define a new secure system access password. This password is saved immediately in KCM databases.
                </p>

                {passwordError && (
                  <div className="mb-4 p-2.5 bg-pink-50 border-l-4 border-pink-500 text-pink-800 rounded-r text-[11px] font-semibold">
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="mb-4 p-2.5 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 rounded-r text-[11px] font-semibold">
                    {passwordSuccess}
                  </div>
                )}

                <form onSubmit={handlePasswordChangeSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-700 mb-1">
                      Current Password (Optional/Override)
                    </label>
                    <input
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-700 mb-1">
                      New Security Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 5 characters"
                      className="w-full bg-slate-50 border border-purple-100 rounded-lg p-2 text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => setIsChangingPassword(false)}
                      className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingPassword}
                      className="bg-gradient-to-r from-pink-600 to-purple-700 text-white font-bold px-4 py-2 rounded-lg text-xs hover:shadow-md cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingPassword ? 'Updating...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

          {/* Inactive Vehicles List Modal (employee-toggled status from Fleet & Vehicles) */}
          {showInactiveFleetModal && (
            <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl border border-pink-100 max-w-lg w-full p-6 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-pink-500 to-purple-600" />
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-pink-600" />
                      Inactive Vehicles
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      Vehicles marked Inactive in the Fleet &amp; Vehicles module.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowInactiveFleetModal(false)}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="max-h-[350px] overflow-y-auto pr-1 space-y-2">
                  {(() => {
                    const inactiveVehicles = (vehicles || []).filter(v => v.active === false);

                    if (inactiveVehicles.length === 0) {
                      return (
                        <p className="text-xs text-center py-10 text-slate-400 font-mono">
                          🎉 ALL REGISTERED VEHICLES ARE ACTIVE!
                        </p>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {inactiveVehicles.map((v, idx) => {
                          const reg = v.regNo || v["Reg. No."] || 'Unknown';
                          const model = v.model || v["Model"] || '-';
                          const type = v.type || v.Type || '-';
                          return (
                            <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col justify-between hover:bg-slate-100 transition-colors">
                              <span className="font-mono font-black text-slate-950 text-xs tracking-wider">{reg}</span>
                              <span className="text-[9px] text-slate-400 font-bold uppercase truncate">{model} &middot; {type}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-end pt-4 border-t border-slate-100 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowInactiveFleetModal(false)}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs uppercase cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Super Admin Tab Overview */}
          {activeTab === 'admin-overview' && user.department === 'super_admin' && (
            <div className="space-y-6" id="super-admin-desk-board">
              {/* Corporate Fleet Showcase Banner */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-950 rounded-2xl border border-slate-800 p-6 flex flex-col md:flex-row items-center gap-6 shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 bg-radial-[circle_at_center,rgba(16,185,129,0.08)_0%,transparent_75%] pointer-events-none" />
                <div className="flex-1 space-y-2 z-10 text-center md:text-left">
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Official KCM Fleet Vehicle
                  </span>
                  <h2 className="text-xl font-black text-white tracking-tight uppercase">
                    KCM Supply Chain Solution
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                    Empowering regional logistics across India with our custom-built, reliable freight transit division. Real-time mileage, maintenance auditing, and route dispatch.
                  </p>
                </div>
                <div className="w-full md:w-80 h-40 bg-black/60 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-2 shrink-0 z-10">
                  <img
                    src={companyTruck}
                    alt="KCM Company Truck"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              {/* Dynamic Operational Day Selector & Subsystem KPIs */}
              {(() => {
                const normalizeVehicleCategory = (cat?: string) => {
                  const c = String(cat || '').toLowerCase().trim();
                  if (c === 'normal' || c === 'dry') return 'dry';
                  if (c === 'walkee') return 'walkes';
                  return c;
                };
                const categoryCounts: Record<string, number> = { dry: 0, hybrid: 0, walkes: 0, reefer: 0 };
                (vehicles || []).forEach(v => {
                  const cat = normalizeVehicleCategory(v.Category || v.category);
                  if (cat in categoryCounts) categoryCounts[cat]++;
                });

                const unresolvedNotifications = notifications.filter(n => !n.read);

                // Employee-toggled Active/Inactive status from the Fleet & Vehicles module
                // (separate from the mileage-based "ran today" concept above). Missing/undefined
                // status is treated as Active, so all vehicles show Active by default.
                const statusActiveVehicles = (vehicles || []).filter(v => v.active !== false);
                const statusInactiveVehicles = (vehicles || []).filter(v => v.active === false);

                return (
                  <div className="space-y-4">
                    {/* Subsystem KPIs */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-sans">
                      <div className="bg-white p-4 rounded-xl border border-pink-100 shadow-sm">
                        <p className="font-bold text-purple-400 uppercase tracking-wider text-[10px]">Fleet Size</p>
                        <h3 className="text-xl font-black text-slate-800 mt-1">{vehicles.length} Vehicles</h3>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-pink-100 shadow-sm">
                        <p className="font-bold text-purple-400 uppercase tracking-wider text-[10px]">Fleet Status</p>
                        <h3 className="text-xl font-black text-emerald-600 mt-1">
                          {statusActiveVehicles.length} Active
                          {statusInactiveVehicles.length > 0 && (
                            <span
                              onClick={() => setShowInactiveFleetModal(true)}
                              className="text-rose-600 cursor-pointer hover:underline"
                              title="Click to view inactive vehicle details"
                            > / {statusInactiveVehicles.length} Inactive</span>
                          )}
                        </h3>
                        <p className="text-[9px] text-slate-400 mt-1">as marked in Fleet & Vehicles</p>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-pink-100 shadow-sm bg-pink-50/10">
                        <p className="font-bold text-pink-500 uppercase tracking-wider text-[10px]">Unresolved Alerts</p>
                        <h3 className="text-xl font-black text-pink-700 mt-1">{unresolvedNotifications.length} Unresolved</h3>
                      </div>

                      <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm">
                        <p className="font-bold text-amber-700 uppercase tracking-wider text-[10px]">Dry</p>
                        <h3 className="text-xl font-black text-amber-800 mt-1">{categoryCounts.dry} Vehicles</h3>
                      </div>

                      <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-sm">
                        <p className="font-bold text-emerald-700 uppercase tracking-wider text-[10px]">Hybrid</p>
                        <h3 className="text-xl font-black text-emerald-800 mt-1">{categoryCounts.hybrid} Vehicles</h3>
                      </div>

                      <div className="bg-fuchsia-50 p-4 rounded-xl border border-fuchsia-200 shadow-sm">
                        <p className="font-bold text-fuchsia-700 uppercase tracking-wider text-[10px]">Walkes</p>
                        <h3 className="text-xl font-black text-fuchsia-800 mt-1">{categoryCounts.walkes} Vehicles</h3>
                      </div>

                      <div className="bg-cyan-50 p-4 rounded-xl border border-cyan-200 shadow-sm">
                        <p className="font-bold text-cyan-700 uppercase tracking-wider text-[10px]">Reefer</p>
                        <h3 className="text-xl font-black text-cyan-800 mt-1">{categoryCounts.reefer} Vehicles</h3>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Active Compliance Warnings & Security Alerts */}
              <div className="grid grid-cols-1 gap-6">

                {/* Real-time Notifications: Abnormal Logins & Insurance */}
                <div className="bg-white rounded-2xl shadow-sm border border-pink-100 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h2 className="text-xs font-black text-purple-900 uppercase tracking-wider flex items-center gap-2">
                      <Bell className="w-4 h-4 text-pink-600 animate-bounce" />
                      Live Security & Compliance Notifications
                    </h2>

                    <button
                      onClick={async () => {
                        setIsSendingDigest(true);
                        setSendDigestMessage(null);
                        const result = await onSendComplianceDigestNow();
                        setSendDigestMessage({
                          text: result.message || result.error || 'Something went wrong.',
                          error: !result.success
                        });
                        setIsSendingDigest(false);
                      }}
                      disabled={isSendingDigest}
                      className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-[11px] text-white font-bold py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-pink-500/10 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {isSendingDigest ? 'Sending...' : 'Send Alerts Now'}
                    </button>
                  </div>

                  {sendDigestMessage && (
                    <p className={`text-[11px] font-semibold ${sendDigestMessage.error ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {sendDigestMessage.text}
                    </p>
                  )}

                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {notifications.filter(n => !n.read).length === 0 ? (
                      <div className="text-center py-10 text-slate-400 font-mono text-xs">
                        ✅ NO PENDING SECURITY OR COMPLIANCE VIOLATIONS DISCOVERED.
                      </div>
                    ) : (
                      notifications.filter(n => !n.read).map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-all hover:bg-slate-50/50 ${
                            notif.type === 'security'
                              ? 'bg-pink-50/40 border-pink-200'
                              : 'bg-purple-50/40 border-purple-200'
                          }`}
                        >
                          <div className="space-y-1">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${
                              notif.type === 'security' ? 'bg-pink-100 text-pink-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {notif.type === 'security' ? '🚨 Security Violation' : '📅 Compliance Alert'}
                            </span>
                            <p className="font-bold text-slate-800 leading-snug">{notif.message}</p>
                            <p className="text-[10px] text-slate-400 font-mono font-medium">{notif.timestamp}</p>
                          </div>

                          <button
                            onClick={() => onResolveNotification(notif.id)}
                            className="bg-slate-950 hover:bg-slate-800 text-white font-extrabold px-3 py-1.5 rounded-lg text-[9px] uppercase cursor-pointer transition-colors shrink-0"
                          >
                            Resolve
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* Departmental Main Content Views */}
          {activeTab === 'fleet' && hasAccess('fleet') && (
            <FleetSheet 
              vehicles={vehicles} 
              userRole={user.department} 
              onUpdateVehicle={onUpdateVehicle} 
              onDeleteVehicle={onDeleteVehicle}
            />
          )}

          {activeTab === 'fuel' && hasAccess('fuel') && (
            <FuelManagement
              user={user}
              logs={fuelLogs}
              onAddLog={onAddFuelLog}
              onUpdateLog={onUpdateFuelLog}
              onDeleteLog={onDeleteFuelLog}
              vehicles={vehicles}
              vendors={fuelVendors}
              onAddVendor={onAddFuelVendor}
              onDeleteVendor={onDeleteFuelVendor}
              mileageReports={mileageReports}
              onAddMileageReport={onAddMileageReport}
              onUpdateMileageReport={onUpdateMileageReport}
              onDeleteMileageReport={onDeleteMileageReport}
              vehicleMileages={vehicleMileages}
              onAddVehicleMileage={onAddVehicleMileage}
              onDeleteVehicleMileage={onDeleteVehicleMileage}
            />
          )}

          {activeTab === 'billing' && hasAccess('billing') && (
            <Billing 
              invoices={invoices} 
              onAddInvoice={onAddInvoice} 
              onUpdateInvoice={onUpdateInvoice}
              onDeleteInvoice={onDeleteInvoice}
            />
          )}

          {activeTab === 'pettycash' && hasAccess('pettycash') && (
            <PettyCash 
              vouchers={vouchers} 
              onAddVoucher={onAddVoucher} 
              onUpdateVoucher={onUpdateVoucher} 
              onDeleteVoucher={onDeleteVoucher} 
              onClearImportedPettyCash={onClearImportedPettyCash}
            />
          )}

          {activeTab === 'maintenance' && hasAccess('maintenance') && (
            <Maintenance 
              records={records} 
              onAddRecord={onAddMaintenanceRecord} 
              onUpdateRecord={onUpdateMaintenanceRecord}
              onDeleteRecord={onDeleteMaintenanceRecord}
            />
          )}

          {activeTab === 'accounts' && hasAccess('accounts') && (
            <Accounts 
              entries={entries} 
              onAddEntry={onAddAccountsEntry} 
              onUpdateEntry={onUpdateAccountsEntry}
              onDeleteEntry={onDeleteAccountsEntry}
            />
          )}

          {activeTab === 'hr' && hasAccess('hr') && (
            <HR
              user={user}
              employees={employees}
              onAddEmployee={onAddEmployee}
              onUpdateEmployee={onUpdateEmployee}
              onDeleteEmployee={onDeleteEmployee}
            />
          )}

          {activeTab === 'warehouse' && hasAccess('warehouse') && (
            <WarehouseDetails
              user={user}
              entries={warehouseEntries}
              vehicles={vehicles}
              onAddEntry={onAddWarehouseEntry}
              onUpdateEntry={onUpdateWarehouseEntry}
              onDeleteEntry={onDeleteWarehouseEntry}
            />
          )}

          {activeTab === 'mileage' && hasAccess('mileage') && (
            <MileageReportModule
              user={user}
              reports={mileageReports}
              vehicles={vehicles}
              onAddReport={onAddMileageReport}
              onUpdateReport={onUpdateMileageReport}
              onDeleteReport={onDeleteMileageReport}
              vehicleMileages={vehicleMileages}
              onAddVehicleMileage={onAddVehicleMileage}
              onDeleteVehicleMileage={onDeleteVehicleMileage}
              readOnly
            />
          )}

        </div>
      </main>
    </div>
    </>
  );
}
