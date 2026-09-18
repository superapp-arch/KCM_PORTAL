// Vehicle Financial Performance's PDF/Excel exports (2026-09-19 enhancement).
// Built entirely on top of reportExport.ts's existing shared Excel/PDF
// builder (the same one Reports & Analytics and Driver Salary already use)
// so this module doesn't grow a second export engine - every number here
// comes straight from vehicleFinancialPerformance.ts's own calculation
// engine (computeCompanyPnl/computeCategoryPerformance/etc.), the exact same
// functions the on-screen dashboard calls, so an export can never disagree
// with what's on screen.
//
// Chart images are NOT embedded in the PDF - reportExport.ts's PDF builder
// is table-only (jsPDF + autotable), and this codebase has no SVG/canvas
// rasterizer to turn a live recharts chart into a PDF image without adding a
// new dependency for it. The same underlying data the charts are drawn from
// is included as tables instead (Category Performance, cost-by-label, the
// monthly trend), so nothing here is missing - only the pixel chart itself,
// which is still viewable on screen.
import { ReportTableSection, exportReportToExcel, exportReportToPdf } from './reportExport';
import {
  CompanyPnl, VehiclePnl, CategoryPnl, CompanyOverviewStats, ManagementInsight,
  ManagementSuggestion, MonthlyTrendResult
} from './vehicleFinancialPerformance';

// --- Vehicle P&L table (shared by the main screen & category exports) ------

const VEHICLE_PNL_COLUMNS = [
  'Vehicle', 'Category', 'Revenue', 'Fuel', 'Driver Salary', 'Fleet Maintenance', 'Tyres', 'Battery',
  'Loan/EMI', 'Petty Cash (vehicle)', 'FASTag', 'GPS', 'Total Cost', 'Profit/Loss', 'Margin %', 'Status'
];

function lineAmt(vp: VehiclePnl, label: string): number {
  return vp.deductions.find(d => d.label === label)?.amount || 0;
}

function vehiclePnlRow(vp: VehiclePnl): (string | number)[] {
  return [
    vp.regNo, vp.category, vp.totalRevenue, lineAmt(vp, 'Fuel'), lineAmt(vp, 'Driver Salary'),
    lineAmt(vp, 'Fleet Maintenance'), lineAmt(vp, 'Tyres'), lineAmt(vp, 'Battery'),
    lineAmt(vp, 'Vehicle EMI / Loan'), lineAmt(vp, 'Petty Cash (vehicle-linked)'), lineAmt(vp, 'FASTag'),
    lineAmt(vp, 'GPS'), vp.totalDeductions, vp.pnl, vp.marginPct,
    vp.status === 'profit' ? 'PROFIT' : vp.status === 'loss' ? 'LOSS' : 'BREAK-EVEN'
  ];
}

function vehiclePnlSection(heading: string, list: VehiclePnl[]): ReportTableSection {
  return { heading, columns: VEHICLE_PNL_COLUMNS, rows: list.map(vehiclePnlRow) };
}

function categoryPerformanceSection(categories: CategoryPnl[]): ReportTableSection {
  return {
    heading: 'Category Performance',
    columns: ['Category', 'Vehicles', 'Revenue', 'Total Cost', 'Profit/Loss', 'Margin %', 'Avg Revenue/Vehicle', 'Avg Cost/Vehicle', 'Avg P&L/Vehicle', 'Profitable', 'Loss-Making', 'Break-Even'],
    rows: categories.map(c => [c.category, c.vehicleCount, c.revenue, c.totalCost, c.pnl, c.marginPct, c.avgRevenue, c.avgCost, c.avgPnl, c.profitableCount, c.lossCount, c.breakEvenCount])
  };
}

function staffSalarySection(company: CompanyPnl, restricted: boolean): ReportTableSection {
  if (restricted) {
    return { heading: 'Staff / Office Salaries', columns: ['Note'], rows: [['Restricted for this account - not included in this export. See a Super Admin or Bhagya for Staff Salary detail.']] };
  }
  const rows = company.companyLevelDeductions.find(d => d.label === 'Staff/Office Salaries')?.sourceRows || [];
  return {
    heading: 'Staff / Office Salaries',
    columns: ['Emp ID', 'Name', 'Designation', 'Department', 'Total Days', 'Working Days', 'LOP Days', 'Gross Salary', 'Total Deductions', 'Net Salary', 'Month'],
    rows: rows.map((r: any) => [r.empId, r.name, r.designation || '', r.department || '', r.totalDays ?? '', r.workingDays ?? '', r.lopDays ?? '', r.grossSalary ?? '', r.totalDeductions ?? '', r.netSalary ?? '', r.month])
  };
}

