import React, { useState, useEffect, useRef } from 'react';
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
  VehicleMileage,
  Vendor,
  DriverEmployee,
  VehicleLoan,
  BusinessLoan,
  MarketPodEntry,
  PettyCashAdvance,
  MaintenanceServiceStation,
  BreakdownReport,
  VehicleServiceSchedule,
  TireRecord,
  BatteryRecord,
  ToolsChecklistRecord
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
import VendorManagement from './VendorManagement';
import DriverDetails from './DriverDetails';
import LoanManagement from './LoanManagement';
import kcmLogo from '../assets/images/logo.png';
import Watermark from './Watermark';
import companyTruck from '../assets/images/kcm_vehicle_cutout.png';
import {
  LogOut, ShieldAlert, FileSpreadsheet, Fuel, FileText, Landmark,
  Settings, DollarSign, Contact, Bell, Mail, RefreshCw, CheckCircle, Clock,
  KeyRound, Cpu, Terminal, Copy, Check, Eye, EyeOff, Warehouse, Gauge, X,
  Truck, Building2, HandCoins, Menu
} from 'lucide-react';

// Driver Details module gate - mirrors server.ts's DRIVER_LOCATION_SCOPES
// keys exactly (which locations each person actually sees is filtered
// server-side, this just decides who can open the tab at all).
const DRIVER_ACCESS_EMAILS = [
  'rajeshwar@kcmlogistics.in',
  'nagaraju.linga@kcmlogistics.in',
  'ramesh@kcmlogistics.in',
  'saneel@kcmlogistics.in',
  'vinod@kcmlogistics.in',
  'bhagya@kcmlogistics.in',
  'divya@kcmlogistics.in'
];

// Petty Cash's 3 logins - mirrors server.ts's PETTY_CASH_ACCESS_EMAILS
// exactly. Vinod and Ramesh are already department 'petty_cash'; Saneel is
// department 'maintenance' but also gets Petty Cash access, hence the
// explicit email allowlist rather than relying on department alone.
const PETTY_CASH_ACCESS_EMAILS = ['vinod@kcmlogistics.in', 'ramesh@kcmlogistics.in', 'saneel@kcmlogistics.in'];

// Fuel Management + Mileage Report gate - mirrors server.ts's
// FUEL_ENTRY_USER_EMAILS exactly.
const FUEL_ACCESS_EMAILS = ['chandanreddy@kcmlogistics.in', 'praveenkumar@kcmlogistics.in', 'ramesh@kcmlogistics.in'];

