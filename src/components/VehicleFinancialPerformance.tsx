// Vehicle Financial Performance (2026-09-18 direct request; enhanced
// 2026-09-19 per follow-up spec) - see src/utils/vehicleFinancialPerformance.ts
// for the full aggregation logic and exactly which figures are real vs.
// held-back placeholders. This screen is purely a read+compute+render view -
// nothing here writes anything back to any module, and nothing is
// persisted: every number is recomputed fresh on each load/month change, so
// it's always live against current source data (no "closed month" concept).
import React, { useEffect, useMemo, useState } from 'react';
import {
  User, Vehicle, FuelLog, MileageReport, PettyCashVoucher, WarehouseEntry,
  VehicleLoan, MaintenanceRecord, DriverEmployee, StaffEmployee
} from '../types';
import { DriverSalaryAdvanceVoucherSlim } from '../utils/driverPettyCashAdvance';
import { authFetch } from '../authFetch';
import {
  computeCompanyPnl, computeCategoryPerformance, computeCompanyOverviewStats,
  computeMonthlyTrend, computeManagementInsights, computeManagementSuggestions,
  VehiclePnl, PnlLineItem, CategoryPnl, ManagementInsight, ManagementSuggestion
} from '../utils/vehicleFinancialPerformance';
import {
  exportMainExcel, exportMainPdf, exportVehicleDetailExcel, exportVehicleDetailPdf,
  exportCategoryExcel, exportCategoryPdf, exportCompanyOverviewExcel, exportCompanyOverviewPdf
} from '../utils/vehicleFinancialPerformanceExport';
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, ShieldAlert, Lock, Loader2,
  AlertTriangle, X, FileDown, FileSpreadsheet, Users, Wallet, Lightbulb, ClipboardList
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

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
  employees: StaffEmployee[]; // Staff master - name/designation only, always safe to share
}

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const CHART_COLORS = ['#059669', '#0891b2', '#7c3aed', '#d97706', '#dc2626', '#2563eb', '#db2777', '#65a30d', '#9333ea', '#0d9488'];

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function StatusBadge({ status }: { status: VehiclePnl['status'] }) {
  if (status === 'profit') return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-black"><TrendingUp className="w-2.5 h-2.5" />PROFIT</span>;
  if (status === 'loss') return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9px] font-black"><TrendingDown className="w-2.5 h-2.5" />LOSS</span>;
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 text-[9px] font-black"><Minus className="w-2.5 h-2.5" />BREAK-EVEN</span>;
}

