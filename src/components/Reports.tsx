import React, { useState, useEffect, useRef } from 'react';
import {
  User, Vehicle, FuelLog, MileageReport, Vendor, DriverEmployee, VehicleLoan, BusinessLoan,
  BillingInvoice, PettyCashVoucher, PettyCashAdvance, MarketPodEntry, MaintenanceRecord,
  BreakdownReport, AccountsEntry, StaffEmployee, WarehouseEntry, VehicleServiceSchedule,
  TireRecord, BatteryRecord, ToolsChecklistRecord, ServiceStationSparePart, ServiceStationInspection,
  DriverAttendance
} from '../types';
import { authFetch } from '../authFetch';
import {
  BarChart3, Lock, ShieldAlert, Loader2, X, Eye, FileSpreadsheet, FileText, Share2,
  Fuel, Gauge, Building2, Contact, Truck, HandCoins, Landmark, Settings, DollarSign, Warehouse
} from 'lucide-react';
import DateInput from './DateInput';
import { ReportPeriod, ReportRange, getReportRange, isDateInRange, isMonthInRange } from '../utils/reportDateRange';
import { ReportTableSection, exportReportToExcel, exportReportToPdf, buildExcelFile, buildPdfFile, shareOrDownloadFile } from '../utils/reportExport';
import { computeMonthsCompleted, computeDueDate, resolveLoanStatus } from '../utils/loanDates';
import { effectiveInvoiceAmount, effectiveInvoiceStatus } from '../utils/billingInvoiceCalc';
import { payableAmount, payableAmountLive, driverSalaryRows, SALARY_COLUMNS } from '../utils/driverSalaryExport';

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
  // Fleet Maintenance's other 5 sub-modules (2026-09-10 direct request: each
  // sub-module needs its own independently viewable/downloadable report,
  // never flattened together) - already loaded in Administration.tsx's own
  // state for the Maintenance tab, just not previously threaded down here.
  vehicleServiceSchedules: VehicleServiceSchedule[];
  tireRecords: TireRecord[];
  batteryRecords: BatteryRecord[];
  toolsChecklistRecords: ToolsChecklistRecord[];
  serviceStationSpareParts: ServiceStationSparePart[];
  serviceStationInspections: ServiceStationInspection[];
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

// One extra (non-date) filter dimension per module, on top of the existing
// date-range control (2026-09-10 direct request) - a plain string map since
// most modules need exactly one dimension (Bunk/Card/All, On-Roll/Contract,
// company entity, maintenance sub-module) except Petty Cash, which needs two
// (holder AND report type) at once. Defaults below always reproduce today's
// existing behavior (nothing filtered out) until an admin actively picks a
// non-default option - this is an addition, never a behavior change.
type CardFilterState = Record<string, string>;

const FUEL_SOURCE_OPTIONS = ['All', 'Bunk', 'Card', 'Petty Cash'];
const HR_EMPLOYEE_TYPE_OPTIONS = ['All', 'On-Roll', 'Contract'];
const BILLING_ENTITY_OPTIONS: { value: 'KCM Insta' | 'KCM Supply'; label: string }[] = [
  { value: 'KCM Insta', label: 'KCM Insta Services' },
  { value: 'KCM Supply', label: 'KCM Supply Chain Solutions' }
];
const PETTY_CASH_REPORT_TYPE_OPTIONS = ['Vouchers', 'Market Trip'];
const MAINTENANCE_SUBMODULE_OPTIONS = [
  'Service History', 'Service Schedule', 'Service Station', 'Tire & Alignment',
  'Battery', 'Tools Checklist', 'Breakdown/Workshop/Electrical'
];

const defaultFilterState = (key: ModuleKey): CardFilterState => {
  switch (key) {
    case 'fuel': case 'mileage': return { source: 'All' };
    case 'hr': return { employeeType: 'All' };
    case 'billing': return { entity: 'KCM Insta' };
    case 'pettycash': return { holder: 'All', reportType: 'Vouchers' };
    case 'maintenance': return { subModule: 'Service History' };
    default: return {};
  }
};

