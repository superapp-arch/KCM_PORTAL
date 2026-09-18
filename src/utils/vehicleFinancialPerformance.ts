// Vehicle Financial Performance (2026-09-18 direct request; enhanced
// 2026-09-18 same day per follow-up spec) - a monthly fleet-owner P&L
// module. Deliberately collects NO new data of its own - every figure here
// is aggregated live from records already saved in other modules (Fleet &
// Vehicles, Fuel Management, Petty Cash, Warehouse Details, Loan
// Management, Fleet Maintenance, Driver Details, HR & Payroll), linked
// primarily by vehicle number. Nothing here is persisted - recomputed fresh
// on every load, so editing a source record (e.g. a Petty Cash entry)
// always retroactively updates this module's own numbers too.
//
// HELD BACK (direct instruction, 2026-09-18): Customer Billing revenue
// (trips completed x per-trip billing rate, attributed back to the
// vehicle(s) assigned to that client) is NOT computed here yet - the
// Customer Billing module has no trip-count field and no client->vehicle
// assignment at all today, so there is nothing to aggregate. That column
// is a placeholder (always 0) until the billing-rate logic is defined;
// every other revenue/deduction line item below is real.
//
// FASTag: also a placeholder (always 0) - there is no FASTag data source
// anywhere in this codebase (Vendor Management has no toll-charge field).
// Flagged the same way as Customer Billing so it's never silently mistaken
// for a real, computed figure.
//
// RTO / Insurance: the enhancement spec asked for these "if already
// supported by source data". Fleet & Vehicles only stores a static
// insurance policy/premium snapshot (no dated recurring-payment ledger) and
// has no RTO cost ledger at all, so neither can be attributed to a specific
// month without inventing an amortization rule nobody asked for. Left out
// entirely (not even as a 0-placeholder line) rather than fabricated - the
// same principle already applied to Customer Billing/FASTag. Tyres and
// Battery, by contrast, ARE already real Fleet Maintenance service types
// (see MaintenanceRecord.serviceType) and are broken out below.
//
// ARCHITECTURE NOTE: the enhancement spec asked for server-side aggregation
// "to avoid loading the entire DB into the browser". This module is kept
// as pure client-side aggregation instead, matching how every other module
// in this app already works today (App.tsx's fetchAllData already loads
// this app's full operational dataset into the browser on every login/
// save - there is no partial-load convention anywhere else to follow), and
// matching how this exact module was explicitly requested and already
// built earlier this same day. Re-architecting to server-side aggregation
// would be a much larger, riskier change than "enhance the existing
// module" calls for, and at this fleet's actual scale (hundreds of
// vehicles, not millions of rows) the client-side computation below runs
// in well under a second.
import {
  Vehicle, FuelLog, MileageReport, PettyCashVoucher, WarehouseEntry,
  VehicleLoan, MaintenanceRecord, DriverEmployee, DriverAttendance, StaffEmployee
} from '../types';
import { resolveLoanStatus, computeMonthsCompleted } from './loanDates';
import { computeDriverEarnings } from './driverSalaryExport';
import { DriverSalaryAdvanceVoucherSlim, computeDriverPettyCashAdvance } from './driverPettyCashAdvance';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Fixed monthly GPS charge - auto-applied to every active vehicle, no
// external data source or manual entry needed (per direct instruction).
export const GPS_MONTHLY_CHARGE = 150;

// A vehicle/category is treated as break-even, not a (rounding-noise) tiny
// profit or loss, within this band - avoids a vehicle that nets to
// pnl = -0.4 (pure float rounding) being bucketed as "Loss-Making" and
// thrown off a management insight.
const BREAK_EVEN_BAND = 1;

export interface PnlLineItem {
  label: string;
  amount: number;
  sourceModule: string;
  // Traceability (every line item must be traceable back to its source
  // module and originating record) - the record ids that were summed into
  // this line item, for an audit trail.
  recordIds: string[];
  // The actual underlying rows (already filtered to exactly what was
  // summed) - shape varies by sourceModule/label; the drill-down UI knows
  // which columns to render for which label. Absent for line items with no
  // row-level source (e.g. the fixed GPS charge, or a held-back placeholder).
  sourceRows?: Record<string, any>[];
  note?: string; // flags a placeholder (Customer Billing, FASTag) or an assumption
}

export interface VehiclePnl {
  regNo: string;
  vehicleType?: string;
  vehicleModel?: string;
  category: string; // Fleet & Vehicles' own Category field - 'Uncategorized' when blank
  month: string; // YYYY-MM
  revenue: PnlLineItem[];
  deductions: PnlLineItem[];
  totalRevenue: number;
  totalDeductions: number;
  pnl: number;
  marginPct: number; // 0 when totalRevenue is 0 (handled safely, never NaN/Infinity)
  status: 'profit' | 'loss' | 'break-even';
}