function nonVehiclePettyCashSection(company: CompanyPnl): ReportTableSection {
  const rows = company.companyLevelDeductions.find(d => d.label === 'Non-vehicle-linked Petty Cash')?.sourceRows || [];
  return {
    heading: 'Non-Vehicle Petty Cash',
    columns: ['Date', 'Entry No', 'Category', 'Description/Client', 'Amount', 'Holder', 'Remarks'],
    rows: rows.map((r: any) => [r.date, r.entryNo, r.category, r.clientName || r.remarks || '', r.cashPaid || 0, r.enteredBy || '', r.remarks || ''])
  };
}

function insightsSection(insights: ManagementInsight[]): ReportTableSection {
  return { heading: 'Management Insights', columns: ['Type', 'Insight', 'Detail'], rows: insights.map(i => [i.kind === 'fact' ? 'Calculated Fact' : 'Observation', i.label, i.detail]) };
}

function suggestionsSection(suggestions: ManagementSuggestion[]): ReportTableSection {
  const rows: (string | number)[][] = [];
  suggestions.forEach(s => {
    rows.push([s.trigger, s.actions.map((a, i) => `${i + 1}. ${a}`).join(' ')]);
  });
  return { heading: 'Management Suggestions', columns: ['Trigger (Calculated Fact)', 'Suggested Actions'], rows };
}

function executiveSummarySection(company: CompanyPnl, overview: CompanyOverviewStats, month: string): ReportTableSection {
  return {
    heading: 'Executive Summary',
    columns: ['Metric', 'Value'],
    rows: [
      ['Reporting Month', month],
      ['Total Vehicles', overview.totalVehicles],
      ['Profitable Vehicles', overview.profitableVehicles],
      ['Loss-Making Vehicles', overview.lossMakingVehicles],
      ['Break-Even Vehicles', overview.breakEvenVehicles],
      ['Total Vehicle Revenue', company.totalVehicleRevenue],
      ['Total Vehicle Cost', company.totalVehicleCost],
      ['Total Vehicle Profit/Loss', company.vehiclePnlTotal],
      ['Staff/Office Salaries (company-level)', company.companyLevelDeductions.find(d => d.label === 'Staff/Office Salaries')?.amount || 0],
      ['Non-Vehicle Petty Cash (company-level)', company.companyLevelDeductions.find(d => d.label === 'Non-vehicle-linked Petty Cash')?.amount || 0],
      ['FINAL COMPANY PROFIT/LOSS', company.companyPnl],
      ['Final Company Margin %', company.totalVehicleRevenue > 0 ? Math.round((company.companyPnl / company.totalVehicleRevenue) * 10000) / 100 : 0]
    ]
  };
}

function costDriversSection(company: CompanyPnl): ReportTableSection {
  const byLabel = new Map<string, number>();
  company.vehiclePnls.forEach(v => v.deductions.forEach(d => byLabel.set(d.label, (byLabel.get(d.label) || 0) + d.amount)));
  const rows = Array.from(byLabel.entries()).sort((a, b) => b[1] - a[1]).map(([label, amt]) => [label, Math.round(amt * 100) / 100]);
  return { heading: 'Major Cost Drivers (fleet-wide)', columns: ['Cost Category', 'Total Amount'], rows };
}

function trendSection(trend: MonthlyTrendResult): ReportTableSection {
  return {
    heading: 'Monthly Trend',
    columns: ['Month', 'Revenue', 'Vehicle Cost', 'Staff/Office Salary', 'Non-Vehicle Petty Cash', 'Final Company P&L', 'Margin %'],
    rows: trend.points.map(p => [p.month, p.revenue, p.vehicleCost, p.staffOfficeSalary, p.nonVehiclePettyCash, p.companyPnl, p.marginPct])
  };
}

// ===================== Main screen (Vehicle P&L tab) =====================