// Divya gets Fuel Management too (RQ-ID-only, see server.ts's
// FUEL_RQ_ID_ONLY_EMAILS), but not Mileage Report - kept separate from
// FUEL_ACCESS_EMAILS above since her access is much narrower.
const FUEL_RQ_ID_ONLY_EMAILS = ['divya@kcmlogistics.in'];

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
  onUpdateFuelLogRqId: (id: string, rqId: string) => Promise<void>;
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
  maintenanceServiceStations: MaintenanceServiceStation[];
  onAddMaintenanceServiceStation: (station: Omit<MaintenanceServiceStation, 'id'>) => Promise<void>;
  onDeleteMaintenanceServiceStation: (id: string) => Promise<void>;
  breakdownReports: BreakdownReport[];
  onAddBreakdownReport: (report: Omit<BreakdownReport, 'id'>) => Promise<void>;
  onUpdateBreakdownReport: (id: string, report: Partial<BreakdownReport>) => Promise<void>;
  onDeleteBreakdownReport: (id: string) => Promise<void>;
  vehicleServiceSchedules: VehicleServiceSchedule[];
  onSaveVehicleServiceSchedule: (schedule: VehicleServiceSchedule) => Promise<void>;
  tireRecords: TireRecord[];
  onSaveTireRecord: (record: TireRecord | Omit<TireRecord, 'id'>) => Promise<void>;
  onDeleteTireRecord: (id: string) => Promise<void>;
  batteryRecords: BatteryRecord[];
  onSaveBatteryRecord: (record: BatteryRecord | Omit<BatteryRecord, 'id'>) => Promise<void>;
  onDeleteBatteryRecord: (id: string) => Promise<void>;
  toolsChecklistRecords: ToolsChecklistRecord[];
  onSaveToolsChecklistRecord: (record: Omit<ToolsChecklistRecord, 'id'>) => Promise<void>;
  onDeleteToolsChecklistRecord: (id: string) => Promise<void>;
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
  // Returns the new report's id - Fuel Entry's Mileage section needs it back
  // to link the fuel log it saves alongside (see FuelLog.mileageReportId).
  onAddMileageReport: (report: Omit<MileageReport, 'id'>) => Promise<string | undefined>;
  onUpdateMileageReport: (id: string, report: Partial<MileageReport>) => Promise<void>;
  onDeleteMileageReport: (id: string) => Promise<void>;
  marketPodEntries: MarketPodEntry[];
  onAddMarketPodEntry: (entry: Omit<MarketPodEntry, 'id'>) => Promise<void>;
  onUpdateMarketPodEntry: (id: string, entry: Partial<MarketPodEntry>) => Promise<void>;
  onDeleteMarketPodEntry: (id: string) => Promise<void>;
  pettyCashAdvances: PettyCashAdvance[];
  onAddPettyCashAdvance: (advance: Omit<PettyCashAdvance, 'id'>) => Promise<void>;
  onDeletePettyCashAdvance: (id: string) => Promise<void>;
  fuelVendors: FuelVendor[];
  onAddFuelVendor: (vendor: Omit<FuelVendor, 'id'>) => Promise<void>;
  onDeleteFuelVendor: (id: string) => Promise<void>;
  vehicleMileages: VehicleMileage[];
  onAddVehicleMileage: (entry: Omit<VehicleMileage, 'id'>) => Promise<void>;
  onUpdateVehicleMileage: (id: string, entry: Partial<VehicleMileage>) => Promise<void>;
  onDeleteVehicleMileage: (id: string) => Promise<void>;
  vendors: Vendor[];
  onAddVendor: (vendor: Omit<Vendor, 'id'>) => Promise<void>;
  onUpdateVendor: (id: string, vendor: Partial<Vendor>) => Promise<void>;
  onDeleteVendor: (id: string) => Promise<void>;
  drivers: DriverEmployee[];
  onAddDriver: (driver: Omit<DriverEmployee, 'id'> & { id: string }) => Promise<void>;
  onUpdateDriver: (id: string, driver: Partial<DriverEmployee>) => Promise<void>;
  onDeleteDriver: (id: string) => Promise<void>;
  vehicleLoans: VehicleLoan[];
  onAddVehicleLoan: (loan: Omit<VehicleLoan, 'id'> & { id: string }) => Promise<void>;
  onUpdateVehicleLoan: (id: string, loan: Partial<VehicleLoan>) => Promise<void>;
  onDeleteVehicleLoan: (id: string) => Promise<void>;
  businessLoans: BusinessLoan[];
  onAddBusinessLoan: (loan: Omit<BusinessLoan, 'id'>) => Promise<void>;
  onUpdateBusinessLoan: (id: string, loan: Partial<BusinessLoan>) => Promise<void>;
  onDeleteBusinessLoan: (id: string) => Promise<void>;
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
  onUpdateFuelLogRqId,
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
  vehicleServiceSchedules,
  onSaveVehicleServiceSchedule,
  tireRecords,
  onSaveTireRecord,
  onDeleteTireRecord,
  batteryRecords,
  onSaveBatteryRecord,
  onDeleteBatteryRecord,
  toolsChecklistRecords,
  onSaveToolsChecklistRecord,
  onDeleteToolsChecklistRecord,
  maintenanceServiceStations,
  onAddMaintenanceServiceStation,
  onDeleteMaintenanceServiceStation,
  breakdownReports,
  onAddBreakdownReport,
  onUpdateBreakdownReport,
  onDeleteBreakdownReport,
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
  marketPodEntries,
  onAddMarketPodEntry,
  onUpdateMarketPodEntry,
  onDeleteMarketPodEntry,
  pettyCashAdvances,
  onAddPettyCashAdvance,
  onDeletePettyCashAdvance,
  fuelVendors,
  onAddFuelVendor,
  onDeleteFuelVendor,
  vehicleMileages,
  onAddVehicleMileage,
  onUpdateVehicleMileage,
  onDeleteVehicleMileage,
  vendors,
  onAddVendor,
  onUpdateVendor,
  onDeleteVendor,
  drivers,
  onAddDriver,
  onUpdateDriver,
  onDeleteDriver,
  vehicleLoans,
  onAddVehicleLoan,
  onUpdateVehicleLoan,
  onDeleteVehicleLoan,
  businessLoans,
  onAddBusinessLoan,
  onUpdateBusinessLoan,
  onDeleteBusinessLoan
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

  // Sidebar collapse/flyout state. isPinned is the persistent "pinned open"
  // choice from the hamburger, saved across sessions. isHovering is the
  // purely transient hover-flyout state (desktop only, only meaningful when
  // not pinned). isMobileOpen is the mobile drawer state, independent of
  // both - mobile has no hover concept and behaves like a pinned drawer.
  const SIDEBAR_PINNED_KEY = 'kcm_sidebar_pinned';
  const [isPinned, setIsPinned] = useState<boolean>(() => localStorage.getItem(SIDEBAR_PINNED_KEY) === 'true');
  const [isHovering, setIsHovering] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const hoverCloseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarExpanded = isPinned || isHovering || isMobileOpen;
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(formatISTClock(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (hoverCloseTimeout.current) clearTimeout(hoverCloseTimeout.current);
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
    // Warehouse Details is super-admin-only for now; may open up to other roles later.
    if ((tabName === 'fuel' || tabName === 'mileage') && FUEL_ACCESS_EMAILS.includes(user.email || '')) return true;
    if (tabName === 'fuel' && FUEL_RQ_ID_ONLY_EMAILS.includes(user.email || '')) return true;
    if (tabName === 'fleet' && (user.department === 'vehicle_manager' || user.email === 'bhagya@kcmlogistics.in' || user.email === 'finance@kcmlogistics.in')) return true;
    if (tabName === 'billing' && (user.department === 'billing' || user.email === 'bhagya@kcmlogistics.in')) return true;
    if (tabName === 'pettycash' && (user.department === 'petty_cash' || PETTY_CASH_ACCESS_EMAILS.includes(user.email || ''))) return true;
    if (tabName === 'maintenance' && user.department === 'maintenance') return true;
    if (tabName === 'accounts' && user.department === 'accounts_finance') return true;
    if (tabName === 'hr' && user.email === 'bhagya@kcmlogistics.in') return true;
    if (tabName === 'vendors' && (user.email === 'divya@kcmlogistics.in' || user.email === 'finance@kcmlogistics.in')) return true;
    // Driver Details is location-scoped (see server.ts: DRIVER_LOCATION_SCOPES)
    // - this just gates the tab/module itself; which drivers each of these
    // people actually sees is filtered server-side.
    if (tabName === 'drivers' && DRIVER_ACCESS_EMAILS.includes(user.email || '')) return true;
    // Loan Management mirrors server.ts's LOAN_ACCESS_EMAILS.
    if (tabName === 'loans' && user.email === 'finance@kcmlogistics.in') return true;
    return false;
  };

  // Hamburger toggles a different thing depending on viewport: on desktop it
  // flips the persistent pinned/expanded state (saved to localStorage); on
  // mobile there's no pinning concept, it just opens/closes the drawer.
  const handleHamburgerClick = () => {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    if (isDesktop) {
      setIsPinned(prev => {
        const next = !prev;
        localStorage.setItem(SIDEBAR_PINNED_KEY, String(next));
        return next;
      });
    } else {
      setIsMobileOpen(prev => !prev);
    }
  };

  // Only the hover-flyout collapses immediately on navigation - the pinned
  // (desktop) and drawer (mobile) states stay open since the user opened
  // them deliberately, not just by passing the cursor over the rail.
  const handleNavClick = (tab: string) => {
    setActiveTab(tab);
    if (!isPinned) setIsHovering(false);
  };

  const handleSidebarMouseEnter = () => {
    if (hoverCloseTimeout.current) {
      clearTimeout(hoverCloseTimeout.current);
      hoverCloseTimeout.current = null;
    }
    setIsHovering(true);
  };

  const handleSidebarMouseLeave = () => {
    // Small delay so a cursor briefly leaving and re-entering the rail
    // doesn't flicker the flyout closed and back open.
    hoverCloseTimeout.current = setTimeout(() => setIsHovering(false), 180);
  };

  const PINK_ACTIVE = 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-l-4 border-pink-500';
  const navItems: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; iconColor: string; active: string; visible: boolean; badge?: number }> = [
    { id: 'admin-overview', label: 'Super Admin Terminal', icon: ShieldAlert, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: user.department === 'super_admin', badge: unreadCount },
    { id: 'fleet', label: 'Fleet & Vehicles', icon: FileSpreadsheet, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('fleet') },
    { id: 'fuel', label: 'Fuel Management', icon: Fuel, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('fuel') },
    { id: 'mileage', label: 'Mileage Report', icon: Gauge, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('mileage') },
    { id: 'vendors', label: 'Vendor Management', icon: Building2, iconColor: 'text-indigo-400', active: 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-indigo-300 border-l-4 border-indigo-500', visible: hasAccess('vendors') },
    { id: 'hr', label: 'HR & Payroll', icon: Contact, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('hr') },
    { id: 'drivers', label: 'Driver Details', icon: Truck, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('drivers') },
    { id: 'loans', label: 'Loan Management', icon: HandCoins, iconColor: 'text-emerald-400', active: PINK_ACTIVE, visible: hasAccess('loans') },
    { id: 'billing', label: 'Customer Billings', icon: FileText, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('billing') },
    { id: 'pettycash', label: 'Petty cash', icon: Landmark, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('pettycash') },
    { id: 'maintenance', label: 'Fleet Maintenance', icon: Settings, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('maintenance') },
    { id: 'accounts', label: 'Accounts and Finance', icon: DollarSign, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('accounts') },
    { id: 'warehouse', label: 'Warehouse Details', icon: Warehouse, iconColor: 'text-pink-400', active: PINK_ACTIVE, visible: hasAccess('warehouse') }
  ];

  return (
    <>
      <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 overflow-hidden relative z-10" id="admin-main-stage">

      {/* Desktop-only layout placeholder - this (not the actual <aside>) is
          what reserves flex space, so hover-expanding the sidebar never
          reflows the main content. Width only reacts to the pinned state. */}
      <div className={`hidden md:block shrink-0 transition-all duration-200 ease-in-out ${isPinned ? 'w-60' : 'w-16'}`} aria-hidden="true" />

      {/* Main Workspace Frame */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 relative" id="admin-workspace-grid">
        
        {/* Same brand watermark as the Login page */}
        <Watermark src={kcmLogo} />

        {/* Sticky Sub-Header Bar */}
        <header className="h-16 bg-white border-b border-pink-100 flex items-center justify-between px-6 shrink-0 shadow-xs" id="admin-global-header">
          <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-600">
            {/* Mobile-only trigger - the sidebar's own hamburger lives inside
                the drawer, which is off-screen until opened, so mobile needs
                a second always-visible entry point to open it. */}
            <button
              onClick={handleHamburgerClick}
              title="Open menu"
              className="md:hidden w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-100 text-purple-700 transition-all cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
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
              userEmail={user.email}
              onUpdateVehicle={onUpdateVehicle}
              onDeleteVehicle={onDeleteVehicle}
              vehicleMileages={vehicleMileages}
              onAddVehicleMileage={onAddVehicleMileage}
              onUpdateVehicleMileage={onUpdateVehicleMileage}
              vehicleLoans={vehicleLoans}
            />
          )}

          {activeTab === 'fuel' && hasAccess('fuel') && (
            <FuelManagement
              user={user}
              logs={fuelLogs}
              onAddLog={onAddFuelLog}
              onUpdateLog={onUpdateFuelLog}
              onUpdateFuelLogRqId={onUpdateFuelLogRqId}
              onDeleteLog={onDeleteFuelLog}
              vehicles={vehicles}
              drivers={drivers}
              mileageReports={mileageReports}
              onAddMileageReport={onAddMileageReport}
              onUpdateMileageReport={onUpdateMileageReport}
              onDeleteMileageReport={onDeleteMileageReport}
              vehicleMileages={vehicleMileages}
              onAddVehicleMileage={onAddVehicleMileage}
              onUpdateVehicleMileage={onUpdateVehicleMileage}
              onDeleteVehicleMileage={onDeleteVehicleMileage}
              vendorProfiles={vendors}
              employees={employees}
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
              user={user}
              vouchers={vouchers}
              onAddVoucher={onAddVoucher}
              onUpdateVoucher={onUpdateVoucher}
              onDeleteVoucher={onDeleteVoucher}
              vehicles={vehicles}
              onUpdateVehicle={onUpdateVehicle}
              drivers={drivers}
              vendors={vendors}
              marketPodEntries={marketPodEntries}
              onAddMarketPodEntry={onAddMarketPodEntry}
              onUpdateMarketPodEntry={onUpdateMarketPodEntry}
              onDeleteMarketPodEntry={onDeleteMarketPodEntry}
              pettyCashAdvances={pettyCashAdvances}
              onAddPettyCashAdvance={onAddPettyCashAdvance}
              onDeletePettyCashAdvance={onDeletePettyCashAdvance}
            />
          )}

          {activeTab === 'maintenance' && hasAccess('maintenance') && (
            <Maintenance
              records={records}
              onAddRecord={onAddMaintenanceRecord}
              onUpdateRecord={onUpdateMaintenanceRecord}
              onDeleteRecord={onDeleteMaintenanceRecord}
              vehicles={vehicles}
              drivers={drivers}
              mileageReports={mileageReports}
              serviceStations={maintenanceServiceStations}
              onAddServiceStation={onAddMaintenanceServiceStation}
              onDeleteServiceStation={onDeleteMaintenanceServiceStation}
              breakdownReports={breakdownReports}
              onAddBreakdownReport={onAddBreakdownReport}
              onUpdateBreakdownReport={onUpdateBreakdownReport}
              onDeleteBreakdownReport={onDeleteBreakdownReport}
              vehicleServiceSchedules={vehicleServiceSchedules}
              onSaveVehicleServiceSchedule={onSaveVehicleServiceSchedule}
              tireRecords={tireRecords}
              onSaveTireRecord={onSaveTireRecord}
              onDeleteTireRecord={onDeleteTireRecord}
              batteryRecords={batteryRecords}
              onSaveBatteryRecord={onSaveBatteryRecord}
              onDeleteBatteryRecord={onDeleteBatteryRecord}
              toolsChecklistRecords={toolsChecklistRecords}
              onSaveToolsChecklistRecord={onSaveToolsChecklistRecord}
              onDeleteToolsChecklistRecord={onDeleteToolsChecklistRecord}
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

          {activeTab === 'drivers' && hasAccess('drivers') && (
            <DriverDetails
              user={user}
              drivers={drivers}
              onAddDriver={onAddDriver}
              onUpdateDriver={onUpdateDriver}
              onDeleteDriver={onDeleteDriver}
            />
          )}

          {activeTab === 'loans' && hasAccess('loans') && (
            <LoanManagement
              vehicles={vehicles}
              vehicleLoans={vehicleLoans}
              onAddVehicleLoan={onAddVehicleLoan}
              onUpdateVehicleLoan={onUpdateVehicleLoan}
              onDeleteVehicleLoan={onDeleteVehicleLoan}
              businessLoans={businessLoans}
              onAddBusinessLoan={onAddBusinessLoan}
              onUpdateBusinessLoan={onUpdateBusinessLoan}
              onDeleteBusinessLoan={onDeleteBusinessLoan}
            />
          )}

          {activeTab === 'vendors' && hasAccess('vendors') && (
            <VendorManagement
              vendors={vendors}
              onAddVendor={onAddVendor}
              onUpdateVendor={onUpdateVendor}
              onDeleteVendor={onDeleteVendor}
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
              onUpdateVehicleMileage={onUpdateVehicleMileage}
              onDeleteVehicleMileage={onDeleteVehicleMileage}
              employees={employees}
              readOnly
            />
          )}

        </div>
      </main>

      {/* Mobile-only backdrop - dims the workspace while the drawer is open,
          tapping it closes the drawer same as the hamburger. */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/50 z-30 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Vibrant Pink & Purple Bento Sidebar - always position:fixed/absolute
          (never in normal flex flow) so its width can change on hover
          without ever reflowing the placeholder/main content next to it. */}
      <aside
        className={`fixed md:absolute top-0 left-0 h-full z-40 flex flex-col bg-gradient-to-b from-purple-950 via-indigo-950 to-pink-950 text-slate-100 border-r border-pink-900/30 transition-all duration-200 ease-in-out ${sidebarExpanded ? 'w-60' : 'w-16'} ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 ${(isMobileOpen || (isHovering && !isPinned)) ? 'shadow-[6px_0_24px_rgba(0,0,0,0.35)]' : ''}`}
        id="admin-sidebar"
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >

        {/* Sidebar Brand Header */}
        <div className={`bg-purple-900/40 text-white border-b border-pink-500/20 flex shrink-0 ${sidebarExpanded ? 'flex-row items-center gap-3 p-4' : 'flex-col items-center gap-2 py-3'}`}>
          <button
            onClick={handleHamburgerClick}
            title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-white/10 text-pink-200 hover:text-white transition-all cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shadow-md shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          {sidebarExpanded && (
            <div className="whitespace-nowrap overflow-hidden">
              <span className="font-extrabold tracking-tight text-sm text-white block leading-tight">KCM Logistics</span>
              <span className="text-[9px] text-pink-300 font-bold uppercase tracking-widest block mt-0.5">Official Portal</span>
            </div>
          )}
        </div>

        {/* Navigation Section */}
        <nav className={`flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden ${sidebarExpanded ? 'p-4' : 'p-2'}`}>
          {sidebarExpanded && (
            <div className="text-pink-300/60 text-[10px] uppercase tracking-widest font-black mb-3 px-2 whitespace-nowrap">Workspace Modules</div>
          )}

          {navItems.filter(item => item.visible).map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={!sidebarExpanded ? item.label : undefined}
                className={`w-full text-xs font-bold py-2.5 flex items-center transition-all rounded-xl cursor-pointer ${sidebarExpanded ? 'text-left px-3 gap-2.5' : 'justify-center px-0'} ${isActive ? item.active : 'text-purple-200 hover:bg-white/5 hover:text-white'}`}
              >
                <span className="relative shrink-0">
                  <Icon className={`w-4 h-4 ${item.iconColor}`} />
                  {!sidebarExpanded && !!item.badge && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-pink-600 text-white font-black text-[8px] min-w-[14px] h-[14px] px-0.5 rounded-full flex items-center justify-center animate-bounce">
                      {item.badge}
                    </span>
                  )}
                </span>
                {sidebarExpanded && <span className="flex-1 truncate whitespace-nowrap">{item.label}</span>}
                {sidebarExpanded && !!item.badge && item.badge > 0 && (
                  <span className="bg-pink-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full animate-bounce shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User profile footer in sidebar */}
        <div className={`border-t border-purple-500/20 bg-purple-950/50 shrink-0 ${sidebarExpanded ? 'p-4' : 'p-2 flex flex-col items-center gap-2'}`}>
          {sidebarExpanded ? (
            <>
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
            </>
          ) : (
            <>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 border border-pink-400/40 flex items-center justify-center text-xs text-white font-black shrink-0 shadow-sm" title={user.name}>
                {user.name.substring(0, 2).toUpperCase()}
              </div>
              <button
                onClick={() => {
                  setIsChangingPassword(true);
                  setPasswordError(null);
                  setPasswordSuccess(null);
                }}
                title="Change Password"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-pink-500/20 text-pink-200 transition-all cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleLogoutClick}
                disabled={isLoggingOut}
                title="Exit"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-pink-600/10 hover:bg-pink-600/20 border border-pink-500/30 text-pink-300 transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-pink-400" />
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
    </>
  );
}