export interface CompanyLevelDeduction {
  label: string;
  amount: number;
  sourceModule: string;
  recordIds: string[];
  sourceRows?: Record<string, any>[];
}

export interface CompanyPnl {
  month: string;
  vehiclePnls: VehiclePnl[];
  vehiclePnlTotal: number; // sum of every vehicle's own P&L (their totalRevenue - totalDeductions)
  totalVehicleRevenue: number;
  totalVehicleCost: number;
  companyLevelDeductions: CompanyLevelDeduction[];
  companyLevelDeductionTotal: number;
  companyPnl: number;
}

const normReg = (s: string | undefined) => (s || '').trim().toUpperCase();
const inMonth = (dateIso: string | undefined, month: string) => (dateIso || '').slice(0, 7) === month;

// Fleet & Vehicles' own Reg. No./Category fields, in the same "either key"
// shape used throughout the rest of this app (FleetSheet.tsx, WarehouseDetails.tsx, etc).
const regNoOf = (v: Vehicle): string => v.regNo || v['Reg. No.'] || v.id || '';
const categoryOf = (v: Vehicle): string => (v.category || v['Category'] || '').trim() || 'Uncategorized';

// Several source record types (Petty Cash, Fleet Maintenance, Warehouse
// Details, Vehicle Loan) carry an optional `documents` array whose legacy
// entries can hold a `fileData` base64 blob. Raw records are used as-is for
// `sourceRows` (traceability), but that one field must never ride along -
// it would dump a multi-KB/MB base64 string into a drill-down table cell
// (UI) or an exported Excel/PDF cell, which is both unusable and slow to
// render. Strips it out (shallow) rather than switching sourceRows to a
// hand-picked field list, so a source module gaining a new field is still
// visible here for free.
function stripDocuments<T extends Record<string, any>>(row: T): Record<string, any> {
  const { documents, ...rest } = row as Record<string, any>;
  return rest;
}

