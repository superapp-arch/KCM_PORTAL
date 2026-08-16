import express from "express";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";
import upload from "./src/upload/upload.ts";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

import { createServer as createViteServer } from 'vite';
import { verifyPassword } from './src/auth/password.ts';
import { createSession, getSessionUser, destroySession, extractBearerToken, startSessionCleanup } from './src/auth/session.ts';
import { issueOtp, verifyOtp } from './src/auth/otp.ts';
import { istTimestamp, istDateKey, istHour, istMonthDayKey } from './src/auth/time.ts';
import { computeDueDateRaw } from './src/utils/loanDates.ts';
import { extractTrailingNumber } from './src/utils/sort.ts';
import { latestOdometerFor, computeKmStatus, computeAlignmentStatus, nextAlignmentDueKm, projectDueDate, daysUntil } from './src/utils/maintenanceDates.ts';
import {
  User,
  Vehicle,
  FuelLog,
  BillingInvoice,
  PettyCashVoucher,
  MaintenanceRecord,
  AccountsEntry,
  StaffEmployee,
  StaffSalaryDetail,
  StaffSalaryHike,
  StaffAdvanceDeduction,
  StaffProvidentFund,
  StaffAttendanceAdjustment,
  StaffBankDetail,
  StaffAttendance,
  StaffHoliday,
  AbnormalLogin,
  DashboardNotification,
  WarehouseEntry,
  MileageReport,
  FuelVendor,
  VehicleMileage,
  Vendor,
  DriverEmployee,
  DriverAttendance,
  DriverLocationCategory,
  VehicleLoan,
  BusinessLoan,
  MarketPodEntry,
  MarketPodBalanceReceipt,
  PettyCashAdvance,
  VehicleMaintenanceProfile,
  MaintenanceServiceStation,
  BreakdownReport,
  VehicleServiceSchedule,
  AlertSettings,
  TireBrand,
  TireRecord,
  BatteryRecord,
  ToolsChecklistRecord
} from './src/types.ts';
import {
  seedDatabase,
  DEFAULT_USERS,
  getUsers,
  updateUserPassword,
  migratePlaintextPasswords,
  getVehicles,
  saveVehicle,
  deleteVehicle,
  getFuelLogs,
  saveFuelLog,
  deleteFuelLog,
  getBillingInvoices,
  saveBillingInvoice,
  deleteBillingInvoice,
  getPettyCashVouchers,
  savePettyCashVoucher,
  deletePettyCashVoucher,
  getMarketPodEntries,
  saveMarketPodEntry,
  deleteMarketPodEntry,
  getPettyCashAdvances,
  savePettyCashAdvance,
  deletePettyCashAdvance,
  getMaintenanceRecords,
  saveMaintenanceRecord,
  deleteMaintenanceRecord,
  getVehicleMaintenanceProfiles,
  saveVehicleMaintenanceProfile,
  deleteVehicleMaintenanceProfile,
  getMaintenanceServiceStations,
  saveMaintenanceServiceStation,
  deleteMaintenanceServiceStation,
  getBreakdownReports,
  saveBreakdownReport,
  deleteBreakdownReport,
  getVehicleServiceSchedules,
  saveVehicleServiceSchedule,
  deleteVehicleServiceSchedule,
  getAlertSettings,
  saveAlertSettings,
  getTireBrands,
  addTireBrand,
  getTireRecords,
  saveTireRecord,
  deleteTireRecord,
  getBatteryRecords,
  saveBatteryRecord,
  deleteBatteryRecord,
  getToolsChecklistRecords,
  saveToolsChecklistRecord,
  deleteToolsChecklistRecord,
  migrateLegacyMaintenanceProfiles,
  getAccountsEntries,
  saveAccountsEntry,
  deleteAccountsEntry,
  getStaffEmployees,
  saveStaffEmployee,
  deleteStaffEmployee,
  getStaffSalaryDetails,
  saveStaffSalaryDetail,
  getStaffSalaryHikes,
  saveStaffSalaryHike,
  deleteStaffSalaryHike,
  getStaffAdvanceDeductions,
  saveStaffAdvanceDeduction,
  deleteStaffAdvanceDeduction,
  getStaffProvidentFundRecords,
  saveStaffProvidentFundRecord,
  getStaffAttendanceAdjustments,
  saveStaffAttendanceAdjustment,
  getStaffBankDetails,
  saveStaffBankDetail,
  getStaffAttendance,
  saveStaffAttendanceRecord,
  deleteStaffAttendanceRecord,
  getStaffHolidays,
  saveStaffHoliday,
  deleteStaffHoliday,
  getSalarySlips,
  saveSalarySlipRecord,
  getSalarySlipAudits,
  saveSalarySlipAuditRecord,
  getDriverSalarySlips,
  saveDriverSalarySlipRecord,
  getDriverSalarySlipAudits,
  saveDriverSalarySlipAuditRecord,
  getServiceInvoices,
  saveServiceInvoiceRecord,
  getServiceInvoiceAudits,
  saveServiceInvoiceAuditRecord,
  getAbnormalLogins,
  saveAbnormalLogin,
  resolveAllAbnormalLogins,
  getNotifications,
  saveNotification,
  resolveNotification,
  getWarehouseEntries,
  saveWarehouseEntry,
  deleteWarehouseEntry,
  getMileageReports,
  saveMileageReport,
  deleteMileageReport,
  getFuelVendors,
  saveFuelVendor,
  deleteFuelVendor,
  getVehicleMileages,
  saveVehicleMileage,
  deleteVehicleMileage,
  getVendors,
  saveVendor,
  deleteVendor,
  getDriverEmployees,
  saveDriverEmployee,
  deleteDriverEmployee,
  getDriverAttendance,
  saveDriverAttendanceRecord,
  deleteDriverAttendanceRecord,
  getVehicleLoans,
  saveVehicleLoan,
  deleteVehicleLoan,
  getBusinessLoans,
  saveBusinessLoan,
  deleteBusinessLoan
} from './src/db/service.ts';

// Parses "DD.MM.YYYY" or "YYYY-MM-DD" expiry strings used across fleet records.
function parseFlexibleDate(raw?: string): Date | null {
  if (!raw) return null;
  if (raw.includes('.')) {
    const parts = raw.split('.');
    if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    return null;
  }
  if (raw.includes('-')) return new Date(raw);
  return null;
}

// Formats a parsed expiry Date as DD-MM-YYYY for display, regardless of
// whichever format (DD.MM.YYYY, YYYY-MM-DD, ...) the source field was in.
function formatDateDDMMYYYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

// Compliance fields checked for upcoming expiry, each with its own alert window
// (days remaining until expiry) and notification id prefix.
const COMPLIANCE_CHECKS: Array<{
  key: string;
  mixedCaseKey: string;
  label: string;
  idPrefix: string;
  minDays: number;
  maxDays: number;
  type: 'insurance' | 'permit' | 'fc' | 'tax';
}> = [
  { key: 'insurance', mixedCaseKey: 'Insurance', label: 'Insurance', idPrefix: 'ins', minDays: 0, maxDays: 15, type: 'insurance' },
  { key: 'statePermit', mixedCaseKey: 'State permit', label: 'State Permit', idPrefix: 'permit-state', minDays: 0, maxDays: 15, type: 'permit' },
  { key: 'allIndiaPermit', mixedCaseKey: 'All India Permit', label: 'National (All India) Permit', idPrefix: 'permit-national', minDays: 0, maxDays: 15, type: 'permit' },
  { key: 'fc', mixedCaseKey: 'FC', label: 'FC (Fitness Certificate)', idPrefix: 'fc', minDays: 0, maxDays: 15, type: 'fc' },
  { key: 'tax', mixedCaseKey: 'Tax', label: 'Tax', idPrefix: 'tax', minDays: 0, maxDays: 15, type: 'tax' },
];

// The email digest only fires when a document is exactly this many days from
// expiry (checked once/day - see runScheduledComplianceDigest), instead of
// nagging every day inside a wide window. Kept in ascending order so digest
// rows sort soonest-first.
const ALERT_MILESTONE_DAYS = [3, 7, 15];

// Fleet Maintenance's own email milestones (Service Due / Wheel Alignment
// Due) - confirmed 3/5/7 days, distinct from compliance's 3/7/15.
const MAINTENANCE_ALERT_MILESTONE_DAYS = [3, 5, 7];

// --- Staff Salary & Attendance calculation helpers ---

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Effective Salary = CTC25 plus every hike whose effective date has already
// passed (hikes are modeled as rows - see StaffSalaryHike - so a new hike
// cycle never needs a schema change).
function computeEffectiveSalary(ctc25: number | undefined, hikes: StaffSalaryHike[], asOfDate: string): number {
  const applicable = hikes.filter(h => h.effectiveDate <= asOfDate);
  return (ctc25 || 0) + applicable.reduce((s, h) => s + (h.amount || 0), 0);
}

// Upserts one attendance day using a deterministic id (empId-date), so marking
// the same day twice updates it in place instead of creating a duplicate row.
async function upsertAttendanceEntry(entry: { empId: string; date: string; status: string; remarks?: string }) {
  const id = `${entry.empId}-${entry.date}`;
  const record: StaffAttendance = {
    id, empId: entry.empId, date: entry.date, status: entry.status as StaffAttendance['status'], remarks: entry.remarks
  };
  await saveStaffAttendanceRecord(record);
  return record;
}

const PAID_STATUSES = ['Present', 'PaidLeave', 'LeaveWithPermission', 'HalfDay', 'MedicalLeave', 'Holiday', 'WeekOff'];

// LOP days default to the count of 'AbsentLOP'-marked attendance rows, but HR
// can manually override this per employee/month (see StaffAttendanceAdjustment)
// - e.g. to waive or adjust a LOP count - and that override wins everywhere
// LOP is shown or used (summary modal, Provident Fund tab).
async function computeMonthlyAttendanceSummary(empId: string, month: string) {
  const [attendanceRows, adjustments] = await Promise.all([getStaffAttendance(), getStaffAttendanceAdjustments()]);
  const rows = attendanceRows.filter(a => a.empId === empId && a.date.startsWith(month));
  const totalDays = daysInMonth(month);
  const counts: Record<string, number> = {
    Present: 0, AbsentNoInfo: 0, AbsentLOP: 0, PaidLeave: 0, LeaveWithPermission: 0,
    HalfDay: 0, MedicalLeave: 0, Holiday: 0, WeekOff: 0
  };
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

  const override = adjustments.find(a => a.empId === empId && a.month === month)?.lopDaysOverride;
  const lopDays = override != null ? override : counts.AbsentLOP;

  const totalAbsent = counts.AbsentNoInfo + lopDays;
  const paidDays = rows.filter(r => PAID_STATUSES.includes(r.status)).length;
  const workingDays = totalDays - counts.Holiday - counts.WeekOff;
  const attendancePercentage = totalDays > 0 ? Math.round((paidDays / totalDays) * 1000) / 10 : 0;

  return {
    empId, month, totalDays, workingDays,
    presentDays: counts.Present, totalAbsent, halfDays: counts.HalfDay,
    paidLeaveDays: counts.PaidLeave, leaveWithPermissionDays: counts.LeaveWithPermission,
    medicalLeaveDays: counts.MedicalLeave, lopDays, lopIsOverridden: override != null,
    holidayDays: counts.Holiday, weekOffDays: counts.WeekOff,
    // Present + Paid Leave, both counted as "worked" for salary purposes -
    // used by Salary Breakup's Working Days stat (see StaffFormModal.tsx).
    salaryWorkingDays: counts.Present + counts.PaidLeave,
    attendancePercentage, rows
  };
}

// Driver Details' attendance model now mirrors Staff Attendance's full
// 9-status enum exactly (see computeMonthlyAttendanceSummary above) -
// AbsentLOP feeds LOP, LeaveWithPermission feeds "Exemption Leave" (the
// driver module's term for an approved absence that doesn't count as LOP).
async function computeDriverMonthlyAttendanceSummary(driverId: string, month: string) {
  const attendanceRows = await getDriverAttendance();
  const rows = attendanceRows.filter(a => a.driverId === driverId && a.date.startsWith(month));
  const totalDays = daysInMonth(month);
  const counts: Record<string, number> = {
    Present: 0, AbsentNoInfo: 0, AbsentLOP: 0, PaidLeave: 0, LeaveWithPermission: 0,
    HalfDay: 0, MedicalLeave: 0, Holiday: 0, WeekOff: 0
  };
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

  const lopDays = counts.AbsentLOP;
  const exemptionLeaveDays = counts.LeaveWithPermission;
  const totalAbsent = counts.AbsentNoInfo + lopDays;
  const paidDays = rows.filter(r => PAID_STATUSES.includes(r.status)).length;
  const workingDays = totalDays - counts.Holiday - counts.WeekOff;
  const attendancePercentage = totalDays > 0 ? Math.round((paidDays / totalDays) * 1000) / 10 : 0;

  return {
    driverId, month, totalDays, workingDays,
    presentDays: counts.Present, totalAbsent, halfDays: counts.HalfDay,
    paidLeaveDays: counts.PaidLeave, leaveWithPermissionDays: counts.LeaveWithPermission,
    medicalLeaveDays: counts.MedicalLeave, lopDays, exemptionLeaveDays,
    holidayDays: counts.Holiday, weekOffDays: counts.WeekOff,
    // Present + Paid Leave, both counted as "worked" for salary purposes -
    // used by the Salary tab's Working Days stat (see DriverFormModal.tsx).
    salaryWorkingDays: counts.Present + counts.PaidLeave,
    attendancePercentage, rows
  };
}

// Same math as computeDriverMonthlyAttendanceSummary above, but scoped to an
// arbitrary [from, to] date range instead of a fixed calendar month - powers
// the Driver Salary Slip's Date From/To pro-ration (a driver who only worked
// part of a month still gets a slip covering just that period). Wages Per
// Day still divides by the number of days in the *month `from` falls in*
// (not the range length) - a range spanning more than one calendar month is
// an edge case this doesn't specially handle, since Driver Salary's Gross
// Salary figure is itself always a single month's number.
async function computeDriverRangeAttendanceSummary(driverId: string, from: string, to: string) {
  const attendanceRows = await getDriverAttendance();
  const rows = attendanceRows.filter(a => a.driverId === driverId && a.date >= from && a.date <= to);
  const totalDaysInRange = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const counts: Record<string, number> = {
    Present: 0, AbsentNoInfo: 0, AbsentLOP: 0, PaidLeave: 0, LeaveWithPermission: 0,
    HalfDay: 0, MedicalLeave: 0, Holiday: 0, WeekOff: 0
  };
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

  return {
    driverId, from, to, totalDaysInRange,
    presentDays: counts.Present + counts.PaidLeave, // "worked" for salary purposes, same as salaryWorkingDays above
    lopDays: counts.AbsentLOP,
    exemptionLeaveDays: counts.LeaveWithPermission,
    daysInFromMonth: daysInMonth(from.slice(0, 7)),
    rows
  };
}

