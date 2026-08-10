import React, { useState, useEffect, useMemo } from 'react';
import {
  User, Vehicle, FuelLog, MileageReport, Vendor, DriverEmployee, VehicleLoan, BusinessLoan,
  BillingInvoice, PettyCashVoucher, PettyCashAdvance, MarketPodEntry, MaintenanceRecord,
  BreakdownReport, AccountsEntry, StaffEmployee, WarehouseEntry
} from '../types';
import { authFetch } from '../authFetch';
import {
  BarChart3, Download, FileSpreadsheet, FileText, Lock, ShieldAlert, Loader2
} from 'lucide-react';
import DateInput from './DateInput';
import { ReportPeriod, ReportRange, getReportRange, isDateInRange, isMonthInRange } from '../utils/reportDateRange';
import { exportReportToExcel, exportReportToPdf, ReportTableSection } from '../utils/reportExport';

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
  // Fleet & Vehicles / Vendor Management / Loan Management are master/status
  // registries, not dated event logs - they're shown as a current snapshot
  // with no date-range filter, same as their source modules work today.
  dateFiltered: boolean;
  note?: string;
}

const MODULES: ModuleMeta[] = [
  { key: 'pettycash', label: 'Petty Cash', dateFiltered: true },
  { key: 'maintenance', label: 'Fleet Maintenance', dateFiltered: true },
  { key: 'fuel', label: 'Fuel Management', dateFiltered: true },
  { key: 'mileage', label: 'Mileage Report', dateFiltered: true },
  { key: 'fleet', label: 'Fleet & Vehicles', dateFiltered: false, note: 'Current fleet snapshot - not a dated log, so no date range applies.' },
  { key: 'vendors', label: 'Vendor Management', dateFiltered: false, note: 'Current vendor registry snapshot - not a dated log, so no date range applies.' },
  { key: 'drivers', label: 'Driver Salary', dateFiltered: true, note: "Driver Details stores only each driver's most recently-entered salary month, not a full month-by-month history - this shows whichever drivers' recorded month falls in the selected range." },
  { key: 'loans', label: 'Loan Management', dateFiltered: false, note: 'Current loan status snapshot - not a dated log, so no date range applies.' },
  { key: 'billing', label: 'Customer Billings', dateFiltered: true },
  { key: 'accounts', label: 'Accounts & Finance', dateFiltered: true },
  { key: 'warehouse', label: 'Warehouse Details', dateFiltered: true },
  { key: 'hr', label: 'HR & Payroll', dateFiltered: true, note: 'Payroll figures (gross/deductions/net) are the same computation HR & Payroll itself uses - cross-check there for exact payslips.' }
];

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
          { label: 'Market POD Cash Freight', value: money(totalPodFreight) },
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
            heading: 'Market POD - Cash Mode', columns: ['Date', 'Vehicle', 'Freight', 'Advance', 'Balance'],
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
  { value: 'custom', label: 'Custom Range' }
];