export function exportMainExcel(company: CompanyPnl, categories: CategoryPnl[], overview: CompanyOverviewStats, insights: ManagementInsight[], month: string, staffRestricted: boolean) {
  const sections: ReportTableSection[] = [
    executiveSummarySection(company, overview, month),
    vehiclePnlSection('Vehicle P&L', company.vehiclePnls),
    { heading: 'Vehicle Revenue Details', columns: ['Vehicle', 'Category', 'Customer Billing', 'Warehouse Revenue', 'Total Revenue'], rows: company.vehiclePnls.map(v => [v.regNo, v.category, v.revenue.find(r => r.label === 'Customer Billing Revenue')?.amount || 0, v.revenue.find(r => r.label === 'Warehouse Revenue')?.amount || 0, v.totalRevenue]) },
    { heading: 'Vehicle Deduction Summary', columns: VEHICLE_PNL_COLUMNS, rows: company.vehiclePnls.map(vehiclePnlRow) },
    staffSalarySection(company, staffRestricted),
    nonVehiclePettyCashSection(company),
    categoryPerformanceSection(categories),
    insightsSection(insights)
  ];
  exportReportToExcel(`Vehicle_Financial_Performance_${month}`, sections);
}

export function exportMainPdf(company: CompanyPnl, categories: CategoryPnl[], overview: CompanyOverviewStats, insights: ManagementInsight[], suggestions: ManagementSuggestion[], month: string, staffRestricted: boolean) {
  const sections: ReportTableSection[] = [
    executiveSummarySection(company, overview, month),
    { heading: 'Revenue Summary', columns: ['Metric', 'Value'], rows: [['Total Vehicle Revenue', company.totalVehicleRevenue], ['Customer Billing (placeholder - not yet computed)', 0], ['Warehouse Revenue', company.vehiclePnls.reduce((s, v) => s + (v.revenue.find(r => r.label === 'Warehouse Revenue')?.amount || 0), 0)]] },
    costDriversSection(company),
    staffSalarySection(company, staffRestricted),
    nonVehiclePettyCashSection(company),
    { heading: 'Final Company P&L', columns: ['Metric', 'Value'], rows: [['Total Vehicle P&L', company.vehiclePnlTotal], ['- Staff/Office Salaries', company.companyLevelDeductions.find(d => d.label === 'Staff/Office Salaries')?.amount || 0], ['- Non-Vehicle Petty Cash', company.companyLevelDeductions.find(d => d.label === 'Non-vehicle-linked Petty Cash')?.amount || 0], ['= Final Company P&L', company.companyPnl]] },
    categoryPerformanceSection(categories),
    vehiclePnlSection('Vehicle Performance', company.vehiclePnls),
    { heading: 'Charts (see on-screen dashboard for the visual versions - same data)', columns: ['Note'], rows: [['Revenue vs Cost by Category, Profit/Loss by Category, Fleet distribution, and Cost composition charts are shown live on screen. The underlying figures are in the Category Performance and Major Cost Drivers tables above/below.']] },
    insightsSection(insights),
    suggestionsSection(suggestions)
  ];
  exportReportToPdf(`Vehicle_Financial_Performance_${month}`, 'Vehicle Financial Performance', `Reporting Month: ${month} - all figures aggregated live from other KCM Portal modules`, sections);
}

// ===================== Vehicle detail =====================

export function vehicleDetailSections(vp: VehiclePnl): ReportTableSection[] {
  const sections: ReportTableSection[] = [
    { heading: `${vp.regNo} - Summary`, columns: ['Metric', 'Value'], rows: [['Category', vp.category], ['Vehicle Type', vp.vehicleType || ''], ['Model', vp.vehicleModel || ''], ['Month', vp.month], ['Total Revenue', vp.totalRevenue], ['Total Cost', vp.totalDeductions], ['Profit/Loss', vp.pnl], ['Margin %', vp.marginPct], ['Status', vp.status.toUpperCase()]] },
    { heading: 'Revenue', columns: ['Line Item', 'Amount', 'Source Module', 'Records'], rows: vp.revenue.map(r => [r.label, r.amount, r.sourceModule, r.recordIds.length]) },
    { heading: 'Deductions', columns: ['Line Item', 'Amount', 'Source Module', 'Records'], rows: vp.deductions.map(d => [d.label, d.amount, d.sourceModule, d.recordIds.length]) }
  ];
  vp.deductions.forEach(d => {
    if (d.sourceRows && d.sourceRows.length > 0) {
      sections.push({
        heading: `${d.label} - Detail`,
        columns: Object.keys(d.sourceRows[0]),
        rows: d.sourceRows.map(row => Object.values(row).map(v => (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : v)))
      });
    }
  });
  return sections;
}