function buildReport(
  moduleKey: ModuleKey,
  props: ReportsProps,
  range: ReportRange,
  hrExtra: { staffAttendance: any[]; staffPayroll: any[] },
  driverAttendance: DriverAttendance[],
  filter: CardFilterState
): ModuleReport {
  switch (moduleKey) {
    case 'pettycash': {
      // 2026-09-10 direct request: filterable/downloadable per holder
      // (Vinod/Ramesh/Saneel), plus a distinct Market Trip report separate
      // from the general voucher report - both now real row-level filters,
      // not just the summary-only per-user split this used to be.
      const holder = filter.holder || 'All';
      const reportType = filter.reportType || 'Vouchers';
      const belongsToHolder = (enteredBy?: string) => holder === 'All' || enteredBy === holder;

      const vouchersInRange = props.vouchers.filter(v => isDateInRange(v.date, range) && belongsToHolder(v.enteredBy));
      const advancesInRange = props.pettyCashAdvances.filter(a => isDateInRange(a.date, range) && belongsToHolder(a.username));
      const podInRange = props.marketPodEntries.filter(e => isDateInRange(e.date, range) && belongsToHolder(e.enteredBy));
      const cashPodInRange = podInRange.filter(e => e.paymentMode === 'Cash');

      const totalCashPaid = vouchersInRange.reduce((s, v) => s + (v.cashPaid || 0), 0);
      const totalReceived = advancesInRange.reduce((s, a) => s + (a.amount || 0), 0);
      const totalPodFreight = cashPodInRange.reduce((s, e) => s + (e.totalFreight || 0), 0);
      const perUser = PETTY_CASH_USERS.map(u => ({
        label: u.label,
        cashPaid: props.vouchers.filter(v => isDateInRange(v.date, range) && v.enteredBy === u.username).reduce((s, v) => s + (v.cashPaid || 0), 0)
      }));

      if (reportType === 'Market Trip') {
        const totalFreight = podInRange.reduce((s, e) => s + (e.totalFreight || 0), 0);
        const totalAdvance = podInRange.reduce((s, e) => s + (e.receivedAdvance || 0), 0);
        const totalExpenses = podInRange.reduce((s, e) => s + (e.otherExpenses || 0), 0);
        const totalBalance = podInRange.reduce((s, e) => s + (e.balance || 0), 0);
        return {
          summary: [
            { label: 'Trips', value: String(podInRange.length) },
            { label: 'Total Freight', value: money(totalFreight) },
            { label: 'Total Advance Received', value: money(totalAdvance) },
            { label: 'Total Other Expenses', value: money(totalExpenses) },
            { label: 'Total Balance', value: money(totalBalance) }
          ],
          sections: [
            {
              heading: 'Market Trip Details',
              columns: ['Entry No', 'Date', 'Vehicle', 'From', 'To', 'Customer', 'Total Freight', 'Advance Received', 'Other Expenses', 'Balance', 'Coordinator', 'Status', 'Payment Mode', 'Entered By'],
              rows: podInRange.map(e => [
                e.entryNo, e.date, e.vehicleNumber, e.from, e.to, e.customer,
                e.totalFreight || 0, e.receivedAdvance || 0, e.otherExpenses || 0, e.balance || 0,
                e.coordinator || '-', e.status, e.paymentMode || '-', e.enteredBy || '-'
              ])
            }
          ]
        };
      }

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
            rows: vouchersInRange.map(v => [v.date, (v.entryNo || '').replace(/^(ENT)-\d{4}-/, '$1-'), v.category, v.vehicleNumber || '-', v.receiver, v.cashPaid || 0, v.enteredBy || '-'])
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
      // 2026-09-10 direct request: 7 sub-modules, each its own report -
      // never flattened together. subModule picks exactly one; everything
      // below returns ONLY that sub-module's section(s).
      const subModule = filter.subModule || 'Service History';

      if (subModule === 'Service Schedule') {
        const schedules = props.vehicleServiceSchedules;
        return {
          summary: [
            { label: 'Vehicles Tracked', value: String(schedules.length) },
            { label: 'Service Pending', value: String(schedules.filter(s => s.serviceStatus === 'Pending').length) }
          ],
          sections: [{
            heading: 'Service Schedule',
            columns: ['Reg No', 'Last Service Date', 'Last Service Km', 'Service Interval Km', 'Service Status', 'Warranty Status', 'Site'],
            rows: schedules.map(s => [s.regNo, s.lastServiceDate || '-', s.lastServiceKm || 0, s.serviceIntervalKm || 0, s.serviceStatus || '-', s.warrantyStatus || '-', s.site || '-'])
          }]
        };
      }

      if (subModule === 'Service Station') {
        const partsInRange = props.serviceStationSpareParts.filter(p => isDateInRange(p.date, range));
        const inspectionsInRange = props.serviceStationInspections.filter(i => isDateInRange(i.date, range));
        return {
          summary: [
            { label: 'Spare Parts Consumed', value: String(partsInRange.length) },
            { label: 'Inspections', value: String(inspectionsInRange.length) },
            { label: 'Inspections Pending', value: String(inspectionsInRange.filter(i => i.status === 'Pending').length) }
          ],
          sections: [
            {
              heading: 'Spare Parts', columns: ['Date', 'Reg No', 'Part Name', 'Part Number', 'Qty'],
              rows: partsInRange.map(p => [p.date, p.regNo, p.partName, p.partNumber, p.qty || 0])
            },
            {
              heading: 'Inspections', columns: ['Date', 'Reg No', 'Details', 'Status', 'Inspected By'],
              rows: inspectionsInRange.map(i => [i.date, i.regNo, i.details, i.status, i.inspectedBy || '-'])
            }
          ]
        };
      }

      if (subModule === 'Tire & Alignment') {
        const tires = props.tireRecords;
        return {
          summary: [
            { label: 'Tire Records', value: String(tires.length) },
            { label: 'Currently Fitted', value: String(tires.filter(t => t.isCurrent !== false).length) }
          ],
          sections: [{
            heading: 'Tire & Alignment',
            columns: ['Reg No', 'Position', 'Brand', 'Serial No', 'Installed Date', 'Installed Km', 'Last Alignment Km', 'Current'],
            rows: tires.map(t => [t.regNo, t.position, t.tireBrand, t.tireSerialNumber || '-', t.installedDate || '-', t.installedKm || 0, t.lastAlignmentKm || 0, t.isCurrent !== false ? 'Yes' : 'No'])
          }]
        };
      }

      if (subModule === 'Battery') {
        const batteries = props.batteryRecords;
        return {
          summary: [
            { label: 'Battery Records', value: String(batteries.length) },
            { label: 'Currently Fitted', value: String(batteries.filter(b => b.isCurrent).length) }
          ],
          sections: [{
            heading: 'Battery',
            columns: ['Reg No', 'Battery Number', 'Make', 'Installed Date', 'Installed Km', 'Warranty Expiry', 'Current'],
            rows: batteries.map(b => [b.regNo, b.batteryNumber, b.make || '-', b.installedDate || '-', b.installedKm || 0, b.warrantyExpiryDate || '-', b.isCurrent ? 'Yes' : 'No'])
          }]
        };
      }

      if (subModule === 'Tools Checklist') {
        const toolsInRange = props.toolsChecklistRecords.filter(t => isDateInRange(t.checkDate, range));
        return {
          summary: [{ label: 'Checks (period)', value: String(toolsInRange.length) }],
          sections: [{
            heading: 'Tools Checklist',
            columns: ['Check Date', 'Reg No', 'Jack', 'Jack Rod', 'Tommy Bar', 'Spanner', 'Checked By', 'Remarks'],
            rows: toolsInRange.map(t => [t.checkDate, t.regNo, t.hasJack ? 'Yes' : 'No', t.hasJackRod ? 'Yes' : 'No', t.hasTommyBar ? 'Yes' : 'No', t.hasSpanner ? 'Yes' : 'No', t.checkedBy || '-', t.remarks || '-'])
          }]
        };
      }

      if (subModule === 'Breakdown/Workshop/Electrical') {
        const breakdownsInRange = props.breakdownReports.filter(b => isDateInRange(b.date, range));
        const totalBreakdownCost = breakdownsInRange.reduce((s, b) => s + (b.amount || 0), 0);
        return {
          summary: [
            { label: 'Reports (period)', value: String(breakdownsInRange.length) },
            { label: 'Total Cost', value: money(totalBreakdownCost) },
            { label: 'Open (all-time)', value: String(props.breakdownReports.filter(b => b.status === 'Open').length) }
          ],
          sections: [{
            heading: 'Breakdown / Workshop / Electrical',
            columns: ['Date', 'Reg No', 'Type', 'Location', 'Description', 'Driver', 'Amount', 'Payment Type', 'Status'],
            rows: breakdownsInRange.map(b => [b.date, b.regNo, b.type || '-', b.location || '-', b.description || '-', b.driverName || '-', b.amount || 0, b.paymentType || '-', b.status])
          }]
        };
      }

      // Default / 'Service History'
      const recordsInRange = props.records.filter(r => isDateInRange(r.date, range));
      const totalServiceCost = recordsInRange.reduce((s, r) => s + (r.cost || 0), 0);
      const byType: Record<string, number> = {};
      recordsInRange.forEach(r => { byType[r.serviceType] = (byType[r.serviceType] || 0) + (r.cost || 0); });
      return {
        summary: [
          { label: 'Total Service Cost', value: money(totalServiceCost) },
          { label: 'Service Visits', value: String(recordsInRange.length) }
        ],
        sections: [
          {
            heading: 'Service History', columns: ['Date', 'Reg No', 'Type', 'Station', 'Cost', 'Driver', 'Invoice No', 'Odometer'],
            rows: recordsInRange.map(r => [r.date, r.regNo, r.serviceType, r.garageName || '-', r.cost || 0, r.driverName || '-', r.invoiceNumber || '-', r.odometer || 0])
          },
          {
            heading: 'Cost By Category', columns: ['Category', 'Total Cost'],
            rows: Object.entries(byType).map(([k, v]) => [k, v])
          }
        ]
      };
    }

    case 'fuel': {
      // 2026-09-10 direct request: All / Bunk / Card source filter, reusing
      // the exact same FuelLog.bunkOrCard field FuelManagement.tsx's own
      // pill filter reads - "Download full" is simply the 'All' selection,
      // already unfiltered by construction.
      const source = filter.source || 'All';
      const logsInRange = props.fuelLogs.filter(f => isDateInRange(f.date, range) && (source === 'All' || (f.bunkOrCard || 'Bunk') === source));
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
            heading: 'Fuel Entries', columns: ['Date', 'Vehicle', 'Source', 'Bunk', 'Litres', 'Rate', 'Amount', 'Client', 'Type'],
            rows: logsInRange.map(f => [f.date, f.vehicleNumber, f.bunkOrCard || 'Bunk', f.bunkName || '-', f.ltrs || 0, f.rate || 0, f.amount || 0, f.client, f.type])
          }
        ]
      };
    }

    case 'mileage': {
      // 2026-09-10 direct request: same Bunk/Card/All selection as Fuel
      // Management above. MileageReport itself carries no bunk/card field -
      // the link lives on the fuel side (FuelLog.mileageReportId points at
      // the MileageReport it was created alongside, see FuelManagement.tsx's
      // Mileage tab) - so the source is looked up via that link. A mileage
      // entry with no linked fuel log (created directly, or from before this
      // link existed) only ever shows under 'All', same as an unlinked fuel
      // entry does on the Fuel card above - never silently dropped.
      const source = filter.source || 'All';
      const sourceByMileageReportId = new Map<string, string>();
      props.fuelLogs.forEach(f => { if (f.mileageReportId) sourceByMileageReportId.set(f.mileageReportId, f.bunkOrCard || 'Bunk'); });
      const reportsInRange = props.mileageReports.filter(m =>
        isDateInRange(m.date, range) && (source === 'All' || sourceByMileageReportId.get(m.id) === source)
      );
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
            heading: 'Vendor-wise Summary', columns: ['Name', 'Code', 'Client(s)', 'Vehicle No(s)', 'Contact'],
            // 2026-09-10 direct request: the actual vehicle numbers, not just
            // a count - matches VendorManagement.tsx's own on-screen badge
            // list and its own Excel export exactly.
            rows: vendors.map(v => [v.name, v.code, Array.isArray(v.client) ? v.client.join(', ') : (v.client || '-'), (v.vehicleNumbers || []).join(', ') || '-', v.contactNumber || '-'])
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
      // Payable Amount reuses the exact same shared formula/row-builder
      // Driver Salary's own downloads use (driverSalaryExport.ts) rather
      // than re-deriving LOP/deductions math here - "mirrors the Driver
      // Details module structure exactly" (2026-09-10 direct request).
      const totalPayable = driversInRange.reduce((s, d) => s + (driverAttendance.length ? payableAmountLive(d, driverAttendance) : payableAmount(d)), 0);

      // Attendance as an additional section alongside the existing driver
      // data (2026-09-10 direct request offered either approach - this one
      // keeps a single self-contained Driver Details download).
      const driverName = (driverId: string) => props.drivers.find(d => d.id === driverId)?.name || driverId;
      const attendanceInRange = driverAttendance.filter(a => isDateInRange(a.date, range));

      return {
        summary: [
          { label: 'Drivers (this period)', value: String(driversInRange.length) },
          { label: 'Total Petty Cash Advance', value: money(totalAdvance) },
          { label: 'Total LOP Amount', value: money(totalLop) },
          { label: 'Total Loan Deduction', value: money(totalLoanDeduction) },
          { label: 'Total Driver Welfare', value: money(totalWelfare) },
          { label: 'Total Payable Amount', value: money(totalPayable) }
        ],
        sections: [
          {
            heading: 'Driver Salary & Cost',
            columns: SALARY_COLUMNS,
            rows: driverSalaryRows(driversInRange, driverAttendance.length ? driverAttendance : undefined)
          },
          {
            heading: 'Driver Attendance',
            columns: ['Date', 'Driver ID', 'Name', 'Location', 'Status', 'Remarks'],
            rows: attendanceInRange.map(a => [a.date, a.driverId, driverName(a.driverId), a.location || '-', a.status, a.remarks || '-'])
          }
        ]
      };
    }

    case 'loans': {
      // 2026-09-10 direct request: same EMI Paid/Due Date/Status math every
      // other loan screen uses (src/utils/loanDates.ts), never re-derived -
      // matches VehicleLoanSheet.tsx/BusinessLoanSheet.tsx's own columns.
      const vLoans = props.vehicleLoans;
      const bLoans = props.businessLoans;
      const vRows = vLoans.map(l => {
        const monthsCompleted = computeMonthsCompleted(l.emiStartDate, l.tenure);
        const dueDate = computeDueDate(l.emiStartDate, monthsCompleted, l.tenure);
        const status = resolveLoanStatus(l.loanStatus, l.loanStatusManual, monthsCompleted, l.tenure);
        const emiPending = l.tenure != null ? Math.max(0, l.tenure - monthsCompleted) : 0;
        const outstanding = emiPending * (l.monthlyEmi || 0);
        return { l, monthsCompleted, dueDate, status, emiPending, outstanding };
      });
      const bRows = bLoans.map(l => {
        const monthsCompleted = computeMonthsCompleted(l.emiDate, l.tenure);
        const dueDate = computeDueDate(l.emiDate, monthsCompleted, l.tenure);
        const status = resolveLoanStatus(l.loanStatus, l.loanStatusManual, monthsCompleted, l.tenure);
        const emiPending = l.tenure != null ? Math.max(0, l.tenure - monthsCompleted) : 0;
        const outstanding = emiPending * (l.emiMonthly || 0);
        return { l, monthsCompleted, dueDate, status, emiPending, outstanding };
      });
      const activeV = vRows.filter(r => r.status === 'Active').length;
      const activeB = bRows.filter(r => r.status === 'Active').length;
      const totalMonthlyEmi =
        vRows.filter(r => r.status === 'Active').reduce((s, r) => s + (r.l.monthlyEmi || 0), 0) +
        bRows.filter(r => r.status === 'Active').reduce((s, r) => s + (r.l.emiMonthly || 0), 0);
      const totalOutstanding = vRows.reduce((s, r) => s + r.outstanding, 0) + bRows.reduce((s, r) => s + r.outstanding, 0);
      return {
        summary: [
          { label: 'Active Vehicle Loans', value: String(activeV) },
          { label: 'Active Business Loans', value: String(activeB) },
          { label: 'Total Active Monthly EMI', value: money(totalMonthlyEmi) },
          { label: 'Total Outstanding Amount', value: money(totalOutstanding) }
        ],
        sections: [
          {
            heading: 'Vehicle Loans',
            columns: ['Reg No', 'Financer', 'Loan Amount', 'Monthly EMI', 'Tenure', 'EMI Paid', 'EMI Pending', 'O/S Amount', 'Due Date', 'Status'],
            rows: vRows.map(r => [r.l.regNo, r.l.financer, r.l.loanAmount || 0, r.l.monthlyEmi || 0, r.l.tenure || 0, r.monthsCompleted, r.emiPending, r.outstanding, r.dueDate, r.status])
          },
          {
            heading: 'Business Loans',
            columns: ['Financer', 'Loan Type', 'Sanctioned Amount', 'Monthly EMI', 'Tenure', 'EMI Paid', 'EMI Pending', 'O/S Amount', 'Due Date', 'Status'],
            rows: bRows.map(r => [r.l.financer, r.l.loanType, r.l.sanctionedAmount || 0, r.l.emiMonthly || 0, r.l.tenure || 0, r.monthsCompleted, r.emiPending, r.outstanding, r.dueDate, r.status])
          }
        ]
      };
    }

    case 'billing': {
      // 2026-09-10 direct request: KCM Insta Services / KCM Supply Chain
      // Solutions shown and downloadable separately, never merged into one
      // combined report - matches Billing.tsx's own activeCompany tab
      // exactly (same field, same default-to-Insta rule). Figures use the
      // same live-computed effectiveInvoiceAmount/Status Billing.tsx's own
      // KPIs use, not the legacy raw amount/status fields.
      const entity = (filter.entity as 'KCM Insta' | 'KCM Supply') || 'KCM Insta';
      const invoicesInRange = props.invoices.filter(i => isDateInRange(i.date, range) && (i.company || 'KCM Insta') === entity);
      const total = invoicesInRange.reduce((s, i) => s + effectiveInvoiceAmount(i), 0);
      const paid = invoicesInRange.filter(i => effectiveInvoiceStatus(i) === 'Cleared').reduce((s, i) => s + effectiveInvoiceAmount(i), 0);
      const pending = invoicesInRange.filter(i => effectiveInvoiceStatus(i) === 'Pending').reduce((s, i) => s + effectiveInvoiceAmount(i), 0);
      const overdue = invoicesInRange.filter(i => effectiveInvoiceStatus(i) === 'Overdue').reduce((s, i) => s + effectiveInvoiceAmount(i), 0);
      const shortPayment = invoicesInRange.filter(i => effectiveInvoiceStatus(i) === 'Short Payment').reduce((s, i) => s + effectiveInvoiceAmount(i), 0);
      return {
        summary: [
          { label: 'Total Invoiced', value: money(total) },
          { label: 'Cleared', value: money(paid) },
          { label: 'Pending', value: money(pending) },
          { label: 'Overdue', value: money(overdue) },
          { label: 'Short Payment', value: money(shortPayment) }
        ],
        sections: [
          {
            heading: `Invoices - ${BILLING_ENTITY_OPTIONS.find(o => o.value === entity)?.label}`,
            columns: ['Date', 'Invoice No', 'Customer', 'Entity', 'Amount', 'Amount Receivable', 'Amount Received', 'Status'],
            rows: invoicesInRange.map(i => [i.date, i.invoiceNo, i.customerName, i.entity || '-', effectiveInvoiceAmount(i), i.amountReceivable || 0, i.amountReceived || 0, effectiveInvoiceStatus(i)])
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
            // 2026-09-10 direct request: mirrors WarehouseDetails.tsx's own
            // export field-for-field (handleExportCSV) - stored per-entry
            // values read as-is, never recomputed from current rate config,
            // so historical entries stay correct even if rates change later.
            heading: 'Warehouse Entries',
            columns: [
              'Date', 'Warehouse Name', 'Warehouse City', 'Vehicle Number', 'Vehicle Type', 'Vehicle Category',
              'Deployment Type', 'POD Name', 'POD City', 'Fixed Hours', 'Opening Km', 'Closing Km', 'KM Utilised',
              'Base Rate', 'Fuel Cost', 'Final Base Rate', 'Additional KM Cost', 'Additional Hour Cost',
              'Toll Charges', 'Parking Cost', 'Hybrid Reefer Cost', 'Grand Total', 'Vendor Remarks'
            ],
            rows: entriesInRange.map(e => [
              e.date, e.warehouseName, e.warehouseCity, e.vehicleNumber, e.vehicleType, e.vehicleCategory || '-',
              e.deploymentType || '-', e.pod || '-', e.podCity || '-', e.fixedHours || 0, e.openingKm || 0, e.closingKm || 0, e.kmUtilised || 0,
              e.baseRate || 0, e.fuelCost || 0, e.finalBaseRate || 0, e.additionalKmCost || 0, e.additionalHourCost || 0,
              e.tollCharges || 0, e.parkingCost || 0, e.hybridReeferCost || 0, e.grandTotal || 0, e.vendorRemarks || '-'
            ])
          }
        ]
      };
    }

    case 'hr': {
      // 2026-09-10 direct request: full/On-Roll-only/Contract-only download,
      // each with Gross/Deductions/Net/Total Paying Amount matching HR &
      // Payroll's own calculation exactly - these already come straight off
      // /api/staff/provident-fund's server-computed fields (server.ts's
      // Salary Breakup formula, the one true source), never recomputed here.
      const employeeType = filter.employeeType || 'All';
      const employmentTypeOf = (empId: string) => props.employees.find(e => e.id === empId)?.employmentType || 'On-Roll';
      const matchesType = (empId: string) => employeeType === 'All' || employmentTypeOf(empId) === employeeType;

      const employeesFiltered = props.employees.filter(e => employeeType === 'All' || (e.employmentType || 'On-Roll') === employeeType);
      const activeEmployees = employeesFiltered.filter(e => e.status === 'Active');
      const attendanceInRange = hrExtra.staffAttendance.filter((a: any) => isDateInRange(a.date, range) && matchesType(a.empId));
      const payrollInRange = hrExtra.staffPayroll.filter((p: any) => isMonthInRange(p.month, range) && matchesType(p.empId));
      const presentDays = attendanceInRange.filter((a: any) => a.status === 'Present').length;
      const lopDaysCount = attendanceInRange.filter((a: any) => a.status === 'AbsentLOP').length;
      const totalGross = payrollInRange.reduce((s: number, p: any) => s + (p.totalEarnings || 0), 0);
      const totalDeductions = payrollInRange.reduce((s: number, p: any) => s + (p.totalDeductions || 0), 0);
      const totalPayingAmount = payrollInRange.reduce((s: number, p: any) => s + (p.netSalary || 0), 0);
      const empName = (empId: string) => props.employees.find(e => e.id === empId)?.name || empId;
      return {
        summary: [
          { label: 'Active Headcount', value: String(activeEmployees.length) },
          { label: 'Present Days (period)', value: String(presentDays) },
          { label: 'LOP Days (period)', value: String(lopDaysCount) },
          { label: 'Total Gross Salary', value: money(totalGross) },
          { label: 'Total Deductions', value: money(totalDeductions) },
          { label: 'Total Paying Amount', value: money(totalPayingAmount) }
        ],
        sections: [
          {
            heading: 'Payroll (by month)', columns: ['Emp ID', 'Name', 'Employment Type', 'Month', 'Gross Salary', 'Deductions', 'Net Salary'],
            rows: payrollInRange.map((p: any) => [p.empId, empName(p.empId), employmentTypeOf(p.empId), p.month, Math.round(p.totalEarnings || 0), Math.round(p.totalDeductions || 0), Math.round(p.netSalary || 0)])
          },
          {
            heading: 'Employee Master', columns: ['Emp ID', 'Name', 'Designation', 'Employment Type', 'Status', 'Org Unit'],
            rows: employeesFiltered.map(e => [e.id, e.name, e.designation || '-', e.employmentType || 'On-Roll', e.status, e.orgUnit])
          }
        ]
      };
    }
  }
}