// HR & Payroll data is restricted to Bhagya and super admins - the frontend
// already hides the tab from everyone else, but that's UI-only. This is the
// actual enforcement: without it, anyone with a valid session token could
// call /api/staff/* directly (e.g. via devtools) and read or edit employee/
// salary data regardless of what the UI shows them.
async function requireHrAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin' && sessionUser.email !== 'bhagya@kcmlogistics.in') {
    return res.status(403).json({ error: 'You do not have access to HR & Payroll.' });
  }
  next();
}

// Ramesh was added alongside Chandan/Praveen so he can log/see his own fuel
// and mileage entries (see requireFuelAccess + filterEntryRowsForViewer below
// for the row-level "only your own entries" behavior every one of these three
// gets).
const FUEL_ENTRY_USER_EMAILS = ['chandanreddy@kcmlogistics.in', 'praveenkumar@kcmlogistics.in', 'ramesh@kcmlogistics.in'];

// Divya gets into Fuel Management too, but on a fundamentally different
// footing than the three above: she can see every entry (to manage RQ IDs
// across the whole ledger, not just her own - she doesn't own any rows) but
// cannot create/edit/delete entries at all, only update the rqId field on an
// existing one via PUT /api/fuel/:id/rq-id below.
const FUEL_RQ_ID_ONLY_EMAILS = ['divya@kcmlogistics.in'];

// Fuel Management + Mileage Report are restricted to Chandan, Praveen, Ramesh,
// Divya, and super admins - nobody else may access or see this data at all.
// Within that, see the row-level enteredBy filtering applied inside the
// /api/fuel and /api/mileage handlers themselves (this middleware only gates
// the module as a whole, the same two-layer pattern as requireHrAccess above).
async function requireFuelAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (
    sessionUser.department !== 'super_admin' &&
    !FUEL_ENTRY_USER_EMAILS.includes(sessionUser.email || '') &&
    !FUEL_RQ_ID_ONLY_EMAILS.includes(sessionUser.email || '')
  ) {
    return res.status(403).json({ error: 'You do not have access to Fuel Management.' });
  }
  next();
}

// Petty Cash's 3 logins - Vinod and Ramesh are already department
// 'petty_cash', Saneel is department 'maintenance' but also gets Petty Cash
// access, so this is an explicit email allowlist (mirrors FUEL_ENTRY_USER_EMAILS
// above) rather than relying on department alone.
const PETTY_CASH_ACCESS_EMAILS = ['vinod@kcmlogistics.in', 'ramesh@kcmlogistics.in', 'saneel@kcmlogistics.in'];

// Petty Cash (vouchers, Market POD, and the Amount Received advances ledger)
// is restricted to the 3 Petty Cash logins and super admins. Within that, each
// of the 3 only ever sees/modifies their own rows - see filterEntryRowsForViewer/
// canModifyEntryRow and their PettyCashAdvance-specific counterparts below.
async function requirePettyCashAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin' && sessionUser.department !== 'petty_cash' && !PETTY_CASH_ACCESS_EMAILS.includes(sessionUser.email || '')) {
    return res.status(403).json({ error: 'You do not have access to Petty Cash.' });
  }
  next();
}

// Warehouse Details is super-admin-only for now (the user may open it up to
// specific other roles later - this is the one place to widen that).
async function requireWarehouseAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin') {
    return res.status(403).json({ error: 'You do not have access to Warehouse Details.' });
  }
  next();
}

// Loan Management (Vehicle Loan + Business Loan) is restricted to super
// admins plus Rakshina - loan/financial data has no broader specified access
// group. This also gates the shared VehicleLoan record surfaced in Fleet &
// Vehicles' EMI Details tab (read-only there), so a regular Fleet user
// (vehicle_manager, etc.) can see that tab but not its data unless they're
// also allowed here.
const LOAN_ACCESS_EMAILS = ['finance@kcmlogistics.in'];

async function requireLoanAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin' && !LOAN_ACCESS_EMAILS.includes(sessionUser.email || '')) {
    return res.status(403).json({ error: 'You do not have access to Loan Management.' });
  }
  next();
}

const VENDOR_MANAGEMENT_EMAILS = ['divya@kcmlogistics.in', 'finance@kcmlogistics.in'];
// Chandan/Praveen (the Fuel Entry group) get read-only lookup access to
// vendor records so Fuel Entry's vehicle auto-fill/picker works for them,
// without letting them into the Vendor Management module itself.
const VENDOR_READ_ONLY_EMAILS = [...VENDOR_MANAGEMENT_EMAILS, ...FUEL_ENTRY_USER_EMAILS];

// GET /api/vendors: Divya, Rakshina, Chandan, Praveen, or super admin.
async function requireVendorReadAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin' && !VENDOR_READ_ONLY_EMAILS.includes(sessionUser.email || '')) {
    return res.status(403).json({ error: 'You do not have access to vendor records.' });
  }
  next();
}

// POST/PUT/DELETE /api/vendors*: Divya, Rakshina, or super admin only - the
// full Vendor Management module (Aadhar/PAN/bank fields included).
async function requireVendorManagementAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin' && !VENDOR_MANAGEMENT_EMAILS.includes(sessionUser.email || '')) {
    return res.status(403).json({ error: 'You do not have access to Vendor Management.' });
  }
  next();
}

// Petty Cash Entry No / Market POD Entry No are auto-generated server-side
// (never trusting whatever the client computed) so that two Petty Cash
// logins adding entries around the same time can never land on the same
// number - generating it client-side left a race window as wide as "form was
// open" (seconds to minutes), which is exactly how the same Entry No ended
// up assigned to multiple real entries. Computing it here, immediately
// before insert, shrinks that window to a single request, and the
// while-loop below is a belt-and-suspenders check against the (much
// smaller) remaining chance of two inserts landing back-to-back.
// Numbering scheme (per direct instruction, effective 2026-08-13):
// - Aug 2026 and earlier: flat ENT-<year>-<4-digit-seq>, continuing from
//   2673 for the rest of Aug 2026 specifically - the existing sequence had
//   accumulated duplicate/out-of-order numbers (confusing the Ledger's
//   Balance Net running total, which assumes Entry No order = real entry
//   order), and this floor skips past that mess without touching any
//   already-saved record.
// - Sep 2026 onward: ENT-<year>-<2-digit-month><2-digit-seq>, e.g.
//   ENT-2026-0901, 0902... - the 2-digit seq is a running count of entries
//   within that real calendar month (however many get entered per day),
//   resetting to 01 at the start of each new month. Month is always the
//   real calendar month the entry is being saved in, not the voucher's own
//   (possibly backdated) Date field - same "today's real date" convention
//   the year prefix already used before this change.
function nextPettyCashEntryNo(vouchers: PettyCashVoucher[]): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const useMonthlyFormat = year > 2026 || (year === 2026 && month >= 9);
  const existing = new Set(vouchers.map(v => (v.entryNo || '').toUpperCase()));

  if (useMonthlyFormat) {
    const prefix = `ENT-${year}-${String(month).padStart(2, '0')}`;
    let maxNum = 0;
    for (const v of vouchers) {
      const upper = (v.entryNo || '').toUpperCase();
      // Length check matters here - an old flat-format entry can share the
      // same "ENT-<year>-<MM>" characters as a coincidental substring
      // (e.g. old #0950 vs new month "09") without actually being one.
      if (!upper.startsWith(prefix) || upper.length !== prefix.length + 2) continue;
      const n = parseInt(upper.slice(prefix.length), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
    let candidate = `${prefix}${String(maxNum + 1).padStart(2, '0')}`;
    while (existing.has(candidate)) {
      maxNum++;
      candidate = `${prefix}${String(maxNum + 1).padStart(2, '0')}`;
    }
    return candidate;
  }

  const prefix = `ENT-${year}-`;
  let maxNum = (year === 2026 && month === 8) ? 2672 : 0;
  for (const v of vouchers) {
    const upper = (v.entryNo || '').toUpperCase();
    if (!upper.startsWith(prefix)) continue;
    const match = upper.match(/(\d+)$/);
    const n = match ? parseInt(match[1], 10) : 0;
    if (n > maxNum) maxNum = n;
  }
  let candidate = `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
  while (existing.has(candidate)) {
    maxNum++;
    candidate = `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
  }
  return candidate;
}

// Entry No. must be unique - enforced here, not just client-side, since a
// direct API call or a race between two near-simultaneous saves could
// otherwise slip a duplicate past the auto-generator's own collision check
// above. Only ever rejects a genuinely new-to-this-id entryNo; resubmitting
// a record's own unchanged value (the normal edit path, since Entry Number
// is read-only in the UI) always passes, so any duplicates already sitting
// in the database from before this check existed stay fully viewable and
// editable - nothing here touches or blocks them.
function findDuplicateEntryNo<T extends { id?: string; entryNo?: string }>(rows: T[], entryNo: string | undefined, excludeId?: string): boolean {
  const target = (entryNo || '').trim().toUpperCase();
  if (!target) return false;
  return rows.some(r => r.id !== excludeId && (r.entryNo || '').trim().toUpperCase() === target);
}

// Newest-first by default (Petty Cash Ledger / Market POD Trip Ledger) -
// sorted here, server-side, not left to the client, so the order is correct
// no matter what the UI later filters/searches on top. Ties (same date)
// break on Entry No, newest sequence first - mirrors PettyCash.tsx's own
// tie-break rule exactly, so the two never disagree.
function sortEntriesByDate<T extends { date: string; entryNo?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return extractTrailingNumber(b.entryNo) - extractTrailingNumber(a.entryNo);
  });
}

// Keeps a Market POD trip's Received Advance and any recorded Balance
// Settlement receipts in sync with the Petty Cash module's Total Received
// Float, as real PettyCashAdvance rows - identical treatment to a manually
// logged Amount Received entry in every downstream calculation (receivedFor,
// currentBalanceFor, the Consolidated Summary, the combined report), rather
// than a parallel figure that has to be kept consistent by hand.
//
// Deterministic ids (`mp-adv-<tripId>` for the advance, `mp-bal-<tripId>-
// <receiptId>` per balance receipt) mean this can just be called after every
// save with the trip's current state - no separate link field to track, and
// calling it twice is always safe (upsert-or-delete, never duplicates).
// Handles every case point 3 asks for from one place: initial creation,
// amount edits, and Payment Mode flips in either direction (an existing
// linked advance is deleted the moment the trip stops being 'Petty Cash',
// so the float only ever reflects money that's actually routed there).
async function syncMarketPodPettyCashLinks(entry: MarketPodEntry, ownerUsername: string): Promise<void> {
  const isPettyCash = entry.paymentMode === 'Petty Cash';
  const advanceId = `mp-adv-${entry.id}`;
  if (isPettyCash && (entry.receivedAdvance || 0) > 0) {
    await savePettyCashAdvance({
      id: advanceId,
      username: ownerUsername,
      amount: entry.receivedAdvance || 0,
      date: entry.date,
      remarks: `Auto - Market POD Trip ${entry.entryNo} (Received Advance)`,
      source: 'market-pod-advance',
      marketPodEntryId: entry.id
    });
  } else {
    await deletePettyCashAdvance(advanceId);
  }

  for (const receipt of entry.balanceReceipts || []) {
    const balanceAdvanceId = `mp-bal-${entry.id}-${receipt.id}`;
    if (isPettyCash) {
      await savePettyCashAdvance({
        id: balanceAdvanceId,
        username: ownerUsername,
        amount: receipt.amount,
        date: receipt.date,
        remarks: `Auto - Market POD Trip ${entry.entryNo} (Balance Settlement)`,
        source: 'market-pod-balance',
        marketPodEntryId: entry.id
      });
    } else {
      await deletePettyCashAdvance(balanceAdvanceId);
    }
  }
}

// Reverses every float impact a trip ever had - called before it's deleted,
// per point 3's "if a trip is deleted after its balance was received,
// reverse the float impact" (and the same for its Received Advance, if any).
async function removeMarketPodPettyCashLinks(entry: MarketPodEntry): Promise<void> {
  await deletePettyCashAdvance(`mp-adv-${entry.id}`);
  for (const receipt of entry.balanceReceipts || []) {
    await deletePettyCashAdvance(`mp-bal-${entry.id}-${receipt.id}`);
  }
}

// One-time backfill (safe to run on every startup - cheap no-op once caught
// up): syncMarketPodPettyCashLinks only ever ran on a trip's own
// add/edit/delete/balance-receipt action, so any trip saved with Payment
// Mode = Petty Cash *before* that sync existed, and never touched since, was
// missing its float entry entirely. This walks every Market POD trip once
// and syncs whichever ones are still missing their deterministic
// mp-adv-<id>/mp-bal-<id>-<receiptId> link, so historical advances count
// toward the float exactly like this session's Change Request part 2 asked -
// "identical treatment to a manually logged Amount Received entry".
async function backfillMarketPodPettyCashFloats(): Promise<void> {
  try {
    const [entries, advances] = await Promise.all([getMarketPodEntries(), getPettyCashAdvances()]);
    const advanceIds = new Set(advances.map(a => a.id));
    let synced = 0;
    const skippedNoOwner: string[] = [];

    for (const entry of entries) {
      if (entry.paymentMode !== 'Petty Cash') continue;
      const needsAdvance = (entry.receivedAdvance || 0) > 0 && !advanceIds.has(`mp-adv-${entry.id}`);
      const needsBalance = (entry.balanceReceipts || []).some(r => !advanceIds.has(`mp-bal-${entry.id}-${r.id}`));
      if (!needsAdvance && !needsBalance) continue;

      // enteredBy is the only signal for which of the 3 Petty Cash logins
      // this trip's money belongs to - a handful of very old trips saved
      // before that field was stamped have none, and there's no safe way to
      // guess whose float to credit, so those are skipped (logged) rather
      // than attributed to the wrong person.
      if (!entry.enteredBy) { skippedNoOwner.push(entry.entryNo); continue; }

      await syncMarketPodPettyCashLinks(entry, entry.enteredBy);
      synced++;
    }

    if (synced > 0) console.log(`Backfilled Petty Cash float for ${synced} pre-existing Market POD trip(s).`);
    if (skippedNoOwner.length > 0) console.warn(`Skipped Petty Cash float backfill for ${skippedNoOwner.length} Market POD trip(s) with no recorded handler (enteredBy): ${skippedNoOwner.join(', ')}`);
  } catch (error) {
    console.error('Market POD -> Petty Cash float backfill failed:', error);
  }
}

function nextMarketPodEntryNo(entries: MarketPodEntry[]): string {
  const existing = new Set(entries.map(e => (e.entryNo || '').toUpperCase()));
  let maxNum = 0;
  for (const e of entries) {
    const match = (e.entryNo || '').match(/(\d+)$/);
    const n = match ? parseInt(match[1], 10) : 0;
    if (n > maxNum) maxNum = n;
  }
  let candidate = `TRIP-${String(maxNum + 1).padStart(6, '0')}`;
  while (existing.has(candidate.toUpperCase())) {
    maxNum++;
    candidate = `TRIP-${String(maxNum + 1).padStart(6, '0')}`;
  }
  return candidate;
}