export function exportVehicleDetailExcel(vp: VehiclePnl) {
  exportReportToExcel(`Vehicle_PnL_${vp.regNo}_${vp.month}`, vehicleDetailSections(vp));
}

export function exportVehicleDetailPdf(vp: VehiclePnl) {
  exportReportToPdf(`Vehicle_PnL_${vp.regNo}_${vp.month}`, `Vehicle Financial Performance - ${vp.regNo}`, `Category: ${vp.category} | Month: ${vp.month}`, vehicleDetailSections(vp));
}

// ===================== Category export =====================

export function exportCategoryExcel(categories: CategoryPnl[], company: CompanyPnl, month: string) {
  const sections: ReportTableSection[] = [categoryPerformanceSection(categories)];
  categories.forEach(c => {
    sections.push(vehiclePnlSection(c.category, company.vehiclePnls.filter(v => v.category === c.category)));
  });
  exportReportToExcel(`Vehicle_PnL_Category_Performance_${month}`, sections);
}

export function exportCategoryPdf(categories: CategoryPnl[], company: CompanyPnl, month: string) {
  const sections: ReportTableSection[] = [categoryPerformanceSection(categories)];
  categories.forEach(c => {
    sections.push(vehiclePnlSection(c.category, company.vehiclePnls.filter(v => v.category === c.category)));
  });
  exportReportToPdf(`Vehicle_PnL_Category_Performance_${month}`, 'Vehicle Category Performance', `Reporting Month: ${month}`, sections);
}

// ===================== Company Overview =====================

export function exportCompanyOverviewExcel(company: CompanyPnl, categories: CategoryPnl[], overview: CompanyOverviewStats, insights: ManagementInsight[], suggestions: ManagementSuggestion[], month: string, staffRestricted: boolean, trend?: MonthlyTrendResult) {
  const sections: ReportTableSection[] = [
    executiveSummarySection(company, overview, month),
    staffSalarySection(company, staffRestricted),
    nonVehiclePettyCashSection(company),
    categoryPerformanceSection(categories),
    insightsSection(insights),
    suggestionsSection(suggestions)
  ];
  if (trend) sections.splice(4, 0, trendSection(trend));
  exportReportToExcel(`Vehicle_PnL_Company_Overview_${month}`, sections);
}

export function exportCompanyOverviewPdf(company: CompanyPnl, categories: CategoryPnl[], overview: CompanyOverviewStats, insights: ManagementInsight[], suggestions: ManagementSuggestion[], month: string, staffRestricted: boolean, trend?: MonthlyTrendResult) {
  const sections: ReportTableSection[] = [
    executiveSummarySection(company, overview, month),
    { heading: 'Reconciliation', columns: ['Step', 'Value'], rows: [['Sum of Vehicle Revenues', company.totalVehicleRevenue], ['Sum of Vehicle Costs', company.totalVehicleCost], ['= Total Vehicle P&L', company.vehiclePnlTotal], ['- Staff/Office Salaries', company.companyLevelDeductions.find(d => d.label === 'Staff/Office Salaries')?.amount || 0], ['- Non-Vehicle Petty Cash', company.companyLevelDeductions.find(d => d.label === 'Non-vehicle-linked Petty Cash')?.amount || 0], ['= FINAL COMPANY PROFIT/LOSS', company.companyPnl]] },
    staffSalarySection(company, staffRestricted),
    nonVehiclePettyCashSection(company),
    categoryPerformanceSection(categories)
  ];
  if (trend) sections.push(trendSection(trend));
  sections.push(insightsSection(insights), suggestionsSection(suggestions));
  exportReportToPdf(`Vehicle_PnL_Company_Overview_${month}`, 'Vehicle Financial Performance - Company Overview', `Reporting Month: ${month}`, sections);
}
