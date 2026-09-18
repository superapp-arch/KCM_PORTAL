// Vehicle Financial Performance (2026-09-18 direct request) - a new module
// that computes, per vehicle and per month, revenue, deductions, and
// resulting profit & loss. Deliberately collects NO new data of its own -
// every figure here is aggregated live from records already saved in other
// modules (Fleet & Vehicles, Fuel Management, Petty Cash, Warehouse
// Details, Loan Management, Fleet Maintenance, Driver Details, HR &
// Payroll), linked primarily by vehicle number. Nothing here is persisted -
// recomputed fresh on every load, so editing a source record (e.g. a Petty
// Cash entry) always retroactively updates this module's own numbers too,
// per direct instruction.
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
import {
  Vehicle, FuelLog, MileageReport, PettyCashVoucher, WarehouseEntry,
  VehicleLoan, MaintenanceRecord, DriverEmployee, DriverAttendance
} from '../types';
import { resolveLoanStatus, computeMonthsCompleted } from './loanDates';
import { payableAmountLiveCurrentMonth } from './driverSalaryExport';
import { DriverSalaryAdvanceVoucherSlim } from './driverPettyCashAdvance';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Fixed monthly GPS charge - auto-applied to every active vehicle, no
// external data source or manual entry needed (per direct instruction).
export const GPS_MONTHLY_CHARGE = 150;

export interface PnlLineItem {
  label: string;
  amount: number;
  sourceModule: string;
  // Traceability (per direct instruction: every line item must be
  // traceable back to its source module and originating record) - the
  // record ids that were summed into this line item, for an audit drill-down.
  recordIds: string[];
  note?: string; // flags a placeholder (Customer Billing, FASTag) or an assumption
}

export interface VehiclePnl {
  regNo: string;
  vehicleType?: string;
  vehicleModel?: string;
  month: string; // YYYY-MM
  revenue: PnlLineItem[];
  deductions: PnlLineItem[];
  totalRevenue: number;
  totalDeductions: number;
  pnl: number;
}

export interface CompanyLevelDeduction {
  label: string;
  amount: number;
  sourceModule: string;
  recordIds: string[];
}

export interface CompanyPnl {
  month: string;
  vehiclePnls: VehiclePnl[];
  vehiclePnlTotal: number;
  companyLevelDeductions: CompanyLevelDeduction[];
  companyLevelDeductionTotal: number;
  companyPnl: number;
}

const normReg = (s: string | undefined) => (s || '').trim().toUpperCase();
const inMonth = (dateIso: string | undefined, month: string) => (dateIso || '').slice(0, 7) === month;

// Fleet & Vehicles' own Reg. No. field, in the same "either key" shape used
// throughout the rest of this app (FleetSheet.tsx, WarehouseDetails.tsx, etc).
const regNoOf = (v: Vehicle): string => v.regNo || v['Reg. No.'] || v.id || '';

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
  driverPettyCashVouchers: DriverSalaryAdvanceVoucherSlim[]; // narrow slice for computeDriverPettyCashAdvance - see payableAmountLiveCurrentMonth
  staffPayroll: { empId: string; month: string; netSalary: number }[]; // HR & Payroll, company-level only - never vehicle-linked
}