// Small reusable pill-button row for the extra per-module filters below -
// same visual language as the existing period pills (Reports.tsx's own
// established pattern) so a new filter dimension never looks bolted-on.
function FilterPillRow({ options, selected, onSelect, theme }: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
  theme: { btn: string };
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onSelect(o.value)}
          className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors text-[10px] ${
            selected === o.value ? `${theme.btn} text-white` : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PETTY_CASH_HOLDER_PILL_OPTIONS = [
  { value: 'All', label: 'All' },
  ...PETTY_CASH_USERS.map(u => ({ value: u.username, label: u.label }))
];

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

  // Per-module extra filter (Bunk/Card, On-Roll/Contract, entity, holder,
  // sub-module - see defaultFilterState) - same "no mismatch" guarantee as
  // cardRanges: reportFor() below is the single call site for View, both
  // Download formats, and Share, so this is automatically what every one of
  // those shows/exports, never something a download path could drift from.
  const [cardFilters, setCardFilters] = useState<Record<ModuleKey, CardFilterState>>(() => {
    const init = {} as Record<ModuleKey, CardFilterState>;
    MODULES.forEach(m => { init[m.key] = defaultFilterState(m.key); });
    return init;
  });
  const updateCardFilter = (key: ModuleKey, patch: CardFilterState) =>
    setCardFilters(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

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

  // Driver Details' Attendance section (2026-09-10 direct request) - same
  // fetch-once-on-mount pattern as HR & Payroll's data above; Driver
  // Attendance isn't otherwise part of this portal's shared Administration
  // state either.
  const [driverAttendance, setDriverAttendance] = useState<DriverAttendance[]>([]);
  useEffect(() => {
    if (!isSuperAdmin) return;
    authFetch('/api/drivers/attendance').then(r => r.ok ? r.json() : [])
      .then(data => setDriverAttendance(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to load Driver Attendance report data:', err));
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
  const reportFor = (key: ModuleKey): ModuleReport => buildReport(key, props, rangeFor(key), { staffAttendance, staffPayroll }, driverAttendance, cardFilters[key]);

  // 2026-09-10 direct request: whatever filter is active on screen must be
  // exactly what's in the download - the filename/subtitle spelling it out
  // too means it's never ambiguous which selection a saved file represents,
  // even after it's been downloaded and renamed/moved.
  const filterLabelFor = (key: ModuleKey): string | null => {
    const f = cardFilters[key];
    switch (key) {
      case 'fuel': case 'mileage': return f.source && f.source !== 'All' ? f.source : null;
      case 'hr': return f.employeeType && f.employeeType !== 'All' ? f.employeeType : null;
      case 'billing': return BILLING_ENTITY_OPTIONS.find(o => o.value === f.entity)?.label || null;
      case 'pettycash': {
        const holderLabel = f.holder && f.holder !== 'All' ? PETTY_CASH_HOLDER_PILL_OPTIONS.find(o => o.value === f.holder)?.label : null;
        return [f.reportType, holderLabel].filter(Boolean).join(' - ') || null;
      }
      case 'maintenance': return f.subModule || null;
      default: return null;
    }
  };

  const exportMetaFor = (meta: ModuleMeta) => {
    const range = rangeFor(meta.key);
    const filterLabel = filterLabelFor(meta.key);
    const filenameParts = [
      `KCM_Report_${meta.label.replace(/[^a-zA-Z0-9]+/g, '_')}`,
      filterLabel ? filterLabel.replace(/[^a-zA-Z0-9]+/g, '_') : null,
      meta.dateFiltered ? range.label.replace(/[^a-zA-Z0-9]+/g, '_') : 'Snapshot'
    ].filter(Boolean);
    const filenameBase = filenameParts.join('_');
    const subtitle = [
      filterLabel ? `Filter: ${filterLabel}` : null,
      meta.dateFiltered ? `Period: ${range.label} (${range.start} to ${range.end})` : 'Current snapshot'
    ].filter(Boolean).join(' | ');
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

              {/* Extra per-module filter dimension (2026-09-10 direct
                  request) - narrows both the on-screen View and every
                  download/share the same way, since they all read this same
                  cardFilters state via reportFor(). */}
              {(meta.key === 'fuel' || meta.key === 'mileage') && (
                <FilterPillRow
                  theme={theme}
                  options={FUEL_SOURCE_OPTIONS.map(v => ({ value: v, label: v }))}
                  selected={cardFilters[meta.key].source}
                  onSelect={(source) => updateCardFilter(meta.key, { source })}
                />
              )}
              {meta.key === 'hr' && (
                <FilterPillRow
                  theme={theme}
                  options={HR_EMPLOYEE_TYPE_OPTIONS.map(v => ({ value: v, label: v }))}
                  selected={cardFilters.hr.employeeType}
                  onSelect={(employeeType) => updateCardFilter('hr', { employeeType })}
                />
              )}
              {meta.key === 'billing' && (
                <FilterPillRow
                  theme={theme}
                  options={BILLING_ENTITY_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                  selected={cardFilters.billing.entity}
                  onSelect={(entity) => updateCardFilter('billing', { entity })}
                />
              )}
              {meta.key === 'pettycash' && (
                <div className="space-y-1">
                  <FilterPillRow
                    theme={theme}
                    options={PETTY_CASH_REPORT_TYPE_OPTIONS.map(v => ({ value: v, label: v }))}
                    selected={cardFilters.pettycash.reportType}
                    onSelect={(reportType) => updateCardFilter('pettycash', { reportType })}
                  />
                  <FilterPillRow
                    theme={theme}
                    options={PETTY_CASH_HOLDER_PILL_OPTIONS}
                    selected={cardFilters.pettycash.holder}
                    onSelect={(holder) => updateCardFilter('pettycash', { holder })}
                  />
                </div>
              )}
              {meta.key === 'maintenance' && (
                <FilterPillRow
                  theme={theme}
                  options={MAINTENANCE_SUBMODULE_OPTIONS.map(v => ({ value: v, label: v }))}
                  selected={cardFilters.maintenance.subModule}
                  onSelect={(subModule) => updateCardFilter('maintenance', { subModule })}
                />
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