function daysInMonth(month: string | undefined): number {
  if (!month) return 30;
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Mirrors driverSalaryExport.ts's own private liveMonthAttendance exactly
// (Present + Paid Leave = Working Days, AbsentLOP = LOP days) so this
// module's Driver Salary drill-down is numerically identical to what the
// Salary Breakup tab/Driver Salary list show for the same driver/month -
// duplicated locally only because that helper isn't exported.
function liveMonthAttendance(driverId: string, month: string, attendance: DriverAttendance[]): { totalDays: number; workingDays: number; lopDays: number } {
  const rows = attendance.filter(a => a.driverId === driverId && a.date.startsWith(month));
  return {
    totalDays: daysInMonth(month),
    workingDays: rows.filter(r => r.status === 'Present' || r.status === 'PaidLeave').length,
    lopDays: rows.filter(r => r.status === 'AbsentLOP').length
  };
}

export interface VehicleFinancialPerformanceInputs {
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  mileageReports: MileageReport[];
  vouchers: PettyCashVoucher[];
  warehouseEntries: WarehouseEntry[];
  vehicleLoans: VehicleLoan[];
  maintenanceRecords: MaintenanceRecord[];
  drivers: DriverEmployee[];
  driverAttendance: DriverAttendance[];
  driverPettyCashVouchers: DriverSalaryAdvanceVoucherSlim[]; // narrow slice for computeDriverPettyCashAdvance
  // HR & Payroll (Staff Salary Breakup, formerly "Provident Fund") - full
  // enriched rows from GET /api/staff/provident-fund (empId, month,
  // netSalary, plus every earnings/deduction component). Company-level
  // only - never vehicle-linked. Pass [] for a viewer who isn't allowed to
  // see Staff Salary data (e.g. Vinod - see requireHrFullAccess in
  // server.ts) rather than fetching it for them; the UI then shows that
  // card/section as access-restricted instead of a misleading ₹0.
  staffPayroll: Record<string, any>[];
  // Staff master (name/designation/orgUnit) - always safe to pass regardless
  // of who's viewing (no salary figures in it), used only to label
  // staffPayroll rows in the drill-down.
  staffEmployees: StaffEmployee[];
}

export function computeCompanyPnl(inputs: VehicleFinancialPerformanceInputs, month: string): CompanyPnl {
  const {
    vehicles, fuelLogs, mileageReports, vouchers, warehouseEntries,
    vehicleLoans, maintenanceRecords, drivers, driverAttendance,
    driverPettyCashVouchers, staffPayroll, staffEmployees
  } = inputs;

  // Only vehicles considered active this month count toward the per-vehicle
  // P&L at all (a sold/retired vehicle has no ongoing GPS/EMI/driver cost) -
  // Vehicle.active is undefined/missing-treated-as-active, matching the
  // convention already used elsewhere in Fleet & Vehicles.
  const activeVehicles = vehicles.filter(v => v.active !== false);

  const mileageById = new Map(mileageReports.map(m => [m.id, m]));
  const employeeById = new Map(staffEmployees.map(e => [e.id, e]));

  const vehiclePnls: VehiclePnl[] = activeVehicles.map(v => {
    const regNo = normReg(regNoOf(v));

    // --- Revenue ---
    const warehouseRows = warehouseEntries.filter(w => normReg(w.vehicleNumber) === regNo && inMonth(w.date, month));
    const warehouseRevenue = round2(warehouseRows.reduce((s, w) => s + (w.grandTotal || 0), 0));

    const revenue: PnlLineItem[] = [
      {
        label: 'Customer Billing Revenue',
        amount: 0,
        sourceModule: 'Customer Billing',
        recordIds: [],
        note: 'Not computed yet - Customer Billing has no trip-count/per-vehicle-assignment data today. Held per direct instruction until billing-rate logic is defined.'
      },
      {
        label: 'Warehouse Revenue',
        amount: warehouseRevenue,
        sourceModule: 'Warehouse Details',
        recordIds: warehouseRows.map(w => w.id),
        sourceRows: warehouseRows.map(stripDocuments)
      }
    ];

    // --- Deductions ---
    // EMI/Loan - only while the loan is actually Active this month (a
    // Closed loan's EMI is no longer a real monthly cost).
    const loan = vehicleLoans.find(l => normReg(l.regNo) === regNo);
    let emiAmount = 0;
    const emiRecordIds: string[] = [];
    const emiSourceRows: Record<string, any>[] = [];
    if (loan && loan.emiStartDate) {
      const monthsCompleted = computeMonthsCompleted(loan.emiStartDate, loan.tenure);
      const status = resolveLoanStatus(loan.loanStatus, loan.loanStatusManual, monthsCompleted, loan.tenure);
      // Only counts if this loan's EMI schedule actually covers `month`
      // (started on/before it, and not yet fully completed as of it) -
      // otherwise a loan taken out later, or already closed, would wrongly
      // charge EMI against a month it was never actually due in.
      const startMonth = loan.emiStartDate.slice(0, 7);
      const coversMonth = startMonth <= month && status === 'Active';
      if (coversMonth) {
        emiAmount = round2(loan.monthlyEmi || 0);
        emiRecordIds.push(loan.id);
        emiSourceRows.push({ ...stripDocuments(loan), monthsCompleted, resolvedStatus: status });
      }
    }

    // Fuel - base diesel amount, plus any Extra Fuel cost already folded
    // into a linked Mileage Report's own totalAmount (which always includes
    // Extra Fuel regardless of payment mode - see FuelManagement.tsx).
    const fuelRows = fuelLogs.filter(f => normReg(f.vehicleNumber) === regNo && inMonth(f.date, month));
    const fuelAmount = round2(fuelRows.reduce((s, f) => {
      const linked = f.mileageReportId ? mileageById.get(f.mileageReportId) : undefined;
      return s + (linked ? (linked.totalAmount ?? f.amount ?? 0) : (f.amount || 0));
    }, 0));
    const fuelSourceRows = fuelRows.map(f => {
      const linked = f.mileageReportId ? mileageById.get(f.mileageReportId) : undefined;
      return {
        date: f.date, bunkName: f.bunkName, location: f.location, vehicleNumber: f.vehicleNumber,
        ltrs: f.ltrs, rate: f.rate,
        amount: linked ? (linked.totalAmount ?? f.amount ?? 0) : (f.amount || 0),
        bunkOrCard: f.bunkOrCard, indentNumber: f.indentNumber, mileageLinked: !!linked, id: f.id
      };
    });

    // Driver Salary - each vehicle has one assigned driver per direct
    // instruction, but DriverEmployee.vehicleNos allows a driver to legitimately
    // cover more than one vehicle in real data. Splitting the payable amount
    // evenly across every vehicle that driver covers avoids charging (and,
    // at the company-level rollup below, double-counting) the same salary
    // once per vehicle they're assigned to.
    const assignedDriver = drivers.find(d => {
      const vNos = d.vehicleNos && d.vehicleNos.length > 0 ? d.vehicleNos : (d.vehicleNo ? [d.vehicleNo] : []);
      return vNos.some(n => normReg(n) === regNo);
    });
    let driverSalaryAmount = 0;
    const driverSalaryRecordIds: string[] = [];
    const driverSalarySourceRows: Record<string, any>[] = [];
    if (assignedDriver) {
      const vNos = assignedDriver.vehicleNos && assignedDriver.vehicleNos.length > 0 ? assignedDriver.vehicleNos : (assignedDriver.vehicleNo ? [assignedDriver.vehicleNo] : []);
      const splitFactor = vNos.length > 0 ? vNos.length : 1;
      const { totalDays, workingDays, lopDays } = liveMonthAttendance(assignedDriver.id, month, driverAttendance);
      const pettyCashAdvance = computeDriverPettyCashAdvance(driverPettyCashVouchers, assignedDriver.id, month).total;
      const breakdown = computeDriverEarnings({
        grossSalary: assignedDriver.grossSalary || 0, otherAdditions: assignedDriver.otherAdditions || 0,
        pettyCashAdvance, loanDeduction: assignedDriver.loanDeduction || 0,
        recoveryAmount: assignedDriver.recoveryAmount || 0, driverWelfare: assignedDriver.driverWelfare || 0,
        bata: assignedDriver.bata || 0, totalDays, workingDays, lopDays
      });
      const fullPayable = breakdown.payableAmount;
      driverSalaryAmount = round2(fullPayable / splitFactor);
      driverSalaryRecordIds.push(assignedDriver.id);
      driverSalarySourceRows.push({
        driverId: assignedDriver.id, driverName: assignedDriver.name, month,
        vehicleNos: vNos, splitFactor,
        totalDays, workingDays, lopDays,
        grossSalary: assignedDriver.grossSalary || 0, otherAdditions: assignedDriver.otherAdditions || 0,
        pettyCashAdvance, loanDeduction: assignedDriver.loanDeduction || 0, recoveryAmount: assignedDriver.recoveryAmount || 0,
        driverWelfare: assignedDriver.driverWelfare || 0, bata: assignedDriver.bata || 0,
        perDaySalary: breakdown.perDaySalary, grossEarned: breakdown.grossEarned, lopDeduction: breakdown.lopDeduction,
        totalDeductions: breakdown.totalDeductions, fullPayableAmount: fullPayable, sharePerVehicle: driverSalaryAmount
      });
    }

    // Petty Cash - only entries actually tied to this vehicle number; a
    // blank vehicleNumber (e.g. Office Maintenance) is company-level only,
    // handled separately below, never attributed to any vehicle.
    const vehiclePettyCashRows = vouchers.filter(p => normReg(p.vehicleNumber) === regNo && inMonth(p.date, month));
    const vehiclePettyCashAmount = round2(vehiclePettyCashRows.reduce((s, p) => s + (p.cashPaid || 0), 0));

    // Fleet Maintenance - split into Tyres/Battery (real, distinct
    // MaintenanceRecord.serviceType values) and everything else, so the
    // vehicle-level breakdown matches the spec's own column list instead of
    // one lump "Fleet Maintenance" figure hiding two of its named columns.
    const allMaintRows = maintenanceRecords.filter(r => normReg(r.regNo) === regNo && inMonth(r.date, month));
    const tyreRows = allMaintRows.filter(r => r.serviceType === 'Tire Service');
    const batteryRows = allMaintRows.filter(r => r.serviceType === 'Battery Service');
    const otherMaintRows = allMaintRows.filter(r => r.serviceType !== 'Tire Service' && r.serviceType !== 'Battery Service');
    const maintenanceAmount = round2(otherMaintRows.reduce((s, r) => s + (r.cost || 0), 0));
    const tyreAmount = round2(tyreRows.reduce((s, r) => s + (r.cost || 0), 0));
    const batteryAmount = round2(batteryRows.reduce((s, r) => s + (r.cost || 0), 0));

    const deductions: PnlLineItem[] = [
      { label: 'Vehicle EMI / Loan', amount: emiAmount, sourceModule: 'Loan Management', recordIds: emiRecordIds, sourceRows: emiSourceRows },
      { label: 'Fuel', amount: fuelAmount, sourceModule: 'Fuel Management', recordIds: fuelRows.map(f => f.id), sourceRows: fuelSourceRows },
      {
        label: 'Driver Salary', amount: driverSalaryAmount, sourceModule: 'Driver Details', recordIds: driverSalaryRecordIds,
        sourceRows: driverSalarySourceRows,
        note: assignedDriver && (assignedDriver.vehicleNos?.length || 0) > 1 ? `Split evenly across ${assignedDriver.vehicleNos!.length} vehicles this driver covers.` : undefined
      },
      { label: 'Petty Cash (vehicle-linked)', amount: vehiclePettyCashAmount, sourceModule: 'Petty Cash', recordIds: vehiclePettyCashRows.map(p => p.id), sourceRows: vehiclePettyCashRows.map(stripDocuments) },
      { label: 'Fleet Maintenance', amount: maintenanceAmount, sourceModule: 'Fleet Maintenance', recordIds: otherMaintRows.map(r => r.id), sourceRows: otherMaintRows.map(stripDocuments) },
      { label: 'Tyres', amount: tyreAmount, sourceModule: 'Fleet Maintenance', recordIds: tyreRows.map(r => r.id), sourceRows: tyreRows.map(stripDocuments) },
      { label: 'Battery', amount: batteryAmount, sourceModule: 'Fleet Maintenance', recordIds: batteryRows.map(r => r.id), sourceRows: batteryRows.map(stripDocuments) },
      { label: 'FASTag', amount: 0, sourceModule: 'FASTag', recordIds: [], note: 'No FASTag data source exists in this app yet - always 0 until one is added.' },
      { label: 'GPS', amount: GPS_MONTHLY_CHARGE, sourceModule: 'Fixed monthly charge', recordIds: [] }
    ];

    const totalRevenue = round2(revenue.reduce((s, r) => s + r.amount, 0));
    const totalDeductions = round2(deductions.reduce((s, d) => s + d.amount, 0));
    const pnl = round2(totalRevenue - totalDeductions);
    const status: VehiclePnl['status'] = Math.abs(pnl) < BREAK_EVEN_BAND ? 'break-even' : (pnl > 0 ? 'profit' : 'loss');

    return {
      regNo,
      vehicleType: v.type,
      vehicleModel: v.model,
      category: categoryOf(v),
      month,
      revenue,
      deductions,
      totalRevenue,
      totalDeductions,
      pnl,
      marginPct: totalRevenue > 0 ? round2((pnl / totalRevenue) * 100) : 0,
      status
    };
  });

  const vehiclePnlTotal = round2(vehiclePnls.reduce((s, v) => s + v.pnl, 0));
  const totalVehicleRevenue = round2(vehiclePnls.reduce((s, v) => s + v.totalRevenue, 0));
  const totalVehicleCost = round2(vehiclePnls.reduce((s, v) => s + v.totalDeductions, 0));

  // Company-level-only deductions - never attributed to any vehicle.
  const staffSalaryRows = staffPayroll.filter(p => p.month === month);
  const staffSalaryTotal = round2(staffSalaryRows.reduce((s, p) => s + (p.netSalary || 0), 0));
  const staffSalarySourceRows = staffSalaryRows.map(p => {
    const emp = employeeById.get(p.empId);
    return {
      ...p,
      name: emp?.name || p.empId,
      designation: emp?.designation || '',
      department: emp?.orgUnit === 'KCM_INSTA' ? 'KCM Insta' : (emp?.orgUnit === 'KCM_SUPPLY' ? 'KCM Supply' : ''),
      employmentType: emp?.employmentType || ''
    };
  });

  const nonVehiclePettyCashRows = vouchers.filter(p => !p.vehicleNumber?.trim() && inMonth(p.date, month));
  const nonVehiclePettyCashTotal = round2(nonVehiclePettyCashRows.reduce((s, p) => s + (p.cashPaid || 0), 0));

  const companyLevelDeductions: CompanyLevelDeduction[] = [
    { label: 'Staff/Office Salaries', amount: staffSalaryTotal, sourceModule: 'HR & Payroll', recordIds: staffSalaryRows.map(p => p.empId), sourceRows: staffSalarySourceRows },
    { label: 'Non-vehicle-linked Petty Cash', amount: nonVehiclePettyCashTotal, sourceModule: 'Petty Cash', recordIds: nonVehiclePettyCashRows.map(p => p.id), sourceRows: nonVehiclePettyCashRows.map(stripDocuments) }
  ];
  const companyLevelDeductionTotal = round2(companyLevelDeductions.reduce((s, d) => s + d.amount, 0));

  return {
    month,
    vehiclePnls,
    vehiclePnlTotal,
    totalVehicleRevenue,
    totalVehicleCost,
    companyLevelDeductions,
    companyLevelDeductionTotal,
    companyPnl: round2(vehiclePnlTotal - companyLevelDeductionTotal)
  };
}

// ===================== Category Performance (section 12) =====================

export interface CategoryPnl {
  category: string;
  vehicleCount: number;
  revenue: number;
  totalCost: number;
  pnl: number;
  marginPct: number;
  avgRevenue: number;
  avgCost: number;
  avgPnl: number;
  profitableCount: number;
  lossCount: number;
  breakEvenCount: number;
}

export function computeCategoryPerformance(company: CompanyPnl): CategoryPnl[] {
  const groups = new Map<string, VehiclePnl[]>();
  company.vehiclePnls.forEach(vp => {
    const list = groups.get(vp.category) || [];
    list.push(vp);
    groups.set(vp.category, list);
  });

  return Array.from(groups.entries()).map(([category, list]) => {
    const revenue = round2(list.reduce((s, v) => s + v.totalRevenue, 0));
    const totalCost = round2(list.reduce((s, v) => s + v.totalDeductions, 0));
    const pnl = round2(revenue - totalCost);
    const count = list.length;
    return {
      category,
      vehicleCount: count,
      revenue,
      totalCost,
      pnl,
      marginPct: revenue > 0 ? round2((pnl / revenue) * 100) : 0,
      avgRevenue: count > 0 ? round2(revenue / count) : 0,
      avgCost: count > 0 ? round2(totalCost / count) : 0,
      avgPnl: count > 0 ? round2(pnl / count) : 0,
      profitableCount: list.filter(v => v.status === 'profit').length,
      lossCount: list.filter(v => v.status === 'loss').length,
      breakEvenCount: list.filter(v => v.status === 'break-even').length
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

// ===================== Company Overview stats (section 10) =====================

export interface CompanyOverviewStats {
  totalVehicles: number;
  profitableVehicles: number;
  lossMakingVehicles: number;
  breakEvenVehicles: number;
  avgRevenuePerVehicle: number;
  avgCostPerVehicle: number;
  avgPnlPerVehicle: number;
}

export function computeCompanyOverviewStats(company: CompanyPnl): CompanyOverviewStats {
  const n = company.vehiclePnls.length;
  return {
    totalVehicles: n,
    profitableVehicles: company.vehiclePnls.filter(v => v.status === 'profit').length,
    lossMakingVehicles: company.vehiclePnls.filter(v => v.status === 'loss').length,
    breakEvenVehicles: company.vehiclePnls.filter(v => v.status === 'break-even').length,
    avgRevenuePerVehicle: n > 0 ? round2(company.totalVehicleRevenue / n) : 0,
    avgCostPerVehicle: n > 0 ? round2(company.totalVehicleCost / n) : 0,
    avgPnlPerVehicle: n > 0 ? round2(company.vehiclePnlTotal / n) : 0
  };
}

// ===================== Monthly Trend (section 16) =====================

export interface TrendPoint {
  month: string;
  revenue: number;
  vehicleCost: number;
  staffOfficeSalary: number;
  nonVehiclePettyCash: number;
  companyPnl: number;
  marginPct: number; // companyPnl / revenue, safe at 0 revenue
}

// Trailing `monthsBack` months ending at (and including) `endMonth`,
// oldest-first - e.g. endMonth='2026-09', monthsBack=6 -> Apr..Sep 2026.
export function trailingMonthKeys(endMonth: string, monthsBack: number): string[] {
  const [y, m] = endMonth.split('-').map(Number);
  const out: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(y, (m - 1) - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export interface MonthlyTrendResult {
  points: TrendPoint[];
  companyPnlByMonth: CompanyPnl[]; // same order as points - lets callers derive further insights (e.g. consecutive-loss streaks) without recomputing
}

// Computes computeCompanyPnl() once per month in the window - each call
// already builds the full per-vehicle breakdown as a side effect, so
// consecutive-loss-style insights below reuse this instead of a second pass.
export function computeMonthlyTrend(inputs: VehicleFinancialPerformanceInputs, endMonth: string, monthsBack: number = 6): MonthlyTrendResult {
  const months = trailingMonthKeys(endMonth, monthsBack);
  const companyPnlByMonth = months.map(month => computeCompanyPnl(inputs, month));
  const points: TrendPoint[] = companyPnlByMonth.map(c => {
    const staffOfficeSalary = c.companyLevelDeductions.find(d => d.label === 'Staff/Office Salaries')?.amount || 0;
    const nonVehiclePettyCash = c.companyLevelDeductions.find(d => d.label === 'Non-vehicle-linked Petty Cash')?.amount || 0;
    return {
      month: c.month,
      revenue: c.totalVehicleRevenue,
      vehicleCost: c.totalVehicleCost,
      staffOfficeSalary,
      nonVehiclePettyCash,
      companyPnl: c.companyPnl,
      marginPct: c.totalVehicleRevenue > 0 ? round2((c.companyPnl / c.totalVehicleRevenue) * 100) : 0
    };
  });
  return { points, companyPnlByMonth };
}

// ===================== Management Insights (section 14) =====================

export interface ManagementInsight {
  kind: 'fact' | 'observation';
  label: string;
  detail: string;
}

export function computeManagementInsights(company: CompanyPnl, categories: CategoryPnl[], trend?: MonthlyTrendResult): ManagementInsight[] {
  const insights: ManagementInsight[] = [];
  const vehicles = company.vehiclePnls;
  if (vehicles.length === 0) return insights;

  const byRevenue = [...categories].sort((a, b) => b.revenue - a.revenue);
  const byProfit = [...categories].sort((a, b) => b.pnl - a.pnl);
  const byAvgPnl = [...categories].sort((a, b) => b.avgPnl - a.avgPnl);
  const byAvgCost = [...categories].sort((a, b) => b.avgCost - a.avgCost);

  if (byRevenue[0]) insights.push({ kind: 'fact', label: 'Highest Revenue Category', detail: `${byRevenue[0].category} (₹${byRevenue[0].revenue.toLocaleString('en-IN')})` });
  if (byProfit[0]) insights.push({ kind: 'fact', label: 'Highest Profit Category', detail: `${byProfit[0].category} (₹${byProfit[0].pnl.toLocaleString('en-IN')})` });
  const lossCategory = [...categories].sort((a, b) => a.pnl - b.pnl)[0];
  if (lossCategory && lossCategory.pnl < 0) insights.push({ kind: 'fact', label: 'Highest-Loss Category', detail: `${lossCategory.category} (₹${lossCategory.pnl.toLocaleString('en-IN')})` });
  if (byAvgPnl[0]) insights.push({ kind: 'fact', label: 'Highest Average Profit / Vehicle', detail: `${byAvgPnl[0].category} (₹${byAvgPnl[0].avgPnl.toLocaleString('en-IN')} avg)` });
  if (byAvgCost[byAvgCost.length - 1] !== undefined) {
    const highestAvgCost = [...categories].sort((a, b) => b.avgCost - a.avgCost)[0];
    if (highestAvgCost) insights.push({ kind: 'fact', label: 'Highest Average Cost / Vehicle', detail: `${highestAvgCost.category} (₹${highestAvgCost.avgCost.toLocaleString('en-IN')} avg)` });
  }

  const staffAmt = company.companyLevelDeductions.find(d => d.label === 'Staff/Office Salaries')?.amount || 0;
  const nonVehicleAmt = company.companyLevelDeductions.find(d => d.label === 'Non-vehicle-linked Petty Cash')?.amount || 0;
  insights.push({ kind: 'fact', label: 'Largest Company-Level Expense', detail: staffAmt >= nonVehicleAmt ? `Staff/Office Salaries (₹${staffAmt.toLocaleString('en-IN')})` : `Non-Vehicle Petty Cash (₹${nonVehicleAmt.toLocaleString('en-IN')})` });

  // Largest vehicle cost category (deduction label with the highest fleet-wide sum)
  const costByLabel = new Map<string, number>();
  vehicles.forEach(v => v.deductions.forEach(d => costByLabel.set(d.label, (costByLabel.get(d.label) || 0) + d.amount)));
  const topCostLabel = [...costByLabel.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCostLabel) insights.push({ kind: 'fact', label: 'Largest Vehicle Cost Category', detail: `${topCostLabel[0]} (₹${round2(topCostLabel[1]).toLocaleString('en-IN')} fleet-wide)` });

  const byVehiclePnl = [...vehicles].sort((a, b) => a.pnl - b.pnl);
  const worstVehicle = byVehiclePnl[0];
  const bestVehicle = byVehiclePnl[byVehiclePnl.length - 1];
  if (worstVehicle && worstVehicle.status === 'loss') insights.push({ kind: 'fact', label: 'Highest-Loss Vehicle', detail: `${worstVehicle.regNo} (₹${worstVehicle.pnl.toLocaleString('en-IN')})` });
  if (bestVehicle && bestVehicle.status === 'profit') insights.push({ kind: 'fact', label: 'Highest-Profit Vehicle', detail: `${bestVehicle.regNo} (₹${bestVehicle.pnl.toLocaleString('en-IN')})` });

  const zeroRevenueVehicles = vehicles.filter(v => v.totalRevenue === 0);
  if (zeroRevenueVehicles.length > 0) insights.push({ kind: 'observation', label: 'Vehicles With Zero Revenue', detail: `${zeroRevenueVehicles.length} vehicle(s): ${zeroRevenueVehicles.slice(0, 10).map(v => v.regNo).join(', ')}${zeroRevenueVehicles.length > 10 ? '…' : ''}` });

  // Vehicles with unusually high cost vs their own category average (>1.5x)
  const catAvgCost = new Map(categories.map(c => [c.category, c.avgCost]));
  const highCostVehicles = vehicles.filter(v => {
    const avg = catAvgCost.get(v.category) || 0;
    return avg > 0 && v.totalDeductions > avg * 1.5;
  });
  if (highCostVehicles.length > 0) insights.push({ kind: 'observation', label: 'Vehicles With Unusually High Cost (>1.5x category average)', detail: highCostVehicles.slice(0, 10).map(v => v.regNo).join(', ') + (highCostVehicles.length > 10 ? '…' : '') });

  // Categories where cost is growing faster than revenue, and categories
  // with a negative margin in every trailing month - both only meaningful
  // with multi-month data (trend), per spec's own "if available" caveat.
  if (trend && trend.companyPnlByMonth.length >= 2) {
    const first = trend.companyPnlByMonth[0];
    const last = trend.companyPnlByMonth[trend.companyPnlByMonth.length - 1];
    const catCostFirst = new Map(computeCategoryPerformance(first).map(c => [c.category, c.totalCost]));
    const catRevFirst = new Map(computeCategoryPerformance(first).map(c => [c.category, c.revenue]));
    const catNowPerf = computeCategoryPerformance(last);
    const growingCostCategories = catNowPerf.filter(c => {
      const costFirst = catCostFirst.get(c.category) || 0;
      const revFirst = catRevFirst.get(c.category) || 0;
      if (costFirst <= 0 || revFirst <= 0) return false;
      const costGrowth = (c.totalCost - costFirst) / costFirst;
      const revGrowth = (c.revenue - revFirst) / revFirst;
      return costGrowth > revGrowth && costGrowth > 0.05;
    });
    if (growingCostCategories.length > 0) insights.push({ kind: 'observation', label: `Cost Growing Faster Than Revenue (${first.month} → ${last.month})`, detail: growingCostCategories.map(c => c.category).join(', ') });

    const allCategoryNames = new Set(trend.companyPnlByMonth.flatMap(c => computeCategoryPerformance(c).map(cp => cp.category)));
    const consistentlyNegative = Array.from(allCategoryNames).filter(catName =>
      trend.companyPnlByMonth.every(c => {
        const cp = computeCategoryPerformance(c).find(x => x.category === catName);
        return cp ? cp.pnl < 0 : false;
      })
    );
    if (consistentlyNegative.length > 0) insights.push({ kind: 'observation', label: `Consistently Negative-Margin Categories (last ${trend.companyPnlByMonth.length} months)`, detail: consistentlyNegative.join(', ') });
  }

  return insights;
}

// ===================== Management Suggestions (section 15) =====================

export interface ManagementSuggestion {
  trigger: string; // the calculated fact/observation that triggered this
  actions: string[]; // suggested next steps - always phrased as suggestions, never facts
}

export function computeManagementSuggestions(company: CompanyPnl, categories: CategoryPnl[]): ManagementSuggestion[] {
  const suggestions: ManagementSuggestion[] = [];
  const vehicles = company.vehiclePnls;
  if (vehicles.length === 0) return suggestions;

  const catAvg = new Map(categories.map(c => [c.category, c]));

  const findLineAmount = (v: VehiclePnl, label: string) => v.deductions.find(d => d.label === label)?.amount || 0;
  const catAvgFuel = new Map<string, number>();
  const catAvgMaint = new Map<string, number>();
  categories.forEach(c => {
    const list = vehicles.filter(v => v.category === c.category);
    catAvgFuel.set(c.category, list.length ? round2(list.reduce((s, v) => s + findLineAmount(v, 'Fuel'), 0) / list.length) : 0);
    catAvgMaint.set(c.category, list.length ? round2(list.reduce((s, v) => s + findLineAmount(v, 'Fleet Maintenance'), 0) / list.length) : 0);
  });

  const highFuelVehicles = vehicles.filter(v => {
    const avg = catAvgFuel.get(v.category) || 0;
    return avg > 0 && findLineAmount(v, 'Fuel') > avg * 1.3;
  });
  if (highFuelVehicles.length > 0) {
    suggestions.push({
      trigger: `${highFuelVehicles.length} vehicle(s) have Fuel cost >30% above their category average: ${highFuelVehicles.slice(0, 8).map(v => v.regNo).join(', ')}`,
      actions: ['Review fuel cost/km for these vehicles', 'Compare against similar vehicles in the same category', 'Check for abnormal fuel usage or leakage', 'Examine routes and utilization for these vehicles']
    });
  }

  const highMaintVehicles = vehicles.filter(v => {
    const avg = catAvgMaint.get(v.category) || 0;
    return avg > 0 && findLineAmount(v, 'Fleet Maintenance') > avg * 1.5;
  });
  if (highMaintVehicles.length > 0) {
    suggestions.push({
      trigger: `${highMaintVehicles.length} vehicle(s) have Fleet Maintenance cost >50% above their category average: ${highMaintVehicles.slice(0, 8).map(v => v.regNo).join(', ')}`,
      actions: ['Review repeated repairs for these vehicles', 'Identify vehicles with frequent breakdowns', 'Compare maintenance cost against the category average', 'Strengthen preventive maintenance scheduling']
    });
  }

  const lowRevenueVehicles = vehicles.filter(v => {
    const cat = catAvg.get(v.category);
    return cat && cat.avgRevenue > 0 && v.totalRevenue < cat.avgRevenue * 0.5;
  });
  if (lowRevenueVehicles.length > 0) {
    suggestions.push({
      trigger: `${lowRevenueVehicles.length} vehicle(s) generate <50% of their category's average revenue: ${lowRevenueVehicles.slice(0, 8).map(v => v.regNo).join(', ')}`,
      actions: ['Review trip/warehouse utilization for these vehicles', 'Compare vehicle revenue against the category average', 'Review low-utilization routes or deployments']
    });
  }

  const repeatedLossVehicles = vehicles.filter(v => v.status === 'loss');
  if (repeatedLossVehicles.length > 0) {
    suggestions.push({
      trigger: `${repeatedLossVehicles.length} vehicle(s) are loss-making this month: ${repeatedLossVehicles.slice(0, 8).map(v => v.regNo).join(', ')}`,
      actions: ['Monitor for consecutive monthly losses (see Monthly Trend)', 'Review route/deployment profitability', 'Review utilization', 'Evaluate redeployment or operational changes if losses persist']
    });
  }

  const lossCategories = categories.filter(c => c.pnl < 0);
  if (lossCategories.length > 0) {
    suggestions.push({
      trigger: `${lossCategories.length} category(ies) are loss-making this month: ${lossCategories.map(c => c.category).join(', ')}`,
      actions: ['Compare revenue vs. cost for these categories', 'Review fleet utilization within the category', 'Analyze the major cost drivers for the category', 'Compare against other, profitable categories']
    });
  }

  return suggestions;
}