export function computeCompanyPnl(inputs: VehicleFinancialPerformanceInputs, month: string): CompanyPnl {
  const {
    vehicles, fuelLogs, mileageReports, vouchers, warehouseEntries,
    vehicleLoans, maintenanceRecords, drivers, driverAttendance,
    driverPettyCashVouchers, staffPayroll
  } = inputs;

  // Only vehicles considered active this month count toward the per-vehicle
  // P&L at all (a sold/retired vehicle has no ongoing GPS/EMI/driver cost) -
  // Vehicle.active is undefined/missing-treated-as-active, matching the
  // convention already used elsewhere in Fleet & Vehicles.
  const activeVehicles = vehicles.filter(v => v.active !== false);

  const mileageById = new Map(mileageReports.map(m => [m.id, m]));

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
        recordIds: warehouseRows.map(w => w.id)
      }
    ];

    // --- Deductions ---
    // EMI/Loan - only while the loan is actually Active this month (a
    // Closed loan's EMI is no longer a real monthly cost).
    const loan = vehicleLoans.find(l => normReg(l.regNo) === regNo);
    let emiAmount = 0;
    const emiRecordIds: string[] = [];
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
    if (assignedDriver) {
      const vNos = assignedDriver.vehicleNos && assignedDriver.vehicleNos.length > 0 ? assignedDriver.vehicleNos : (assignedDriver.vehicleNo ? [assignedDriver.vehicleNo] : []);
      const splitFactor = vNos.length > 0 ? vNos.length : 1;
      const fullPayable = payableAmountLiveCurrentMonth(assignedDriver, driverAttendance, driverPettyCashVouchers, month);
      driverSalaryAmount = round2(fullPayable / splitFactor);
      driverSalaryRecordIds.push(assignedDriver.id);
    }

    // Petty Cash - only entries actually tied to this vehicle number; a
    // blank vehicleNumber (e.g. Office Maintenance) is company-level only,
    // handled separately below, never attributed to any vehicle.
    const vehiclePettyCashRows = vouchers.filter(p => normReg(p.vehicleNumber) === regNo && inMonth(p.date, month));
    const vehiclePettyCashAmount = round2(vehiclePettyCashRows.reduce((s, p) => s + (p.cashPaid || 0), 0));

    // Fleet Maintenance - auto-summed service/repair cost for the month.
    const maintenanceRows = maintenanceRecords.filter(r => normReg(r.regNo) === regNo && inMonth(r.date, month));
    const maintenanceAmount = round2(maintenanceRows.reduce((s, r) => s + (r.cost || 0), 0));

    const deductions: PnlLineItem[] = [
      { label: 'Vehicle EMI / Loan', amount: emiAmount, sourceModule: 'Loan Management', recordIds: emiRecordIds },
      { label: 'Fuel', amount: fuelAmount, sourceModule: 'Fuel Management', recordIds: fuelRows.map(f => f.id) },
      {
        label: 'Driver Salary', amount: driverSalaryAmount, sourceModule: 'Driver Details', recordIds: driverSalaryRecordIds,
        note: assignedDriver && (assignedDriver.vehicleNos?.length || 0) > 1 ? `Split evenly across ${assignedDriver.vehicleNos!.length} vehicles this driver covers.` : undefined
      },
      { label: 'Petty Cash (vehicle-linked)', amount: vehiclePettyCashAmount, sourceModule: 'Petty Cash', recordIds: vehiclePettyCashRows.map(p => p.id) },
      { label: 'Fleet Maintenance', amount: maintenanceAmount, sourceModule: 'Fleet Maintenance', recordIds: maintenanceRows.map(r => r.id) },
      { label: 'FASTag', amount: 0, sourceModule: 'FASTag', recordIds: [], note: 'No FASTag data source exists in this app yet - always 0 until one is added.' },
      { label: 'GPS', amount: GPS_MONTHLY_CHARGE, sourceModule: 'Fixed monthly charge', recordIds: [] }
    ];

    const totalRevenue = round2(revenue.reduce((s, r) => s + r.amount, 0));
    const totalDeductions = round2(deductions.reduce((s, d) => s + d.amount, 0));

    return {
      regNo,
      vehicleType: v.type,
      vehicleModel: v.model,
      month,
      revenue,
      deductions,
      totalRevenue,
      totalDeductions,
      pnl: round2(totalRevenue - totalDeductions)
    };
  });

  const vehiclePnlTotal = round2(vehiclePnls.reduce((s, v) => s + v.pnl, 0));

  // Company-level-only deductions - never attributed to any vehicle.
  const staffSalaryRows = staffPayroll.filter(p => p.month === month);
  const staffSalaryTotal = round2(staffSalaryRows.reduce((s, p) => s + (p.netSalary || 0), 0));

  const nonVehiclePettyCashRows = vouchers.filter(p => !p.vehicleNumber?.trim() && inMonth(p.date, month));
  const nonVehiclePettyCashTotal = round2(nonVehiclePettyCashRows.reduce((s, p) => s + (p.cashPaid || 0), 0));

  const companyLevelDeductions: CompanyLevelDeduction[] = [
    { label: 'Staff/Office Salaries', amount: staffSalaryTotal, sourceModule: 'HR & Payroll', recordIds: staffSalaryRows.map(p => p.empId) },
    { label: 'Non-vehicle-linked Petty Cash', amount: nonVehiclePettyCashTotal, sourceModule: 'Petty Cash', recordIds: nonVehiclePettyCashRows.map(p => p.id) }
  ];
  const companyLevelDeductionTotal = round2(companyLevelDeductions.reduce((s, d) => s + d.amount, 0));

  return {
    month,
    vehiclePnls,
    vehiclePnlTotal,
    companyLevelDeductions,
    companyLevelDeductionTotal,
    companyPnl: round2(vehiclePnlTotal - companyLevelDeductionTotal)
  };
}
