import express from "express";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";
import upload from "./src/upload/upload.ts";
import multer from "multer";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

import { createServer as createViteServer } from 'vite';
import { verifyPassword } from './src/auth/password.ts';
import { createSession, getSessionUser, destroySession, extractBearerToken, startSessionCleanup } from './src/auth/session.ts';
import { issueOtp, verifyOtp } from './src/auth/otp.ts';
import { istTimestamp, istDateKey, istHour, istMonthDayKey } from './src/auth/time.ts';
import { computeDueDateRaw } from './src/utils/loanDates.ts';
import { extractTrailingNumber, extractLeadingNumber } from './src/utils/sort.ts';
import { nextBunkFuelIndentNumber, nextCardFuelIndentNumber } from './src/utils/fuelIndentNumber.ts';
import {
  WASHING_CYCLE_DAYS, isWashingEligible,
  AC_SERVICE_CYCLE_DAYS, isAcServiceEligible,
  REMINDER_DAYS_BEFORE_DUE
} from './src/utils/vehicleCycleDefaults.ts';
import { latestOdometerFor, computeKmStatus, computeAlignmentStatus, nextAlignmentDueKm, projectDueDate, daysUntil } from './src/utils/maintenanceDates.ts';
import { PETTY_CASH_USERS } from './src/utils/pettyCashUsers.ts';
import { driverAllLocations, isDriverActiveAtLocation, attendanceBelongsToLocation } from './src/utils/driverLocations.ts';
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
  VehicleMaintenanceReference,
  WarehouseRateOverride,
  AlertSettings,
  TireBrand,
  TireRecord,
  BatteryRecord,
  ToolsChecklistRecord,
  ServiceStationSparePart,
  ServiceStationInspection,
  AuditAction,
  BunkPaymentPeriod,
  BunkPayment,
  DieselBunkAccount,
  DieselBunkPayment
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
  getVehicleMaintenanceReferences,
  upsertVehicleMaintenanceReference,
  getWarehouseRateOverrides,
  saveWarehouseRateOverride,
  deleteWarehouseRateOverride,
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
  getServiceStationSpareParts,
  saveServiceStationSparePart,
  deleteServiceStationSparePart,
  getServiceStationInspections,
  saveServiceStationInspection,
  deleteServiceStationInspection,
  getBunkPaymentPeriods,
  saveBunkPaymentPeriod,
  deleteBunkPaymentPeriod,
  getBunkPayments,
  saveBunkPayment,
  deleteBunkPayment,
  getDieselBunkAccounts,
  saveDieselBunkAccount,
  deleteDieselBunkAccount,
  getDieselBunkPayments,
  saveDieselBunkPayment,
  deleteDieselBunkPayment,
  migrateLegacyMaintenanceProfiles,
  migrateMileageReportTotalLitres,
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
  getDriverAttendance,
  saveDriverAttendanceRecord,
  deleteDriverAttendanceRecord,
  getVehicleLoans,
  saveVehicleLoan,
  deleteVehicleLoan,
  getBusinessLoans,
  saveBusinessLoan,
  deleteBusinessLoan,
  createAuditLog,
  getAuditLogs,
  getAuditLogFilterOptions
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
async function upsertAttendanceEntry(entry: { empId: string; date: string; status: string; remarks?: string; markedBy?: string }) {
  const id = `${entry.empId}-${entry.date}`;
  const record: StaffAttendance = {
    id, empId: entry.empId, date: entry.date, status: entry.status as StaffAttendance['status'], remarks: entry.remarks, markedBy: entry.markedBy
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
// Vinod gets into HR & Payroll too, but for Staff Attendance visibility only
// (no Staff Salary/Salary Slip, no marking/editing attendance at all) - see
// requireHrFullAccess below for the narrower gate applied to every other
// /api/staff/* route, and Administration.tsx/HR.tsx for the matching
// client-side restriction.
const HR_ATTENDANCE_VIEW_ONLY_EMAILS = ['vinod@kcmlogistics.in'];

async function requireHrAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin' && sessionUser.email !== 'bhagya@kcmlogistics.in' && !HR_ATTENDANCE_VIEW_ONLY_EMAILS.includes(sessionUser.email || '')) {
    return res.status(403).json({ error: 'You do not have access to HR & Payroll.' });
  }
  next();
}

// Narrower gate for every /api/staff/* route except the attendance-viewing
// ones (GET attendance/holidays/employees, both listed and per-employee) -
// blocks HR_ATTENDANCE_VIEW_ONLY_EMAILS from salary data, salary slips, and
// every attendance WRITE endpoint (mark/bulk/delete/holidays write), while
// still letting bhagya@kcmlogistics.in and super admins through as before.
async function requireHrFullAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (HR_ATTENDANCE_VIEW_ONLY_EMAILS.includes(sessionUser.email || '') && sessionUser.department !== 'super_admin') {
    return res.status(403).json({ error: 'You only have view access to Staff Attendance.' });
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

// Petty Cash's 3 handler logins - Vinod and Ramesh are already department
// 'petty_cash', Saneel is department 'maintenance' but also gets Petty Cash
// access, so this is an explicit email allowlist (mirrors FUEL_ENTRY_USER_EMAILS
// above) rather than relying on department alone. Each of the 3 only ever
// sees/modifies their own rows - see PETTY_CASH_FULL_VIEW_EMAILS below for
// the separate, broader tier.
const PETTY_CASH_ACCESS_EMAILS = ['vinod@kcmlogistics.in', 'ramesh@kcmlogistics.in', 'saneel@kcmlogistics.in'];

// Rakshina (Accounts & Finance) - full cross-handler visibility AND manage
// rights across the whole Petty Cash module (vouchers, Market POD, Amount
// Received advances), not just her own rows like the 3 handlers above - an
// oversight/reconciliation role. Same "opt-in full view" mechanism
// filterEntryRowsForViewer already supports for Divya on Fuel Management,
// just also extended to the write/modify side here (canModifyEntryRow etc.)
// since a finance oversight role needs to fix any handler's entries too.
// Mirrors PettyCash.tsx's own isSuperAdmin, which treats her the same way
// client-side.
const PETTY_CASH_FULL_VIEW_EMAILS = ['finance@kcmlogistics.in'];

function canModifyPettyCashRow(row: { enteredBy?: string } | undefined, sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): boolean {
  if (sessionUser && PETTY_CASH_FULL_VIEW_EMAILS.includes(sessionUser.email || '')) return true;
  return canModifyEntryRow(row, sessionUser);
}

// Petty Cash (vouchers, Market POD, and the Amount Received advances ledger)
// is restricted to the 3 Petty Cash logins, Rakshina (full view), and super
// admins. Within that, each of the 3 handlers only ever sees/modifies their
// own rows - see filterEntryRowsForViewer/canModifyPettyCashRow and their
// PettyCashAdvance-specific counterparts below.
async function requirePettyCashAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (
    sessionUser.department !== 'super_admin' && sessionUser.department !== 'petty_cash' &&
    !PETTY_CASH_ACCESS_EMAILS.includes(sessionUser.email || '') && !PETTY_CASH_FULL_VIEW_EMAILS.includes(sessionUser.email || '')
  ) {
    return res.status(403).json({ error: 'You do not have access to Petty Cash.' });
  }
  next();
}

// Warehouse Details is super-admin-only, plus Bhagya and Vinod explicitly
// (mirrors Administration.tsx's own hasAccess('warehouse') check - this is
// the one place to widen it further to other roles later). Vinod was added
// to the client-side gate in an earlier change but missed here - fixed
// 2026-08-29, since without this he'd see the tab but every actual API call
// would 403.
async function requireWarehouseAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin' && sessionUser.email !== 'bhagya@kcmlogistics.in' && sessionUser.email !== 'vinod@kcmlogistics.in') {
    return res.status(403).json({ error: 'You do not have access to Warehouse Details.' });
  }
  next();
}

// Payments module (bunk payment periods + their payments) is restricted to
// Praveen and super admins (Principal included - department 'super_admin'
// covers both, same as every other "Super Admin / Principal only" gate in
// this app) - mirrors Administration.tsx's own hasAccess('payments') check.
const PAYMENTS_ACCESS_EMAILS = ['praveenkumar@kcmlogistics.in'];
async function requirePaymentsAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin' && !PAYMENTS_ACCESS_EMAILS.includes(sessionUser.email || '')) {
    return res.status(403).json({ error: 'You do not have access to Payments.' });
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
//
// Numbering scheme (per direct instruction, effective 2026-08-13, corrected
// 2026-09-01):
// - Each of the 3 handlers (Ramesh, Vinod, Saneel) keeps their own
//   independent flat sequence ENT-<year>-<4-digit-seq>, mirroring a real
//   physical cash-book each of them keeps - PER-HOLDER, not one sequence
//   shared across all three (two different holders legitimately having the
//   same-looking Entry No is expected - it's scoped to "this handler's own
//   book", not a ledger-wide unique reference; the voucher's own `id` still
//   is). This briefly grew a per-calendar-month reset (ENT-<year>-<MM><NN>)
//   for a Sep 1 2026 cutover, but that's now deferred to
//   MONTHLY_FORMAT_CUTOVER below - nothing already saved under the brief
//   monthly format gets touched/renumbered, this only changes how new
//   entries are numbered going forward.
// - Ramesh already has a real, reliable continuous history in this flat
//   format (e.g. his real last entry is ENT-2026-2941) - this just keeps
//   continuing from his own highest number automatically, same as always.
// - Vinod and Saneel's own historical Entry Nos (from when this was one
//   sequence shared across all 3 handlers) don't reliably reflect where
//   their own physical cash-book actually stands, so each of them manually
//   types their own next Entry No exactly ONCE (see
//   canManualFirstPettyCashEntry below) to continue their own physical
//   numbering into the app - every entry after that is auto-sequential
//   again, indefinitely, with no need to ever retype it (no monthly reset
//   applies until the cutover below).
const MONTHLY_FORMAT_CUTOVER_YEAR = 2027;
const MONTHLY_FORMAT_CUTOVER_MONTH = 3; // March