// Applies the Chandan/Praveen row-level visibility rule shared by /api/fuel
// and /api/mileage: super admins see every row with enteredBy intact; anyone
// else only sees rows they personally entered, with enteredBy stripped out
// (that "who entered it" information is for super admins only - even the
// entering user themselves doesn't see it on their own rows).
// `fullViewEmails` is an opt-in extra allowlist for callers that need a
// specific non-super-admin to see every row too (e.g. Divya on /api/fuel, to
// manage RQ IDs across the whole ledger) - every other caller (petty-cash,
// market-pod, mileage) omits it and keeps the plain super-admin-only rule.
function filterEntryRowsForViewer<T extends { enteredBy?: string }>(rows: T[], sessionUser?: Awaited<ReturnType<typeof getSessionUser>>, fullViewEmails: string[] = []): T[] {
  if (!sessionUser) return [];
  if (sessionUser.department === 'super_admin' || fullViewEmails.includes(sessionUser.email || '')) return rows;
  return rows
    .filter(r => r.enteredBy === sessionUser.username)
    .map(r => { const { enteredBy, ...rest } = r; return rest as T; });
}

// Lighter cousin of filterEntryRowsForViewer, for shared team ledgers (Fleet
// Maintenance work orders, Driver Attendance) where every row must stay
// visible to everyone within scope - only the "who entered/marked it"
// metadata field itself is Super-Admin-only, unlike Fuel/Petty Cash/Market
// POD/Mileage where the whole ROW is restricted to its own entrant.
function maskAttributionField<T extends Record<string, any>>(rows: T[], field: keyof T, sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): T[] {
  if (sessionUser?.department === 'super_admin') return rows;
  return rows.map(r => { const copy = { ...r }; delete copy[field]; return copy; });
}

// Safety net for attendance/petty-cash/fuel/mileage entry dates - the UI
// already disables future dates at the calendar-widget level (DateInput's
// max prop, or the attendance grids' disabled day cells), but this catches
// anyone bypassing that (e.g. a raw API call). Same yyyy-mm-dd "today"
// convention every date default in this codebase already uses (server's own
// local clock, consistent with how every "today" default is computed
// client-side too - not a separate timezone standard).
function isFutureDate(date: string | undefined | null): boolean {
  if (!date) return false;
  return date.slice(0, 10) > new Date().toISOString().slice(0, 10);
}

// A non-super-admin may only modify (update/delete) a row they themselves
// created - mirrors the read-side filtering above for write operations.
function canModifyEntryRow(row: { enteredBy?: string } | undefined, sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): boolean {
  if (!sessionUser) return false;
  if (sessionUser.department === 'super_admin') return true;
  return !!row && row.enteredBy === sessionUser.username;
}

// Same two rules as above, but for PettyCashAdvance rows, which are keyed by
// `username` (whose ledger the advance belongs to) rather than `enteredBy`
// (who happened to log the row) - the two normally coincide for Petty Cash's
// 3 logins, but `username` is what actually matters for whose balance an
// advance counts toward.
function filterAdvancesForViewer(rows: PettyCashAdvance[], sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): PettyCashAdvance[] {
  if (!sessionUser) return [];
  if (sessionUser.department === 'super_admin') return rows;
  return rows.filter(r => r.username === sessionUser.username);
}

function canModifyAdvance(row: PettyCashAdvance | undefined, sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): boolean {
  if (!sessionUser) return false;
  if (sessionUser.department === 'super_admin') return true;
  return !!row && row.username === sessionUser.username;
}

// Driver Details is location-scoped rather than a single fixed access group -
// each regional handler only sees/manages drivers in their assigned
// location(s); Super Admins see every location. This is the WRITE scope
// (add/edit/delete drivers, mark/edit attendance) - see DRIVER_VIEW_ALL_EMAILS
// below for the separate, broader read scope.
const DRIVER_LOCATION_SCOPES: Record<string, DriverLocationCategory[]> = {
  'rajeshwar@kcmlogistics.in': ['Hyd Swiggy', 'Swiggy - Vizag Driver'],
  'nagaraju.linga@kcmlogistics.in': ['Hyd Swiggy', 'Swiggy - Vizag Driver', 'Walkes & Parking Drivers HYD', 'Vijayawada Drivers Details'],
  'ramesh@kcmlogistics.in': ['Nelmangala Reliance', 'Nidaghatta Reliance', 'Chennai Hybrid', 'Swiggy DHL'],
  'saneel@kcmlogistics.in': ['BLR Swiggy', 'Goa Vehicle', 'Cold Star BLR', 'Belgaum Drivers Details'],
  'hemanth@kcmlogistics.in': ['BLR Swiggy', 'Goa Vehicle', 'Cold Star BLR', 'Belgaum Drivers Details'],
  'vinod@kcmlogistics.in': ['Market Vehicle Driver Details', 'HSK RIL F&V Drivers', 'KCM Service Station']
};

// Bhagya and Divya get every location (like a super admin) rather than a
// single region - their roles already span HR/Billing/Fleet/Vendor admin
// duties. Both read and write everywhere.
const DRIVER_ALL_LOCATIONS_EMAILS = ['bhagya@kcmlogistics.in', 'divya@kcmlogistics.in'];

// Vinod: can VIEW every Driver Details location (drivers + attendance,
// read-only outside his own scope), but may only ADD/EDIT/DELETE drivers and
// mark/edit attendance within his own DRIVER_LOCATION_SCOPES entry above -
// a view-all/write-scoped tier distinct from DRIVER_ALL_LOCATIONS_EMAILS.
const DRIVER_VIEW_ALL_EMAILS = ['vinod@kcmlogistics.in'];

async function requireDriverAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (
    sessionUser.department !== 'super_admin' &&
    !DRIVER_ALL_LOCATIONS_EMAILS.includes(sessionUser.email || '') &&
    !DRIVER_VIEW_ALL_EMAILS.includes(sessionUser.email || '') &&
    !DRIVER_LOCATION_SCOPES[sessionUser.email || '']
  ) {
    return res.status(403).json({ error: 'You do not have access to Driver Details.' });
  }
  next();
}

// Read scope: which locations' drivers/attendance a GET returns. Super
// admins, Bhagya/Divya, and Vinod (view-all) get every location; everyone
// else only their assigned DRIVER_LOCATION_SCOPES set.
function getAllowedDriverViewLocations(sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): DriverLocationCategory[] | 'ALL' {
  if (!sessionUser) return [];
  if (
    sessionUser.department === 'super_admin' ||
    DRIVER_ALL_LOCATIONS_EMAILS.includes(sessionUser.email || '') ||
    DRIVER_VIEW_ALL_EMAILS.includes(sessionUser.email || '')
  ) return 'ALL';
  return DRIVER_LOCATION_SCOPES[sessionUser.email || ''] || [];
}

// Write scope: which locations a user may add/edit/delete drivers in, or
// mark/edit attendance for. Narrower than view scope for DRIVER_VIEW_ALL_EMAILS
// (Vinod sees every location but can only write within his own).
function getAllowedDriverWriteLocations(sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): DriverLocationCategory[] | 'ALL' {
  if (!sessionUser) return [];
  if (sessionUser.department === 'super_admin' || DRIVER_ALL_LOCATIONS_EMAILS.includes(sessionUser.email || '')) return 'ALL';
  return DRIVER_LOCATION_SCOPES[sessionUser.email || ''] || [];
}

function canViewDriverLocation(location: string, sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): boolean {
  const allowed = getAllowedDriverViewLocations(sessionUser);
  return allowed === 'ALL' || allowed.includes(location as DriverLocationCategory);
}

