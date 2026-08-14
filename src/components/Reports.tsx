import React, { useState, useEffect, useRef } from 'react';
import {
  User, Vehicle, FuelLog, MileageReport, Vendor, DriverEmployee, VehicleLoan, BusinessLoan,
  BillingInvoice, PettyCashVoucher, PettyCashAdvance, MarketPodEntry, MaintenanceRecord,
  BreakdownReport, AccountsEntry, StaffEmployee, WarehouseEntry
} from '../types';
import { authFetch } from '../authFetch';
import {
  BarChart3, Lock, ShieldAlert, Loader2, X, Eye, FileSpreadsheet, FileText, Share2,
  Fuel, Gauge, Building2, Contact, Truck, HandCoins, Landmark, Settings, DollarSign, Warehouse
} from 'lucide-react';
import DateInput from './DateInput';
import { ReportPeriod, ReportRange, getReportRange, isDateInRange, isMonthInRange } from '../utils/reportDateRange';
import { ReportTableSection, exportReportToExcel, exportReportToPdf, buildExcelFile, buildPdfFile, shareOrDownloadFile } from '../utils/reportExport';

interface ReportsProps {
  user: User;
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  mileageReports: MileageReport[];
  vendors: Vendor[];
  drivers: DriverEmployee[];
  vehicleLoans: VehicleLoan[];
  businessLoans: BusinessLoan[];
  invoices: BillingInvoice[];
  vouchers: PettyCashVoucher[];
  pettyCashAdvances: PettyCashAdvance[];
  marketPodEntries: MarketPodEntry[];
  records: MaintenanceRecord[];
  breakdownReports: BreakdownReport[];
  entries: AccountsEntry[];
  employees: StaffEmployee[];
  warehouseEntries: WarehouseEntry[];
}

type ModuleKey =
  | 'pettycash' | 'maintenance' | 'fuel' | 'mileage' | 'fleet' | 'vendors'
  | 'drivers' | 'loans' | 'billing' | 'accounts' | 'warehouse' | 'hr';

interface ModuleMeta {
  key: ModuleKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // Fleet & Vehicles / Vendor Management / Loan Management are master/status
  // registries, not dated event logs - they're shown as a current snapshot
  // with no date-range filter, same as their source modules work today.
  dateFiltered: boolean;
  note?: string;
}

// Same icon each module already uses on its own Administration.tsx nav tab,
// so a card here is instantly recognizable.
const MODULES: ModuleMeta[] = [
  { key: 'fleet', label: 'Fleet & Vehicles', icon: FileSpreadsheet, dateFiltered: false, note: 'Current fleet snapshot - not a dated log, so no date range applies.' },
  { key: 'fuel', label: 'Fuel Management', icon: Fuel, dateFiltered: true },
  { key: 'mileage', label: 'Mileage Report', icon: Gauge, dateFiltered: true },
  { key: 'vendors', label: 'Vendor Management', icon: Building2, dateFiltered: false, note: 'Current vendor registry snapshot - not a dated log, so no date range applies.' },
  { key: 'hr', label: 'HR & Payroll', icon: Contact, dateFiltered: true, note: 'Payroll figures (gross/deductions/net) are the same computation HR & Payroll itself uses - cross-check there for exact payslips.' },
  { key: 'drivers', label: 'Driver Details', icon: Truck, dateFiltered: true, note: "Driver Details stores only each driver's most recently-entered salary month, not a full month-by-month history - this shows whichever drivers' recorded month falls in the selected range." },
  { key: 'loans', label: 'Loan Management', icon: HandCoins, dateFiltered: false, note: 'Current loan status snapshot - not a dated log, so no date range applies.' },
  { key: 'billing', label: 'Customer Billings', icon: FileText, dateFiltered: true },
  { key: 'pettycash', label: 'Petty Cash', icon: Landmark, dateFiltered: true },
  { key: 'maintenance', label: 'Fleet Maintenance', icon: Settings, dateFiltered: true },
  { key: 'accounts', label: 'Accounts and Finance', icon: DollarSign, dateFiltered: true },
  { key: 'warehouse', label: 'Warehouse Details', icon: Warehouse, dateFiltered: true }
];