function nextPettyCashEntryNo(holderVouchers: PettyCashVoucher[]): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const useMonthlyFormat = year > MONTHLY_FORMAT_CUTOVER_YEAR || (year === MONTHLY_FORMAT_CUTOVER_YEAR && month >= MONTHLY_FORMAT_CUTOVER_MONTH);
  const existing = new Set(holderVouchers.map(v => (v.entryNo || '').toUpperCase()));

  if (useMonthlyFormat) {
    const prefix = `ENT-${year}-${String(month).padStart(2, '0')}`;
    let maxNum = 0;
    for (const v of holderVouchers) {
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

  // Flat, per-holder (current scheme through the cutover above). Excludes
  // any stray monthly-shaped value that might already exist from the
  // briefly-live Sep 1 2026 cutover (see looksLikeStrayMonthlyFormatEntry)
  // so it never gets miscounted as a real flat sequence number.
  const prefix = `ENT-${year}-`;
  let maxNum = 0;
  for (const v of holderVouchers) {
    const upper = (v.entryNo || '').toUpperCase();
    if (!upper.startsWith(prefix) || looksLikeStrayMonthlyFormatEntry(upper, prefix)) continue;
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

// A stray monthly-format entry (ENT-<year>-<MM><NN>) briefly created during
// the now-reverted Sep 1 2026 cutover looks identical in shape to the flat
// scheme's own ENT-<year>-<NNNN> - both are exactly 4 trailing digits. Value
// is what tells them apart: MMNN maxes out at 1299 (month 01-12, seq 00-99),
// while every genuine flat number in this dataset has been >= 2672 since the
// 2026-08-13 floor. Excluding a stray <=1299 value here only means offering
// the one-time manual entry (see canManualFirstPettyCashEntry) a little
// longer than strictly needed - it can never cause a wrong AUTOMATIC number,
// so it's a safe, one-directional bias.
function looksLikeStrayMonthlyFormatEntry(entryNo: string | undefined, flatPrefix: string): boolean {
  const upper = (entryNo || '').toUpperCase();
  if (!upper.startsWith(flatPrefix) || upper.length !== flatPrefix.length + 4) return false;
  const n = parseInt(upper.slice(flatPrefix.length), 10);
  return !isNaN(n) && n <= 1299;
}

// Petty Cash change request (2026-08-26, corrected 2026-09-01): Vinod and
// Saneel each manually type their own next Entry No exactly once (continuing
// their own physical cash-book numbering into the app) - every entry after
// that is auto-sequential and locked again, same as every other handler
// always was. Ramesh is unaffected (he'd already been entering vouchers
// under a reliable version of the flat scheme when this shipped) - he keeps
// the fully-automatic behavior nextPettyCashEntryNo always had.
const MANUAL_FIRST_ENTRY_USERNAMES = ['vinoda', 'saneel'];

// Whether `username`'s next save is eligible for a manually-typed Entry No,
// and what shape that manual entry must take - width/max differ between the
// current flat scheme (4 digits, 1-9999) and the monthly scheme it'll
// eventually resume being (2 digits, 1-99, once MONTHLY_FORMAT_CUTOVER
// arrives). Not eligible at all for anyone outside MANUAL_FIRST_ENTRY_
// USERNAMES, or once that holder already has a real entry under the current
// scheme (only ever true for their very first save under each scheme).
function canManualFirstPettyCashEntry(holderVouchers: PettyCashVoucher[], username: string): { can: boolean; prefix: string; width: number; max: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const useMonthlyFormat = year > MONTHLY_FORMAT_CUTOVER_YEAR || (year === MONTHLY_FORMAT_CUTOVER_YEAR && month >= MONTHLY_FORMAT_CUTOVER_MONTH);
  if (!MANUAL_FIRST_ENTRY_USERNAMES.includes(username)) {
    return { can: false, prefix: useMonthlyFormat ? `ENT-${year}-${String(month).padStart(2, '0')}` : `ENT-${year}-`, width: useMonthlyFormat ? 2 : 4, max: useMonthlyFormat ? 99 : 9999 };
  }
  if (useMonthlyFormat) {
    const prefix = `ENT-${year}-${String(month).padStart(2, '0')}`;
    const can = !holderVouchers.some(v => {
      const upper = (v.entryNo || '').toUpperCase();
      return upper.startsWith(prefix) && upper.length === prefix.length + 2;
    });
    return { can, prefix, width: 2, max: 99 };
  }
  const prefix = `ENT-${year}-`;
  const hasRelevant = holderVouchers.some(v => {
    const upper = (v.entryNo || '').toUpperCase();
    return upper.startsWith(prefix) && !looksLikeStrayMonthlyFormatEntry(upper, prefix);
  });
  return { can: !hasRelevant, prefix, width: 4, max: 9999 };
}

// Normalizes a manually-typed trailing sequence into the full Entry No -
// only the number itself is ever user-supplied, the ENT-<year>-<...> prefix
// is fixed/known and never part of what they type. Returns null for
// anything outside 1-`max` so the route can reject it with a clear error
// instead of silently coercing garbage input.
function buildManualPettyCashEntryNo(prefix: string, rawSeq: unknown, width: number, max: number): string | null {
  const digits = String(rawSeq ?? '').trim().replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  if (isNaN(n) || n < 1 || n > max) return null;
  return `${prefix}${String(n).padStart(width, '0')}`;
}

// Which Entry No numbering "bucket" a voucher belongs to for renumbering
// purposes (see renumberPettyCashSequence below) - currently only recognizes
// the flat-2026 format (ENT-2026-<4-digit-seq>), and only from the
// 2026-08-13 floor (2672) onward - anything below that is the deliberately-
// untouched messy legacy zone (duplicate/out-of-order numbers, see
// nextPettyCashEntryNo's own comment), OR a stray monthly-format entry (see
// looksLikeStrayMonthlyFormatEntry - always <=1299, so the >= 2672 floor
// already excludes it too), and must never be swept into a renumbering pass.
//
// Bucketed PER-HOLDER (2026-09-01 correction) - Entry No is now each
// handler's own independent book (see nextPettyCashEntryNo's own header
// comment), so gap-compaction must never cross from one holder's sequence
// into another's; a voucher with no enteredBy at all (pre-dates per-holder
// numbering entirely) buckets alone under its own empty-string holder key,
// same "never mixed into a real handler's sequence" treatment.
interface PettyCashEntryBucket { key: string; prefix: string; width: number; floor: number; seq: number }
function pettyCashEntryBucket(v: PettyCashVoucher): PettyCashEntryBucket | null {
  const upper = (v.entryNo || '').toUpperCase();
  const m = upper.match(/^ENT-(\d{4})-(\d{4})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const value = parseInt(m[2], 10);
  if (isNaN(value) || year !== 2026 || value < 2672) return null;
  return { key: `${v.enteredBy || ''}||${year}-flat`, prefix: `ENT-${year}-`, width: 4, floor: 2672, seq: value };
}

// Closes any gap left in the Entry No sequence - e.g. deleting ENT-2026-2713
// out of .../2712, 2713, 2714 shifts 2714 down to become the new 2713, and
// so on, so the office never sees "2712, 2714" with 2713 missing. Renumbers
// within each bucket independently (see pettyCashEntryBucket), sorted by
// each voucher's CURRENT Entry No - preserving relative order (the same
// "Entry No order = real entry order" assumption the Ledger's running
// Balance Net already depends on), only the numbers shift, nothing is
// reordered or touched outside a recognized/eligible bucket. Idempotent - a
// no-op once a bucket is already gap-free - so it's safe to run after every
// delete AND as a one-time sweep to fix gaps that already existed before
// this existed.
async function renumberPettyCashSequence(): Promise<void> {
  try {
    const vouchers = await getPettyCashVouchers();
    const buckets = new Map<string, { prefix: string; width: number; floor: number; entries: { voucher: PettyCashVoucher; seq: number }[] }>();

    vouchers.forEach(v => {
      const info = pettyCashEntryBucket(v);
      if (!info) return;
      if (!buckets.has(info.key)) buckets.set(info.key, { prefix: info.prefix, width: info.width, floor: info.floor, entries: [] });
      buckets.get(info.key)!.entries.push({ voucher: v, seq: info.seq });
    });

    for (const { prefix, width, floor, entries } of buckets.values()) {
      entries.sort((a, b) => a.seq - b.seq);
      for (let i = 0; i < entries.length; i++) {
        const targetEntryNo = `${prefix}${String(floor + i).padStart(width, '0')}`;
        if (entries[i].voucher.entryNo.toUpperCase() !== targetEntryNo) {
          await savePettyCashVoucher({ ...entries[i].voucher, entryNo: targetEntryNo });
        }
      }
    }
  } catch (error) {
    console.error('Failed to renumber Petty Cash Entry No sequence:', error);
  }
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

// --- Fuel Entry Indent No - Bunk and Card are two completely independent
// sequences, generated by the shared nextBunkFuelIndentNumber/
// nextCardFuelIndentNumber (see src/utils/fuelIndentNumber.ts - also used
// client-side as a fallback estimate, so the two can never drift apart),
// both database-backed (computed fresh from getFuelLogs() every call, never
// an in-memory counter) so they stay correct across server/PM2 restarts,
// deployments, and concurrent users. A pre-existing FuelLog saved before the
// bunkOrCard field existed is treated as 'Bunk' - the same default the Add
// Entry form itself has always used - so it's never silently miscounted
// into the Card sequence or dropped from Bunk's.
//
// Both sequences are further scoped per enteredBy - each fuel-access login
// (Chandan, Praveen, Ramesh) gets their own independent Bunk sequence (still
// per calendar month) and their own independent Card sequence (still always
// starts at 00001), so two different people's Indent Nos are never mixed up
// or compared against each other, told apart only by who entered them. A
// legacy row with no enteredBy at all (pre-dates this feature) is bucketed
// under '' - isolated from every real login's own sequence, never blended
// into one of them by accident.

// Duplicate guard for both sequences - scoped to match how each is
// generated: Bunk within the same (Bunk, calendar month, enteredBy) bucket
// (the same number can legitimately recur across different months or
// different people, since Bunk restarts by hand each month and each person
// has their own sequence), Card across its whole per-person sequence (never
// resets, so no two Card entries by the SAME person should ever share a
// number - two different people's Card sequences may coincide freely). Only
// ever rejects a genuinely new-to-this-id value - resubmitting a record's
// own unchanged Indent No (a normal edit that didn't touch it) always
// passes.
function findDuplicateFuelIndentNumber(logs: FuelLog[], indentNumber: string | undefined, candidate: { bunkOrCard?: string; date?: string; enteredBy?: string }, excludeId?: string): boolean {
  const target = (indentNumber || '').trim().toUpperCase();
  if (!target) return false;
  const isCard = candidate.bunkOrCard === 'Card';
  const monthKey = (candidate.date || '').slice(0, 7);
  return logs.some(l => {
    if (l.id === excludeId) return false;
    if ((l.indentNumber || '').trim().toUpperCase() !== target) return false;
    if ((l.enteredBy || '') !== (candidate.enteredBy || '')) return false; // separate sequence per person
    const lIsCard = l.bunkOrCard === 'Card';
    if (isCard !== lIsCard) return false;
    if (isCard) return true; // Card: one sequence per person, no month scoping
    return (l.date || '').slice(0, 7) === monthKey;
  });
}

// Closes any gap left in the Indent No sequence after a delete - same idea
// as renumberPettyCashSequence above, applied to both Fuel sequences
// independently, and now further bucketed per enteredBy (see the block
// comment above):
// - Bunk: bucketed per (calendar month, enteredBy) (matches
//   nextBunkFuelIndentNumber's own scoping) - within each bucket, the
//   surviving entries are renumbered to run consecutively starting from that
//   bucket's own lowest existing number (whatever the office originally
//   typed by hand for that month's first entry), preserving relative order.
// - Card: one sequence per enteredBy, each renumbered to run consecutively
//   from 00001 - matches nextCardFuelIndentNumber's own always-starts-at-1
//   rule.
// Only ever touches entries whose current Indent No is already in the
// numeric shape each sequence recognizes (extractLeadingNumber()>0 for Bunk,
// the exact 5-digit shape for Card) - anything else (blank, non-numeric,
// legacy/free-text) is left completely alone, same "don't touch what it
// doesn't recognize" rule as the Petty Cash version. Idempotent - a no-op
// once a bucket is already gap-free.
async function renumberFuelIndentSequence(): Promise<void> {
  try {
    const logs = await getFuelLogs();

    // Bunk - one bucket per (calendar month, enteredBy).
    const bunkBuckets = new Map<string, { log: FuelLog; seq: number }[]>();
    logs.forEach(l => {
      if ((l.bunkOrCard || 'Bunk') !== 'Bunk') return;
      const seq = extractLeadingNumber(l.indentNumber);
      if (seq <= 0) return;
      const monthKey = (l.date || '').slice(0, 7);
      if (!monthKey) return;
      const bucketKey = `${monthKey}::${l.enteredBy || ''}`;
      if (!bunkBuckets.has(bucketKey)) bunkBuckets.set(bucketKey, []);
      bunkBuckets.get(bucketKey)!.push({ log: l, seq });
    });
    for (const entries of bunkBuckets.values()) {
      entries.sort((a, b) => a.seq - b.seq);
      const floor = entries[0].seq;
      for (let i = 0; i < entries.length; i++) {
        const targetIndentNumber = String(floor + i);
        if ((entries[i].log.indentNumber || '').trim() !== targetIndentNumber) {
          await saveFuelLog({ ...entries[i].log, id: entries[i].log.id, indentNumber: targetIndentNumber });
        }
      }
    }

    // Card - one continuous sequence per enteredBy, always starting at 00001.
    const cardBuckets = new Map<string, { log: FuelLog; seq: number }[]>();
    logs.forEach(l => {
      if (l.bunkOrCard !== 'Card' || !/^\d{5}$/.test((l.indentNumber || '').trim())) return;
      const seq = parseInt(l.indentNumber.trim(), 10);
      if (isNaN(seq) || seq <= 0) return;
      const bucketKey = l.enteredBy || '';
      if (!cardBuckets.has(bucketKey)) cardBuckets.set(bucketKey, []);
      cardBuckets.get(bucketKey)!.push({ log: l, seq });
    });
    for (const entries of cardBuckets.values()) {
      entries.sort((a, b) => a.seq - b.seq);
      for (let i = 0; i < entries.length; i++) {
        const targetIndentNumber = String(i + 1).padStart(5, '0');
        if ((entries[i].log.indentNumber || '').trim() !== targetIndentNumber) {
          await saveFuelLog({ ...entries[i].log, id: entries[i].log.id, indentNumber: targetIndentNumber });
        }
      }
    }
  } catch (error) {
    console.error('Failed to renumber Fuel Indent No sequence:', error);
  }
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

// NOTE: Extra Fuel "Paid by Petty Cash" (FuelManagement.tsx's Mileage tab)
// deliberately does NOT create/sync a Petty Cash voucher (a
// syncFuelExtraPettyCashLink used to exist here and auto-generate one, per
// direct instruction that was later reversed - showing the "(PC)"/holder
// badge on the Fuel Entry and in the Mileage Report module (see
// MileageReport.tsx) is enough; no linked Petty Cash entry should be
// created). MileageReport.extraFuelPaymentMode/pettyCashHolderUsername are
// still stored and displayed - pettyCashEntryId is simply never populated.

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
// specific non-super-admin to see every row too - e.g. Divya on /api/fuel
// (RQ IDs across the whole ledger), or Rakshina on /api/petty-cash and
// /api/market-pod (PETTY_CASH_FULL_VIEW_EMAILS, full oversight of all 3
// handlers). Any other caller (mileage, etc.) omits it and keeps the plain
// super-admin-only rule.
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

// One-way exception on top of Fuel Management's usual "only see your own
// entries" rule: Chandan can also see Praveen's fuel entries (never the
// reverse - Praveen still only ever sees his own), so he can fill in the
// Mileage section on an entry Praveen left it blank on. Keyed by username
// (matches enteredBy), not email.
const FUEL_MILEAGE_ONLY_VISIBLE_ENTRANTS: Record<string, string[]> = {
  chandanreddy: ['praveenkumar'],
};

// Fuel-specific version of filterEntryRowsForViewer: same rules (super admin
// sees everything with enteredBy intact; Divya/RQ-ID-only sees everything
// too), plus the one-way exception above. Unlike the viewer's own rows
// (enteredBy always stripped, even from themselves), a foreign row visible
// only via the exception keeps its enteredBy - that's the signal the client
// uses to know a row isn't theirs and lock its Details section, exposing
// only the Mileage section as editable (see FuelManagement.tsx).
function filterFuelLogsForViewer(rows: FuelLog[], sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): FuelLog[] {
  if (!sessionUser) return [];
  if (sessionUser.department === 'super_admin' || FUEL_RQ_ID_ONLY_EMAILS.includes(sessionUser.email || '')) return rows;
  const extraUsernames = FUEL_MILEAGE_ONLY_VISIBLE_ENTRANTS[sessionUser.username] || [];
  return rows
    .filter(r => r.enteredBy === sessionUser.username || extraUsernames.includes(r.enteredBy || ''))
    .map(r => r.enteredBy === sessionUser.username ? (({ enteredBy, ...rest }) => rest as FuelLog)(r) : r);
}

// Resolves what a PUT /api/fuel/:id request is actually allowed to write:
// the requester's own row (or any row, for a super admin) saves the request
// body as-is; a foreign row reachable only via the mileage-only exception
// above has every field forced back to the existing row's own value except
// mileageReportId, regardless of what the request body contains - so Chandan
// can never alter Praveen's Details section (indentNumber, ltrs, rate, etc.)
// even via a raw API call, only ever attach/replace the linked Mileage
// Report. Anyone else gets rejected outright.
function buildFuelLogUpdateForViewer(existing: FuelLog, body: any, sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): { data: any } | { error: string } {
  if (!sessionUser) return { error: 'Authentication required.' };
  if (sessionUser.department === 'super_admin' || existing.enteredBy === sessionUser.username) {
    return { data: { ...body, id: existing.id, enteredBy: existing.enteredBy } };
  }
  const extraUsernames = FUEL_MILEAGE_ONLY_VISIBLE_ENTRANTS[sessionUser.username] || [];
  if (extraUsernames.includes(existing.enteredBy || '')) {
    return { data: { ...existing, mileageReportId: body?.mileageReportId } };
  }
  return { error: 'You cannot modify this entry.' };
}

// Same two rules as above, but for PettyCashAdvance rows, which are keyed by
// `username` (whose ledger the advance belongs to) rather than `enteredBy`
// (who happened to log the row) - the two normally coincide for Petty Cash's
// 3 logins, but `username` is what actually matters for whose balance an
// advance counts toward.
function filterAdvancesForViewer(rows: PettyCashAdvance[], sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): PettyCashAdvance[] {
  if (!sessionUser) return [];
  if (sessionUser.department === 'super_admin' || PETTY_CASH_FULL_VIEW_EMAILS.includes(sessionUser.email || '')) return rows;
  return rows.filter(r => r.username === sessionUser.username);
}

function canModifyAdvance(row: PettyCashAdvance | undefined, sessionUser?: Awaited<ReturnType<typeof getSessionUser>>): boolean {
  if (!sessionUser) return false;
  if (sessionUser.department === 'super_admin' || PETTY_CASH_FULL_VIEW_EMAILS.includes(sessionUser.email || '')) return true;
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
  'hemanth@kcmlogistics.in': ['BLR Swiggy', 'Goa Vehicle', 'Cold Star BLR', 'Belgaum Drivers Details']
  // Vinod used to be scoped here (a handful of locations, plus view-only
  // everywhere else via DRIVER_VIEW_ALL_EMAILS) - 2026-09-02: promoted to
  // full read+write everywhere, see DRIVER_ALL_LOCATIONS_EMAILS below.
};

// Bhagya, Divya, Chandana, and Vinod get every location (like a super
// admin) rather than a single region. All read and write everywhere -
// Driver Details AND Driver Attendance/Driver Salary both, no location
// restriction at all.
const DRIVER_ALL_LOCATIONS_EMAILS = ['bhagya@kcmlogistics.in', 'divya@kcmlogistics.in', 'ln.chandana@kcmlogistics.in', 'vinod@kcmlogistics.in'];

// View-all/write-scoped tier (broader read than write) - currently unused
// now that Vinod (its only member) has full read+write via
// DRIVER_ALL_LOCATIONS_EMAILS above. Left in place since the access model
// (view everywhere, write only within DRIVER_LOCATION_SCOPES) is a real,
// reusable tier if a future hire needs it again.
const DRIVER_VIEW_ALL_EMAILS: string[] = [];

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
// admins and DRIVER_ALL_LOCATIONS_EMAILS get every location; everyone
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
// mark/edit attendance for. Narrower than view scope for anyone in
// DRIVER_VIEW_ALL_EMAILS (currently empty - see its own comment above).
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
  // Mileage Report gained a Total Ltrs (Litres + Extra Fuel) field that
  // Mileage/Cost-per-KM now compute from - backfill it onto every
  // pre-existing row (no-op once every row has it).
  await migrateMileageReportTotalLitres();
  // One-time sweep to close any Petty Cash Entry No gaps that already
  // existed before renumberPettyCashSequence started running on every
  // delete - no-op once the sequence is already gap-free.
  await renumberPettyCashSequence();
  // Same one-time sweep for Fuel Indent No (Bunk and Card sequences) - see
  // renumberFuelIndentSequence.
  await renumberFuelIndentSequence();
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

  // --- Washing (Walkes/Reefer/Hybrid) & AC Service (Hybrid/Reefer) staged
  // reminder emails - fixed calendar-day cycles (unlike
  // calculateMaintenanceMilestoneAlerts above, which is km/projected-date
  // driven): a fixed 10-day Washing cycle and a fixed 40-day AC Service
  // cycle, both with a fixed 2-day-before-due reminder (REMINDER_DAYS_BEFORE_DUE
  // in src/utils/vehicleCycleDefaults.ts) - no per-vehicle override, no
  // global settings panel. A Hybrid/Reefer vehicle is eligible for BOTH
  // cycles independently (they're unrelated activities); Walkes gets only
  // Washing; Dry gets neither - it only ever gets the existing km-based
  // Service Schedule alerts above. Reminders only fire for a vehicle that
  // actually has a real last-washing/last-AC-service date recorded - the
  // Service Schedule UI's own "default to today" preview is a display
  // convenience only and never used to trigger a real email for a vehicle
  // that's never actually been washed/serviced.
  function addDaysToIsoDate(dateStr: string, days: number): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return dt;
  }

  interface ServiceWashingReminder {
    regNo: string;
    vehicleType: string; // Fleet & Vehicles' own Category value, e.g. 'Reefer', 'Hybrid', 'Walkes'
    alertType: 'Washing Due' | 'AC Service Due';
    dueDate: string; // YYYY-MM-DD
    daysRemaining: number;
    // The cycle's own anchor date (lastWashingDate/lastAcServiceDate) - baked
    // into the dedup marker id below, so a newly-logged washing/AC service (a
    // new cycle) is never blocked by an already-sent marker from the old one.
    cycleStartDate: string;
  }

  async function calculateServiceWashingReminders(): Promise<ServiceWashingReminder[]> {
    const [schedules, fleetVehicles] = await Promise.all([
      getVehicleServiceSchedules(),
      getVehicles()
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

    const pushIfDue = (
      schedule: (typeof schedules)[number], category: string, vehicleType: string,
      alertType: 'Washing Due' | 'AC Service Due', anchorDate: string | undefined, cycleDays: number
    ) => {
      if (!anchorDate) return;
      const due = addDaysToIsoDate(anchorDate, cycleDays);
      const daysRemaining = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysRemaining !== REMINDER_DAYS_BEFORE_DUE) return;
      reminders.push({ regNo: schedule.regNo, vehicleType, alertType, dueDate: due.toISOString().slice(0, 10), daysRemaining, cycleStartDate: anchorDate });
    };

    schedules.forEach(schedule => {
      const category = categoryFor(schedule.regNo).toLowerCase();
      const vehicleType = category.charAt(0).toUpperCase() + category.slice(1);
      if (isWashingEligible(category)) {
        pushIfDue(schedule, category, vehicleType, 'Washing Due', schedule.lastWashingDate, WASHING_CYCLE_DAYS);
      }
      if (isAcServiceEligible(category)) {
        pushIfDue(schedule, category, vehicleType, 'AC Service Due', schedule.lastAcServiceDate, AC_SERVICE_CYCLE_DAYS);
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
      const markerPrefix = r.alertType === 'AC Service Due' ? 'ac-service' : 'washing';
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
          type: r.alertType === 'AC Service Due' ? 'ac-service-due' : 'washing-due',
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

  // Builds and sends the Compliance digest email right now - every vehicle
  // whose insurance/permit/FC/tax expiry falls exactly on its 3/7/15-day
  // milestone today, sorted soonest-first - to the Super Admin(s) and
  // Bhagya. Used both by the automatic daily schedule and the manual "Send
  // Alerts Now" button; the manual path always sends regardless of whether
  // today's automatic digest already went out.
  //
  // 2026-09-03: recipient swapped from Chandana to Bhagya (bhagya@
  // kcmlogistics.in) - same recipient-selection logic (Super Admin(s) plus
  // one named non-admin recipient), just a different person. Matched by
  // email rather than username, unlike the old Chandana check, since that's
  // the same identifier this file already uses elsewhere for Bhagya (see
  // BHAGYA_EMAIL below) - no assumption needed about her exact `username`
  // value.
  //
  // 2026-08-29: deliberately compliance-only again - it used to also fold in
  // Scheduled Service/Wheel Alignment (calculateMaintenanceMilestoneAlerts
  // below) into one merged email, but that's been pulled back out on direct
  // instruction: compliance alerts were "perfect as they were" and shouldn't
  // be touched, while Scheduled Service/Wheel Alignment/Washing get their
  // own separate treatment (recipients/content) once that's specified -
  // calculateMaintenanceMilestoneAlerts is left defined below, just unused
  // here for now, ready to wire into that separate flow later.
  async function buildAndSendComplianceDigest(): Promise<{ sent: boolean; count: number; recipients: string[] }> {
    const sortedAlerts = await calculateMilestoneAlerts();
    if (sortedAlerts.length === 0) return { sent: false, count: 0, recipients: [] };

    const usersList = await getUsersWithFallback();
    const recipients = usersList
      .filter((u: any) => u.department === 'super_admin' || u.email === 'bhagya@kcmlogistics.in')
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
      subject: 'KCM Fleet Compliance Digest',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;">
          <p>Hello,</p>
          <p>The following documents are coming due - please action before the due date.</p>
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
          <p style="margin-top:14px;">Please arrange renewals at the earliest to avoid compliance violations.</p>
        </div>
      `,
    });

    await saveNotification({
      id: `digest-sent-${todayKey}`,
      title: 'Daily Compliance Digest Sent',
      message: `Digest emailed to ${recipients.join(', ')} covering ${sortedAlerts.length} item${sortedAlerts.length === 1 ? '' : 's'} (compliance at 3/7/15 days).`,
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
  // Evening-before heads-up to admins/Bhagya (see sendUpcomingBirthdayReminder
  // below) - separate from BIRTHDAY_EMAIL_HOUR_IST, which gates the actual
  // day-of wish email to the employee.
  const BIRTHDAY_REMINDER_EVENING_HOUR_IST = 18;
  const BHAGYA_EMAIL = 'bhagya@kcmlogistics.in';

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

  // Same day+month match as getTodaysBirthdayEmployees, but against
  // tomorrow's date - feeds the evening-before admin reminder below.
  async function getTomorrowsBirthdayEmployees(): Promise<StaffEmployee[]> {
    const employees = await getStaffEmployees();
    const tomorrowKey = istMonthDayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    return employees.filter(e => {
      if (e.status !== 'Active' || !e.dateOfBirth) return false;
      const dob = new Date(e.dateOfBirth);
      if (isNaN(dob.getTime())) return false;
      const dobKey = `${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`;
      return dobKey === tomorrowKey;
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
    // Bhagya isn't a super admin but runs HR & Payroll day-to-day (same
    // access grant as Warehouse Details - see requireHrAccess above), so she
    // gets this notice too, alongside every super admin. Deduped via Set in
    // case she's ever also flagged super_admin.
    const superAdminEmails = Array.from(new Set([
      ...usersList.filter((u: any) => u.department === 'super_admin').map((u: any) => u.email).filter(Boolean) as string[],
      BHAGYA_EMAIL
    ]));

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

  // Evening-before heads-up: admins + Bhagya only (never the employee - the
  // actual wish email to them is still the day-of sendTodaysBirthdayWishes
  // above, unchanged) get a "tomorrow is X's birthday" notice so there's
  // time to arrange something before the day itself. Dedup'd per employee/
  // day via its own marker (separate id namespace from the day-of one) so
  // the hourly interval never double-sends once it's gone out for the
  // evening.
  async function sendUpcomingBirthdayReminders(): Promise<{ sent: number; names: string[] }> {
    const upcoming = await getTomorrowsBirthdayEmployees();
    if (upcoming.length === 0) return { sent: 0, names: [] };

    const todayKey = istDateKey();
    const existingNotifs = await getNotifications();
    const usersList = await getUsersWithFallback();
    const recipientEmails = Array.from(new Set([
      ...usersList.filter((u: any) => u.department === 'super_admin').map((u: any) => u.email).filter(Boolean) as string[],
      BHAGYA_EMAIL
    ]));

    let sentCount = 0;
    const sentNames: string[] = [];

    for (const emp of upcoming) {
      const markerId = `birthday-eve-reminder-${emp.id}-${todayKey}`;
      if (existingNotifs.some((n: any) => n.id === markerId)) continue;

      try {
        if (recipientEmails.length > 0) {
          await resend.emails.send({
            from: process.env.EMAIL_FROM || 'alerts@kcmlogistics.in',
            to: recipientEmails,
            subject: `Birthday Tomorrow - ${emp.name}`,
            html: `<p>Heads up - tomorrow is <strong>${emp.name}</strong>'s birthday.</p>`
          });
        }

        await saveNotification({
          id: markerId,
          title: 'Birthday Tomorrow',
          message: `Tomorrow is ${emp.name}'s birthday.`,
          type: 'birthday',
          timestamp: istTimestamp(),
          read: false
        });

        sentCount++;
        sentNames.push(emp.name);
        console.log(`[BIRTHDAY] Sent evening-before reminder for ${emp.name} (${emp.id}).`);
      } catch (error) {
        console.error(`[BIRTHDAY] Failed to send evening-before reminder for ${emp.name} (${emp.id}):`, error);
      }
    }

    return { sent: sentCount, names: sentNames };
  }

  // Automatic trigger - runs on the same hourly interval as the compliance
  // digest, but only actually sends from BIRTHDAY_EMAIL_HOUR_IST onward each
  // day (never earlier), and only once per employee per day regardless of
  // how many times the hourly tick lands after that hour. Also fires the
  // evening-before admin/Bhagya reminder once it's past
  // BIRTHDAY_REMINDER_EVENING_HOUR_IST, same "only once per employee per day"
  // guarantee via its own marker.
  async function runScheduledBirthdayCheck() {
    try {
      if (istHour() >= BIRTHDAY_EMAIL_HOUR_IST) await sendTodaysBirthdayWishes();
      if (istHour() >= BIRTHDAY_REMINDER_EVENING_HOUR_IST) await sendUpcomingBirthdayReminders();
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
  // (Fleet documents, HR Aadhar/PAN, driver salary bank proof, Petty Cash
  // voucher receipts, etc.) - saves the file to disk and returns its path
  // for the frontend to store on the record, instead of embedding the file
  // as base64 in the database. Limit raised to 500MB (2026-09-04, was
  // 25MB) - see src/upload/upload.ts. Wrapped here (rather than passed
  // straight to app.post) so a file that's still over the limit, or an
  // unsupported type, fails with a clean JSON error instead of Multer's
  // error propagating unhandled - previously that would have surfaced as a
  // generic server error page instead of a real "why did this fail"
  // message, which is exactly the kind of silent failure a save should
  // never leave the office guessing about.
  app.post('/api/upload/:module', (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, message: 'File is too large - the maximum upload size is 500MB.' });
      }
      if (err) {
        return res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Failed to upload file.' });
      }
      next();
    });
  }, (req, res) => {
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

        await createAuditLog({
          usernameOverride: matchedUser?.username || cleanLoginId,
          action: 'ACCESS_DENIED',
          module: 'Authentication',
          entityType: 'Login',
          description: reason,
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.headers['user-agent']
        });
      };

      if (!matchedUser) {
        await createAuditLog({
          usernameOverride: cleanLoginId,
          action: 'ACCESS_DENIED',
          module: 'Authentication',
          entityType: 'Login',
          description: `Login attempt for unrecognized account "${cleanLoginId}"`,
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.headers['user-agent']
        });
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
        await createAuditLog({
          user: userSession,
          action: 'LOGIN',
          module: 'Authentication',
          entityType: 'Login',
          description: `${userSession.name} (${userSession.username}) logged in`,
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.headers['user-agent']
        });
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
      await createAuditLog({
        user: userSession,
        action: 'LOGIN',
        module: 'Authentication',
        entityType: 'Login',
        description: `${userSession.name} (${userSession.username}) logged in (OTP-verified)`,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
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
      const usersList = await getUsersWithFallback();
      const resetUser = usersList.find((u: any) => (u.email || '').toLowerCase() === cleanEmail);
      await createAuditLog({
        usernameOverride: resetUser?.username || cleanEmail,
        action: 'PASSWORD_CHANGE',
        module: 'Authentication',
        entityType: 'User',
        entityId: resetUser?.username,
        description: `Password reset via Forgot Password for "${resetUser?.username || cleanEmail}"`,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
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
        await createAuditLog({
          user: sessionUser,
          action: 'PASSWORD_CHANGE',
          module: 'Authentication',
          entityType: 'User',
          entityId: sessionUser.username,
          description: `${sessionUser.name} (${sessionUser.username}) changed their own password`,
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.headers['user-agent']
        });
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
    const token = extractBearerToken(req.headers.authorization);
    const sessionUser = await getSessionUser(token);
    await destroySession(token);
    if (sessionUser) {
      await createAuditLog({
        user: sessionUser,
        action: 'LOGOUT',
        module: 'Authentication',
        entityType: 'Login',
        description: `${sessionUser.name} (${sessionUser.username}) logged out`,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
    }
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
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
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

      const regNoLabel = finalVehicle['Reg. No.'] || finalVehicle.regNo || finalVehicle.id;
      await createAuditLog({
        user: sessionUser,
        action: index !== -1 ? 'UPDATE' : 'CREATE',
        module: 'Fleet & Vehicles',
        entityType: 'Vehicle',
        entityId: String(finalVehicle.id || regNoLabel || ''),
        description: `${index !== -1 ? 'Updated' : 'Created'} vehicle ${regNoLabel}`,
        oldData: index !== -1 ? vehiclesList[index] : undefined,
        newData: finalVehicle,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });

      res.json({ success: true, vehicles: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/fleet/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { id } = req.params;
      const existing = (await getVehicles()).find((v: Vehicle) => v.id === id || v['Reg. No.'] === id || v.regNo === id);
      const result = await deleteVehicle(id);
      await createAuditLog({
        user: sessionUser,
        action: 'DELETE',
        module: 'Fleet & Vehicles',
        entityType: 'Vehicle',
        entityId: id,
        description: `Deleted vehicle ${existing?.['Reg. No.'] || existing?.regNo || id}`,
        oldData: existing,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
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
          message: 'Nothing is currently at its 3/7/15-day expiry mark (insurance, permits, FC, tax) - nothing to send.'
        });
      }

      res.json({
        success: true,
        sent: true,
        message: `Compliance digest sent to ${result.recipients.join(', ')} covering ${result.count} item${result.count === 1 ? '' : 's'}.`
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
      res.json(filterFuelLogsForViewer(await getFuelLogs(), sessionUser));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  // Database-backed Indent No preview for the Add Entry form - computed
  // fresh from every saved fuel log each call (see
  // nextBunkFuelIndentNumber/nextCardFuelIndentNumber), not a client-side
  // guess off a possibly-stale local cache, so two users adding entries at
  // the same time both see the real next number. `indentNumber: null` means
  // there's nothing to continue from yet (first Bunk entry of a new month) -
  // the office types a starting number by hand in that case. Still just a
  // preview/prefill - the actual save is still validated by the duplicate
  // check in POST/PUT below, and the field stays fully editable either way.
  // Scoped to the requesting session's own username - each fuel-access login
  // has their own independent sequence (see the block comment above
  // nextBunkFuelIndentNumber), derived from the session rather than a
  // client-suppliable query param so it can't be spoofed.
  app.get('/api/fuel/next-indent-number', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const bunkOrCard = req.query.bunkOrCard === 'Card' ? 'Card' : 'Bunk';
      const date = typeof req.query.date === 'string' ? req.query.date : '';
      const logs = await getFuelLogs();
      const indentNumber = bunkOrCard === 'Card' ? nextCardFuelIndentNumber(logs, sessionUser?.username) : nextBunkFuelIndentNumber(logs, date, sessionUser?.username);
      res.json({ indentNumber });
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
      const allLogs = await getFuelLogs();
      if (findDuplicateFuelIndentNumber(allLogs, req.body?.indentNumber, { ...req.body, enteredBy: sessionUser?.username })) {
        return res.status(409).json({ error: `Indent No. ${req.body.indentNumber} already exists in your ${req.body?.bunkOrCard === 'Card' ? 'Card' : 'Bunk'} sequence.` });
      }
      // Pre-generated here (same fallback saveFuelLog itself would apply) just
      // so the id is known for the audit record below - no behavior change.
      const newId = req.body?.id || String(Date.now());
      const result = await saveFuelLog({ ...req.body, id: newId, enteredBy: sessionUser?.username });
      await createAuditLog({
        user: sessionUser,
        action: 'CREATE',
        module: 'Fuel Management',
        entityType: 'Fuel Entry',
        entityId: newId,
        description: `Created fuel entry ${req.body?.indentNumber || newId}`,
        newData: { ...req.body, id: newId },
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: filterFuelLogsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/fuel/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getFuelLogs()).find(l => l.id === req.params.id);
      if (!existing) return res.status(404).json({ error: 'Fuel entry not found.' });
      // Chandan can reach this on one of Praveen's entries (the mileage-only
      // exception - see buildFuelLogUpdateForViewer) to attach a Mileage
      // Report; every other field on that row is forced back to its existing
      // value regardless of what the request body says, so only
      // mileageReportId can actually change on a foreign row.
      const resolved = buildFuelLogUpdateForViewer(existing, req.body, sessionUser);
      if ('error' in resolved) return res.status(403).json({ error: resolved.error });
      if (isFutureDate(resolved.data?.date)) return res.status(400).json({ error: 'Fuel entry date cannot be in the future.' });
      const allLogs = await getFuelLogs();
      if (findDuplicateFuelIndentNumber(allLogs, resolved.data?.indentNumber, resolved.data || {}, req.params.id)) {
        return res.status(409).json({ error: `Indent No. ${resolved.data.indentNumber} already exists in the ${resolved.data?.bunkOrCard === 'Card' ? 'Card' : 'Bunk'} sequence.` });
      }
      const result = await saveFuelLog(resolved.data);
      await createAuditLog({
        user: sessionUser,
        action: 'UPDATE',
        module: 'Fuel Management',
        entityType: 'Fuel Entry',
        entityId: req.params.id,
        description: `Updated fuel entry ${resolved.data?.indentNumber || existing?.indentNumber || req.params.id}`,
        oldData: existing,
        newData: { ...resolved.data, id: req.params.id },
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: filterFuelLogsForViewer(result, sessionUser) });
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
      res.json({ success: true, data: filterFuelLogsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/fuel/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getFuelLogs()).find(l => l.id === req.params.id);
      // Never deletable by anyone but the entry's own entrant (or a super
      // admin) - the mileage-only exception above only ever grants a limited
      // write on mileageReportId, never delete.
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      await deleteFuelLog(req.params.id);
      // Deleting an entry leaves a gap in its Indent No sequence - close it
      // immediately, same as Petty Cash's Entry No (see
      // renumberFuelIndentSequence).
      await renumberFuelIndentSequence();
      await createAuditLog({
        user: sessionUser,
        action: 'DELETE',
        module: 'Fuel Management',
        entityType: 'Fuel Entry',
        entityId: req.params.id,
        description: `Deleted fuel entry ${existing?.indentNumber || req.params.id}`,
        oldData: existing,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
      const result = await getFuelLogs();
      res.json({ success: true, data: filterFuelLogsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/billing', async (req, res) => {
    try { res.json(await getBillingInvoices()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/billing', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const newId = req.body?.id || String(Date.now());
      const data = await saveBillingInvoice({ ...req.body, id: newId });
      await createAuditLog({
        user: sessionUser, action: 'CREATE', module: 'Billing', entityType: 'Invoice', entityId: newId,
        description: `Created invoice ${req.body?.invoiceNo || newId}`, newData: { ...req.body, id: newId },
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/billing/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getBillingInvoices()).find(i => i.id === req.params.id);
      const data = await saveBillingInvoice({ ...req.body, id: req.params.id });
      await createAuditLog({
        user: sessionUser, action: 'UPDATE', module: 'Billing', entityType: 'Invoice', entityId: req.params.id,
        description: `Updated invoice ${req.body?.invoiceNo || existing?.invoiceNo || req.params.id}`,
        oldData: existing, newData: { ...req.body, id: req.params.id },
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/billing/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getBillingInvoices()).find(i => i.id === req.params.id);
      const data = await deleteBillingInvoice(req.params.id);
      await createAuditLog({
        user: sessionUser, action: 'DELETE', module: 'Billing', entityType: 'Invoice', entityId: req.params.id,
        description: `Deleted invoice ${existing?.invoiceNo || req.params.id}`, oldData: existing,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
      res.json(sortEntriesByDate(filterEntryRowsForViewer(await getPettyCashVouchers(), sessionUser, PETTY_CASH_FULL_VIEW_EMAILS)));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/petty-cash', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allVouchers = await getPettyCashVouchers();
      const enteredBy = sessionUser?.username || '';
      // Entry No is per-holder now regardless of format (see
      // nextPettyCashEntryNo's own header comment) - always scope to just
      // this handler's own vouchers, never the whole ledger.
      const scopedVouchers = allVouchers.filter(v => v.enteredBy === enteredBy);
      const manualInfo = canManualFirstPettyCashEntry(scopedVouchers, enteredBy);
      const rawManualSeq = req.body?.manualEntryNoSeq;

      let entryNo: string;
      if (manualInfo.can && rawManualSeq != null && String(rawManualSeq).trim() !== '') {
        const manual = buildManualPettyCashEntryNo(manualInfo.prefix, rawManualSeq, manualInfo.width, manualInfo.max);
        if (!manual) return res.status(400).json({ error: `Enter a valid Entry No (1-${manualInfo.max}) to continue your own numbering.` });
        if (findDuplicateEntryNo(scopedVouchers, manual)) return res.status(409).json({ error: `Entry No. ${manual} already exists in your own entries.` });
        entryNo = manual;
      } else {
        entryNo = nextPettyCashEntryNo(scopedVouchers);
        if (findDuplicateEntryNo(scopedVouchers, entryNo)) {
          return res.status(409).json({ error: `Entry No. ${entryNo} already exists.` });
        }
      }
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Petty cash entry date cannot be in the future.' });
      // Cash Paid = 0 isn't a real disbursement - same rule the client
      // already enforces, repeated here as a safety net for a raw API call.
      if (!(Number(req.body?.cashPaid) > 0)) return res.status(400).json({ error: 'Please enter a valid Cash Paid amount.' });
      const newId = req.body?.id || String(Date.now());
      const result = await savePettyCashVoucher({ ...req.body, id: newId, entryNo, enteredBy });
      await createAuditLog({
        user: sessionUser, action: 'CREATE', module: 'Petty Cash', entityType: 'Petty Cash Entry', entityId: newId,
        description: `Created petty cash entry ${entryNo}`, newData: { ...req.body, id: newId, entryNo },
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, PETTY_CASH_FULL_VIEW_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/petty-cash/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allVouchers = await getPettyCashVouchers();
      const existing = allVouchers.find(v => v.id === req.params.id);
      if (!canModifyPettyCashRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
      // Merged with `existing` (2026-09-04 fix, same class of bug as
      // Driver Details' own PUT route) - savePettyCashVoucher overwrites
      // the whole stored record with whatever it's given, so a genuinely
      // partial update (the Docs modal saves only `{ documents }`) would
      // have silently wiped every other field - category, amounts, vehicle
      // numbers, everything - off the voucher. It also used to reject that
      // same docs-only save outright with "Please enter a valid Cash Paid
      // amount" (req.body.cashPaid was undefined, since the docs save never
      // touches it) - validating the merged value instead of the raw
      // request body fixes both: a full edit-form save (which always
      // includes cashPaid) still validates normally, and a docs-only save
      // now correctly inherits the already-valid existing cashPaid/date.
      const merged = { ...existing, ...req.body, id: req.params.id, enteredBy: existing?.enteredBy };
      // Scoped to this same holder's own vouchers - Entry No is per-holder
      // now (see nextPettyCashEntryNo's own comment), so a different
      // handler legitimately using the same-looking Entry No isn't a
      // conflict.
      if (req.body.entryNo && findDuplicateEntryNo(allVouchers.filter(v => v.enteredBy === existing?.enteredBy), req.body.entryNo, req.params.id)) {
        return res.status(409).json({ error: `Entry No. ${req.body.entryNo} already exists.` });
      }
      if (isFutureDate(merged.date)) return res.status(400).json({ error: 'Petty cash entry date cannot be in the future.' });
      if (!(Number(merged.cashPaid) > 0)) return res.status(400).json({ error: 'Please enter a valid Cash Paid amount.' });
      const result = await savePettyCashVoucher(merged);
      await createAuditLog({
        user: sessionUser, action: 'UPDATE', module: 'Petty Cash', entityType: 'Petty Cash Entry', entityId: req.params.id,
        description: `Updated petty cash entry ${req.body?.entryNo || existing?.entryNo || req.params.id}`,
        oldData: existing, newData: merged,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, PETTY_CASH_FULL_VIEW_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/petty-cash/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getPettyCashVouchers()).find(v => v.id === req.params.id);
      if (!canModifyPettyCashRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      await deletePettyCashVoucher(req.params.id);
      // Deleting a voucher leaves a gap in its Entry No sequence - close it
      // immediately rather than leaving a permanent hole (see
      // renumberPettyCashSequence).
      await renumberPettyCashSequence();
      await createAuditLog({
        user: sessionUser, action: 'DELETE', module: 'Petty Cash', entityType: 'Petty Cash Entry', entityId: req.params.id,
        description: `Deleted petty cash entry ${existing?.entryNo || req.params.id}`, oldData: existing,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      const result = await getPettyCashVouchers();
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, PETTY_CASH_FULL_VIEW_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/market-pod', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(sortEntriesByDate(filterEntryRowsForViewer(await getMarketPodEntries(), sessionUser, PETTY_CASH_FULL_VIEW_EMAILS)));
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
      res.json({ success: true, data: filterEntryRowsForViewer(await getMarketPodEntries(), sessionUser, PETTY_CASH_FULL_VIEW_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/market-pod/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allEntries = await getMarketPodEntries();
      const existing = allEntries.find(e => e.id === req.params.id);
      if (!canModifyPettyCashRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
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
      res.json({ success: true, data: filterEntryRowsForViewer(await getMarketPodEntries(), sessionUser, PETTY_CASH_FULL_VIEW_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/market-pod/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getMarketPodEntries()).find(e => e.id === req.params.id);
      if (!canModifyPettyCashRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      if (existing) await removeMarketPodPettyCashLinks(existing);
      const result = await deleteMarketPodEntry(req.params.id);
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, PETTY_CASH_FULL_VIEW_EMAILS) });
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
      if (!canModifyPettyCashRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
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
      res.json({ success: true, data: filterEntryRowsForViewer(await getMarketPodEntries(), sessionUser, PETTY_CASH_FULL_VIEW_EMAILS) });
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
      // ledger; a super admin or full-view user (Rakshina) may specify a
      // different `username` (e.g. logging a top-up on someone else's behalf).
      const canActOnBehalfOfOthers = sessionUser?.department === 'super_admin' || PETTY_CASH_FULL_VIEW_EMAILS.includes(sessionUser?.email || '');
      const username = canActOnBehalfOfOthers && req.body.username ? req.body.username : sessionUser?.username;
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
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Work order date cannot be in the future.' });
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const result = await saveMaintenanceRecord({ ...req.body, enteredBy: sessionUser?.username });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/maintenance/:id', async (req, res) => {
    try {
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Work order date cannot be in the future.' });
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
    try {
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Breakdown date cannot be in the future.' });
      res.json({ success: true, data: await saveBreakdownReport(req.body as BreakdownReport) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/breakdown-reports/:id', async (req, res) => {
    try {
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Breakdown date cannot be in the future.' });
      res.json({ success: true, data: await saveBreakdownReport({ ...req.body, id: req.params.id } as BreakdownReport) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/breakdown-reports/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteBreakdownReport(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/vehicle-service-schedules', async (req, res) => {
    try { res.json(await getVehicleServiceSchedules()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  // DEF Status/Site changes (2026-09-02) are logged - user, timestamp,
  // before/after - same createAuditLog helper Fuel Management/Service
  // Invoice already use, since these two fields (unlike the rest of this
  // record) are compliance-relevant (DEF/AdBlue status per vehicle) and the
  // spec explicitly calls for a change trail. Only fires when one of the two
  // actually changed, and only ever describes those two - not a full-record
  // diff.
  async function auditDefStatusSiteChange(sessionUser: Awaited<ReturnType<typeof getSessionUser>>, existing: VehicleServiceSchedule | undefined, updated: VehicleServiceSchedule, req: express.Request) {
    const oldDef = existing?.defStatus, newDef = updated.defStatus;
    const oldSite = existing?.site, newSite = updated.site;
    if (oldDef === newDef && oldSite === newSite) return;
    const parts: string[] = [];
    if (oldDef !== newDef) parts.push(`DEF Status: ${oldDef || '(blank)'} -> ${newDef || '(blank)'}`);
    if (oldSite !== newSite) parts.push(`Site: ${oldSite || '(blank)'} -> ${newSite || '(blank)'}`);
    await createAuditLog({
      user: sessionUser,
      action: 'UPDATE',
      module: 'Fleet Maintenance',
      entityType: 'DEF Status / Site',
      entityId: updated.regNo || updated.id,
      description: `${updated.regNo || updated.id}: ${parts.join('; ')}`,
      oldData: { defStatus: oldDef, site: oldSite },
      newData: { defStatus: newDef, site: newSite },
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent']
    });
  }

  // Only Last Service/Washing Date are restricted to no-future here -
  // Warranty Expiry Date is deliberately left alone since it's normally a
  // real future date (that's the whole point of an expiry date).
  app.post('/api/vehicle-service-schedules', async (req, res) => {
    try {
      if (isFutureDate(req.body?.lastServiceDate) || isFutureDate(req.body?.lastWashingDate)) {
        return res.status(400).json({ error: 'Last Service/Washing Date cannot be in the future.' });
      }
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getVehicleServiceSchedules()).find(s => s.id === req.body?.id);
      const toSave = req.body as VehicleServiceSchedule;
      const saved = await saveVehicleServiceSchedule(toSave);
      await auditDefStatusSiteChange(sessionUser, existing, toSave, req);
      res.json({ success: true, data: saved });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/vehicle-service-schedules/:id', async (req, res) => {
    try {
      if (isFutureDate(req.body?.lastServiceDate) || isFutureDate(req.body?.lastWashingDate)) {
        return res.status(400).json({ error: 'Last Service/Washing Date cannot be in the future.' });
      }
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getVehicleServiceSchedules()).find(s => s.id === req.params.id);
      const toSave = { ...req.body, id: req.params.id } as VehicleServiceSchedule;
      const saved = await saveVehicleServiceSchedule(toSave);
      await auditDefStatusSiteChange(sessionUser, existing, toSave, req);
      res.json({ success: true, data: saved });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/vehicle-service-schedules/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteVehicleServiceSchedule(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Service Schedule's Vehicle Maintenance Reference lookup (see
  // VehicleMaintenanceReference in src/types.ts) - a separate reference
  // dataset from vehicle-service-schedules above, keyed on Vehicle No.
  app.get('/api/vehicle-maintenance-reference', async (req, res) => {
    try { res.json(await getVehicleMaintenanceReferences()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/vehicle-maintenance-reference', async (req, res) => {
    try {
      const body: VehicleMaintenanceReference = req.body;
      if (!body.vehicleNo || !body.vehicleNo.trim()) {
        return res.status(400).json({ error: 'Vehicle No is required.' });
      }
      res.json({ success: true, data: await upsertVehicleMaintenanceReference({ ...body, vehicleNo: body.vehicleNo.trim().toUpperCase() }) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Retired - Service Schedule's Service Due/Washing Due cycle config is now
  // fixed per-category defaults with per-vehicle overrides (see
  // VehicleServiceSchedule.cycleDays/reminderDays and
  // calculateServiceWashingReminders above), not this global settings row.
  // Routes kept only so any previously-saved row remains readable; no UI
  // calls these anymore.
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
    try {
      if (isFutureDate(req.body?.installedDate)) return res.status(400).json({ error: 'Installed Date cannot be in the future.' });
      res.json({ success: true, data: await saveTireRecord(req.body as TireRecord) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/tire-records/:id', async (req, res) => {
    try {
      if (isFutureDate(req.body?.installedDate)) return res.status(400).json({ error: 'Installed Date cannot be in the future.' });
      res.json({ success: true, data: await saveTireRecord({ ...req.body, id: req.params.id } as TireRecord) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/tire-records/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteTireRecord(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/battery-records', async (req, res) => {
    try { res.json(await getBatteryRecords()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/battery-records', async (req, res) => {
    try {
      if (isFutureDate(req.body?.installedDate)) return res.status(400).json({ error: 'Installed Date cannot be in the future.' });
      res.json({ success: true, data: await saveBatteryRecord(req.body as BatteryRecord) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/battery-records/:id', async (req, res) => {
    try {
      if (isFutureDate(req.body?.installedDate)) return res.status(400).json({ error: 'Installed Date cannot be in the future.' });
      res.json({ success: true, data: await saveBatteryRecord({ ...req.body, id: req.params.id } as BatteryRecord) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/battery-records/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteBatteryRecord(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/tools-checklist-records', async (req, res) => {
    try { res.json(await getToolsChecklistRecords()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/tools-checklist-records', async (req, res) => {
    try {
      if (isFutureDate(req.body?.checkDate)) return res.status(400).json({ error: 'Check Date cannot be in the future.' });
      res.json({ success: true, data: await saveToolsChecklistRecord(req.body as ToolsChecklistRecord) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/tools-checklist-records/:id', async (req, res) => {
    try {
      if (isFutureDate(req.body?.checkDate)) return res.status(400).json({ error: 'Check Date cannot be in the future.' });
      res.json({ success: true, data: await saveToolsChecklistRecord({ ...req.body, id: req.params.id } as ToolsChecklistRecord) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/tools-checklist-records/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteToolsChecklistRecord(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Fleet Maintenance > Service Station > Spare Parts - same shape/access as
  // every other maintenance sub-log above (Tire/Battery/Tools Checklist).
  app.get('/api/service-station-spare-parts', async (req, res) => {
    try { res.json(await getServiceStationSpareParts()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/service-station-spare-parts', async (req, res) => {
    try {
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Date cannot be in the future.' });
      res.json({ success: true, data: await saveServiceStationSparePart(req.body as ServiceStationSparePart) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/service-station-spare-parts/:id', async (req, res) => {
    try {
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Date cannot be in the future.' });
      res.json({ success: true, data: await saveServiceStationSparePart({ ...req.body, id: req.params.id } as ServiceStationSparePart) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/service-station-spare-parts/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteServiceStationSparePart(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Fleet Maintenance > Service Station > Inspection.
  app.get('/api/service-station-inspections', async (req, res) => {
    try { res.json(await getServiceStationInspections()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/service-station-inspections', async (req, res) => {
    try {
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Date cannot be in the future.' });
      res.json({ success: true, data: await saveServiceStationInspection(req.body as ServiceStationInspection) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/service-station-inspections/:id', async (req, res) => {
    try {
      if (isFutureDate(req.body?.date)) return res.status(400).json({ error: 'Date cannot be in the future.' });
      res.json({ success: true, data: await saveServiceStationInspection({ ...req.body, id: req.params.id } as ServiceStationInspection) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/service-station-inspections/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteServiceStationInspection(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
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
  // Narrower second gate: HR_ATTENDANCE_VIEW_ONLY_EMAILS (Vinod) may only
  // ever GET the attendance-viewing routes (the grid itself, per-employee/
  // monthly summaries, the "download all" report, the employee list for
  // names, and holidays for the auto-fill-derived display) - every other
  // /api/staff/* route, including every attendance WRITE endpoint, requires
  // requireHrFullAccess instead. Matched on the full request path (not
  // req.path, which Express strips to be relative to this mount point) so
  // this reads correctly regardless of mounting semantics.
  app.use('/api/staff', async (req, res, next) => {
    const path = req.originalUrl.split('?')[0];
    const isAttendanceViewGet = req.method === 'GET' && (
      path === '/api/staff/employees' ||
      path === '/api/staff/holidays' ||
      path.startsWith('/api/staff/attendance')
    );
    if (isAttendanceViewGet) return next();
    return requireHrFullAccess(req, res, next);
  });

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
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(maskAttributionField(await getStaffAttendance(), 'markedBy', sessionUser));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/staff/attendance/mark', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { empId, date, status, remarks } = req.body;
      if (isFutureDate(date)) return res.status(400).json({ success: false, error: 'Attendance cannot be marked for a future date.' });
      const record = await upsertAttendanceEntry({ empId, date, status, remarks, markedBy: sessionUser?.username });
      res.json({ success: true, data: maskAttributionField([record], 'markedBy', sessionUser)[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/staff/attendance/bulk', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const entries = req.body as Array<{ empId: string; date: string; status: string; remarks?: string }>;
      if (!Array.isArray(entries)) return res.status(400).json({ success: false, error: 'Request body must be an array of attendance entries.' });
      if (entries.some(e => isFutureDate(e.date))) return res.status(400).json({ success: false, error: 'Attendance cannot be marked for a future date.' });

      const results = [];
      for (const entry of entries) {
        results.push(await upsertAttendanceEntry({ ...entry, markedBy: sessionUser?.username }));
      }
      res.json({ success: true, data: maskAttributionField(results, 'markedBy', sessionUser) });
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

  // Warehouse Details endpoints - super-admin + Bhagya (see requireWarehouseAccess)
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
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const entry: WarehouseEntry = req.body;
      // Opening KM/Closing KM/Add KM/Odometer Utilised are whole-number-only
      // fields (see WarehouseDetails.tsx Log New Deployment) - the UI already
      // blocks "." on entry, but round here too (standard round-half-up, not
      // truncate) in case a direct API call bypasses the UI. Km Utilised is
      // re-derived from the rounded Opening/Closing KM rather than trusting
      // whatever the client sent, so it can never disagree with them.
      if (entry.openingKm != null) entry.openingKm = Math.round(entry.openingKm);
      if (entry.closingKm != null) entry.closingKm = Math.round(entry.closingKm);
      if (entry.extraKm != null) entry.extraKm = Math.round(entry.extraKm);
      if (entry.openingKm != null && entry.closingKm != null) {
        entry.kmUtilised = Math.round(Math.max(0, entry.closingKm - entry.openingKm));
      }
      const existing = entry.id ? (await getWarehouseEntries()).find(e => e.id === entry.id) : undefined;
      const result = await saveWarehouseEntry(entry);
      const label = `${entry.vehicleNumber || ''} (${entry.date || ''})`.trim();
      await createAuditLog({
        user: sessionUser,
        action: existing ? 'UPDATE' : 'CREATE',
        module: 'Warehouse Details',
        entityType: 'Warehouse Deployment',
        entityId: entry.id || existing?.id,
        description: `${existing ? 'Updated' : 'Created'} warehouse deployment ${label}`,
        oldData: existing,
        newData: entry,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/warehouse/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { id } = req.params;
      const existing = (await getWarehouseEntries()).find(e => e.id === id);
      const result = await deleteWarehouseEntry(id);
      await createAuditLog({
        user: sessionUser,
        action: 'DELETE',
        module: 'Warehouse Details',
        entityType: 'Warehouse Deployment',
        entityId: id,
        description: `Deleted warehouse deployment ${existing?.vehicleNumber || id} (${existing?.date || ''})`,
        oldData: existing,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Warehouse Details > Rates - editable overrides (2026-08-29, see
  // WarehouseRateOverride in src/types.ts). A sibling path to /api/warehouse,
  // not a sub-path of it, so it needs its own requireWarehouseAccess
  // registration rather than inheriting the one above. Writes (add/edit/
  // delete a rate) are further restricted to Super Admin only - this is
  // core pricing data, not a routine data-entry field.
  app.use('/api/warehouse-rate-overrides', requireWarehouseAccess);
  app.get('/api/warehouse-rate-overrides', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(maskAttributionField(await getWarehouseRateOverrides(), 'enteredBy', sessionUser));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/warehouse-rate-overrides', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (sessionUser?.department !== 'super_admin') {
        return res.status(403).json({ error: 'Only Super Admin can edit or add warehouse rates.' });
      }
      const body: WarehouseRateOverride = req.body;
      if (!body.id || !body.kind || !body.dims || !body.value) {
        return res.status(400).json({ error: 'id, kind, dims, and value are required.' });
      }
      const existing = (await getWarehouseRateOverrides()).find(o => o.id === body.id);
      const result = await saveWarehouseRateOverride({ ...body, enteredBy: sessionUser.username });
      await createAuditLog({
        user: sessionUser, action: existing ? 'UPDATE' : 'CREATE', module: 'Warehouse Details', entityType: 'Rate Override', entityId: body.id,
        description: `${existing ? 'Updated' : 'Added'} warehouse rate override ${body.id}`,
        oldData: existing, newData: body,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/warehouse-rate-overrides/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      if (sessionUser?.department !== 'super_admin') {
        return res.status(403).json({ error: 'Only Super Admin can delete a warehouse rate override.' });
      }
      const { id } = req.params;
      const existing = (await getWarehouseRateOverrides()).find(o => o.id === id);
      const result = await deleteWarehouseRateOverride(id);
      await createAuditLog({
        user: sessionUser, action: 'DELETE', module: 'Warehouse Details', entityType: 'Rate Override', entityId: id,
        description: `Deleted warehouse rate override ${id} - reverts to the default rate`,
        oldData: existing,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
      if (entry.pettyCashHolderUsername && !PETTY_CASH_USERS.some(u => u.username === entry.pettyCashHolderUsername)) {
        return res.status(400).json({ error: 'Invalid Petty Cash Paid By selection.' });
      }
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

  // Payments module - reconciling what's owed to a fuel bunk (see
  // src/types.ts's BunkPaymentPeriod/BunkPayment). Restricted to Praveen +
  // Super Admins (requirePaymentsAccess above).
  app.use('/api/bunk-payment-periods', requirePaymentsAccess);
  app.use('/api/bunk-payments', requirePaymentsAccess);

  app.get('/api/bunk-payment-periods', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(maskAttributionField(await getBunkPaymentPeriods(), 'enteredBy', sessionUser));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/bunk-payment-periods', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const body: BunkPaymentPeriod = req.body;
      if (!body.bunkName || !body.location || !body.periodFrom || !body.periodTo) {
        return res.status(400).json({ error: 'Bunk Name, Location, and both Period dates are required.' });
      }
      if (body.periodFrom > body.periodTo) {
        return res.status(400).json({ error: 'Period From cannot be after Period To.' });
      }
      const allPeriods = await getBunkPaymentPeriods();
      const existing = body.id ? allPeriods.find(p => p.id === body.id) : undefined;
      // Sequential/non-overlapping periods per bunk (mirrors Payments.tsx's
      // own findOverlappingPeriod client-side check) - the backstop for a
      // direct API call bypassing the UI's inline validation.
      const conflict = allPeriods.find(p =>
        p.id !== body.id && p.bunkName === body.bunkName && p.location === body.location &&
        p.periodFrom <= body.periodTo && p.periodTo >= body.periodFrom
      );
      if (conflict) {
        return res.status(409).json({ error: `Overlaps an existing period for this bunk: ${conflict.periodFrom} to ${conflict.periodTo}. The next period must start after it ends.` });
      }
      const newId = body.id || String(Date.now());
      const result = await saveBunkPaymentPeriod({ ...body, id: newId, enteredBy: existing?.enteredBy || sessionUser?.username });
      await createAuditLog({
        user: sessionUser, action: existing ? 'UPDATE' : 'CREATE', module: 'Payments', entityType: 'Bunk Payment Period', entityId: newId,
        description: `${existing ? 'Updated' : 'Created'} payment period for ${body.bunkName} (${body.location}): ${body.periodFrom} to ${body.periodTo}`,
        oldData: existing, newData: { ...body, id: newId },
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, id: newId, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/bunk-payment-periods/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { id } = req.params;
      const existing = (await getBunkPaymentPeriods()).find(p => p.id === id);
      // Cascade - a period's payment history is meaningless once the period
      // itself is gone, same "delete reverses everything it caused" rule
      // Fuel Entry -> Mileage Report -> linked Petty Cash voucher follows.
      const orphanedPayments = (await getBunkPayments()).filter(p => p.bunkPeriodId === id);
      for (const payment of orphanedPayments) await deleteBunkPayment(payment.id);
      const result = await deleteBunkPaymentPeriod(id);
      await createAuditLog({
        user: sessionUser, action: 'DELETE', module: 'Payments', entityType: 'Bunk Payment Period', entityId: id,
        description: `Deleted payment period for ${existing?.bunkName || id} (${existing?.location || ''})${orphanedPayments.length > 0 ? ` and its ${orphanedPayments.length} payment(s)` : ''}`,
        oldData: existing,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/bunk-payments', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(maskAttributionField(await getBunkPayments(), 'enteredBy', sessionUser));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add Payment always appends - this only ever creates a new row (the UI
  // never sends an existing id), never overwrites a prior payment. Balance
  // is derived client-side from the full payment history, not enforced here.
  app.post('/api/bunk-payments', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const body: BunkPayment = req.body;
      if (!body.bunkPeriodId || !body.amount || body.amount <= 0 || !body.mode || !body.paidDate) {
        return res.status(400).json({ error: 'Amount, Payment Mode, and Paid Date are required.' });
      }
      if (isFutureDate(body.paidDate)) return res.status(400).json({ error: 'Paid Date cannot be in the future.' });
      const newId = String(Date.now());
      const result = await saveBunkPayment({ ...body, id: newId, enteredBy: sessionUser?.username });
      await createAuditLog({
        user: sessionUser, action: 'CREATE', module: 'Payments', entityType: 'Bunk Payment', entityId: newId,
        description: `Logged a ${body.mode} payment of ₹${body.amount} against payment period ${body.bunkPeriodId}`,
        newData: { ...body, id: newId },
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/bunk-payments/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { id } = req.params;
      const existing = (await getBunkPayments()).find(p => p.id === id);
      const result = await deleteBunkPayment(id);
      await createAuditLog({
        user: sessionUser, action: 'DELETE', module: 'Payments', entityType: 'Bunk Payment', entityId: id,
        description: `Deleted a ${existing?.mode || ''} payment of ₹${existing?.amount || 0} from payment period ${existing?.bunkPeriodId || id}`,
        oldData: existing,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Diesel Payments module (2026-08-29 rework) - a running per-bunk account,
  // not a period/cycle-based statement (see src/types.ts's DieselBunkAccount/
  // DieselBunkPayment). Reuses the same requirePaymentsAccess gate as the
  // deprecated bunk-payment-periods/bunk-payments routes above.
  app.use('/api/diesel-bunk-accounts', requirePaymentsAccess);
  app.use('/api/diesel-bunk-payments', requirePaymentsAccess);

  app.get('/api/diesel-bunk-accounts', async (req, res) => {
    try { res.json(await getDieselBunkAccounts()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/diesel-bunk-accounts', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const body: DieselBunkAccount = req.body;
      if (!body.bunkName || !body.location) {
        return res.status(400).json({ error: 'Bunk Name and Location are required.' });
      }
      const allAccounts = await getDieselBunkAccounts();
      const existing = body.id ? allAccounts.find(a => a.id === body.id) : undefined;
      // One account per (Bunk Name, Location) - the same identity Fuel
      // Management itself uses to group fuel entries by bunk.
      const duplicate = allAccounts.find(a => a.id !== body.id && a.bunkName === body.bunkName && a.location === body.location);
      if (duplicate) {
        return res.status(409).json({ error: `An account for ${body.bunkName} (${body.location}) already exists.` });
      }
      const newId = body.id || String(Date.now());
      const result = await saveDieselBunkAccount({
        ...body, id: newId,
        openingBalance: Number(body.openingBalance) || 0,
        highExposureThreshold: body.highExposureThreshold != null ? Number(body.highExposureThreshold) : undefined
      });
      await createAuditLog({
        user: sessionUser, action: existing ? 'UPDATE' : 'CREATE', module: 'Diesel Payments', entityType: 'Diesel Bunk Account', entityId: newId,
        description: `${existing ? 'Updated' : 'Created'} diesel bunk account for ${body.bunkName} (${body.location})`,
        oldData: existing, newData: { ...body, id: newId },
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, id: newId, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/diesel-bunk-accounts/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { id } = req.params;
      const existing = (await getDieselBunkAccounts()).find(a => a.id === id);
      const orphanedPayments = (await getDieselBunkPayments()).filter(p => p.bunkId === id);
      const result = await deleteDieselBunkAccount(id);
      await createAuditLog({
        user: sessionUser, action: 'DELETE', module: 'Diesel Payments', entityType: 'Diesel Bunk Account', entityId: id,
        description: `Deleted diesel bunk account for ${existing?.bunkName || id} (${existing?.location || ''})${orphanedPayments.length > 0 ? ` and its ${orphanedPayments.length} payment(s)` : ''}`,
        oldData: existing,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/diesel-bunk-payments', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(maskAttributionField(await getDieselBunkPayments(), 'enteredBy', sessionUser));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add Payment always appends - the UI never sends an existing id, so this
  // only ever creates a new row, never overwrites a prior payment. No cap
  // against the outstanding balance - overpayment is allowed, per spec.
  app.post('/api/diesel-bunk-payments', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const body: DieselBunkPayment = req.body;
      if (!body.bunkId || !body.amount || body.amount <= 0 || !body.mode || !body.date) {
        return res.status(400).json({ error: 'Amount, Payment Mode, and Date are required.' });
      }
      if (!['cash', 'card', 'netbanking'].includes(body.mode)) {
        return res.status(400).json({ error: 'Payment Mode must be Cash, Card, or Netbanking.' });
      }
      // Reference/Note is mandatory for Card/Netbanking (reconciliation),
      // optional for Cash - mirrors Payments.tsx's own inline check.
      if (body.mode !== 'cash' && !(body.reference || '').trim()) {
        return res.status(400).json({ error: 'Reference/Note is required for Card and Netbanking payments.' });
      }
      if (isFutureDate(body.date)) return res.status(400).json({ error: 'Payment date cannot be in the future.' });
      const newId = String(Date.now());
      const result = await saveDieselBunkPayment({ ...body, id: newId, reference: (body.reference || '').trim() || undefined, enteredBy: sessionUser?.username });
      await createAuditLog({
        user: sessionUser, action: 'CREATE', module: 'Diesel Payments', entityType: 'Diesel Bunk Payment', entityId: newId,
        description: `Logged a ${body.mode} payment of ₹${body.amount} against diesel bunk account ${body.bunkId}`,
        newData: { ...body, id: newId },
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/diesel-bunk-payments/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { id } = req.params;
      const existing = (await getDieselBunkPayments()).find(p => p.id === id);
      const result = await deleteDieselBunkPayment(id);
      await createAuditLog({
        user: sessionUser, action: 'DELETE', module: 'Diesel Payments', entityType: 'Diesel Bunk Payment', entityId: id,
        description: `Deleted a ${existing?.mode || ''} payment of ₹${existing?.amount || 0} from diesel bunk account ${existing?.bunkId || id}`,
        oldData: existing,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      res.json({ success: true, data: maskAttributionField(result, 'enteredBy', sessionUser) });
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
      // One row per (driver, vehicle) pair - a driver covering several
      // vehicles (vehicleNos) now yields one row per vehicle instead of just
      // the first, so every module matching by vehicle number can actually
      // find them under each one. Falls back to the legacy single vehicleNo
      // for any driver saved before vehicleNos existed.
      const rows = all.flatMap(d => {
        const vehicles = d.vehicleNos && d.vehicleNos.length > 0 ? d.vehicleNos : (d.vehicleNo ? [d.vehicleNo] : []);
        return vehicles.filter(Boolean).map(vehicleNo => ({ id: d.id, name: d.name, vehicleNo }));
      });
      res.json(rows);
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
      res.json(allowed === 'ALL' ? all : all.filter(d => driverAllLocations(d).some(loc => allowed.includes(loc))));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/drivers/petty-cash-advances', requireDriverAccess);
  // Driver Salary's "Petty Cash/Advance" auto-fetch (2026-08-29) - a narrow
  // slice of Petty Cash (only the "DRIVER SALARY ADV" category, and only
  // vendorId/date/cashPaid/enteredBy, nothing else) rather than the full
  // Petty Cash ledger, so a Driver Details viewer without any Petty Cash
  // module access of their own still sees these figures without being
  // granted broader Petty Cash visibility. enteredBy is masked to Super
  // Admins only, same convention every other module's enteredBy already
  // follows - computeDriverPettyCashAdvance client-side (see
  // src/utils/driverPettyCashAdvance.ts) matches this against Driver ID and
  // groups by month.
  app.get('/api/drivers/petty-cash-advances', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const all = await getPettyCashVouchers();
      const slim = all
        .filter(v => (v.category || '').trim().toUpperCase() === 'DRIVER SALARY ADV')
        .map(v => ({ vendorId: v.vendorId, date: v.date, cashPaid: v.cashPaid, enteredBy: v.enteredBy }));
      res.json(maskAttributionField(slim, 'enteredBy', sessionUser));
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
      const newId = entry.id || String(Date.now());
      const result = await saveDriverEmployee({ ...entry, id: newId });
      await createAuditLog({
        user: sessionUser, action: 'CREATE', module: 'Driver Details', entityType: 'Driver', entityId: newId,
        description: `Created driver ${entry.name || newId} (${newId})`, newData: { ...entry, id: newId },
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      const allowed = getAllowedDriverViewLocations(sessionUser);
      res.json({ success: true, data: allowed === 'ALL' ? result : result.filter(d => driverAllLocations(d).some(loc => allowed.includes(loc))) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/drivers/employees/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getDriverEmployees()).find(d => d.id === req.params.id);
      // 2026-09-03 multi-location support: write access to ANY of the
      // driver's currently-assigned locations is enough to edit their
      // shared profile fields (name, bank details, the location list
      // itself, etc.) - matches the "any overlap" rule view scoping
      // already uses. Which NEW locations can be added is left to the
      // client's own locationOptions (already restricted to the caller's
      // writable set), not re-validated here per-location.
      if (!existing || !driverAllLocations(existing).some(loc => canWriteDriverLocation(loc, sessionUser))) {
        return res.status(403).json({ error: 'You cannot modify this driver.' });
      }
      // Merged with `existing` (2026-09-02 data-integrity fix) - saveDriverEmployee
      // overwrites the whole stored record with whatever it's given, so this
      // used to save req.body AS the complete new record. Every caller so far
      // has happened to send a near-complete object (DriverFormModal builds
      // its payload from the full form state) except the inline document-
      // upload panel (DriverSalarySheet.tsx's handleUpdateDocs), which
      // intentionally sends just `{ aadharDocuments: [...] }` - unmerged,
      // that would have silently wiped every other field (name, location,
      // salary, bank details...) off the record the next time someone
      // attached a document from that panel. Merging here makes a genuine
      // partial update safe for every current and future caller.
      const result = await saveDriverEmployee({ ...existing, ...req.body, id: req.params.id });
      await createAuditLog({
        user: sessionUser, action: 'UPDATE', module: 'Driver Details', entityType: 'Driver', entityId: req.params.id,
        description: `Updated driver ${req.body?.name || existing.name || req.params.id} (${req.params.id})`,
        oldData: existing, newData: { ...req.body, id: req.params.id },
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      const allowed = getAllowedDriverViewLocations(sessionUser);
      res.json({ success: true, data: allowed === 'ALL' ? result : result.filter(d => driverAllLocations(d).some(loc => allowed.includes(loc))) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Soft-delete (2026-09-02 data-integrity fix) - "Delete Driver" used to
  // physically remove the driver_employees row, which silently took that
  // driver's entire Attendance/Salary history down with it everywhere the
  // app resolves a driver's name/location/vehicle by looking them up in the
  // CURRENT driver_employees table (which is most places - see
  // DriverAttendanceSheet.tsx). This now just flips status to 'inactive'
  // and keeps the row (and every field on it) exactly as it was - the
  // driver stops appearing in active pick-lists but every historical record
  // that points at their id keeps resolving correctly, forever. The
  // physical deleteDriverEmployee() function still exists in db/service.ts
  // for a genuine data-entry mistake (a duplicate/garbage row that never
  // had real history against it), but nothing in the app calls it anymore -
  // use a direct DB fix for that rare case instead of exposing it here.
  app.delete('/api/drivers/employees/:id', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getDriverEmployees()).find(d => d.id === req.params.id);
      if (!existing || !driverAllLocations(existing).some(loc => canWriteDriverLocation(loc, sessionUser))) {
        return res.status(403).json({ error: 'You cannot deactivate this driver.' });
      }
      const inactivatedDate = new Date().toISOString().slice(0, 10);
      const updated: DriverEmployee = { ...existing, status: 'inactive', inactivatedDate };
      const result = await saveDriverEmployee(updated);
      await createAuditLog({
        user: sessionUser, action: 'DEACTIVATE', module: 'Driver Details', entityType: 'Driver', entityId: req.params.id,
        description: `Deactivated driver ${existing.name || req.params.id} (${req.params.id}) - historical Attendance/Salary records preserved`,
        oldData: existing, newData: updated,
        ipAddress: req.ip || '127.0.0.1', userAgent: req.headers['user-agent']
      });
      const allowed = getAllowedDriverViewLocations(sessionUser);
      res.json({ success: true, data: allowed === 'ALL' ? result : result.filter(d => driverAllLocations(d).some(loc => allowed.includes(loc))) });
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
  // `location`, when given (2026-09-03 multi-location support), checks
  // access against that ONE specific assignment - e.g. marking a Vizag cell
  // requires write access to Vizag specifically, even if this same driver
  // also has a Hyderabad assignment the caller happens to manage. Omitted
  // (the default), it checks whether the caller has access to ANY of the
  // driver's assigned locations - used for actions on the driver's shared
  // profile fields (name, bank details, etc.) rather than one location.
  async function assertDriverAccessible(
    driverId: string, sessionUser: Awaited<ReturnType<typeof getSessionUser>> | undefined,
    mode: 'view' | 'write' = 'write', location?: DriverLocationCategory
  ) {
    const driver = (await getDriverEmployees()).find(d => d.id === driverId);
    if (!driver) return false;
    const check = mode === 'view' ? canViewDriverLocation : canWriteDriverLocation;
    if (location) return check(location, sessionUser);
    return driverAllLocations(driver).some(loc => check(loc, sessionUser));
  }

  // 2026-09-02 data-integrity note: this scoping is keyed off `driverId`
  // resolving to a CURRENT driver_employees row's location - that's exactly
  // right now that Delete Driver soft-deletes (see DELETE /api/drivers/
  // employees/:id) rather than removing the row, since an inactive
  // driver's row - and its location - persists forever, so their history
  // keeps showing to anyone with access to that location. The only case
  // this still excludes for a location-scoped (non-ALL) viewer is a
  // driver_attendance row whose driverId has NO driver_employees row at
  // all (a legacy gap predating this fix) - its location genuinely can't be
  // resolved, so it's deliberately withheld from scoped viewers rather than
  // guessed at; a full-access ('ALL') viewer still gets everything
  // unconditionally below.
  app.get('/api/drivers/attendance', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const allowed = getAllowedDriverViewLocations(sessionUser);
      const [rows, drivers] = await Promise.all([getDriverAttendance(), getDriverEmployees()]);
      const scoped = allowed === 'ALL' ? rows : (() => {
        const allowedDriverIds = new Set(drivers.filter(d => driverAllLocations(d).some(loc => allowed.includes(loc))).map(d => d.id));
        return rows.filter(r => allowedDriverIds.has(r.driverId));
      })();
      res.json(maskAttributionField(scoped, 'markedBy', sessionUser));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // `location` (2026-09-03 multi-location support) is stamped onto the
  // saved record and validated against the driver's own assignments, so a
  // driver covering more than one location has their attendance correctly
  // attributed to whichever location it was actually marked under rather
  // than always resolving to their primary location. Omitted entirely, it
  // falls back to the driver's primary location - keeps any older client
  // request shape working exactly as before.
  app.post('/api/drivers/attendance/mark', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const { driverId, date, status, remarks, location } = req.body;
      const driver = (await getDriverEmployees()).find(d => d.id === driverId);
      if (!driver) return res.status(404).json({ success: false, error: 'Driver not found.' });
      const effectiveLocation: DriverLocationCategory = location && driverAllLocations(driver).includes(location) ? location : driver.location;
      if (!(await assertDriverAccessible(driverId, sessionUser, 'write', effectiveLocation))) {
        return res.status(403).json({ success: false, error: 'You cannot mark attendance for this driver at this location.' });
      }
      if (isFutureDate(date)) return res.status(400).json({ success: false, error: 'Attendance cannot be marked for a future date.' });
      const id = `${driverId}-${date}`;
      // markedBy always reflects whoever most recently set *this* day's
      // status (unlike a flat ledger's enteredBy) - each driver+date cell is
      // its own record, independently re-stamped every time it's re-marked.
      const record: DriverAttendance = { id, driverId, date, status, remarks, location: effectiveLocation, markedBy: sessionUser?.username };
      await saveDriverAttendanceRecord(record);
      res.json({ success: true, data: maskAttributionField([record], 'markedBy', sessionUser)[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/drivers/attendance/bulk', async (req, res) => {
    try {
      const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
      const entries = req.body as Array<{ driverId: string; date: string; status: string; location?: DriverLocationCategory }>;
      if (!Array.isArray(entries)) return res.status(400).json({ success: false, error: 'Request body must be an array of attendance entries.' });
      const allDrivers = await getDriverEmployees();
      const results: DriverAttendance[] = [];
      for (const entry of entries) {
        const driver = allDrivers.find(d => d.id === entry.driverId);
        if (!driver) continue;
        const effectiveLocation: DriverLocationCategory = entry.location && driverAllLocations(driver).includes(entry.location) ? entry.location : driver.location;
        if (!(await assertDriverAccessible(entry.driverId, sessionUser, 'write', effectiveLocation))) continue;
        if (isFutureDate(entry.date)) continue; // silently skipped, same treatment as an out-of-scope driver just above
        const id = `${entry.driverId}-${entry.date}`;
        const record: DriverAttendance = { id, driverId: entry.driverId, date: entry.date, status: entry.status as DriverAttendance['status'], location: effectiveLocation, markedBy: sessionUser?.username };
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
      // Checked against the record's own stamped location (2026-09-03) when
      // it has one, falling back to the driver's primary location for a
      // legacy record with none - matches attendanceBelongsToLocation's own
      // fallback rule.
      if (!existing || !(await assertDriverAccessible(existing.driverId, sessionUser, 'write', existing.location))) {
        return res.status(403).json({ error: 'You cannot delete this attendance record.' });
      }
      const [rows, drivers] = await Promise.all([deleteDriverAttendanceRecord(req.params.id), getDriverEmployees()]);
      const allowed = getAllowedDriverViewLocations(sessionUser);
      if (allowed === 'ALL') {
        res.json({ success: true, data: rows });
      } else {
        const allowedDriverIds = new Set(drivers.filter(d => driverAllLocations(d).some(loc => allowed.includes(loc))).map(d => d.id));
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

  // Audit Trail - read-only, Super Admin only (Principal's own account is
  // department 'super_admin' too - see src/db/service.ts's DEFAULT_USERS
  // "Super Admin Principal" seed row - so this single department check
  // already covers both, same as every other "Super Admin / Principal only"
  // gate in this app, e.g. Reports.tsx's isSuperAdmin). There is
  // deliberately no create/update/delete route here - audit records are
  // only ever written by createAuditLog() from trusted server-side code
  // above, never accepted from a client request body.
  const requireAuditAccess = async (req: express.Request, res: express.Response) => {
    const sessionUser = await getSessionUser(extractBearerToken(req.headers.authorization));
    if (!sessionUser || sessionUser.department !== 'super_admin') {
      await createAuditLog({
        user: sessionUser,
        usernameOverride: sessionUser ? undefined : 'unauthenticated',
        action: 'ACCESS_DENIED',
        module: 'Administration',
        entityType: 'Audit Trail',
        description: sessionUser
          ? `${sessionUser.name} (${sessionUser.username}) attempted to access Audit Trail without permission`
          : 'Unauthenticated request attempted to access Audit Trail',
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent']
      });
      res.status(403).json({ error: 'Access denied. Audit Trail is restricted to Super Admin.' });
      return null;
    }
    return sessionUser;
  };

  app.get('/api/audit-logs', async (req, res) => {
    try {
      const sessionUser = await requireAuditAccess(req, res);
      if (!sessionUser) return;

      const { page, pageSize, sortDir, dateFrom, dateTo, userId, userRole, module, action, entityType, q } = req.query;
      const result = await getAuditLogs({
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        sortDir: sortDir === 'asc' ? 'asc' : 'desc',
        dateFrom: typeof dateFrom === 'string' && dateFrom ? dateFrom : undefined,
        dateTo: typeof dateTo === 'string' && dateTo ? dateTo : undefined,
        userId: typeof userId === 'string' && userId ? userId : undefined,
        userRole: typeof userRole === 'string' && userRole ? userRole : undefined,
        module: typeof module === 'string' && module ? module : undefined,
        action: typeof action === 'string' && action ? action : undefined,
        entityType: typeof entityType === 'string' && entityType ? entityType : undefined,
        q: typeof q === 'string' && q ? q : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Distinct User/Module/Action/Entity Type values actually present in the
  // table, for the Audit Trail UI's filter dropdowns.
  app.get('/api/audit-logs/filter-options', async (req, res) => {
    try {
      const sessionUser = await requireAuditAccess(req, res);
      if (!sessionUser) return;
      res.json(await getAuditLogFilterOptions());
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