// Generic drill-down modal - renders any array of plain objects as a table,
// deriving columns from the first row's own keys so every source type
// (Fuel/Maintenance/Petty Cash/Staff Salary/...) can share one modal.
function DetailModal({ title, subtitle, rows, onClose }: { title: string; subtitle?: string; rows: Record<string, any>[]; onClose: () => void }) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="overflow-auto p-4">
          {rows.length === 0 ? (
            <p className="text-xs text-slate-400 font-mono text-center py-8">No underlying records for this line item this month.</p>
          ) : (
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  {columns.map(c => <th key={c} className="text-left px-2 py-1.5 font-bold text-slate-600 uppercase tracking-wide border-b border-slate-200 whitespace-nowrap">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    {columns.map(c => {
                      const v = row[c];
                      const display = v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)));
                      return <td key={c} className="px-2 py-1.5 font-mono text-slate-700 whitespace-nowrap">{display}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function LineItemRow({ item, onViewDetails }: { item: PnlLineItem; onViewDetails: (item: PnlLineItem) => void }) {
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
        {item.sourceRows && item.sourceRows.length > 0 && (
          <button type="button" onClick={() => onViewDetails(item)} className="text-[9px] font-bold text-cyan-700 hover:text-cyan-900 underline cursor-pointer">View Details</button>
        )}
      </div>
    </div>
  );
}

function VehiclePnlRow({ vp, onViewDetails, onExport }: { vp: VehiclePnl; onViewDetails: (item: PnlLineItem) => void; onExport: (vp: VehiclePnl, format: 'excel' | 'pdf') => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          <span className="font-mono font-bold text-slate-900 text-xs">{vp.regNo}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">{vp.category}</span>
          <span className="text-[10px] text-slate-400">{vp.vehicleType || '-'} {vp.vehicleModel ? `/ ${vp.vehicleModel}` : ''}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-emerald-600">Rev {money(vp.totalRevenue)}</span>
          <span className="text-rose-600">Cost {money(vp.totalDeductions)}</span>
          <span className={`font-black flex items-center gap-1 ${vp.pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {vp.pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {money(vp.pnl)}
          </span>
          <span className="hidden sm:inline"><StatusBadge status={vp.status} /></span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50">
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Revenue</p>
              {vp.revenue.map((r, i) => <LineItemRow key={i} item={r} onViewDetails={onViewDetails} />)}
            </div>
            <div>
              <p className="text-[9px] font-bold text-rose-700 uppercase tracking-wider mb-1">Deductions</p>
              {vp.deductions.map((d, i) => <LineItemRow key={i} item={d} onViewDetails={onViewDetails} />)}
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-white">
            <span className="text-[10px] text-slate-400 font-mono">Margin: <strong className={vp.pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{vp.marginPct}%</strong></span>
            <div className="flex gap-2">
              <button type="button" onClick={() => onExport(vp, 'excel')} className="text-[10px] font-bold text-slate-500 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"><FileSpreadsheet className="w-3 h-3" /> Excel</button>
              <button type="button" onClick={() => onExport(vp, 'pdf')} className="text-[10px] font-bold text-slate-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer"><FileDown className="w-3 h-3" /> PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone, onClick, sub }: { label: string; value: string; tone: 'emerald' | 'rose' | 'slate' | 'dark'; onClick?: () => void; sub?: string }) {
  const toneClasses = {
    emerald: 'text-emerald-700', rose: 'text-rose-700', slate: 'text-slate-800', dark: 'text-emerald-400'
  }[tone];
  const bg = tone === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const labelColor = tone === 'dark' ? 'text-slate-400' : 'text-slate-400';
  return (
    <div className={`${bg} rounded-2xl border p-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <p className={`text-[10px] ${labelColor} uppercase font-bold`}>{label}</p>
      <p className={`text-lg font-black font-mono ${toneClasses}`}>{value}</p>
      {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
      {onClick && <p className="text-[9px] text-cyan-600 font-bold mt-1">Click for detail →</p>}
    </div>
  );
}

function ExportButtons({ onExcel, onPdf }: { onExcel: () => void; onPdf: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold hover:bg-emerald-100 cursor-pointer"><FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel</button>
      <button type="button" onClick={onPdf} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold hover:bg-rose-100 cursor-pointer"><FileDown className="w-3.5 h-3.5" /> Export PDF</button>
    </div>
  );
}

function CategoryPerformanceSection({ categories, company }: { categories: CategoryPnl[]; company: ReturnType<typeof computeCompanyPnl> }) {
  const costByLabel = useMemo(() => {
    const m = new Map<string, number>();
    company.vehiclePnls.forEach(v => v.deductions.forEach(d => m.set(d.label, (m.get(d.label) || 0) + d.amount)));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value: Math.round(value) })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  }, [company]);

  const fleetDistribution = useMemo(() => categories.map(c => ({ name: c.category, value: c.vehicleCount })), [categories]);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Category Performance</h2>
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="w-full text-[11px] border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-slate-50">
              {['Category', 'Vehicles', 'Revenue', 'Total Cost', 'P&L', 'Margin %', 'Avg Rev/Veh', 'Avg Cost/Veh', 'Avg P&L/Veh', 'Profit/Loss/BE'].map(h => (
                <th key={h} className="text-left px-2.5 py-2 font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(c => (
              <tr key={c.category} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-2.5 py-2 font-bold text-slate-800 whitespace-nowrap">{c.category}</td>
                <td className="px-2.5 py-2 font-mono">{c.vehicleCount}</td>
                <td className="px-2.5 py-2 font-mono text-emerald-700">{money(c.revenue)}</td>
                <td className="px-2.5 py-2 font-mono text-rose-700">{money(c.totalCost)}</td>
                <td className={`px-2.5 py-2 font-mono font-bold ${c.pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(c.pnl)}</td>
                <td className="px-2.5 py-2 font-mono">{c.marginPct}%</td>
                <td className="px-2.5 py-2 font-mono text-slate-500">{money(c.avgRevenue)}</td>
                <td className="px-2.5 py-2 font-mono text-slate-500">{money(c.avgCost)}</td>
                <td className="px-2.5 py-2 font-mono text-slate-500">{money(c.avgPnl)}</td>
                <td className="px-2.5 py-2 font-mono text-[10px] whitespace-nowrap"><span className="text-emerald-600">{c.profitableCount}P</span> / <span className="text-rose-600">{c.lossCount}L</span> / <span className="text-slate-400">{c.breakEvenCount}BE</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {categories.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Revenue vs Cost by Category</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categories.map(c => ({ name: c.category, Revenue: c.revenue, Cost: c.totalCost }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Revenue" fill="#059669" />
                <Bar dataKey="Cost" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Profit/Loss by Category</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categories.map(c => ({ name: c.category, 'P&L': c.pnl }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="P&L">
                  {categories.map((c, i) => <Cell key={i} fill={c.pnl >= 0 ? '#059669' : '#dc2626'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Fleet Distribution by Category</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={fleetDistribution} dataKey="value" nameKey="name" outerRadius={80} label={({ name, value }: any) => `${name}: ${value}`}>
                  {fleetDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Cost Composition (fleet-wide)</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={costByLabel} dataKey="value" nameKey="name" outerRadius={80} label={({ name }: any) => name}>
                  {costByLabel.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function InsightsAndSuggestions({ insights, suggestions }: { insights: ManagementInsight[]; suggestions: ManagementSuggestion[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Management Insights</h3>
        {insights.length === 0 ? <p className="text-xs text-slate-400">No insights yet - not enough data this month.</p> : (
          <ul className="space-y-2">
            {insights.map((ins, i) => (
              <li key={i} className="text-[11px] border-l-2 border-slate-200 pl-2">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase mr-1.5 ${ins.kind === 'fact' ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'}`}>{ins.kind === 'fact' ? 'Fact' : 'Observation'}</span>
                <strong className="text-slate-700">{ins.label}:</strong> <span className="text-slate-500 font-mono">{ins.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-cyan-600" /> Management Suggestions</h3>
        {suggestions.length === 0 ? <p className="text-xs text-slate-400">No suggestions - nothing unusual detected this month.</p> : (
          <ul className="space-y-3">
            {suggestions.map((s, i) => (
              <li key={i} className="text-[11px] border-l-2 border-cyan-200 pl-2">
                <p className="text-slate-600 mb-1"><span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase mr-1.5 bg-slate-200 text-slate-600">Trigger</span>{s.trigger}</p>
                <ul className="list-disc list-inside text-slate-500 ml-1">
                  {s.actions.map((a, j) => <li key={j}>{a}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function VehicleFinancialPerformance({
  user, vehicles, fuelLogs, mileageReports, vouchers, warehouseEntries,
  vehicleLoans, records, drivers, driverPettyCashAdvanceVouchers, employees
}: Props) {
  // Mirrors Administration.tsx's own hasAccess('vehicle-pnl') check exactly
  // (Super Admin, plus Bhagya and Vinod per direct instruction) - kept as
  // its own local check (not just "isSuperAdmin") since this module is no
  // longer Super-Admin-only.
  const canAccessVehiclePnl = user.department === 'super_admin' || user.email === 'bhagya@kcmlogistics.in' || user.email === 'vinod@kcmlogistics.in';

  // Staff/Office Salary is a NARROWER, deliberate restriction than module
  // access itself - server.ts's requireHrFullAccess explicitly blocks Vinod
  // from every Staff Salary figure (GET /api/staff/provident-fund), by name,
  // independent of this module's own access. Rather than either (a) quietly
  // punching a hole in that restriction just so this module's numbers look
  // complete for him, or (b) silently showing him a wrong ₹0, this module
  // simply never fetches that data for him and marks the Staff/Office
  // Salaries card/section/exports as restricted instead - honest about what
  // he can't see rather than misleading.
  const canSeeStaffSalary = user.department === 'super_admin' || user.email === 'bhagya@kcmlogistics.in';

  const [month, setMonth] = useState(currentMonthKey());
  const [tab, setTab] = useState<'vehicle' | 'company'>('vehicle');
  const [driverAttendance, setDriverAttendance] = useState<any[]>([]);
  const [staffPayroll, setStaffPayroll] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailModal, setDetailModal] = useState<{ title: string; subtitle?: string; rows: Record<string, any>[] } | null>(null);

  // Same fetch-once-on-mount pattern Reports.tsx already uses for these two
  // datasets - neither is otherwise part of this portal's shared
  // Administration state, and both are only ever needed here for computing
  // Driver Salary (attendance-based) and Staff Salary (company-level).
  useEffect(() => {
    if (!canAccessVehiclePnl) return;
    setLoading(true);
    Promise.all([
      authFetch('/api/drivers/attendance').then(r => r.ok ? r.json() : []),
      canSeeStaffSalary ? authFetch('/api/staff/provident-fund').then(r => r.ok ? r.json() : []) : Promise.resolve([])
    ]).then(([attendance, payroll]) => {
      setDriverAttendance(Array.isArray(attendance) ? attendance : []);
      setStaffPayroll(Array.isArray(payroll) ? payroll : []);
    }).catch(err => console.error('Failed to load Vehicle Financial Performance source data:', err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessVehiclePnl, canSeeStaffSalary]);

  const inputs = useMemo(() => ({
    vehicles, fuelLogs, mileageReports, vouchers, warehouseEntries,
    vehicleLoans, maintenanceRecords: records, drivers, driverAttendance,
    driverPettyCashVouchers: driverPettyCashAdvanceVouchers, staffPayroll, staffEmployees: employees
  }), [vehicles, fuelLogs, mileageReports, vouchers, warehouseEntries, vehicleLoans, records, drivers, driverAttendance, driverPettyCashAdvanceVouchers, staffPayroll, employees]);

  const company = useMemo(() => computeCompanyPnl(inputs, month), [inputs, month]);
  const categories = useMemo(() => computeCategoryPerformance(company), [company]);
  const overview = useMemo(() => computeCompanyOverviewStats(company), [company]);
  // Only computed while Company Overview is open - 6x the per-month cost of
  // `company` above, which is otherwise wasted work on the Vehicle P&L tab.
  const trend = useMemo(() => tab === 'company' ? computeMonthlyTrend(inputs, month, 6) : undefined, [inputs, month, tab]);
  const insights = useMemo(() => computeManagementInsights(company, categories, trend), [company, categories, trend]);
  const suggestions = useMemo(() => computeManagementSuggestions(company, categories), [company, categories]);

  const staffAmount = company.companyLevelDeductions.find(d => d.label === 'Staff/Office Salaries')?.amount || 0;
  const nonVehicleAmount = company.companyLevelDeductions.find(d => d.label === 'Non-vehicle-linked Petty Cash')?.amount || 0;

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

  const openStaffSalaryDetail = () => {
    if (!canSeeStaffSalary) {
      setDetailModal({ title: 'Staff / Office Salaries - Restricted', rows: [] });
      return;
    }
    const rows = company.companyLevelDeductions.find(d => d.label === 'Staff/Office Salaries')?.sourceRows || [];
    setDetailModal({ title: 'Staff / Office Salaries', subtitle: `${month} - ${rows.length} employee(s) - source: HR & Payroll (Staff Salary Breakup)`, rows });
  };
  const openNonVehiclePettyCashDetail = () => {
    const rows = company.companyLevelDeductions.find(d => d.label === 'Non-vehicle-linked Petty Cash')?.sourceRows || [];
    setDetailModal({ title: 'Non-Vehicle Petty Cash', subtitle: `${month} - ${rows.length} transaction(s) - source: Petty Cash`, rows });
  };
  const openRevenueBreakdown = () => {
    setDetailModal({
      title: 'Revenue Breakdown', subtitle: `${month} - by source, across all active vehicles`,
      rows: [
        { Source: 'Customer Billing', Amount: 0, Note: 'Not computed yet - held pending billing-rate logic' },
        { Source: 'Warehouse Revenue', Amount: company.vehiclePnls.reduce((s, v) => s + (v.revenue.find(r => r.label === 'Warehouse Revenue')?.amount || 0), 0), Note: '' }
      ]
    });
  };
  const openCostBreakdown = () => {
    const byLabel = new Map<string, number>();
    company.vehiclePnls.forEach(v => v.deductions.forEach(d => byLabel.set(d.label, (byLabel.get(d.label) || 0) + d.amount)));
    setDetailModal({ title: 'Total Vehicle Cost Breakdown', subtitle: `${month} - fleet-wide, by cost category`, rows: Array.from(byLabel.entries()).sort((a, b) => b[1] - a[1]).map(([Category, Amount]) => ({ Category, Amount: Math.round(Amount * 100) / 100 })) });
  };
  const openReconciliation = () => {
    setDetailModal({
      title: 'Net Profit/Loss Reconciliation', subtitle: month,
      rows: [
        { Step: 'Sum of Vehicle Revenues', Amount: company.totalVehicleRevenue },
        { Step: 'Sum of Vehicle Costs', Amount: company.totalVehicleCost },
        { Step: '= Total Vehicle P&L', Amount: company.vehiclePnlTotal },
        { Step: '- Staff/Office Salaries', Amount: canSeeStaffSalary ? staffAmount : 'Restricted' },
        { Step: '- Non-Vehicle Petty Cash', Amount: nonVehicleAmount },
        { Step: '= FINAL COMPANY PROFIT/LOSS', Amount: canSeeStaffSalary ? company.companyPnl : `${company.vehiclePnlTotal - nonVehicleAmount} (excludes restricted Staff Salary)` }
      ]
    });
  };
  const onLineItemDetails = (item: PnlLineItem) => {
    setDetailModal({ title: item.label, subtitle: `${item.sourceModule} - ${item.recordIds.length} record(s)`, rows: item.sourceRows || [] });
  };
  const onVehicleExport = (vp: VehiclePnl, format: 'excel' | 'pdf') => {
    if (format === 'excel') exportVehicleDetailExcel(vp); else exportVehicleDetailPdf(vp);
  };

  const sortedVehiclePnls = [...company.vehiclePnls].sort((a, b) => a.regNo.localeCompare(b.regNo));

  return (
    <div className="space-y-6">
      {detailModal && <DetailModal title={detailModal.title} subtitle={detailModal.subtitle} rows={detailModal.rows} onClose={() => setDetailModal(null)} />}

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

      <div className="flex items-center gap-2 border-b border-slate-200">
        <button type="button" onClick={() => setTab('vehicle')} className={`px-4 py-2 text-xs font-bold cursor-pointer border-b-2 -mb-px ${tab === 'vehicle' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Vehicle P&amp;L</button>
        <button type="button" onClick={() => setTab('company')} className={`px-4 py-2 text-xs font-bold cursor-pointer border-b-2 -mb-px ${tab === 'company' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Company Overview</button>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>Customer Billing revenue and FASTag are not computed yet</strong> - both always show ₹0, flagged with a <AlertTriangle className="w-3 h-3 inline text-amber-500" /> icon in each vehicle's detail view.
          Customer Billing needs its per-trip billing-rate logic defined and a client→vehicle assignment (neither exists in the app today); FASTag has no data source anywhere in this app yet.
          {!canSeeStaffSalary && <> <strong>Staff/Office Salaries figures are restricted for your account</strong> and are excluded from your Company P&L (shown separately below) rather than shown as an inaccurate ₹0.</>} Every other figure below is real, computed from live data.
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading Driver Attendance / Staff Payroll...</div>
      )}

      {tab === 'vehicle' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Monthly Summary ({month})</h2>
            <ExportButtons
              onExcel={() => exportMainExcel(company, categories, overview, insights, month, !canSeeStaffSalary)}
              onPdf={() => exportMainPdf(company, categories, overview, insights, suggestions, month, !canSeeStaffSalary)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard label="Total Revenue" value={money(company.totalVehicleRevenue)} tone="emerald" onClick={openRevenueBreakdown} />
            <SummaryCard label="Total Vehicle Cost" value={money(company.totalVehicleCost)} tone="rose" onClick={openCostBreakdown} />
            <SummaryCard label="Sum of Vehicle P&L" value={money(company.vehiclePnlTotal)} tone={company.vehiclePnlTotal >= 0 ? 'emerald' : 'rose'} onClick={openReconciliation} />
            <SummaryCard label="Staff / Office Salaries" value={canSeeStaffSalary ? money(staffAmount) : 'Restricted'} tone="rose" onClick={openStaffSalaryDetail} />
            <SummaryCard label="Non-Vehicle Petty Cash" value={money(nonVehicleAmount)} tone="rose" onClick={openNonVehiclePettyCashDetail} />
            <SummaryCard label="Vehicle Count" value={String(overview.totalVehicles)} tone="slate" sub={`${overview.profitableVehicles}P / ${overview.lossMakingVehicles}L / ${overview.breakEvenVehicles}BE`} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Per-Vehicle P&amp;L ({sortedVehiclePnls.length} active vehicles)</h2>
            {sortedVehiclePnls.length === 0 ? (
              <p className="text-xs text-slate-400 font-mono p-6 text-center bg-white rounded-xl border border-slate-200">No active vehicles in Fleet &amp; Vehicles.</p>
            ) : (
              <div className="space-y-1.5">
                {sortedVehiclePnls.map(vp => <VehiclePnlRow key={vp.regNo} vp={vp} onViewDetails={onLineItemDetails} onExport={onVehicleExport} />)}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <ExportButtons onExcel={() => exportCategoryExcel(categories, company, month)} onPdf={() => exportCategoryPdf(categories, company, month)} />
          </div>
          <CategoryPerformanceSection categories={categories} company={company} />
        </>
      )}

      {tab === 'company' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Company Overview ({month})</h2>
            <ExportButtons
              onExcel={() => exportCompanyOverviewExcel(company, categories, overview, insights, suggestions, month, !canSeeStaffSalary, trend)}
              onPdf={() => exportCompanyOverviewPdf(company, categories, overview, insights, suggestions, month, !canSeeStaffSalary, trend)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total Vehicle Revenue" value={money(company.totalVehicleRevenue)} tone="emerald" />
            <SummaryCard label="Total Vehicle Costs" value={money(company.totalVehicleCost)} tone="rose" />
            <SummaryCard label="Total Vehicle P&L" value={money(company.vehiclePnlTotal)} tone={company.vehiclePnlTotal >= 0 ? 'emerald' : 'rose'} />
            <SummaryCard label="FINAL COMPANY P&L" value={canSeeStaffSalary ? money(company.companyPnl) : `${money(company.vehiclePnlTotal - nonVehicleAmount)}*`} tone="dark" onClick={openReconciliation} sub={!canSeeStaffSalary ? '*excludes restricted Staff Salary' : undefined} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Staff / Office Salaries" value={canSeeStaffSalary ? money(staffAmount) : 'Restricted'} tone="rose" onClick={openStaffSalaryDetail} sub={canSeeStaffSalary ? `${(company.companyLevelDeductions.find(d => d.label === 'Staff/Office Salaries')?.sourceRows || []).length} employees` : undefined} />
            <SummaryCard label="Non-Vehicle Petty Cash" value={money(nonVehicleAmount)} tone="rose" onClick={openNonVehiclePettyCashDetail} sub={`${(company.companyLevelDeductions.find(d => d.label === 'Non-vehicle-linked Petty Cash')?.sourceRows || []).length} transactions`} />
            <SummaryCard label="Final Company Margin" value={company.totalVehicleRevenue > 0 && canSeeStaffSalary ? `${Math.round((company.companyPnl / company.totalVehicleRevenue) * 10000) / 100}%` : '—'} tone="slate" />
            <SummaryCard label="Total Vehicles" value={String(overview.totalVehicles)} tone="slate" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-slate-500" /> Company P&amp;L Reconciliation</h3>
            <div className="font-mono text-[11px] space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Sum of Vehicle Revenues</span><span className="text-emerald-700">{money(company.totalVehicleRevenue)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Sum of Vehicle Costs</span><span className="text-rose-700">{money(company.totalVehicleCost)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1"><span className="text-slate-700 font-bold">= Total Vehicle P&amp;L</span><span className="font-bold">{money(company.vehiclePnlTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">- Staff/Office Salaries</span><span className="text-rose-700">{canSeeStaffSalary ? money(staffAmount) : 'Restricted'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">- Non-Vehicle Petty Cash</span><span className="text-rose-700">{money(nonVehicleAmount)}</span></div>
              <div className="flex justify-between border-t border-slate-300 pt-1"><span className="text-slate-900 font-black">= FINAL COMPANY PROFIT/LOSS</span><span className={`font-black ${company.companyPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{canSeeStaffSalary ? money(company.companyPnl) : `${money(company.vehiclePnlTotal - nonVehicleAmount)} (excl. restricted Staff Salary)`}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label="Profitable Vehicles" value={String(overview.profitableVehicles)} tone="emerald" />
            <SummaryCard label="Loss-Making Vehicles" value={String(overview.lossMakingVehicles)} tone="rose" />
            <SummaryCard label="Break-Even Vehicles" value={String(overview.breakEvenVehicles)} tone="slate" />
            <SummaryCard label="Avg Revenue / Vehicle" value={money(overview.avgRevenuePerVehicle)} tone="slate" />
            <SummaryCard label="Avg Cost / Vehicle" value={money(overview.avgCostPerVehicle)} tone="slate" />
            <SummaryCard label="Avg Profit/Loss / Vehicle" value={money(overview.avgPnlPerVehicle)} tone={overview.avgPnlPerVehicle >= 0 ? 'emerald' : 'rose'} />
          </div>

          {trend && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-slate-500" /><h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Monthly Trend (last {trend.points.length} months)</h3></div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend.points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#059669" strokeWidth={2} />
                  <Line type="monotone" dataKey="vehicleCost" name="Vehicle Cost" stroke="#dc2626" strokeWidth={2} />
                  <Line type="monotone" dataKey="companyPnl" name="Final Company P&L" stroke="#0891b2" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Month', 'Revenue', 'Vehicle Cost', 'Staff/Office Salary', 'Non-Vehicle Petty Cash', 'Final Company P&L', 'Margin %'].map(h => <th key={h} className="text-left px-2 py-1.5 font-bold text-slate-500 uppercase border-b border-slate-200 whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {trend.points.map(p => (
                      <tr key={p.month} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 font-mono font-bold">{p.month}</td>
                        <td className="px-2 py-1.5 font-mono text-emerald-700">{money(p.revenue)}</td>
                        <td className="px-2 py-1.5 font-mono text-rose-700">{money(p.vehicleCost)}</td>
                        <td className="px-2 py-1.5 font-mono">{money(p.staffOfficeSalary)}</td>
                        <td className="px-2 py-1.5 font-mono">{money(p.nonVehiclePettyCash)}</td>
                        <td className={`px-2 py-1.5 font-mono font-bold ${p.companyPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(p.companyPnl)}</td>
                        <td className="px-2 py-1.5 font-mono">{p.marginPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <InsightsAndSuggestions insights={insights} suggestions={suggestions} />
        </div>
      )}
    </div>
  );
}