// Literal Tailwind class names per module (not synthesized from a variable -
// Tailwind's build-time scanner needs to see the exact class strings
// somewhere in source, a `border-${color}-200` template would silently
// produce no CSS at all).
const MODULE_THEMES: Record<ModuleKey, { border: string; bg: string; text: string; iconBg: string; btn: string }> = {
  fleet: { border: 'border-pink-200', bg: 'bg-pink-50', text: 'text-pink-700', iconBg: 'bg-pink-100', btn: 'bg-pink-600 hover:bg-pink-700' },
  fuel: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', iconBg: 'bg-amber-100', btn: 'bg-amber-600 hover:bg-amber-700' },
  mileage: { border: 'border-cyan-200', bg: 'bg-cyan-50', text: 'text-cyan-700', iconBg: 'bg-cyan-100', btn: 'bg-cyan-600 hover:bg-cyan-700' },
  vendors: { border: 'border-indigo-200', bg: 'bg-indigo-50', text: 'text-indigo-700', iconBg: 'bg-indigo-100', btn: 'bg-indigo-600 hover:bg-indigo-700' },
  hr: { border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700', iconBg: 'bg-purple-100', btn: 'bg-purple-600 hover:bg-purple-700' },
  drivers: { border: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-700', iconBg: 'bg-sky-100', btn: 'bg-sky-600 hover:bg-sky-700' },
  loans: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', iconBg: 'bg-emerald-100', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  billing: { border: 'border-fuchsia-200', bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', iconBg: 'bg-fuchsia-100', btn: 'bg-fuchsia-600 hover:bg-fuchsia-700' },
  pettycash: { border: 'border-teal-200', bg: 'bg-teal-50', text: 'text-teal-700', iconBg: 'bg-teal-100', btn: 'bg-teal-600 hover:bg-teal-700' },
  maintenance: { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', iconBg: 'bg-blue-100', btn: 'bg-blue-600 hover:bg-blue-700' },
  accounts: { border: 'border-green-200', bg: 'bg-green-50', text: 'text-green-700', iconBg: 'bg-green-100', btn: 'bg-green-600 hover:bg-green-700' },
  warehouse: { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-700', iconBg: 'bg-orange-100', btn: 'bg-orange-600 hover:bg-orange-700' }
};

const PETTY_CASH_USERS = [
  { username: 'vinoda', label: 'Vinod' },
  { username: 'ramesh', label: 'Ramesh' },
  { username: 'saneel', label: 'Saneel' }
];

interface ModuleReport {
  summary: { label: string; value: string }[];
  sections: ReportTableSection[];
}

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function buildReport(
  moduleKey: ModuleKey,
  props: ReportsProps,
  range: ReportRange,
  hrExtra: { staffAttendance: any[]; staffPayroll: any[] }
): ModuleReport {
  switch (moduleKey) {
    case 'pettycash': {
      const vouchersInRange = props.vouchers.filter(v => isDateInRange(v.date, range));
      const advancesInRange = props.pettyCashAdvances.filter(a => isDateInRange(a.date, range));
      const cashPodInRange = props.marketPodEntries.filter(e => e.paymentMode === 'Cash' && isDateInRange(e.date, range));
      const totalCashPaid = vouchersInRange.reduce((s, v) => s + (v.cashPaid || 0), 0);
      const totalReceived = advancesInRange.reduce((s, a) => s + (a.amount || 0), 0);
      const totalPodFreight = cashPodInRange.reduce((s, e) => s + (e.totalFreight || 0), 0);
      const perUser = PETTY_CASH_USERS.map(u => ({
        label: u.label,
        cashPaid: vouchersInRange.filter(v => v.enteredBy === u.username).reduce((s, v) => s + (v.cashPaid || 0), 0)
      }));
      return {
        summary: [
          { label: 'Total Cash Paid', value: money(totalCashPaid) },
          { label: 'Total Amount Received', value: money(totalReceived) },
          { label: 'Net', value: money(totalReceived - totalCashPaid) },
          { label: 'Market Trip Cash Freight', value: money(totalPodFreight) },
          ...perUser.map(u => ({ label: `${u.label} - Cash Paid`, value: money(u.cashPaid) }))
        ],
        sections: [
          {
            heading: 'Petty Cash Vouchers', columns: ['Date', 'Entry No', 'Category', 'Vehicle', 'Receiver', 'Cash Paid', 'Entered By'],
            rows: vouchersInRange.map(v => [v.date, v.entryNo, v.category, v.vehicleNumber || '-', v.receiver, v.cashPaid || 0, v.enteredBy || '-'])
          },
          {
            heading: 'Amount Received (Advances)', columns: ['Date', 'Username', 'Amount', 'Remarks'],
            rows: advancesInRange.map(a => [a.date, a.username, a.amount || 0, a.remarks || '-'])
          },
          {
            heading: 'Market Trip - Cash Mode', columns: ['Date', 'Vehicle', 'Freight', 'Advance', 'Balance'],
            rows: cashPodInRange.map(e => [e.date, e.vehicleNumber, e.totalFreight || 0, e.receivedAdvance || 0, e.balance || 0])
          }
        ]
      };
    }

    case 'maintenance': {
      const recordsInRange = props.records.filter(r => isDateInRange(r.date, range));
      const breakdownsInRange = props.breakdownReports.filter(b => isDateInRange(b.date, range));
      const totalServiceCost = recordsInRange.reduce((s, r) => s + (r.cost || 0), 0);
      const totalBreakdownCost = breakdownsInRange.reduce((s, b) => s + (b.amount || 0), 0);
      const byType: Record<string, number> = {};
      recordsInRange.forEach(r => { byType[r.serviceType] = (byType[r.serviceType] || 0) + (r.cost || 0); });
      return {
        summary: [
          { label: 'Total Service Cost', value: money(totalServiceCost) },
          { label: 'Service Visits', value: String(recordsInRange.length) },
          { label: 'Total Breakdown/Workshop Cost', value: money(totalBreakdownCost) },
          { label: 'Open Breakdowns (all-time)', value: String(props.breakdownReports.filter(b => b.status === 'Open').length) }
        ],
        sections: [
          {
            heading: 'Service History', columns: ['Date', 'Reg No', 'Type', 'Station', 'Cost', 'Driver'],
            rows: recordsInRange.map(r => [r.date, r.regNo, r.serviceType, r.garageName || '-', r.cost || 0, r.driverName || '-'])
          },
          {
            heading: 'Breakdown / Workshop / Electrical', columns: ['Date', 'Reg No', 'Type', 'Amount', 'Payment Type', 'Status'],
            rows: breakdownsInRange.map(b => [b.date, b.regNo, b.type || '-', b.amount || 0, b.paymentType || '-', b.status])
          },
          {
            heading: 'Cost By Category', columns: ['Category', 'Total Cost'],
            rows: Object.entries(byType).map(([k, v]) => [k, v])
          }
        ]
      };
    }

    case 'fuel': {
      const logsInRange = props.fuelLogs.filter(f => isDateInRange(f.date, range));
      const totalAmount = logsInRange.reduce((s, f) => s + (f.amount || 0), 0);
      const totalLtrs = logsInRange.reduce((s, f) => s + (f.ltrs || 0), 0);
      return {
        summary: [
          { label: 'Total Fuel Amount', value: money(totalAmount) },
          { label: 'Total Litres', value: totalLtrs.toLocaleString('en-IN') },
          { label: 'Entries', value: String(logsInRange.length) },
          { label: 'Avg Rate/Litre', value: totalLtrs ? `₹${(totalAmount / totalLtrs).toFixed(2)}` : '-' }
        ],
        sections: [
          {
            heading: 'Fuel Entries', columns: ['Date', 'Vehicle', 'Bunk', 'Litres', 'Rate', 'Amount', 'Client', 'Type'],
            rows: logsInRange.map(f => [f.date, f.vehicleNumber, f.bunkName || '-', f.ltrs || 0, f.rate || 0, f.amount || 0, f.client, f.type])
          }
        ]
      };
    }

    case 'mileage': {
      const reportsInRange = props.mileageReports.filter(m => isDateInRange(m.date, range));
      const totalKm = reportsInRange.reduce((s, m) => s + (m.totalKm || 0), 0);
      const totalLtrs = reportsInRange.reduce((s, m) => s + (m.litres || 0), 0);
      return {
        summary: [
          { label: 'Total KM Covered', value: totalKm.toLocaleString('en-IN') },
          { label: 'Total Litres', value: totalLtrs.toLocaleString('en-IN') },
          { label: 'Overall Mileage', value: totalLtrs ? `${(totalKm / totalLtrs).toFixed(2)} km/l` : '-' },
          { label: 'Entries', value: String(reportsInRange.length) }
        ],
        sections: [
          {
            heading: 'Mileage Entries', columns: ['Date', 'Vehicle', 'Opening Km', 'Closing Km', 'Total Km', 'Litres', 'Mileage'],
            rows: reportsInRange.map(m => [m.date, m.vehicleNo, m.openingKm || 0, m.closingKm || 0, m.totalKm || 0, m.litres || 0, m.mileage || 0])
          }
        ]
      };
    }

    case 'fleet': {
      const vehicles = props.vehicles;
      const active = vehicles.filter(v => v.active !== false).length;
      const byOwnership: Record<string, number> = {};
      vehicles.forEach(v => { const o = v.ownership || 'Unspecified'; byOwnership[o] = (byOwnership[o] || 0) + 1; });
      return {
        summary: [
          { label: 'Total Vehicles', value: String(vehicles.length) },
          { label: 'Active', value: String(active) },
          ...Object.entries(byOwnership).map(([k, v]) => ({ label: k, value: String(v) }))
        ],
        sections: [
          {
            heading: 'Vehicle-wise Summary', columns: ['Reg No', 'Type', 'Category', 'Ownership', 'Model', 'Insurance Exp', 'FC Exp', 'Tax'],
            rows: vehicles.map(v => [
              v.regNo || v['Reg. No.'] || '-', v.type || '-', v.category || '-', v.ownership || '-',
              v.model || '-', v.insurance || '-', v.fc || '-', v.tax || '-'
            ])
          }
        ]
      };
    }

    case 'vendors': {
      const vendors = props.vendors;
      const active = vendors.filter(v => v.active !== false).length;
      const totalVehicles = vendors.reduce((s, v) => s + (v.vehicleNumbers?.length || 0), 0);
      return {
        summary: [
          { label: 'Total Vendors', value: String(vendors.length) },
          { label: 'Active', value: String(active) },
          { label: 'Total Registered Vehicles', value: String(totalVehicles) }
        ],
        sections: [
          {
            heading: 'Vendor-wise Summary', columns: ['Name', 'Code', 'Client(s)', 'Vehicles', 'Contact'],
            rows: vendors.map(v => [v.name, v.code, Array.isArray(v.client) ? v.client.join(', ') : (v.client || '-'), (v.vehicleNumbers || []).length, v.contactNumber || '-'])
          }
        ]
      };
    }

    case 'drivers': {
      const driversInRange = props.drivers.filter(d => isMonthInRange(d.month, range));
      const totalAdvance = driversInRange.reduce((s, d) => s + (d.pettyCashAdvance || 0), 0);
      const totalLop = driversInRange.reduce((s, d) => s + (d.lopAmount || 0), 0);
      const totalLoanDeduction = driversInRange.reduce((s, d) => s + (d.loanDeduction || 0), 0);
      const totalWelfare = driversInRange.reduce((s, d) => s + (d.driverWelfare || 0), 0);
      return {
        summary: [
          { label: 'Drivers (this period)', value: String(driversInRange.length) },
          { label: 'Total Petty Cash Advance', value: money(totalAdvance) },
          { label: 'Total LOP Amount', value: money(totalLop) },
          { label: 'Total Loan Deduction', value: money(totalLoanDeduction) },
          { label: 'Total Driver Welfare', value: money(totalWelfare) }
        ],
        sections: [
          {
            heading: 'Driver Salary & Cost', columns: ['Driver ID', 'Name', 'Vehicle', 'Month', 'LOP Amt', 'Advance', 'Loan Ded.', 'Recovery', 'Welfare'],
            rows: driversInRange.map(d => [d.id, d.name, d.vehicleNo || '-', d.month || '-', d.lopAmount || 0, d.pettyCashAdvance || 0, d.loanDeduction || 0, d.recoveryAmount || 0, d.driverWelfare || 0])
          }
        ]
      };
    }

    case 'loans': {
      const vLoans = props.vehicleLoans;
      const bLoans = props.businessLoans;
      const activeV = vLoans.filter(l => l.loanStatus === 'Active').length;
      const activeB = bLoans.filter(l => l.loanStatus === 'Active').length;
      const totalMonthlyEmi =
        vLoans.filter(l => l.loanStatus === 'Active').reduce((s, l) => s + (l.monthlyEmi || 0), 0) +
        bLoans.filter(l => l.loanStatus === 'Active').reduce((s, l) => s + (l.emiMonthly || 0), 0);
      return {
        summary: [
          { label: 'Active Vehicle Loans', value: String(activeV) },
          { label: 'Active Business Loans', value: String(activeB) },
          { label: 'Total Active Monthly EMI', value: money(totalMonthlyEmi) }
        ],
        sections: [
          {
            heading: 'Vehicle Loans', columns: ['Reg No', 'Financer', 'Loan Amount', 'Monthly EMI', 'Status'],
            rows: vLoans.map(l => [l.regNo, l.financer, l.loanAmount || 0, l.monthlyEmi || 0, l.loanStatus])
          },
          {
            heading: 'Business Loans', columns: ['Financer', 'Loan Type', 'Sanctioned Amount', 'Monthly EMI', 'Status'],
            rows: bLoans.map(l => [l.financer, l.loanType, l.sanctionedAmount || 0, l.emiMonthly || 0, l.loanStatus])
          }
        ]
      };
    }

    case 'billing': {
      const invoicesInRange = props.invoices.filter(i => isDateInRange(i.date, range));
      const total = invoicesInRange.reduce((s, i) => s + (i.amount || 0), 0);
      const paid = invoicesInRange.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
      const pending = invoicesInRange.filter(i => i.status === 'Pending').reduce((s, i) => s + (i.amount || 0), 0);
      const overdue = invoicesInRange.filter(i => i.status === 'Overdue').reduce((s, i) => s + (i.amount || 0), 0);
      return {
        summary: [
          { label: 'Total Invoiced', value: money(total) },
          { label: 'Paid', value: money(paid) },
          { label: 'Pending', value: money(pending) },
          { label: 'Overdue', value: money(overdue) }
        ],
        sections: [
          {
            heading: 'Invoices', columns: ['Date', 'Invoice No', 'Customer', 'Amount', 'Status'],
            rows: invoicesInRange.map(i => [i.date, i.invoiceNo, i.customerName, i.amount || 0, i.status])
          }
        ]
      };
    }

    case 'accounts': {
      const entriesInRange = props.entries.filter(e => isDateInRange(e.date, range));
      const income = entriesInRange.filter(e => e.type === 'Income').reduce((s, e) => s + (e.amount || 0), 0);
      const expense = entriesInRange.filter(e => e.type === 'Expense').reduce((s, e) => s + (e.amount || 0), 0);
      return {
        summary: [
          { label: 'Total Income', value: money(income) },
          { label: 'Total Expense', value: money(expense) },
          { label: 'Net', value: money(income - expense) }
        ],
        sections: [
          {
            heading: 'Accounts Entries', columns: ['Date', 'Type', 'Category', 'Amount', 'Reference'],
            rows: entriesInRange.map(e => [e.date, e.type, e.category, e.amount || 0, e.reference || '-'])
          }
        ]
      };
    }

    case 'warehouse': {
      const entriesInRange = props.warehouseEntries.filter(e => isDateInRange(e.date, range));
      const totalKm = entriesInRange.reduce((s, e) => s + (e.kmUtilised || 0), 0);
      const uniqueVehicles = new Set(entriesInRange.map(e => e.vehicleNumber)).size;
      return {
        summary: [
          { label: 'Entries', value: String(entriesInRange.length) },
          { label: 'Total KM Utilised', value: totalKm.toLocaleString('en-IN') },
          { label: 'Unique Vehicles', value: String(uniqueVehicles) }
        ],
        sections: [
          {
            heading: 'Warehouse Entries', columns: ['Date', 'Warehouse', 'City', 'Vehicle', 'Type', 'KM Utilised', 'POD'],
            rows: entriesInRange.map(e => [e.date, e.warehouseName, e.warehouseCity, e.vehicleNumber, e.vehicleType, e.kmUtilised || 0, e.pod || '-'])
          }
        ]
      };
    }

    case 'hr': {
      const activeEmployees = props.employees.filter(e => e.status === 'Active');
      const attendanceInRange = hrExtra.staffAttendance.filter((a: any) => isDateInRange(a.date, range));
      const payrollInRange = hrExtra.staffPayroll.filter((p: any) => isMonthInRange(p.month, range));
      const presentDays = attendanceInRange.filter((a: any) => a.status === 'Present').length;
      const lopDaysCount = attendanceInRange.filter((a: any) => a.status === 'AbsentLOP').length;
      const totalGross = payrollInRange.reduce((s: number, p: any) => s + (p.totalEarnings || 0), 0);
      const totalDeductions = payrollInRange.reduce((s: number, p: any) => s + (p.totalDeductions || 0), 0);
      const totalNetPayroll = payrollInRange.reduce((s: number, p: any) => s + (p.netSalary || 0), 0);
      const empName = (empId: string) => props.employees.find(e => e.id === empId)?.name || empId;
      return {
        summary: [
          { label: 'Active Headcount', value: String(activeEmployees.length) },
          { label: 'Present Days (period)', value: String(presentDays) },
          { label: 'LOP Days (period)', value: String(lopDaysCount) },
          { label: 'Total Gross Earnings', value: money(totalGross) },
          { label: 'Total Deductions', value: money(totalDeductions) },
          { label: 'Total Net Payroll', value: money(totalNetPayroll) }
        ],
        sections: [
          {
            heading: 'Payroll (by month)', columns: ['Emp ID', 'Name', 'Month', 'Gross Earnings', 'Deductions', 'Net Salary'],
            rows: payrollInRange.map((p: any) => [p.empId, empName(p.empId), p.month, Math.round(p.totalEarnings || 0), Math.round(p.totalDeductions || 0), Math.round(p.netSalary || 0)])
          },
          {
            heading: 'Employee Master', columns: ['Emp ID', 'Name', 'Designation', 'Status', 'Org Unit'],
            rows: props.employees.map(e => [e.id, e.name, e.designation || '-', e.status, e.orgUnit])
          }
        ]
      };
    }
  }
}

const PERIOD_LABELS: { value: ReportPeriod; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' }
];

interface CardRangeState {
  period: ReportPeriod;
  anchorDate: string;
  customStart: string;
  customEnd: string;
}

const defaultRangeState = (): CardRangeState => {
  const today = new Date().toISOString().slice(0, 10);
  return { period: 'monthly', anchorDate: today, customStart: today, customEnd: today };
};

export default function Reports(props: ReportsProps) {
  const isSuperAdmin = props.user.department === 'super_admin';

  const [cardRanges, setCardRanges] = useState<Record<ModuleKey, CardRangeState>>(() => {
    const init = {} as Record<ModuleKey, CardRangeState>;
    MODULES.forEach(m => { init[m.key] = defaultRangeState(); });
    return init;
  });
  const updateCardRange = (key: ModuleKey, patch: Partial<CardRangeState>) =>
    setCardRanges(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const [viewingModule, setViewingModule] = useState<ModuleKey | null>(null);
  const [openMenu, setOpenMenu] = useState<{ key: ModuleKey; kind: 'download' | 'share' } | null>(null);
  const [notif, setNotif] = useState<string | null>(null);
  const triggerNotif = (msg: string) => { setNotif(msg); setTimeout(() => setNotif(null), 4500); };

  // HR & Payroll's deeper data (attendance/payroll) isn't otherwise fetched
  // into this portal's shared state (see HR.tsx, which fetches it itself
  // too) - fetched once here on mount so the HR & Payroll card's numbers are
  // ready whenever it's viewed/exported.
  const [staffAttendance, setStaffAttendance] = useState<any[]>([]);
  const [staffPayroll, setStaffPayroll] = useState<any[]>([]);
  const [hrLoading, setHrLoading] = useState(false);
  useEffect(() => {
    if (!isSuperAdmin) return;
    setHrLoading(true);
    Promise.all([
      authFetch('/api/staff/attendance').then(r => r.ok ? r.json() : []),
      authFetch('/api/staff/provident-fund').then(r => r.ok ? r.json() : [])
    ]).then(([attendance, payroll]) => {
      setStaffAttendance(Array.isArray(attendance) ? attendance : []);
      setStaffPayroll(Array.isArray(payroll) ? payroll : []);
    }).catch(err => console.error('Failed to load HR & Payroll report data:', err))
      .finally(() => setHrLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  // Close an open Download/Share menu on any outside click.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  const rangeFor = (key: ModuleKey): ReportRange => {
    const c = cardRanges[key];
    return getReportRange(c.period, c.anchorDate, c.customStart, c.customEnd);
  };
  const reportFor = (key: ModuleKey): ModuleReport => buildReport(key, props, rangeFor(key), { staffAttendance, staffPayroll });

  const exportMetaFor = (meta: ModuleMeta) => {
    const range = rangeFor(meta.key);
    const filenameBase = `KCM_Report_${meta.label.replace(/[^a-zA-Z0-9]+/g, '_')}_${meta.dateFiltered ? range.label.replace(/[^a-zA-Z0-9]+/g, '_') : 'Snapshot'}`;
    const subtitle = meta.dateFiltered ? `Period: ${range.label} (${range.start} to ${range.end})` : 'Current snapshot';
    const title = `KCM Logistics - ${meta.label} Report`;
    return { filenameBase, subtitle, title };
  };

  const handleDownload = (meta: ModuleMeta, format: 'excel' | 'pdf') => {
    setOpenMenu(null);
    const { filenameBase, subtitle, title } = exportMetaFor(meta);
    const sections = reportFor(meta.key).sections;
    if (format === 'excel') exportReportToExcel(filenameBase, sections);
    else exportReportToPdf(filenameBase, title, subtitle, sections);
  };

  const handleShare = async (meta: ModuleMeta, format: 'excel' | 'pdf') => {
    setOpenMenu(null);
    const { filenameBase, subtitle, title } = exportMetaFor(meta);
    const sections = reportFor(meta.key).sections;
    const file = format === 'excel' ? buildExcelFile(filenameBase, sections) : buildPdfFile(filenameBase, title, subtitle, sections);
    await shareOrDownloadFile(file, title, subtitle, triggerNotif);
  };

  // Defense-in-depth: Administration.tsx already gates rendering this
  // component to Super Admin only (same hasAccess() pattern every other
  // module uses), but this internal check means Reports & Analytics refuses
  // to show anything even if it were ever reached another way - required per
  // spec since this now surfaces Payroll/salary data. Placed after every
  // hook above (never before) so hook call order stays identical on every
  // render, regardless of this condition.
  if (!isSuperAdmin) {
    return (
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-10 text-center">
        <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <h2 className="text-sm font-bold text-slate-800">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-1">Reports &amp; Analytics is limited to Super Admin / Principal logins only.</p>
      </div>
    );
  }

  const viewingMeta = viewingModule ? MODULES.find(m => m.key === viewingModule)! : null;
  const viewingReport = viewingModule ? reportFor(viewingModule) : null;

  return (
    <div className="space-y-6" id="reports-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <BarChart3 className="text-violet-600 w-5 h-5" />
            Reports &amp; Analytics
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Centralized cross-module reporting - Super Admin / Principal only.
          </p>
        </div>
      </div>

      {notif && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs font-semibold">{notif}</div>
      )}

      {hrLoading && (
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading HR &amp; Payroll data...</div>
      )}

      {/* 12 color-coded module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {MODULES.map(meta => {
          const theme = MODULE_THEMES[meta.key];
          const c = cardRanges[meta.key];
          const range = rangeFor(meta.key);
          const Icon = meta.icon;
          return (
            <div key={meta.key} className={`rounded-2xl border ${theme.border} ${theme.bg} p-4 flex flex-col gap-3 text-xs shadow-xs`}>
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl ${theme.iconBg} ${theme.text}`}><Icon className="w-4 h-4" /></div>
                <h3 className={`font-bold text-sm ${theme.text}`}>{meta.label}</h3>
              </div>

              {meta.dateFiltered ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    {PERIOD_LABELS.map(p => (
                      <button
                        key={p.value}
                        onClick={() => updateCardRange(meta.key, { period: p.value })}
                        className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors text-[10px] ${
                          c.period === p.value ? `${theme.btn} text-white` : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {c.period === 'custom' ? (
                    <div className="flex items-center gap-1">
                      <DateInput value={c.customStart} onChange={(e) => updateCardRange(meta.key, { customStart: e.target.value })} className="bg-white border border-slate-200 rounded-lg px-1.5 py-1 font-mono text-slate-700 text-[10px]" />
                      <span className="text-slate-400 text-[10px]">to</span>
                      <DateInput value={c.customEnd} onChange={(e) => updateCardRange(meta.key, { customEnd: e.target.value })} className="bg-white border border-slate-200 rounded-lg px-1.5 py-1 font-mono text-slate-700 text-[10px]" />
                    </div>
                  ) : (
                    <DateInput value={c.anchorDate} onChange={(e) => updateCardRange(meta.key, { anchorDate: e.target.value })} className="bg-white border border-slate-200 rounded-lg px-1.5 py-1 font-mono text-slate-700 text-[10px] w-full" />
                  )}
                  <p className="text-[9px] text-slate-500 font-mono">Showing: <span className="font-bold">{range.label}</span></p>
                </div>
              ) : (
                <p className="text-[9px] text-slate-500 font-mono bg-white/70 border border-slate-200 rounded-lg p-2">{meta.note}</p>
              )}

              <div className="flex items-center gap-1.5 pt-1 mt-auto border-t border-white/60">
                <button
                  onClick={() => setViewingModule(meta.key)}
                  className={`flex-1 flex items-center justify-center gap-1 ${theme.btn} text-white font-bold py-1.5 rounded-lg cursor-pointer transition-all text-[10px]`}
                >
                  <Eye className="w-3 h-3" /> View
                </button>
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu?.key === meta.key && openMenu.kind === 'download' ? null : { key: meta.key, kind: 'download' })}
                    className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                    title="Download"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  {openMenu?.key === meta.key && openMenu.kind === 'download' && (
                    <div ref={menuRef} className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-32">
                      <button onClick={() => handleDownload(meta, 'excel')} className="w-full text-left px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3 h-3 text-emerald-600" /> Excel
                      </button>
                      <button onClick={() => handleDownload(meta, 'pdf')} className="w-full text-left px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-rose-600" /> PDF
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu?.key === meta.key && openMenu.kind === 'share' ? null : { key: meta.key, kind: 'share' })}
                    className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                    title="Share"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  {openMenu?.key === meta.key && openMenu.kind === 'share' && (
                    <div ref={menuRef} className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-32">
                      <button onClick={() => handleShare(meta, 'excel')} className="w-full text-left px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3 h-3 text-emerald-600" /> Excel
                      </button>
                      <button onClick={() => handleShare(meta, 'pdf')} className="w-full text-left px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-rose-600" /> PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* View modal - full report for one module */}
      {viewingMeta && viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className={`p-4 flex items-center justify-between text-white ${MODULE_THEMES[viewingMeta.key].btn.split(' ')[0]}`}>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <viewingMeta.icon className="w-4 h-4" /> {viewingMeta.label} Report
                <span className="text-[10px] font-mono font-normal opacity-80">({exportMetaFor(viewingMeta).subtitle})</span>
              </h3>
              <div className="flex items-center gap-1.5">
                <button onClick={() => handleDownload(viewingMeta, 'excel')} className="p-1.5 bg-white/15 hover:bg-white/25 rounded-lg cursor-pointer transition-colors" title="Download Excel"><FileSpreadsheet className="w-4 h-4" /></button>
                <button onClick={() => handleDownload(viewingMeta, 'pdf')} className="p-1.5 bg-white/15 hover:bg-white/25 rounded-lg cursor-pointer transition-colors" title="Download PDF"><FileText className="w-4 h-4" /></button>
                <button onClick={() => handleShare(viewingMeta, 'pdf')} className="p-1.5 bg-white/15 hover:bg-white/25 rounded-lg cursor-pointer transition-colors" title="Share PDF"><Share2 className="w-4 h-4" /></button>
                <button onClick={() => setViewingModule(null)} className="p-1.5 bg-white/15 hover:bg-white/25 rounded-lg cursor-pointer transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs bg-slate-50/50">
              {viewingMeta.note && (
                <p className="text-[10px] text-amber-700 font-mono bg-amber-50 border border-amber-100 rounded-lg p-2.5">{viewingMeta.note}</p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {viewingReport.summary.map((s, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide truncate" title={s.label}>{s.label}</p>
                    <p className="text-sm font-black text-slate-800 font-mono mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>

              {viewingReport.sections.map((section, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">{section.heading} ({section.rows.length})</h4>
                  <div className="overflow-x-auto overflow-y-auto max-h-[320px] border border-slate-200 rounded-xl shadow-2xs bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px] sticky top-0 z-10">
                        <tr>{section.columns.map((c, i) => <th key={i} className="px-3 py-2.5 whitespace-nowrap">{c}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {section.rows.length === 0 ? (
                          <tr><td colSpan={section.columns.length} className="text-center py-8 text-slate-400 font-mono text-[11px]">No records in this range.</td></tr>
                        ) : section.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors text-[11px]">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className={`px-3 py-2 whitespace-nowrap ${typeof cell === 'number' ? 'text-right font-mono' : ''}`}>
                                {typeof cell === 'number' ? cell.toLocaleString('en-IN') : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
