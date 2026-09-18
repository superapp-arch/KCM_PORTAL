// Vehicle Financial Performance (2026-09-18 direct request) - see
// src/utils/vehicleFinancialPerformance.ts for the full aggregation logic
// and exactly which figures are real vs. held-back placeholders. This
// screen is purely a read+compute+render view - nothing here writes
// anything back to any module, and nothing is persisted: every number is
// recomputed fresh on each load/month change, so it's always live against
// current source data (per direct instruction - no "closed month" concept).
import React, { useEffect, useState } from 'react';
import {
  User, Vehicle, FuelLog, MileageReport, PettyCashVoucher, WarehouseEntry,
  VehicleLoan, MaintenanceRecord, DriverEmployee
} from '../types';
import { DriverSalaryAdvanceVoucherSlim } from '../utils/driverPettyCashAdvance';
import { authFetch } from '../authFetch';
import { computeCompanyPnl, VehiclePnl, PnlLineItem } from '../utils/vehicleFinancialPerformance';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, ShieldAlert, Lock, Loader2, AlertTriangle } from 'lucide-react';

interface Props {
  user: User;
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  mileageReports: MileageReport[];
  vouchers: PettyCashVoucher[];
  warehouseEntries: WarehouseEntry[];
  vehicleLoans: VehicleLoan[];
  records: MaintenanceRecord[]; // Fleet Maintenance
  drivers: DriverEmployee[];
  driverPettyCashAdvanceVouchers: DriverSalaryAdvanceVoucherSlim[];
}

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function LineItemRow({ item }: { item: PnlLineItem }) {
  return (
    <div className="flex items-center justify-between py-1 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="text-slate-600">{item.label}</span>
        <span className="text-slate-300 font-mono text-[9px]">({item.sourceModule})</span>
        {item.note && (
          <span title={item.note}><AlertTriangle className="w-3 h-3 text-amber-500" /></span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-slate-400 font-mono text-[9px]">{item.recordIds.length > 0 ? `${item.recordIds.length} record${item.recordIds.length === 1 ? '' : 's'}` : ''}</span>
        <span className="font-mono font-bold text-slate-800">{money(item.amount)}</span>
      </div>
    </div>
  );
}

function VehiclePnlRow({ vp }: { vp: VehiclePnl }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          <span className="font-mono font-bold text-slate-900 text-xs">{vp.regNo}</span>
          <span className="text-[10px] text-slate-400">{vp.vehicleType || '-'} {vp.vehicleModel ? `/ ${vp.vehicleModel}` : ''}</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span className="text-emerald-600">Rev {money(vp.totalRevenue)}</span>
          <span className="text-rose-600">Ded {money(vp.totalDeductions)}</span>
          <span className={`font-black flex items-center gap-1 ${vp.pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {vp.pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {money(vp.pnl)}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 p-3 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/50">
          <div>
            <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Revenue</p>
            {vp.revenue.map((r, i) => <LineItemRow key={i} item={r} />)}
          </div>
          <div>
            <p className="text-[9px] font-bold text-rose-700 uppercase tracking-wider mb-1">Deductions</p>
            {vp.deductions.map((d, i) => <LineItemRow key={i} item={d} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VehicleFinancialPerformance({
  user, vehicles, fuelLogs, mileageReports, vouchers, warehouseEntries,
  vehicleLoans, records, drivers, driverPettyCashAdvanceVouchers
}: Props) {
  // Mirrors Administration.tsx's own hasAccess('vehicle-pnl') check exactly
  // (Super Admin, plus Bhagya and Vinod per direct instruction) - kept as
  // its own local check (not just "isSuperAdmin") since this module is no
  // longer Super-Admin-only.
  const canAccessVehiclePnl = user.department === 'super_admin' || user.email === 'bhagya@kcmlogistics.in' || user.email === 'vinod@kcmlogistics.in';

  const [month, setMonth] = useState(currentMonthKey());
  const [driverAttendance, setDriverAttendance] = useState<any[]>([]);
  const [staffPayroll, setStaffPayroll] = useState<{ empId: string; month: string; netSalary: number }[]>([]);
  const [loading, setLoading] = useState(false);

  // Same fetch-once-on-mount pattern Reports.tsx already uses for these two
  // datasets - neither is otherwise part of this portal's shared
  // Administration state, and both are only ever needed here for computing
  // Driver Salary (attendance-based) and Staff Salary (company-level).
  useEffect(() => {
    if (!canAccessVehiclePnl) return;
    setLoading(true);
    Promise.all([
      authFetch('/api/drivers/attendance').then(r => r.ok ? r.json() : []),
      authFetch('/api/staff/provident-fund').then(r => r.ok ? r.json() : [])
    ]).then(([attendance, payroll]) => {
      setDriverAttendance(Array.isArray(attendance) ? attendance : []);
      setStaffPayroll(Array.isArray(payroll) ? payroll : []);
    }).catch(err => console.error('Failed to load Vehicle Financial Performance source data:', err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessVehiclePnl]);

  // Defense-in-depth, same pattern as Reports.tsx - Administration.tsx
  // already gates rendering this to canAccessVehiclePnl above.
  if (!canAccessVehiclePnl) {
    return (
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-10 text-center">
        <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <h2 className="text-sm font-bold text-slate-800">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-1">Vehicle Financial Performance is limited to Super Admin / Principal, Bhagya, and Vinod.</p>
      </div>
    );
  }

  const company = computeCompanyPnl(
    {
      vehicles, fuelLogs, mileageReports, vouchers, warehouseEntries,
      vehicleLoans, maintenanceRecords: records, drivers, driverAttendance,
      driverPettyCashVouchers: driverPettyCashAdvanceVouchers, staffPayroll
    },
    month
  );

  const sortedVehiclePnls = [...company.vehiclePnls].sort((a, b) => a.regNo.localeCompare(b.regNo));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <TrendingUp className="text-emerald-600 w-5 h-5" />
            Vehicle Financial Performance
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Aggregated live from other modules - Super Admin / Principal, Bhagya, and Vinod only. Nothing is stored here.
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-sm text-slate-800"
        />
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>Customer Billing revenue and FASTag are not computed yet</strong> - both always show ₹0, flagged with a <AlertTriangle className="w-3 h-3 inline text-amber-500" /> icon in each vehicle's detail view.
          Customer Billing needs its per-trip billing-rate logic defined and a client→vehicle assignment (neither exists in the app today); FASTag has no data source anywhere in this app yet. Every other figure below is real, computed from live data.
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading Driver Attendance / Staff Payroll...</div>
      )}

      {/* Company-level summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-[10px] text-slate-400 uppercase font-bold">Sum of Vehicle P&amp;L</p>
          <p className={`text-lg font-black font-mono ${company.vehiclePnlTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(company.vehiclePnlTotal)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-[10px] text-slate-400 uppercase font-bold">Staff / Office Salaries</p>
          <p className="text-lg font-black font-mono text-rose-700">{money(company.companyLevelDeductions[0]?.amount || 0)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-[10px] text-slate-400 uppercase font-bold">Non-Vehicle Petty Cash</p>
          <p className="text-lg font-black font-mono text-rose-700">{money(company.companyLevelDeductions[1]?.amount || 0)}</p>
        </div>
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <p className="text-[10px] text-slate-400 uppercase font-bold">Company P&amp;L ({month})</p>
          <p className={`text-lg font-black font-mono ${company.companyPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(company.companyPnl)}</p>
        </div>
      </div>

      {/* Per-vehicle P&L */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Per-Vehicle P&amp;L ({sortedVehiclePnls.length} active vehicles)</h2>
        {sortedVehiclePnls.length === 0 ? (
          <p className="text-xs text-slate-400 font-mono p-6 text-center bg-white rounded-xl border border-slate-200">No active vehicles in Fleet &amp; Vehicles.</p>
        ) : (
          <div className="space-y-1.5">
            {sortedVehiclePnls.map(vp => <VehiclePnlRow key={vp.regNo} vp={vp} />)}
          </div>
        )}
      </div>
    </div>
  );
}