function canWriteDriverLocation(location: string, sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): boolean {
  const allowed = getAllowedDriverWriteLocations(sessionUser);
  return allowed === 'ALL' || allowed.includes(location as DriverLocationCategory);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  // Initialize and seed the database, then upgrade any legacy plain-text
  // passwords left over from before hashing was introduced.
  await seedDatabase();
  await migratePlaintextPasswords();
  // Sessions are DB-backed (see src/auth/session.ts) - this just sweeps out
  // rows nobody has touched in a while so the table doesn't grow forever.
  // Not required for correctness (getSessionUser already rejects expired
  // sessions on lookup regardless of whether the row still exists).
  startSessionCleanup();
  // Fleet Maintenance rebuild: one-time conversion of any pre-existing
  // combined Vehicle Maintenance Profiles into the new Service Schedule /
  // Tire / Battery / Tools Checklist tables (no-op once already migrated).
  await migrateLegacyMaintenanceProfiles();
  // Petty Cash / Market POD change request part 2: backfill pre-existing
  // Petty-Cash-mode trips that predate the float-sync logic (see
  // backfillMarketPodPettyCashFloats above) - no-op once every trip's
  // already synced.
  await backfillMarketPodPettyCashFloats();

  // Sessions, OTPs, and password hashing/verification are handled by the
  // dedicated modules under src/auth - see session.ts, otp.ts, password.ts.

  async function getUsersWithFallback() {
    try {
      const usersList = await getUsers();
      if (!Array.isArray(usersList) || usersList.length === 0) {
        console.warn('User table returned no rows; falling back to seeded users.');
        return DEFAULT_USERS;
      }
      return usersList;
    } catch (error) {
      console.error('Unable to retrieve users from DB, using seeded fallback users.', error);
      return DEFAULT_USERS;
    }
  }

  // Checks a saved vehicle's insurance/permit/FC/tax expiry dates against their
  // alert windows and persists a compliance notification (shown on the Super
  // Admin dashboard bell). Actual emailing runs on its own daily schedule - see
  // runScheduledComplianceDigest below.
  async function checkAndNotifyComplianceAlerts(vehicle: Vehicle) {
    const regNo = vehicle['Reg. No.'] || vehicle.regNo || vehicle.id || 'unknown';
    const today = new Date();
    const existingNotifs = await getNotifications();

    for (const check of COMPLIANCE_CHECKS) {
      const raw = (vehicle as any)[check.key] || (vehicle as any)[check.mixedCaseKey];
      const notifId = `${check.idPrefix}-${regNo}`;
      const existing = existingNotifs.find((n: any) => n.id === notifId);

      const expDate = parseFlexibleDate(raw);
      const diffDays = expDate && !isNaN(expDate.getTime())
        ? Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const inAlertWindow = diffDays != null && diffDays >= check.minDays && diffDays <= check.maxDays;

      if (!inAlertWindow) {
        // The date was updated (renewed/corrected) and no longer falls in the
        // imminent-expiry window - auto-resolve any stale unresolved alert
        // instead of leaving it stuck showing the old expiry forever.
        if (existing && !existing.read && (existing as any).status !== 'Resolved') {
          await resolveNotification(notifId);
        }
        continue;
      }

      if (existing && (existing.read || (existing as any).status === 'Resolved')) continue; // stays resolved until it re-enters a fresh alert window

      await saveNotification({
        id: notifId,
        title: `${check.label} Expiry Alert`,
        message: `Vehicle ${regNo} ${check.label.toLowerCase()} expires on ${raw} (${diffDays} day${diffDays === 1 ? '' : 's'} left). Emailed to Super Admin & Vehicle Data Manager at the 15/7/3-day mark.`,
        type: check.type,
        timestamp: istTimestamp(),
        read: false,
        vehicleRegNo: regNo
      });
    }
  }

  // Compliance items that are exactly 3, 7, or 15 days from expiry today -
  // these are the only ones the email digest sends (see ALERT_MILESTONE_DAYS),
  // so the same vehicle only triggers an email on those three specific days
  // rather than every day it happens to sit inside a wide alert window.
  async function calculateMilestoneAlerts() {
    const alerts: any[] = [];
    const today = new Date();
    const fleetVehicles = await getVehicles();

    fleetVehicles.forEach((v: any) => {
      const regNo = v['Reg. No.'] || v.regNo || v.id;

      COMPLIANCE_CHECKS.forEach(check => {
        const raw = v[check.key] || v[check.mixedCaseKey];
        const expDate = parseFlexibleDate(raw);
        if (!expDate || isNaN(expDate.getTime())) return;

        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (!ALERT_MILESTONE_DAYS.includes(diffDays)) return;

        alerts.push({
          vehicleRegNo: regNo,
          checkLabel: check.label,
          expiryDate: formatDateDDMMYYYY(expDate),
          diffDays
        });
      });
    });

    // Ascending by days left, so 3-day items lead the email, then 7-day, then 15-day.
    return alerts.sort((a, b) => a.diffDays - b.diffDays);
  }

  // Fleet Maintenance's own milestone check (Service Due / Wheel Alignment
  // Due), mirroring calculateMilestoneAlerts above but KM-driven: each
  // vehicle/tire's remaining KM is projected to a calendar date via its own
  // trailing-30-day average km/day (see projectDueDate), then that projected
  // date is checked against MAINTENANCE_ALERT_MILESTONE_DAYS. A vehicle with
  // too little recent mileage history to project a rate is simply skipped
  // here (it still shows on the module's own live KM-based dashboard
  // widgets - see calculateMaintenanceDynamicAlerts below - just without a
  // day-count email).
  async function calculateMaintenanceMilestoneAlerts() {
    const alerts: any[] = [];
    const [schedules, tires, mileage] = await Promise.all([
      getVehicleServiceSchedules(),
      getTireRecords(),
      getMileageReports()
    ]);

    const projectedDateLabel = (isoDate: string) => {
      const [y, m, d] = isoDate.split('-').map(Number);
      return formatDateDDMMYYYY(new Date(y, m - 1, d));
    };

    schedules.forEach(schedule => {
      if (schedule.lastServiceKm == null) return;
      const currentKm = latestOdometerFor(schedule.regNo, mileage as any);
      if (currentKm == null) return;
      const remaining = (schedule.lastServiceKm + (schedule.serviceIntervalKm || 10000)) - currentKm;
      const projected = projectDueDate(schedule.regNo, remaining, mileage as any);
      if (!projected) return;
      const diffDays = daysUntil(projected);
      if (!MAINTENANCE_ALERT_MILESTONE_DAYS.includes(diffDays)) return;
      alerts.push({ vehicleRegNo: schedule.regNo, category: 'Service Due', checkLabel: 'Scheduled Service', expiryDate: projectedDateLabel(projected), diffDays });
    });

    tires.filter(tire => tire.isCurrent !== false).forEach(tire => {
      if (tire.lastAlignmentKm == null) return;
      const currentKm = latestOdometerFor(tire.regNo, mileage as any);
      if (currentKm == null) return;
      const dueAt = nextAlignmentDueKm(tire.lastAlignmentKm)!;
      const projected = projectDueDate(tire.regNo, dueAt - currentKm, mileage as any);
      if (!projected) return;
      const diffDays = daysUntil(projected);
      if (!MAINTENANCE_ALERT_MILESTONE_DAYS.includes(diffDays)) return;
      alerts.push({ vehicleRegNo: tire.regNo, category: 'Wheel Alignment', checkLabel: `Wheel Alignment (${tire.position})`, expiryDate: projectedDateLabel(projected), diffDays });
    });

    return alerts.sort((a, b) => a.diffDays - b.diffDays);
  }

  // --- Service Due (Reefer/Hybrid) & Washing Due (Walkes) staged reminder
  // emails - fixed calendar-day cycles (unlike calculateMaintenanceMilestoneAlerts
  // above, which is km/projected-date driven), confirmed 40-day service /
  // 15-day washing cycles with 15/7/3 and 7/5/3 day reminders respectively.
  // Cycle lengths + reminder thresholds are configurable (see AlertSettings,
  // Service Schedule's own Alert Settings panel) rather than hardcoded. Dry-
  // category vehicles are untouched by this - they only ever get the
  // existing km-based Service Schedule alerts above.
  function addDaysToIsoDate(dateStr: string, days: number): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return dt;
  }

  interface ServiceWashingReminder {
    regNo: string;
    vehicleType: string; // Fleet & Vehicles' own Category value, e.g. 'Reefer', 'Hybrid', 'Walkes'
    alertType: 'Service Due' | 'Washing Due';
    dueDate: string; // YYYY-MM-DD
    daysRemaining: number;
    // The cycle's own anchor date (lastServiceDate/lastWashingDate) - baked
    // into the dedup marker id below, so a newly-logged service/wash (a new
    // cycle) is never blocked by an already-sent marker from the old one.
    cycleStartDate: string;
  }

  async function calculateServiceWashingReminders(): Promise<ServiceWashingReminder[]> {
    const [schedules, fleetVehicles, settings] = await Promise.all([
      getVehicleServiceSchedules(),
      getVehicles(),
      getAlertSettings()
    ]);

    const categoryFor = (regNo: string): string => {
      const v: any = fleetVehicles.find((veh: any) =>
        (veh.regNo || veh['Reg. No.'] || '').trim().toUpperCase() === regNo.trim().toUpperCase()
      );
      return String(v?.Category || v?.category || '').trim();
    };

    const todayKey = istDateKey();
    const today = new Date(`${todayKey}T00:00:00`);
    const reminders: ServiceWashingReminder[] = [];

    schedules.forEach(schedule => {
      const category = categoryFor(schedule.regNo).toLowerCase();

      if ((category === 'reefer' || category === 'hybrid') && schedule.lastServiceDate) {
        const due = addDaysToIsoDate(schedule.lastServiceDate, settings.reeferHybridServiceCycleDays);
        const daysRemaining = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (settings.reeferHybridReminderDays.includes(daysRemaining)) {
          reminders.push({
            regNo: schedule.regNo,
            vehicleType: category === 'reefer' ? 'Reefer' : 'Hybrid',
            alertType: 'Service Due',
            dueDate: due.toISOString().slice(0, 10),
            daysRemaining,
            cycleStartDate: schedule.lastServiceDate
          });
        }
      }

      if (category === 'walkes' && schedule.lastWashingDate) {
        const due = addDaysToIsoDate(schedule.lastWashingDate, settings.walkesWashingCycleDays);
        const daysRemaining = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (settings.walkesReminderDays.includes(daysRemaining)) {
          reminders.push({
            regNo: schedule.regNo,
            vehicleType: 'Walkes',
            alertType: 'Washing Due',
            dueDate: due.toISOString().slice(0, 10),
            daysRemaining,
            cycleStartDate: schedule.lastWashingDate
          });
        }
      }
    });

    return reminders.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  // Sends one email per due vehicle/milestone (not a combined digest, unlike
  // buildAndSendComplianceDigest below) since each carries its own urgency-
  // scaled subject line. Dedup is per marker (regNo + cycleStartDate +
  // daysRemaining) via the same persisted-notification-marker idiom as
  // sendTodaysBirthdayWishes, so a milestone is never emailed twice even if
  // the hourly check reruns, and a new cycle is never blocked by the old
  // one's markers (see cycleStartDate above). Recipients are the same
  // Super Admin + Chandana list every other Fleet alert already uses.
  async function sendServiceWashingReminders(): Promise<{ sent: number; details: string[] }> {
    const reminders = await calculateServiceWashingReminders();
    if (reminders.length === 0) return { sent: 0, details: [] };

    const existingNotifs = await getNotifications();
    const usersList = await getUsersWithFallback();
    const recipients = usersList
      .filter((u: any) => u.department === 'super_admin' || u.username === 'chandana')
      .map((u: any) => u.email)
      .filter(Boolean) as string[];
    if (recipients.length === 0) return { sent: 0, details: [] };

    const appUrl = process.env.APP_URL || process.env.SITE_URL || '';
    let sentCount = 0;
    const details: string[] = [];

    for (const r of reminders) {
      const markerPrefix = r.alertType === 'Service Due' ? 'service' : 'washing';
      const markerId = `${markerPrefix}-reminder-${r.regNo}-${r.cycleStartDate}-${r.daysRemaining}`;
      if (existingNotifs.some((n: any) => n.id === markerId)) continue;

      const subjectEmoji = r.daysRemaining <= 3 ? '🚨' : r.daysRemaining <= 7 ? '⚠️' : '📅';
      const linkHtml = appUrl
        ? `<p><a href="${appUrl}" style="color:#2563eb;">Open ${r.regNo}'s record in Fleet Maintenance → Service Schedule</a></p>`
        : `<p>Open Fleet Maintenance → Service Schedule and search for <strong>${r.regNo}</strong>.</p>`;

      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'alerts@kcmlogistics.in',
          to: recipients,
          subject: `${subjectEmoji} ${r.alertType} in ${r.daysRemaining} day${r.daysRemaining === 1 ? '' : 's'} - ${r.regNo}`,
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;font-size:14px;color:#1e293b;">
              <p>Hello,</p>
              <p><strong>${r.regNo}</strong> (${r.vehicleType}) has its <strong>${r.alertType}</strong> coming up.</p>
              <table style="border-collapse:collapse;font-size:13px;margin:10px 0;">
                <tr><td style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;">Vehicle</td><td style="padding:6px 10px;border:1px solid #e2e8f0;font-family:monospace;">${r.regNo}</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;">Vehicle Type</td><td style="padding:6px 10px;border:1px solid #e2e8f0;">${r.vehicleType}</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;">Alert Type</td><td style="padding:6px 10px;border:1px solid #e2e8f0;">${r.alertType}</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;">Due Date</td><td style="padding:6px 10px;border:1px solid #e2e8f0;font-family:monospace;">${r.dueDate}</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;">Days Remaining</td><td style="padding:6px 10px;border:1px solid #e2e8f0;"><strong>${r.daysRemaining}</strong></td></tr>
              </table>
              ${linkHtml}
            </div>
          `
        });

        // read: false (unlike the compliance digest's own marker) so this
        // also surfaces as an in-app notification badge on the Super Admin
        // Terminal bell, not just a silent audit-log row.
        await saveNotification({
          id: markerId,
          title: `${r.alertType}: ${r.regNo} in ${r.daysRemaining} day${r.daysRemaining === 1 ? '' : 's'}`,
          message: `${r.vehicleType} vehicle ${r.regNo}'s ${r.alertType.toLowerCase()} on ${r.dueDate}.`,
          type: r.alertType === 'Service Due' ? 'service-due' : 'washing-due',
          timestamp: istTimestamp(),
          read: false,
          vehicleRegNo: r.regNo
        });

        sentCount++;
        details.push(`${r.regNo} (${r.alertType}, ${r.daysRemaining}d)`);
      } catch (error) {
        console.error(`Failed to send ${r.alertType} reminder for ${r.regNo}:`, error);
      }
    }

    return { sent: sentCount, details };
  }

  // Automatic trigger - runs on the same hourly interval as the other Fleet
  // alerts. No time-of-day gate (unlike the birthday check) since this isn't
  // tied to a specific send hour, just "at least once today" - the marker
  // dedup above already prevents re-sending within the same day regardless
  // of how many times the hourly tick lands.
  async function runScheduledServiceWashingReminders() {
    try {
      await sendServiceWashingReminders();
    } catch (error) {
      console.error('Failed to run scheduled service/washing reminder check:', error);
    }
  }

  // Builds and sends the combined Fleet digest email right now - every
  // vehicle whose insurance/permit/FC/tax expiry, scheduled service, or wheel
  // alignment falls exactly on its 3/7/15 (compliance) or 3/5/7 (maintenance)
  // day milestone today, sorted soonest-first - to the Super Admin(s) and the
  // Vehicle Data Manager (Chandana), same recipients as before this covered
  // maintenance too. Used both by the automatic daily schedule and the manual
  // "Send Alerts Now" button; the manual path always sends regardless of
  // whether today's automatic digest already went out.
  async function buildAndSendComplianceDigest(): Promise<{ sent: boolean; count: number; recipients: string[] }> {
    const [complianceAlerts, maintenanceAlerts] = await Promise.all([
      calculateMilestoneAlerts(),
      calculateMaintenanceMilestoneAlerts()
    ]);
    const sortedAlerts = [...complianceAlerts, ...maintenanceAlerts].sort((a, b) => a.diffDays - b.diffDays);
    if (sortedAlerts.length === 0) return { sent: false, count: 0, recipients: [] };

    const usersList = await getUsersWithFallback();
    const recipients = usersList
      .filter((u: any) => u.department === 'super_admin' || u.username === 'chandana')
      .map((u: any) => u.email)
      .filter(Boolean) as string[];

    if (recipients.length === 0) return { sent: false, count: 0, recipients: [] };

    const todayKey = istDateKey();
    // Compliance rows (Insurance/Permit/FC/Tax) don't carry their own
    // category label the way the maintenance ones do (checkLabel already IS
    // the check type for compliance, e.g. "Insurance") - default the column
    // to "Compliance" for those.
    const rows = sortedAlerts.map((a: any) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;font-family:monospace;">${a.vehicleRegNo}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">${a.category || 'Compliance'}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">${a.checkLabel}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;font-family:monospace;">${a.expiryDate}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center;">${a.diffDays}</td>
      </tr>
    `).join('');

    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'alerts@kcmlogistics.in',
      to: recipients,
      subject: 'KCM Fleet Compliance & Maintenance Digest',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;">
          <p>Hello,</p>
          <p>The following documents, scheduled services, and wheel alignments are coming due - please action before the due date.</p>
          <table style="border-collapse:collapse;font-size:13px;">
            <thead>
              <tr>
                <th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;text-align:left;">Vehicle No</th>
                <th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;text-align:left;">Category</th>
                <th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;text-align:left;">Item</th>
                <th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;text-align:left;">Due Date</th>
                <th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;text-align:left;">Days Left</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top:14px;">Please arrange renewals/service at the earliest to avoid compliance violations or breakdowns.</p>
        </div>
      `,
    });

    await saveNotification({
      id: `digest-sent-${todayKey}`,
      title: 'Daily Compliance & Maintenance Digest Sent',
      message: `Digest emailed to ${recipients.join(', ')} covering ${sortedAlerts.length} item${sortedAlerts.length === 1 ? '' : 's'} (compliance at 3/7/15 days, service/alignment at 3/5/7 days).`,
      type: 'general',
      timestamp: istTimestamp(),
      read: true
    });

    console.log(`[COMPLIANCE DIGEST] Sent digest to ${recipients.join(', ')} (${sortedAlerts.length} items)`);
    return { sent: true, count: sortedAlerts.length, recipients };
  }

  // Automatic once-per-calendar-day trigger, decoupled from any login event.
  // A persisted marker notification prevents sending more than once per day.
  async function runScheduledComplianceDigest() {
    const digestId = `digest-sent-${istDateKey()}`;

    try {
      const existingNotifs = await getNotifications();
      if (existingNotifs.some((n: any) => n.id === digestId)) return;
      await buildAndSendComplianceDigest();
    } catch (error) {
      console.error('Failed to send scheduled compliance digest:', error);
    }
  }

  // --- Birthday Reminder (HR & Payroll -> Staff Salary -> Basic Info ->
  // Date of Birth is the sole source of truth - no separate DOB field
  // anywhere else). Confirmed send window: no earlier than 9:00 AM IST -
  // easy to change if a different time is wanted. Matches day+month only
  // (ignores year) against each Active employee's stored Date of Birth.
  const BIRTHDAY_EMAIL_HOUR_IST = 9;

  async function getTodaysBirthdayEmployees(): Promise<StaffEmployee[]> {
    const employees = await getStaffEmployees();
    const todayKey = istMonthDayKey();
    return employees.filter(e => {
      if (e.status !== 'Active' || !e.dateOfBirth) return false;
      const dob = new Date(e.dateOfBirth);
      if (isNaN(dob.getTime())) return false;
      const dobKey = `${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`;
      return dobKey === todayKey;
    });
  }

  function firstNameOf(fullName: string): string {
    return (fullName || '').trim().split(/\s+/)[0] || fullName;
  }

  // Sends today's birthday employees their wish email, plus a separate short
  // notice email (not a CC - its own send) to every Super Admin, plus an
  // in-app notification. Dedup'd per employee/day via a persisted marker so
  // re-checking within the same day (the hourly interval) never double-sends
  // - same pattern as runScheduledComplianceDigest's digest-sent-<date> marker,
  // just one marker per employee instead of one for the whole batch, since
  // more than one employee can share a birthday.
  async function sendTodaysBirthdayWishes(): Promise<{ sent: number; names: string[] }> {
    const birthdayEmployees = await getTodaysBirthdayEmployees();
    if (birthdayEmployees.length === 0) return { sent: 0, names: [] };

    const todayKey = istDateKey();
    const existingNotifs = await getNotifications();
    const usersList = await getUsersWithFallback();
    const superAdminEmails = usersList.filter((u: any) => u.department === 'super_admin').map((u: any) => u.email).filter(Boolean) as string[];

    let sentCount = 0;
    const sentNames: string[] = [];

    for (const emp of birthdayEmployees) {
      const markerId = `birthday-sent-${emp.id}-${todayKey}`;
      if (existingNotifs.some((n: any) => n.id === markerId)) continue;
      if (!emp.email) {
        console.warn(`[BIRTHDAY] Skipping ${emp.name} (${emp.id}) - no registered email on file.`);
        continue;
      }

      const firstName = firstNameOf(emp.name);
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'alerts@kcmlogistics.in',
          to: emp.email,
          subject: `Happy Birthday, ${firstName}! 🎉`,
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;font-size:14px;color:#1e293b;">
              <p>Dear ${firstName},</p>
              <p>Wishing you a wonderful birthday filled with joy, laughter, and moments worth celebrating!</p>
              <p>Thank you for the dedication and energy you bring to KCM Logistics every day - it truly makes a difference to our team. We hope this year brings you good health, new milestones, and everything that makes you happiest.</p>
              <p>Have a fantastic day, and enjoy every bit of it!</p>
              <p>Warm wishes,<br/>Team KCM Logistics</p>
            </div>
          `
        });

        if (superAdminEmails.length > 0) {
          await resend.emails.send({
            from: process.env.EMAIL_FROM || 'alerts@kcmlogistics.in',
            to: superAdminEmails,
            subject: `Birthday Wish Sent - ${emp.name}`,
            html: `<p>Today is ${emp.name}'s birthday - wish email sent automatically.</p>`
          });
        }

        await saveNotification({
          id: markerId,
          title: 'Employee Birthday',
          message: `Today is ${emp.name}'s birthday - wish email sent automatically.`,
          type: 'birthday',
          timestamp: istTimestamp(),
          read: true
        });

        sentCount++;
        sentNames.push(emp.name);
        console.log(`[BIRTHDAY] Sent wish email to ${emp.name} (${emp.email}).`);
      } catch (error) {
        console.error(`[BIRTHDAY] Failed to send birthday wish for ${emp.name} (${emp.id}):`, error);
      }
    }

    return { sent: sentCount, names: sentNames };
  }

  // Automatic trigger - runs on the same hourly interval as the compliance
  // digest, but only actually sends from BIRTHDAY_EMAIL_HOUR_IST onward each
  // day (never earlier), and only once per employee per day regardless of
  // how many times the hourly tick lands after that hour.
  async function runScheduledBirthdayCheck() {
    try {
      if (istHour() < BIRTHDAY_EMAIL_HOUR_IST) return;
      await sendTodaysBirthdayWishes();
    } catch (error) {
      console.error('Failed to run scheduled birthday check:', error);
    }
  }

  // Manually trigger the birthday check immediately (Super Admin only) - for
  // verifying the feature works without waiting for 9 AM on someone's actual
  // birthday. Still respects the per-employee/day dedup marker.
  app.post('/api/birthday-check/send-now', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (!sessionUser || sessionUser.department !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Only Super Admin can trigger the birthday check.' });
      }
      const result = await sendTodaysBirthdayWishes();
      res.json({
        success: true,
        sent: result.sent > 0,
        message: result.sent > 0
          ? `Birthday wishes sent for: ${result.names.join(', ')}.`
          : 'No matching employee birthdays today (or already sent earlier today).'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
  });

  // Generic document upload used by DocumentAttachment across every module
  // (Fleet documents, HR Aadhar/PAN, driver salary bank proof, etc.) - saves
  // the file to disk and returns its path for the frontend to store on the
  // record, instead of embedding the file as base64 in the database.
  app.post('/api/upload/:module', upload.single('file'), (req, res) => {
    const moduleName = req.params.module;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file was uploaded.' });
    }
    res.json({
      success: true,
      path: `uploads/${moduleName}/${req.file.filename}`
    });
  });

  // Current session endpoint - resolves strictly from this client's own token
  app.get('/api/session', async (req, res) => {
    res.json((await getSessionUser(extractBearerToken(req.headers.authorization))) || null);
  });

  // Request Login OTP
  app.post('/api/request-otp', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email address is required.' });
      }
      const cleanEmail = String(email).trim().toLowerCase();

      const usersList = await getUsersWithFallback();
      const matchedUser = usersList.find((u: any) => u.email && u.email.toLowerCase() === cleanEmail);

      if (!matchedUser) {
        return res.status(404).json({ success: false, error: 'Account with this email address not found.' });
      }

      const code = issueOtp(cleanEmail);

      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'otp@kcmlogistics.in',
          to: matchedUser.email as string,
          subject: 'Your KCM Logistics login OTP',
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5;">
              <p>Hello ${matchedUser.name || 'User'},</p>
              <p>Your login OTP is <strong>${code}</strong>.</p>
              <p>Enter this code in the app to complete sign in. This code expires in 5 minutes.</p>
              <p>If you did not request this, please ignore this message.</p>
            </div>
          `,
        });
        console.log(`[SECURE EMAIL SYSTEM] Sent OTP email to ${cleanEmail}`);
      } catch (emailError) {
        console.error('Failed to send OTP email:', emailError);
        return res.status(500).json({ success: false, error: 'Failed to deliver OTP email. Please try again later.' });
      }

      res.json({
        success: true,
        message: `A secure 6-digit OTP has been sent to ${matchedUser.email}. Please check your email.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Login endpoint
  app.post('/api/login', async (req, res) => {
    try {
      const { username, password, otp } = req.body;

      const cleanLoginId = String(username || '').trim().toLowerCase();
      const cleanPass = String(password || '').trim();
      const cleanOtp = String(otp || '').trim();

      const usersList = await getUsersWithFallback();

      const matchedUser = usersList.find((u: any) =>
        u.username.toLowerCase() === cleanLoginId ||
        (u.email && u.email.toLowerCase() === cleanLoginId)
      );

      const recordFailedAttempt = async (reason: string, title: string) => {
        const abnormal: AbnormalLogin = {
          id: String(Date.now()),
          timestamp: istTimestamp(),
          username: matchedUser?.username || cleanLoginId,
          ipAddress: req.ip || '127.0.0.1',
          reason,
          resolved: false
        };
        await saveAbnormalLogin(abnormal);

        const secNotif: DashboardNotification = {
          id: String(Date.now() + 1),
          title,
          message: `${title} for "${cleanLoginId}": ${reason}`,
          type: 'security',
          timestamp: abnormal.timestamp,
          read: false
        };
        await saveNotification(secNotif);
      };

      if (!matchedUser) {
        return res.status(401).json({ success: false, error: 'Account with this email or username not found.' });
      }

      const passwordOk = await verifyPassword(cleanPass, matchedUser.pass);
      if (!passwordOk) {
        await recordFailedAttempt(`Invalid password attempt for account "${cleanLoginId}"`, 'Abnormal Login - Bad Credentials');
        return res.status(401).json({ success: false, error: 'Incorrect password.' });
      }

      const otpProvided = otp !== undefined && String(otp).trim() !== '';

      if (!otpProvided) {
        // Daily login with password only
        const userSession: User = {
          username: matchedUser.username,
          name: matchedUser.name,
          department: matchedUser.department as any,
          departmentLabel: matchedUser.departmentLabel,
          email: matchedUser.email || undefined
        };
        const token = await createSession(userSession);
        return res.json({ success: true, user: userSession, token });
      }

      const otpResult = verifyOtp(matchedUser.email || '', cleanOtp);
      if (!otpResult.valid) {
        await recordFailedAttempt(`Invalid OTP input attempt: "${cleanOtp}" (${otpResult.reason})`, 'Abnormal Login - Bad OTP');
        return res.status(401).json({ success: false, error: otpResult.reason || 'Invalid 6-digit OTP security code.' });
      }

      const userSession: User = {
        username: matchedUser.username,
        name: matchedUser.name,
        department: matchedUser.department as any,
        departmentLabel: matchedUser.departmentLabel,
        email: matchedUser.email || undefined
      };
      const token = await createSession(userSession);
      return res.json({ success: true, user: userSession, token });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Forgot Password - Request OTP
  app.post('/api/forgot-password/request', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email address is required.' });
      }
      const cleanEmail = String(email).trim().toLowerCase();

      const usersList = await getUsersWithFallback();
      const matchedUser = usersList.find((u: any) => u.email && u.email.toLowerCase() === cleanEmail);

      if (!matchedUser) {
        return res.status(404).json({ success: false, error: 'No account found with this email address.' });
      }

      const code = issueOtp(cleanEmail);

      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'otp@kcmlogistics.in',
          to: matchedUser.email as string,
          subject: 'Your KCM Logistics password reset OTP',
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5;">
              <p>Hello ${matchedUser.name || 'User'},</p>
              <p>Your password reset OTP is <strong>${code}</strong>.</p>
              <p>Enter this code in the app to reset your password. This code expires in 5 minutes.</p>
              <p>If you did not request this, please ignore this message.</p>
            </div>
          `,
        });
        console.log(`[SECURE RESET SYSTEM] Sent password reset OTP email to ${cleanEmail}`);
      } catch (emailError) {
        console.error('Failed to send reset OTP email:', emailError);
        return res.status(500).json({ success: false, error: 'Failed to deliver reset OTP email. Please try again later.' });
      }

      res.json({
        success: true,
        message: `A secure verification code has been dispatched to ${matchedUser.email}. Please check your email.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Forgot Password - Submit and change
  app.post('/api/forgot-password/reset', async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;
      if (!email || !otp || !newPassword) {
        return res.status(400).json({ success: false, error: 'Email, OTP, and new password are required.' });
      }
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanOtp = String(otp).trim();
      const cleanPass = String(newPassword).trim();

      const otpResult = verifyOtp(cleanEmail, cleanOtp);
      if (!otpResult.valid) {
        return res.status(401).json({ success: false, error: otpResult.reason || 'Invalid or expired OTP code.' });
      }

      await updateUserPassword(cleanEmail, cleanPass);
      return res.json({ success: true, message: 'Password has been reset successfully. You can now login.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Change Password for currently logged in session user
  app.post('/api/change-password', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (!sessionUser) {
        return res.status(401).json({ success: false, error: 'Unauthorized. No active session.' });
      }
      const { oldPassword, newPassword } = req.body;
      if (!newPassword) {
        return res.status(400).json({ success: false, error: 'New password is required.' });
      }

      const usersList = await getUsersWithFallback();
      const userObj = usersList.find((u: any) => u.username === sessionUser.username);
      if (userObj) {
        if (oldPassword) {
          const oldPassOk = await verifyPassword(oldPassword, userObj.pass);
          if (!oldPassOk) {
            return res.status(400).json({ success: false, error: 'Incorrect current password.' });
          }
        }

        await updateUserPassword(userObj.email || '', newPassword);
        return res.json({ success: true, message: 'Password changed successfully and persisted.' });
      } else {
        return res.status(404).json({ success: false, error: 'User account not found.' });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Logout endpoint - invalidates only this client's own token
  app.post('/api/logout', async (req, res) => {
    await destroySession(extractBearerToken(req.headers.authorization));
    res.json({ success: true });
  });

  // Get Fleet Sheet
  app.get('/api/fleet', async (req, res) => {
    try {
      const fleet = await getVehicles();
      res.json(fleet);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save / Update vehicle
  app.post('/api/fleet', async (req, res) => {
    try {
      const updatedVehicle: Vehicle = req.body;
      const vehiclesList = await getVehicles();
      const index = vehiclesList.findIndex((v: Vehicle) => v['Reg. No.'] === updatedVehicle['Reg. No.'] || v.regNo === updatedVehicle.regNo || v.id === updatedVehicle.id);
      
      let newSi = vehiclesList.length + 1;
      if (index !== -1) {
        newSi = vehiclesList[index]['SI No'] || newSi;
      }
      const finalVehicle = { ...updatedVehicle, "SI No": newSi };

      const result = await saveVehicle(finalVehicle);

      // Refresh compliance notifications and notify Super Admin + Vehicle Data Manager
      await checkAndNotifyComplianceAlerts(finalVehicle);

      res.json({ success: true, vehicles: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/fleet/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await deleteVehicle(id);
      res.json({ success: true, vehicles: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Helper function to dynamically calculate alerts on startup/query.
  // Excludes any alert already marked resolved so that resolving it truly
  // stops it from reappearing on the dashboard or in the next daily digest.
  async function calculateDynamicAlerts() {
    const alerts: any[] = [];
    const today = new Date();

    const [fleetVehicles, existingNotifs] = await Promise.all([getVehicles(), getNotifications()]);
    const resolvedIds = new Set(
      existingNotifs.filter((n: any) => n.read || n.status === 'Resolved').map((n: any) => n.id)
    );

    fleetVehicles.forEach((v: any) => {
      const regNo = v['Reg. No.'] || v.regNo || v.id;

      COMPLIANCE_CHECKS.forEach(check => {
        const alertId = `${check.idPrefix}-${regNo}`;
        if (resolvedIds.has(alertId)) return;

        const raw = v[check.key] || v[check.mixedCaseKey];
        const expDate = parseFlexibleDate(raw);
        if (!expDate || isNaN(expDate.getTime())) return;

        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < check.minDays || diffDays > check.maxDays) return;

        alerts.push({
          id: alertId,
          title: `${check.label} Expiry Alert`,
          message: `Vehicle ${regNo} (${v.type || v.Type || 'Tata Ace'}) ${check.label.toLowerCase()} is expiring on ${raw} (in ${diffDays} day${diffDays === 1 ? '' : 's'}). Emailed to Super Admin & Vehicle Data Manager at the 15/7/3-day mark.`,
          type: check.type,
          timestamp: istTimestamp(),
          status: 'Active',
          read: false,
          vehicleRegNo: regNo,
          checkLabel: check.label,
          expiryDate: raw,
          diffDays
        });
      });
    });
    return alerts;
  }

  // Fleet Maintenance's own continuous (non-day-gated) dashboard alerts -
  // Service Due and Wheel Alignment Due/Overdue, straight off the same
  // KM-status thresholds the module's own tabs render (computeKmStatus /
  // computeAlignmentStatus), so a vehicle shows up here the moment it enters
  // the due-soon window, not just on its 3/5/7-day email milestone.
  async function calculateMaintenanceDynamicAlerts() {
    const alerts: any[] = [];
    const [schedules, tires, mileage, existingNotifs] = await Promise.all([
      getVehicleServiceSchedules(),
      getTireRecords(),
      getMileageReports(),
      getNotifications()
    ]);
    const resolvedIds = new Set(
      existingNotifs.filter((n: any) => n.read || n.status === 'Resolved').map((n: any) => n.id)
    );

    schedules.forEach(schedule => {
      const alertId = `svc-due-${schedule.regNo}`;
      if (resolvedIds.has(alertId) || schedule.lastServiceKm == null) return;
      const currentKm = latestOdometerFor(schedule.regNo, mileage as any);
      if (currentKm == null) return;
      const remaining = (schedule.lastServiceKm + (schedule.serviceIntervalKm || 10000)) - currentKm;
      const status = computeKmStatus(remaining);
      if (!status || status === 'ok') return;

      alerts.push({
        id: alertId,
        title: 'Scheduled Service Due Alert',
        message: `Vehicle ${schedule.regNo} is ${status === 'overdue' ? 'overdue for' : 'due soon for'} scheduled service (${remaining} km remaining).`,
        type: 'service-due',
        timestamp: istTimestamp(),
        status: 'Active',
        read: false,
        vehicleRegNo: schedule.regNo
      });
    });

    tires.filter(tire => tire.isCurrent !== false).forEach(tire => {
      const alertId = `align-due-${tire.regNo}-${tire.position}`;
      if (resolvedIds.has(alertId)) return;
      const currentKm = latestOdometerFor(tire.regNo, mileage as any);
      const status = computeAlignmentStatus(tire.lastAlignmentKm, currentKm);
      if (!status || status === 'ok') return;
      const remaining = currentKm != null ? nextAlignmentDueKm(tire.lastAlignmentKm)! - currentKm : undefined;

      alerts.push({
        id: alertId,
        title: 'Wheel Alignment Due Alert',
        message: `Vehicle ${tire.regNo} (${tire.position}) is ${status === 'overdue' ? 'overdue for' : 'due soon for'} wheel alignment${remaining != null ? ` (${remaining} km remaining)` : ''}.`,
        type: 'alignment-due',
        timestamp: istTimestamp(),
        status: 'Active',
        read: false,
        vehicleRegNo: tire.regNo
      });
    });

    return alerts;
  }

  // Manually trigger the compliance digest email immediately (Super Admin only),
  // bypassing the once-per-day automatic gate.
  app.post('/api/compliance-digest/send-now', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (!sessionUser || sessionUser.department !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Only Super Admin can send the compliance digest.' });
      }

      const result = await buildAndSendComplianceDigest();
      if (!result.sent) {
        return res.json({
          success: true,
          sent: false,
          message: 'Nothing is currently at its 3/7/15-day expiry mark (insurance, permits, FC, tax) or its 3/5/7-day mark (scheduled service, wheel alignment) - nothing to send.'
        });
      }

      res.json({
        success: true,
        sent: true,
        message: `Compliance & maintenance digest sent to ${result.recipients.join(', ')} covering ${result.count} item${result.count === 1 ? '' : 's'}.`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Fetch alerts for Super Admin
  app.get('/api/alerts', async (req, res) => {
    try {
      const notifs = await getNotifications();
      const [dynamic, maintenanceDynamic] = await Promise.all([calculateDynamicAlerts(), calculateMaintenanceDynamicAlerts()]);
      const sec = notifs.filter((n: any) => n.type === 'security');
      res.json({
        alerts: [...dynamic, ...maintenanceDynamic, ...sec]
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Notifications API endpoints
  app.get('/api/notifications', async (req, res) => {
    try {
      const storedNotifs = await getNotifications();
      const [dynamicCompliance, dynamicMaintenance] = await Promise.all([calculateDynamicAlerts(), calculateMaintenanceDynamicAlerts()]);
      const dynamic = [...dynamicCompliance, ...dynamicMaintenance];

      const normalizedStored = storedNotifs.map((n: any) => ({
        status: n.status || 'Active',
        ...n
      }));

      const allNotifs = [...normalizedStored];
      dynamic.forEach(dyn => {
        if (!allNotifs.some(n => n.id === dyn.id)) {
          allNotifs.push(dyn);
        }
      });
      res.json(allNotifs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notifications/resolve', async (req, res) => {
    try {
      const { id } = req.body;
      const result = await resolveNotification(id);
      await resolveAllAbnormalLogins();
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/trigger-email-simulation', (req, res) => {
    res.json({ success: true, message: 'Emails dispatched successfully' });
  });

  // Fuel Management is restricted to Chandan, Praveen, and super admins, with
  // Chandan/Praveen each only seeing their own entries - see requireFuelAccess
  // and filterEntryRowsForViewer above.
  app.use('/api/fuel', requireFuelAccess);

  app.get('/api/fuel', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(filterEntryRowsForViewer(await getFuelLogs(), sessionUser, FUEL_RQ_ID_ONLY_EMAILS));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/fuel', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      // Divya never creates entries - guard even though the UI never offers
      // her an Add Entry button.
      if (sessionUser?.department !== 'super_admin' && FUEL_RQ_ID_ONLY_EMAILS.includes(sessionUser?.email || '')) {
        return res.status(403).json({ error: 'You cannot add fuel entries.' });
      }
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Fuel entry date cannot be in the future.' });
      const result = await saveFuelLog({ ...req.body, enteredBy: sessionUser?.username });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, FUEL_RQ_ID_ONLY_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/fuel/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getFuelLogs()).find(l => l.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Fuel entry date cannot be in the future.' });
      const result = await saveFuelLog({ ...req.body, id: req.params.id, enteredBy: existing?.enteredBy });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, FUEL_RQ_ID_ONLY_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  // Divya's restricted update path - only ever touches rqId on an existing
  // entry, regardless of what else is in the request body.
  app.put('/api/fuel/:id/rq-id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (sessionUser?.department !== 'super_admin' && !FUEL_RQ_ID_ONLY_EMAILS.includes(sessionUser?.email || '')) {
        return res.status(403).json({ error: 'You cannot edit this entry.' });
      }
      const existing = (await getFuelLogs()).find(l => l.id === req.params.id);
      if (!existing) return res.status(404).json({ error: 'Fuel entry not found.' });
      const result = await saveFuelLog({ ...existing, rqId: String(req.body.rqId || '').trim() });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, FUEL_RQ_ID_ONLY_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/fuel/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getFuelLogs()).find(l => l.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      const result = await deleteFuelLog(req.params.id);
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, FUEL_RQ_ID_ONLY_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/billing', async (req, res) => {
    try { res.json(await getBillingInvoices()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/billing', async (req, res) => {
    try { res.json({ success: true, data: await saveBillingInvoice(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/billing/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveBillingInvoice({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/billing/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteBillingInvoice(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Petty Cash (vouchers, Market POD, Amount Received advances) is restricted
  // to the 3 Petty Cash logins and super admins, with each of the 3 only ever
  // seeing/modifying their own rows - see requirePettyCashAccess and
  // filterEntryRowsForViewer/canModifyEntryRow above.
  app.use('/api/petty-cash', requirePettyCashAccess);
  app.use('/api/market-pod', requirePettyCashAccess);
  app.use('/api/petty-cash-advances', requirePettyCashAccess);

  app.get('/api/petty-cash', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(sortEntriesByDate(filterEntryRowsForViewer(await getPettyCashVouchers(), sessionUser)));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/petty-cash', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allVouchers = await getPettyCashVouchers();
      const entryNo = nextPettyCashEntryNo(allVouchers);
      if (findDuplicateEntryNo(allVouchers, entryNo)) {
        return res.status(409).json({ error: `Entry No. ${entryNo} already exists.` });
      }
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Petty cash entry date cannot be in the future.' });
      const result = await savePettyCashVoucher({ ...req.body, entryNo, enteredBy: sessionUser?.username });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/petty-cash/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allVouchers = await getPettyCashVouchers();
      const existing = allVouchers.find(v => v.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
      if (req.body.entryNo && findDuplicateEntryNo(allVouchers, req.body.entryNo, req.params.id)) {
        return res.status(409).json({ error: `Entry No. ${req.body.entryNo} already exists.` });
      }
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Petty cash entry date cannot be in the future.' });
      const result = await savePettyCashVoucher({ ...req.body, id: req.params.id, enteredBy: existing?.enteredBy });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/petty-cash/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getPettyCashVouchers()).find(v => v.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      const result = await deletePettyCashVoucher(req.params.id);
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/market-pod', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(sortEntriesByDate(filterEntryRowsForViewer(await getMarketPodEntries(), sessionUser)));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/market-pod', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allEntries = await getMarketPodEntries();
      const entryNo = nextMarketPodEntryNo(allEntries);
      if (findDuplicateEntryNo(allEntries, entryNo)) {
        return res.status(409).json({ error: `Entry No. ${entryNo} already exists.` });
      }
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Market Trip date cannot be in the future.' });
      // id generated up front (mirrors saveMarketPodEntry's own fallback) so
      // syncMarketPodPettyCashLinks' deterministic mp-adv-<id>/mp-bal-<id>-*
      // ids are known immediately, without a second round trip to look it up.
      const newEntry: MarketPodEntry = { ...req.body, id: req.body.id || String(Date.now()), entryNo, enteredBy: sessionUser?.username };
      await saveMarketPodEntry(newEntry);
      await syncMarketPodPettyCashLinks(newEntry, sessionUser?.username || '');
      res.json({ success: true, data: filterEntryRowsForViewer(await getMarketPodEntries(), sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/market-pod/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allEntries = await getMarketPodEntries();
      const existing = allEntries.find(e => e.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
      if (req.body.entryNo && findDuplicateEntryNo(allEntries, req.body.entryNo, req.params.id)) {
        return res.status(409).json({ error: `Entry No. ${req.body.entryNo} already exists.` });
      }
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Market Trip date cannot be in the future.' });
      // balanceReceipts/balanceSettledSnapshot aren't fields the Add/Edit
      // Market POD Trip form manages (only the dedicated balance-receipt
      // endpoint below does) - preserved from the existing record here so a
      // routine freight/advance edit can never silently wipe out settlement
      // history the client's payload doesn't even know about.
      const updatedEntry: MarketPodEntry = {
        ...req.body,
        id: req.params.id,
        enteredBy: existing?.enteredBy,
        balanceReceipts: req.body.balanceReceipts ?? existing?.balanceReceipts,
        balanceSettledSnapshot: req.body.balanceSettledSnapshot ?? existing?.balanceSettledSnapshot
      };
      await saveMarketPodEntry(updatedEntry);
      await syncMarketPodPettyCashLinks(updatedEntry, existing?.enteredBy || sessionUser?.username || '');
      res.json({ success: true, data: filterEntryRowsForViewer(await getMarketPodEntries(), sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/market-pod/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getMarketPodEntries()).find(e => e.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      if (existing) await removeMarketPodPettyCashLinks(existing);
      const result = await deleteMarketPodEntry(req.params.id);
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Balance Settlement - records one partial (or full) receipt against a
  // trip's already-auto-calculated Balance (see point 2 of the Petty Cash
  // change request). Separate from the main PUT above since it's a distinct
  // action ("mark received"), not a form edit, and needs its own
  // over-payment guard + first-receipt snapshot logic.
  app.post('/api/market-pod/:id/balance-receipt', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getMarketPodEntries()).find(e => e.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
      if (!existing) return res.status(404).json({ error: 'Trip not found.' });

      const amount = parseFloat(req.body.amount);
      const date = req.body.date;
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount received.' });
      if (!date) return res.status(400).json({ error: 'Enter the date received.' });
      if (isFutureDate(date)) return res.status(400).json({ error: 'Balance receipt date cannot be in the future.' });

      const receivedSoFar = (existing.balanceReceipts || []).reduce((s, r) => s + r.amount, 0);
      const pending = (existing.balance || 0) - receivedSoFar;
      // Small epsilon for floating-point amounts, not a real allowance to
      // over-collect - "leaving 500 pending" only works if receipts can
      // never sum past the balance in the first place.
      if (amount > pending + 0.01) {
        return res.status(400).json({ error: `Amount exceeds the pending balance of ₹${pending.toLocaleString('en-IN')}.` });
      }

      const receipt: MarketPodBalanceReceipt = { id: String(Date.now()), amount, date };
      const updatedEntry: MarketPodEntry = {
        ...existing,
        balanceReceipts: [...(existing.balanceReceipts || []), receipt],
        // Snapshot only taken once, on the very first receipt - a later
        // partial receipt doesn't reset what "the settled figures" were.
        balanceSettledSnapshot: existing.balanceSettledSnapshot || {
          totalFreight: existing.totalFreight,
          receivedAdvance: existing.receivedAdvance,
          balance: existing.balance
        }
      };
      await saveMarketPodEntry(updatedEntry);
      await syncMarketPodPettyCashLinks(updatedEntry, existing.enteredBy || sessionUser?.username || '');
      res.json({ success: true, data: filterEntryRowsForViewer(await getMarketPodEntries(), sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Petty Cash "Amount Received" advances - each of the 3 logins' running
  // Balance Net ledger opening/top-up entries. Row-scoped by `username`
  // (whose ledger it belongs to) via filterAdvancesForViewer/canModifyAdvance.
  app.get('/api/petty-cash-advances', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(filterAdvancesForViewer(await getPettyCashAdvances(), sessionUser));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/petty-cash-advances', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      // A regular Petty Cash user can only ever add an advance to their own
      // ledger; only a super admin may specify a different `username` (e.g.
      // logging a top-up on someone else's behalf).
      const username = sessionUser?.department === 'super_admin' && req.body.username ? req.body.username : sessionUser?.username;
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Amount Received date cannot be in the future.' });
      const result = await savePettyCashAdvance({ ...req.body, username } as PettyCashAdvance);
      res.json({ success: true, data: filterAdvancesForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/petty-cash-advances/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getPettyCashAdvances()).find(a => a.id === req.params.id);
      if (!canModifyAdvance(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      const result = await deletePettyCashAdvance(req.params.id);
      res.json({ success: true, data: filterAdvancesForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/maintenance', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(maskAttributionField(await getMaintenanceRecords(), 'enteredBy', sessionUser));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/maintenance', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const result = await saveMaintenanceRecord({ ...req.body, enteredBy: sessionUser?.username });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/maintenance/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      // enteredBy is never re-stamped on an edit - it always stays whoever
      // first created this work order, same convention as Fuel/Petty Cash/
      // Market POD/Mileage.
      const existing = (await getMaintenanceRecords()).find(r => r.id === req.params.id);
      const result = await saveMaintenanceRecord({ ...req.body, id: req.params.id, enteredBy: existing?.enteredBy });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/maintenance/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteMaintenanceRecord(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/vehicle-maintenance-profiles', async (req, res) => {
    try { res.json(await getVehicleMaintenanceProfiles()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/vehicle-maintenance-profiles', async (req, res) => {
    try { res.json({ success: true, data: await saveVehicleMaintenanceProfile(req.body as VehicleMaintenanceProfile) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/vehicle-maintenance-profiles/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveVehicleMaintenanceProfile({ ...req.body, id: req.params.id } as VehicleMaintenanceProfile) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/vehicle-maintenance-profiles/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteVehicleMaintenanceProfile(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/maintenance-service-stations', async (req, res) => {
    try { res.json(await getMaintenanceServiceStations()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/maintenance-service-stations', async (req, res) => {
    try { res.json({ success: true, data: await saveMaintenanceServiceStation(req.body as MaintenanceServiceStation) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/maintenance-service-stations/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteMaintenanceServiceStation(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/breakdown-reports', async (req, res) => {
    try { res.json(await getBreakdownReports()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/breakdown-reports', async (req, res) => {
    try { res.json({ success: true, data: await saveBreakdownReport(req.body as BreakdownReport) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/breakdown-reports/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveBreakdownReport({ ...req.body, id: req.params.id } as BreakdownReport) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/breakdown-reports/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteBreakdownReport(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/vehicle-service-schedules', async (req, res) => {
    try { res.json(await getVehicleServiceSchedules()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/vehicle-service-schedules', async (req, res) => {
    try { res.json({ success: true, data: await saveVehicleServiceSchedule(req.body as VehicleServiceSchedule) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/vehicle-service-schedules/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveVehicleServiceSchedule({ ...req.body, id: req.params.id } as VehicleServiceSchedule) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/vehicle-service-schedules/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteVehicleServiceSchedule(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Service Due / Washing Due reminder settings - readable by anyone with
  // Fleet Maintenance access (so Service Schedule can show the configured
  // cycle lengths), editable by Super Admin only.
  app.get('/api/alert-settings', async (req, res) => {
    try { res.json(await getAlertSettings()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/alert-settings', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (!sessionUser || sessionUser.department !== 'super_admin') {
        return res.status(403).json({ error: 'Only Super Admin can change alert settings.' });
      }
      res.json({ success: true, data: await saveAlertSettings(req.body as Partial<AlertSettings>) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Manually trigger the Service Due/Washing Due reminder check immediately
  // (Super Admin only) - for verifying the feature without waiting for the
  // hourly tick. Still respects the per-milestone dedup marker.
  app.post('/api/service-washing-reminders/send-now', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (!sessionUser || sessionUser.department !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Only Super Admin can trigger this check.' });
      }
      const result = await sendServiceWashingReminders();
      res.json({
        success: true,
        sent: result.sent > 0,
        message: result.sent > 0
          ? `Reminders sent for: ${result.details.join(', ')}.`
          : 'No vehicles are at a reminder milestone right now (or already sent for this cycle).'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/service-invoices', async (req, res) => {
    try { res.json(await getServiceInvoices()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/service-invoices', async (req, res) => {
    try { res.json({ success: true, data: await saveServiceInvoiceRecord(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/service-invoices/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveServiceInvoiceRecord({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.get('/api/service-invoice-audit', async (req, res) => {
    try { res.json(await getServiceInvoiceAudits()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/service-invoice-audit', async (req, res) => {
    try { res.json({ success: true, data: await saveServiceInvoiceAuditRecord(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/tire-brands', async (req, res) => {
    try { res.json(await getTireBrands()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/tire-brands', async (req, res) => {
    try {
      const { name } = req.body as { name?: string };
      if (!name || !name.trim()) return res.status(400).json({ error: 'Brand name is required.' });
      res.json({ success: true, data: await addTireBrand(name) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/tire-records', async (req, res) => {
    try { res.json(await getTireRecords()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/tire-records', async (req, res) => {
    try { res.json({ success: true, data: await saveTireRecord(req.body as TireRecord) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/tire-records/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveTireRecord({ ...req.body, id: req.params.id } as TireRecord) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/tire-records/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteTireRecord(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/battery-records', async (req, res) => {
    try { res.json(await getBatteryRecords()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/battery-records', async (req, res) => {
    try { res.json({ success: true, data: await saveBatteryRecord(req.body as BatteryRecord) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/battery-records/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveBatteryRecord({ ...req.body, id: req.params.id } as BatteryRecord) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/battery-records/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteBatteryRecord(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/tools-checklist-records', async (req, res) => {
    try { res.json(await getToolsChecklistRecords()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/tools-checklist-records', async (req, res) => {
    try { res.json({ success: true, data: await saveToolsChecklistRecord(req.body as ToolsChecklistRecord) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/tools-checklist-records/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveToolsChecklistRecord({ ...req.body, id: req.params.id } as ToolsChecklistRecord) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/tools-checklist-records/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteToolsChecklistRecord(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/accounts', async (req, res) => {
    try { res.json(await getAccountsEntries()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/accounts', async (req, res) => {
    try { res.json({ success: true, data: await saveAccountsEntry(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/accounts/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveAccountsEntry({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/accounts/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteAccountsEntry(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Every /api/staff/* route below is HR & Payroll data - gate the whole
  // prefix once here rather than per-route.
  app.use('/api/staff', requireHrAccess);

  // ===== STAFF EMPLOYEES =====
  app.get('/api/staff/employees', async (req, res) => {
    try { res.json(await getStaffEmployees()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/staff/employees', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffEmployee(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/staff/employees/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffEmployee({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/staff/employees/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteStaffEmployee(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ===== STAFF SALARY DETAIL (CTC / advance) =====
  app.get('/api/staff/salary-detail', async (req, res) => {
    try {
      const [details, hikes, deductions] = await Promise.all([
        getStaffSalaryDetails(), getStaffSalaryHikes(), getStaffAdvanceDeductions()
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const enriched = details.map(d => {
        const empDeductions = deductions.filter(x => x.empId === d.empId);
        const deductedTotal = empDeductions.reduce((s, x) => s + (x.amount || 0), 0);
        return {
          ...d,
          effectiveSalary: computeEffectiveSalary(d.ctc25, hikes.filter(h => h.empId === d.empId), today),
          advanceBalance: Math.max(0, (d.advanceAmount || 0) - deductedTotal)
        };
      });
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/staff/salary-detail', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffSalaryDetail(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/staff/salary-detail/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffSalaryDetail({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ===== STAFF SALARY HIKES (rows-based hike history) =====
  app.get('/api/staff/salary-hikes', async (req, res) => {
    try { res.json(await getStaffSalaryHikes()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/staff/salary-hikes', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffSalaryHike(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/staff/salary-hikes/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteStaffSalaryHike(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ===== STAFF ADVANCE DEDUCTIONS (rows-based deduction history against StaffSalaryDetail.advanceAmount) =====
  app.get('/api/staff/advance-deductions', async (req, res) => {
    try { res.json(await getStaffAdvanceDeductions()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/staff/advance-deductions', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffAdvanceDeduction(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/staff/advance-deductions/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteStaffAdvanceDeduction(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ===== STAFF SALARY BREAKUP (formerly "Provident Fund"); totalDays/workingDays/lopDays
  // read live from attendance, and perDaySalary/extraDaysAmount/lopAmount are derived from
  // that same attendance data plus the recurring earnings below, so salary and attendance
  // stay linked without any manual re-entry. =====
  app.get('/api/staff/provident-fund', async (req, res) => {
    try {
      const records = await getStaffProvidentFundRecords();
      const enriched = await Promise.all(records.map(async r => {
        const attendance = await computeMonthlyAttendanceSummary(r.empId, r.month);

        // Recurring monthly earnings only - excludes extra-days pay, since extra-days
        // pay is itself derived from this figure (avoids a circular calculation).
        const recurringEarnings = (r.basic || 0) + (r.hra || 0) + (r.conveyance || 0) + (r.medicalAllowance || 0) +
          (r.lta || 0) + (r.cca || 0) + (r.fuelAllowance || 0) + (r.otherAllowances || 0);

        const perDaySalary = recurringEarnings / 30.5;
        const extraDaysAmount = (r.extraDays || 0) * perDaySalary;
        const lopAmount = attendance.lopDays * perDaySalary;

        const totalEarnings = recurringEarnings + extraDaysAmount;
        const totalDeductions = (r.professionalTax || 0) + (r.epf || 0) + (r.esi || 0) + lopAmount +
          (r.fullAndFinal || 0) + (r.otherDeductions || 0) + (r.advances || 0) + (r.incomeTax || 0);
        const grossSalary = totalEarnings;
        const netSalary = Math.round(grossSalary - totalDeductions);
        return {
          ...r,
          totalDays: attendance.totalDays, workingDays: attendance.workingDays, totalAbsent: attendance.totalAbsent, lopDays: attendance.lopDays,
          perDaySalary, extraDaysAmount, lopAmount,
          totalEarnings, totalDeductions, grossSalary, netSalary
        };
      }));
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/staff/provident-fund', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffProvidentFundRecord(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ===== STAFF ATTENDANCE ADJUSTMENTS (manual LOP override) =====
  app.get('/api/staff/attendance-adjustment/:empId/:month', async (req, res) => {
    try {
      const { empId, month } = req.params;
      const all = await getStaffAttendanceAdjustments();
      const existing = all.find(a => a.empId === empId && a.month === month);
      res.json({ success: true, data: existing || { id: `${empId}-${month}`, empId, month } });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
  });
  app.put('/api/staff/attendance-adjustment/:empId/:month', async (req, res) => {
    try {
      const { empId, month } = req.params;
      const { lopDaysOverride } = req.body;
      const updated: StaffAttendanceAdjustment = { id: `${empId}-${month}`, empId, month, lopDaysOverride };
      await saveStaffAttendanceAdjustment(updated);
      res.json({ success: true, data: updated });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
  });

  // ===== STAFF BANK DETAIL =====
  app.get('/api/staff/bank-detail', async (req, res) => {
    try { res.json(await getStaffBankDetails()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/staff/bank-detail', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffBankDetail(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/staff/bank-detail/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffBankDetail({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ===== STAFF ATTENDANCE =====
  app.get('/api/staff/attendance', async (req, res) => {
    try { res.json(await getStaffAttendance()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/staff/attendance/mark', async (req, res) => {
    try {
      const { empId, date, status, remarks } = req.body;
      if (isFutureDate(date)) return res.status(400).json({ success: false, error: 'Attendance cannot be marked for a future date.' });
      const record = await upsertAttendanceEntry({ empId, date, status, remarks });
      res.json({ success: true, data: record });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/staff/attendance/bulk', async (req, res) => {
    try {
      const entries = req.body as Array<{ empId: string; date: string; status: string; remarks?: string }>;
      if (!Array.isArray(entries)) return res.status(400).json({ success: false, error: 'Request body must be an array of attendance entries.' });
      if (entries.some(e => isFutureDate(e.date))) return res.status(400).json({ success: false, error: 'Attendance cannot be marked for a future date.' });

      const results = [];
      for (const entry of entries) {
        results.push(await upsertAttendanceEntry(entry));
      }
      res.json({ success: true, data: results });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/staff/attendance/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteStaffAttendanceRecord(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/staff/attendance/monthly/:empId/:month', async (req, res) => {
    try {
      const { empId, month } = req.params;
      res.json({ success: true, data: await computeMonthlyAttendanceSummary(empId, month) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Report data for one employee, covering the last month or last 6 months
  // (attendance rows are never purged, so at least 6 months is always retained).
  app.get('/api/staff/attendance/:empId/report', async (req, res) => {
    try {
      const { empId } = req.params;
      const range = (req.query.range as string) || 'last-month';
      const months = range === 'last-6-months' ? 6 : 1;

      const now = new Date();
      const monthKeys: string[] = [];
      for (let i = 0; i < months; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      const [employees, attendanceRows, salaryDetails, salaryHikes, advanceDeductions] = await Promise.all([
        getStaffEmployees(), getStaffAttendance(), getStaffSalaryDetails(), getStaffSalaryHikes(), getStaffAdvanceDeductions()
      ]);
      const employee = employees.find(e => e.id === empId);
      const summaries = await Promise.all(monthKeys.map(m => computeMonthlyAttendanceSummary(empId, m)));
      const rows = attendanceRows.filter(a => a.empId === empId && monthKeys.includes(a.date.slice(0, 7)));

      const detail = salaryDetails.find(d => d.empId === empId);
      const empDeductions = advanceDeductions.filter(x => x.empId === empId);
      const deductedTotal = empDeductions.reduce((s, x) => s + (x.amount || 0), 0);
      const today = new Date().toISOString().slice(0, 10);
      const salary = detail ? {
        ctc25: detail.ctc25,
        annualCtc25: detail.annualCtc25,
        effectiveSalary: computeEffectiveSalary(detail.ctc25, salaryHikes.filter(h => h.empId === empId), today),
        advanceBalance: Math.max(0, (detail.advanceAmount || 0) - deductedTotal)
      } : null;

      res.json({ success: true, data: { employee, monthKeys, summaries, rows, salary } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Report data for all staff, covering the last month or last 6 months.
  app.get('/api/staff/attendance/report/all', async (req, res) => {
    try {
      const range = (req.query.range as string) || 'last-month';
      const months = range === 'last-6-months' ? 6 : 1;

      const now = new Date();
      const monthKeys: string[] = [];
      for (let i = 0; i < months; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      const [employees, salaryDetails, salaryHikes, advanceDeductions] = await Promise.all([
        getStaffEmployees(), getStaffSalaryDetails(), getStaffSalaryHikes(), getStaffAdvanceDeductions()
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const perEmployee = await Promise.all(employees.map(async e => {
        const detail = salaryDetails.find(d => d.empId === e.id);
        const empDeductions = advanceDeductions.filter(x => x.empId === e.id);
        const deductedTotal = empDeductions.reduce((s, x) => s + (x.amount || 0), 0);
        return {
          empId: e.id, name: e.name,
          summaries: await Promise.all(monthKeys.map(m => computeMonthlyAttendanceSummary(e.id, m))),
          salary: detail ? {
            ctc25: detail.ctc25,
            annualCtc25: detail.annualCtc25,
            effectiveSalary: computeEffectiveSalary(detail.ctc25, salaryHikes.filter(h => h.empId === e.id), today),
            advanceBalance: Math.max(0, (detail.advanceAmount || 0) - deductedTotal)
          } : null
        };
      }));

      res.json({ success: true, data: { monthKeys, perEmployee } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== STAFF HOLIDAYS =====
  app.get('/api/staff/holidays', async (req, res) => {
    try { res.json(await getStaffHolidays()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/staff/holidays', async (req, res) => {
    try { res.json({ success: true, data: await saveStaffHoliday(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/staff/holidays/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteStaffHoliday(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ===== SALARY SLIPS ===== (registered under /api/staff so it inherits
  // requireHrAccess above - HR/Payroll admin + Super Admin only, same as
  // every other staff route)
  app.get('/api/staff/salary-slips', async (req, res) => {
    try { res.json(await getSalarySlips()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/staff/salary-slips', async (req, res) => {
    try { res.json({ success: true, data: await saveSalarySlipRecord(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/staff/salary-slips/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveSalarySlipRecord({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.get('/api/staff/salary-slip-audit', async (req, res) => {
    try { res.json(await getSalarySlipAudits()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/staff/salary-slip-audit', async (req, res) => {
    try { res.json({ success: true, data: await saveSalarySlipAuditRecord(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/abnormal-logins', async (req, res) => {
    try { res.json(await getAbnormalLogins()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/abnormal-logins/resolve', async (req, res) => {
    try {
      res.json({ success: true, data: await resolveAllAbnormalLogins() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notify-abnormal', async (req, res) => {
    try {
      const { username, reason } = req.body;
      const log: AbnormalLogin = {
        id: String(Date.now()),
        timestamp: istTimestamp(),
        username: String(username || 'Anonymous'),
        ipAddress: req.ip || '127.0.0.1',
        reason: String(reason || 'Suspicious login telemetry flagged'),
        resolved: false
      };
      await saveAbnormalLogin(log);

      const secNotif: DashboardNotification = {
        id: String(Date.now() + 1),
        title: 'Suspicious Telemetry Flagged',
        message: `Suspicious action by "${username}": ${reason}`,
        type: 'security',
        timestamp: log.timestamp,
        read: false
      };
      await saveNotification(secNotif);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Warehouse Details endpoints - super-admin-only for now
  app.use('/api/warehouse', requireWarehouseAccess);

  app.get('/api/warehouse', async (req, res) => {
    try {
      res.json(await getWarehouseEntries());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/warehouse', async (req, res) => {
    try {
      const entry: WarehouseEntry = req.body;
      const result = await saveWarehouseEntry(entry);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/warehouse/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await deleteWarehouseEntry(id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // Mileage Reports (Trip Details) endpoints - same restricted-access +
  // row-filtering pattern as /api/fuel above. Note there is no PUT route:
  // saveMileageReport upserts by id, so create vs. update is distinguished by
  // whether entry.id already exists.
  app.use('/api/mileage', requireFuelAccess);

  app.get('/api/mileage', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(filterEntryRowsForViewer(await getMileageReports(), sessionUser));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mileage', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const entry: MileageReport = req.body;
      if (isFutureDate(entry.date)) return res.status(400).json({ error: 'Mileage entry date cannot be in the future.' });
      if (entry.id) {
        const existing = (await getMileageReports()).find(r => r.id === entry.id);
        if (!canModifyEntryRow(existing, sessionUser)) {
          return res.status(403).json({ error: 'You cannot modify this entry.' });
        }
        const result = await saveMileageReport({ ...entry, enteredBy: existing?.enteredBy });
        return res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
      }
      // New entry: generate the id here (rather than leaving it to
      // saveMileageReport's own fallback) so it can be returned to the
      // caller - Fuel Entry's combined form needs it back immediately to
      // link the fuel log it's being saved alongside (see FuelLog.mileageReportId).
      const newId = String(Date.now());
      const result = await saveMileageReport({ ...entry, id: newId, enteredBy: sessionUser?.username });
      res.json({ success: true, id: newId, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/mileage/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { id } = req.params;
      const existing = (await getMileageReports()).find(r => r.id === id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      const result = await deleteMileageReport(id);
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fuel Vendor (Vendor Master) endpoints - shared reference list, gated to
  // the module as a whole but not row-filtered (both Chandan and Praveen need
  // the same vendor lookup data).
  app.use('/api/fuel-vendors', requireFuelAccess);

  app.get('/api/fuel-vendors', async (req, res) => {
    try {
      res.json(await getFuelVendors());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fuel-vendors', async (req, res) => {
    try {
      const entry: FuelVendor = req.body;
      const result = await saveFuelVendor(entry);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/fuel-vendors/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await deleteFuelVendor(id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vehicle Mileage Master endpoints - same shared-reference-list pattern as
  // Fuel Vendors above (fixed KM/L rating per vehicle for Trip Details).
  app.use('/api/vehicle-mileage', requireFuelAccess);

  app.get('/api/vehicle-mileage', async (req, res) => {
    try {
      res.json(await getVehicleMileages());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vehicle-mileage', async (req, res) => {
    try {
      const entry: VehicleMileage = req.body;
      const result = await saveVehicleMileage(entry);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/vehicle-mileage/:id', async (req, res) => {
    try {
      const result = await saveVehicleMileage({ ...req.body, id: req.params.id });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/vehicle-mileage/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await deleteVehicleMileage(id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vendor Management endpoints - full CRUD restricted to Divya/Rakshina/
  // super admin; GET additionally allowed for Chandan/Praveen (read-only
  // lookup so Fuel Entry's vehicle auto-fill/picker can work for them).
  app.get('/api/vendors', requireVendorReadAccess, async (req, res) => {
    try {
      res.json(await getVendors());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vendors', requireVendorManagementAccess, async (req, res) => {
    try {
      const entry: Vendor = req.body;
      const result = await saveVendor(entry);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/vendors/:id', requireVendorManagementAccess, async (req, res) => {
    try {
      // Merges with the existing record - saveVendor overwrites the whole
      // stored row with whatever it's given, so a partial body (e.g. just
      // { active }) would otherwise wipe every other field.
      const existing = (await getVendors()).find(v => v.id === req.params.id);
      const result = await saveVendor({ ...existing, ...req.body, id: req.params.id });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/vendors/:id', requireVendorManagementAccess, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await deleteVendor(id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vehicle -> Driver lookup for auto-matching outside the Driver Details
  // module (e.g. Petty Cash's Market POD trip form, Receiver auto-fill) -
  // deliberately NOT behind requireDriverAccess/DRIVER_LOCATION_SCOPES.
  // Those modules need to match ANY vehicle to its driver company-wide
  // regardless of the caller's own Driver Details location scope (a Petty
  // Cash handler logging a trip for a vehicle outside their own scoped
  // locations should still get the right driver, not "no driver mapped"
  // just because their Driver Details access doesn't cover that location).
  // Every field with payroll/bank/document data is deliberately left out -
  // this is a company-wide lookup, not a Driver Details view.
  app.get('/api/drivers/vehicle-lookup', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (!sessionUser) return res.status(401).json({ error: 'Authentication required.' });
      const all = await getDriverEmployees();
      res.json(all.map(d => ({ id: d.id, name: d.name, vehicleNo: d.vehicleNo || '' })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Driver Details endpoints - location-scoped, see DRIVER_LOCATION_SCOPES.
  app.use('/api/drivers/employees', requireDriverAccess);

  app.get('/api/drivers/employees', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allowed = getAllowedDriverViewLocations(sessionUser);
      const all = await getDriverEmployees();
      res.json(allowed === 'ALL' ? all : all.filter(d => allowed.includes(d.location)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/drivers/employees', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const entry: DriverEmployee = req.body;
      if (!canWriteDriverLocation(entry.location, sessionUser)) {
        return res.status(403).json({ error: 'You cannot add a driver in this location.' });
      }
      const result = await saveDriverEmployee(entry);
      const allowed = getAllowedDriverViewLocations(sessionUser);
      res.json({ success: true, data: allowed === 'ALL' ? result : result.filter(d => allowed.includes(d.location)) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/drivers/employees/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getDriverEmployees()).find(d => d.id === req.params.id);
      const targetLocation = req.body.location || existing?.location;
      if (!existing || !canWriteDriverLocation(existing.location, sessionUser) || !canWriteDriverLocation(targetLocation, sessionUser)) {
        return res.status(403).json({ error: 'You cannot modify this driver.' });
      }
      const result = await saveDriverEmployee({ ...req.body, id: req.params.id });
      const allowed = getAllowedDriverViewLocations(sessionUser);
      res.json({ success: true, data: allowed === 'ALL' ? result : result.filter(d => allowed.includes(d.location)) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/drivers/employees/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getDriverEmployees()).find(d => d.id === req.params.id);
      if (!existing || !canWriteDriverLocation(existing.location, sessionUser)) {
        return res.status(403).json({ error: 'You cannot delete this driver.' });
      }
      const result = await deleteDriverEmployee(req.params.id);
      const allowed = getAllowedDriverViewLocations(sessionUser);
      res.json({ success: true, data: allowed === 'ALL' ? result : result.filter(d => allowed.includes(d.location)) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Driver Attendance - same location scoping, resolved via the driver's own
  // location (attendance rows themselves don't carry a location).
  app.use('/api/drivers/attendance', requireDriverAccess);

  // `mode: 'view'` allows read-only access outside the caller's write scope
  // (i.e. for DRIVER_VIEW_ALL_EMAILS like Vinod); `mode: 'write'` (default)
  // is the stricter check used before actually marking/editing/deleting.
  async function assertDriverAccessible(driverId: string, sessionUser: Awaited<ReturnType<typeof getSessionUser>> | undefined, mode: 'view' | 'write' = 'write') {
    const driver = (await getDriverEmployees()).find(d => d.id === driverId);
    if (!driver) return false;
    return mode === 'view' ? canViewDriverLocation(driver.location, sessionUser) : canWriteDriverLocation(driver.location, sessionUser);
  }

  app.get('/api/drivers/attendance', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allowed = getAllowedDriverViewLocations(sessionUser);
      const [rows, drivers] = await Promise.all([getDriverAttendance(), getDriverEmployees()]);
      const scoped = allowed === 'ALL' ? rows : (() => {
        const allowedDriverIds = new Set(drivers.filter(d => allowed.includes(d.location)).map(d => d.id));
        return rows.filter(r => allowedDriverIds.has(r.driverId));
      })();
      res.json(maskAttributionField(scoped, 'markedBy', sessionUser));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/drivers/attendance/mark', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { driverId, date, status, remarks } = req.body;
      if (!(await assertDriverAccessible(driverId, sessionUser))) {
        return res.status(403).json({ success: false, error: 'You cannot mark attendance for this driver.' });
      }
      if (isFutureDate(date)) return res.status(400).json({ success: false, error: 'Attendance cannot be marked for a future date.' });
      const id = `${driverId}-${date}`;
      // markedBy always reflects whoever most recently set *this* day's
      // status (unlike a flat ledger's enteredBy) - each driver+date cell is
      // its own record, independently re-stamped every time it's re-marked.
      const record: DriverAttendance = { id, driverId, date, status, remarks, markedBy: sessionUser?.username };
      await saveDriverAttendanceRecord(record);
      res.json({ success: true, data: maskAttributionField([record], 'markedBy', sessionUser)[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/drivers/attendance/bulk', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const entries = req.body as Array<{ driverId: string; date: string; status: string }>;
      if (!Array.isArray(entries)) return res.status(400).json({ success: false, error: 'Request body must be an array of attendance entries.' });
      const results: DriverAttendance[] = [];
      for (const entry of entries) {
        if (!(await assertDriverAccessible(entry.driverId, sessionUser))) continue;
        if (isFutureDate(entry.date)) continue; // silently skipped, same treatment as an out-of-scope driver just above
        const id = `${entry.driverId}-${entry.date}`;
        const record: DriverAttendance = { id, driverId: entry.driverId, date: entry.date, status: entry.status as DriverAttendance['status'], markedBy: sessionUser?.username };
        await saveDriverAttendanceRecord(record);
        results.push(record);
      }
      res.json({ success: true, data: maskAttributionField(results, 'markedBy', sessionUser) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/drivers/attendance/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getDriverAttendance()).find(r => r.id === req.params.id);
      if (!existing || !(await assertDriverAccessible(existing.driverId, sessionUser))) {
        return res.status(403).json({ error: 'You cannot delete this attendance record.' });
      }
      const [rows, drivers] = await Promise.all([deleteDriverAttendanceRecord(req.params.id), getDriverEmployees()]);
      const allowed = getAllowedDriverViewLocations(sessionUser);
      if (allowed === 'ALL') {
        res.json({ success: true, data: rows });
      } else {
        const allowedDriverIds = new Set(drivers.filter(d => allowed.includes(d.location)).map(d => d.id));
        res.json({ success: true, data: rows.filter(r => allowedDriverIds.has(r.driverId)) });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/drivers/attendance/monthly/:driverId/:month', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { driverId, month } = req.params;
      if (!(await assertDriverAccessible(driverId, sessionUser, 'view'))) {
        return res.status(403).json({ success: false, error: 'You cannot view this driver.' });
      }
      const summary = await computeDriverMonthlyAttendanceSummary(driverId, month);
      res.json({ success: true, data: { ...summary, rows: maskAttributionField(summary.rows, 'markedBy', sessionUser) } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Own path prefixes, so each needs its own requireDriverAccess - Express's
  // app.use('/api/drivers/attendance', ...) above only covers that exact
  // prefix, and /api/drivers/salary-slips etc. are siblings of it, not
  // sub-paths (and /api/drivers/vehicle-lookup deliberately stays
  // unrestricted - see its own route - so a single blanket '/api/drivers'
  // gate isn't an option here).
  app.use('/api/drivers/attendance/range', requireDriverAccess);
  app.use('/api/drivers/salary-slips', requireDriverAccess);
  app.use('/api/drivers/salary-slip-audit', requireDriverAccess);

  // Powers the Driver Salary Slip's Date From/To pro-ration - :from/:to are
  // YYYY-MM-DD (no slashes, so they're safe as plain route segments).
  app.get('/api/drivers/attendance/range/:driverId/:from/:to', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { driverId, from, to } = req.params;
      if (!(await assertDriverAccessible(driverId, sessionUser, 'view'))) {
        return res.status(403).json({ success: false, error: 'You cannot view this driver.' });
      }
      const summary = await computeDriverRangeAttendanceSummary(driverId, from, to);
      res.json({ success: true, data: { ...summary, rows: maskAttributionField(summary.rows, 'markedBy', sessionUser) } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== DRIVER SALARY SLIPS ===== (requireDriverAccess registered above)
  app.get('/api/drivers/salary-slips', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allowed = getAllowedDriverViewLocations(sessionUser);
      const slips = await getDriverSalarySlips();
      res.json(allowed === 'ALL' ? slips : slips.filter(s => allowed.includes(s.location)));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/drivers/salary-slips', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (!(await assertDriverAccessible(req.body.driverId, sessionUser, 'view'))) {
        return res.status(403).json({ error: 'You cannot generate a salary slip for this driver.' });
      }
      res.json({ success: true, data: await saveDriverSalarySlipRecord(req.body) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/drivers/salary-slips/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (!(await assertDriverAccessible(req.body.driverId, sessionUser, 'view'))) {
        return res.status(403).json({ error: 'You cannot update this salary slip.' });
      }
      res.json({ success: true, data: await saveDriverSalarySlipRecord({ ...req.body, id: req.params.id }) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.get('/api/drivers/salary-slip-audit', async (req, res) => {
    try { res.json(await getDriverSalarySlipAudits()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/drivers/salary-slip-audit', async (req, res) => {
    try { res.json({ success: true, data: await saveDriverSalarySlipAuditRecord(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Loan Management: Vehicle Loan (one record per vehicle, id = Reg. No.) and
  // Business Loan - both super-admin-only (see requireLoanAccess).
  app.use('/api/vehicle-loans', requireLoanAccess);

  app.get('/api/vehicle-loans', async (req, res) => {
    try {
      res.json(await getVehicleLoans());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vehicle-loans', async (req, res) => {
    try {
      const result = await saveVehicleLoan(req.body as VehicleLoan);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/vehicle-loans/:id', async (req, res) => {
    try {
      const result = await saveVehicleLoan({ ...req.body, id: req.params.id });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/vehicle-loans/:id', async (req, res) => {
    try {
      res.json({ success: true, data: await deleteVehicleLoan(req.params.id) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/business-loans', requireLoanAccess);

  app.get('/api/business-loans', async (req, res) => {
    try {
      res.json(await getBusinessLoans());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/business-loans', async (req, res) => {
    try {
      const result = await saveBusinessLoan(req.body as BusinessLoan);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/business-loans/:id', async (req, res) => {
    try {
      const result = await saveBusinessLoan({ ...req.body, id: req.params.id });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/business-loans/:id', async (req, res) => {
    try {
      res.json({ success: true, data: await deleteBusinessLoan(req.params.id) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.get("/api/test-email", async (req, res) => {
  try {
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: "superapp@kcmlogistics.in",   // <-- Replace with your own email
      subject: "KCM Logistics Test Email",
      html: `
        <h2>Congratulations 🎉</h2>
        <p>Your Resend integration is working successfully.</p>
      `
    });

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
  }
});
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Real daily schedule for the compliance digest, independent of any user
  // logging in. Checks hourly; the digest-sent-<date> marker notification
  // (written inside buildAndSendComplianceDigest) keeps it to once/day.
  runScheduledComplianceDigest();
  setInterval(runScheduledComplianceDigest, 60 * 60 * 1000);

  // Same hourly-check pattern for the Birthday Reminder - runScheduledBirthdayCheck
  // itself holds off until BIRTHDAY_EMAIL_HOUR_IST (9 AM), then the
  // per-employee birthday-sent-<empId>-<date> marker keeps each employee to
  // once/day regardless of how many times the hourly tick lands after that.
  runScheduledBirthdayCheck();
  setInterval(runScheduledBirthdayCheck, 60 * 60 * 1000);

  // Same hourly-check pattern for the Service Due (Reefer/Hybrid) & Washing
  // Due (Walkes) reminders - per-milestone marker notifications keep each
  // vehicle/threshold to once per cycle regardless of how many times the
  // hourly tick lands.
  runScheduledServiceWashingReminders();
  setInterval(runScheduledServiceWashingReminders, 60 * 60 * 1000);
}

startServer();