export default function Reports(props: ReportsProps) {
  const isSuperAdmin = props.user.department === 'super_admin';

  const [selectedModule, setSelectedModule] = useState<ModuleKey>('pettycash');
  const [period, setPeriod] = useState<ReportPeriod>('monthly');
  const [anchorDate, setAnchorDate] = useState(new Date().toISOString().slice(0, 10));
  const [customStart, setCustomStart] = useState(new Date().toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10));

  const moduleMeta = MODULES.find(m => m.key === selectedModule)!;
  const range = useMemo(() => getReportRange(period, anchorDate, customStart, customEnd), [period, anchorDate, customStart, customEnd]);

  // HR & Payroll's deeper data (attendance/payroll) isn't otherwise fetched
  // into this portal's shared state (see HR.tsx, which fetches it itself
  // too) - lazily fetched here the first time that module is opened.
  const [staffAttendance, setStaffAttendance] = useState<any[]>([]);
  const [staffPayroll, setStaffPayroll] = useState<any[]>([]);
  const [hrLoaded, setHrLoaded] = useState(false);
  const [hrLoading, setHrLoading] = useState(false);
  useEffect(() => {
    if (!isSuperAdmin || selectedModule !== 'hr' || hrLoaded || hrLoading) return;
    setHrLoading(true);
    Promise.all([
      authFetch('/api/staff/attendance').then(r => r.ok ? r.json() : []),
      authFetch('/api/staff/provident-fund').then(r => r.ok ? r.json() : [])
    ]).then(([attendance, payroll]) => {
      setStaffAttendance(Array.isArray(attendance) ? attendance : []);
      setStaffPayroll(Array.isArray(payroll) ? payroll : []);
      setHrLoaded(true);
    }).catch(err => console.error('Failed to load HR & Payroll report data:', err))
      .finally(() => setHrLoading(false));
  }, [selectedModule, hrLoaded, hrLoading]);

  const report = useMemo(
    () => buildReport(selectedModule, props, range, { staffAttendance, staffPayroll }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedModule, props, range, staffAttendance, staffPayroll]
  );

  const exportFilenameBase = `KCM_Report_${moduleMeta.label.replace(/[^a-zA-Z0-9]+/g, '_')}_${moduleMeta.dateFiltered ? range.label.replace(/[^a-zA-Z0-9]+/g, '_') : 'Snapshot'}`;
  const exportSubtitle = moduleMeta.dateFiltered ? `Period: ${range.label} (${range.start} to ${range.end})` : 'Current snapshot';

  const handleExportExcel = () => exportReportToExcel(exportFilenameBase, report.sections);
  const handleExportPdf = () => exportReportToPdf(exportFilenameBase, `KCM Logistics - ${moduleMeta.label} Report`, exportSubtitle, report.sections);

  // Defense-in-depth: Administration.tsx already gates rendering this
  // component to Super Admin only (same hasAccess() pattern every other
  // module uses), but this internal check means Reports refuses to show
  // anything even if it were ever reached another way - required per spec
  // since this now surfaces Payroll/salary data. Placed after every hook
  // above (never before) so hook call order stays identical on every render,
  // regardless of this condition.
  if (!isSuperAdmin) {
    return (
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-10 text-center">
        <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <h2 className="text-sm font-bold text-slate-800">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-1">The Reports module is limited to Super Admin / Principal logins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="reports-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <BarChart3 className="text-violet-600 w-5 h-5" />
            Reports
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Centralized cross-module reporting - Super Admin / Principal only.
          </p>
        </div>
      </div>

      {/* Module selector */}
      <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold">
        {MODULES.map(m => (
          <button
            key={m.key}
            onClick={() => setSelectedModule(m.key)}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              selectedModule === m.key ? 'bg-gradient-to-r from-violet-600 to-slate-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
        {/* Date range controls */}
        {moduleMeta.dateFiltered ? (
          <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
            {PERIOD_LABELS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${
                  period === p.value ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
            {period === 'custom' ? (
              <div className="flex items-center gap-1.5 ml-1">
                <DateInput value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-slate-700" />
                <span className="text-slate-400">to</span>
                <DateInput value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-slate-700" />
              </div>
            ) : (
              <DateInput value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-slate-700 ml-1" />
            )}
            <span className="text-slate-500 font-mono ml-auto">Showing: <span className="font-bold text-slate-700">{range.label}</span></span>
          </div>
        ) : moduleMeta.note && (
          <div className="text-[10px] text-slate-400 font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-100">{moduleMeta.note}</div>
        )}
        {moduleMeta.dateFiltered && moduleMeta.note && (
          <p className="text-[10px] text-amber-600 font-mono bg-amber-50 border border-amber-100 rounded-lg p-2.5">{moduleMeta.note}</p>
        )}

        {selectedModule === 'hr' && hrLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading attendance & payroll data...</div>
        )}

        {/* Export buttons */}
        <div className="flex items-center justify-end gap-2">
          <button onClick={handleExportExcel} className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs transition-all cursor-pointer shadow-2xs">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </button>
          <button onClick={handleExportPdf} className="bg-rose-700 hover:bg-rose-800 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs transition-all cursor-pointer shadow-2xs">
            <FileText className="w-3.5 h-3.5" /> Export PDF
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
          {report.summary.map((s, idx) => (
            <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide truncate" title={s.label}>{s.label}</p>
              <p className="text-sm font-black text-slate-800 font-mono mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Detail tables, one per section */}
        {report.sections.map((section, idx) => (
          <div key={idx} className="space-y-1.5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Download className="w-3 h-3 text-slate-400" /> {section.heading} ({section.rows.length})
            </h3>
            <div className="overflow-x-auto overflow-y-auto max-h-[360px] border border-slate-200 rounded-xl shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px] sticky top-0 z-10">
                  <tr>{section.columns.map((c, i) => <th key={i} className="px-3 py-2.5 whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
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
  );
}
