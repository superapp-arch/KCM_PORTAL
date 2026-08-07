import express from "express";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";
import upload from "./src/upload/upload.ts";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

import { createServer as createViteServer } from 'vite';
import { verifyPassword } from './src/auth/password.ts';
import { createSession, getSessionUser, destroySession, extractBearerToken } from './src/auth/session.ts';
import { issueOtp, verifyOtp } from './src/auth/otp.ts';
import { istTimestamp, istDateKey } from './src/auth/time.ts';
import { computeDueDateRaw } from './src/utils/loanDates.ts';
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
  PettyCashAdvance
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

// HR & Payroll data is restricted to Bhagya and super admins - the frontend
// already hides the tab from everyone else, but that's UI-only. This is the
// actual enforcement: without it, anyone with a valid session token could
// call /api/staff/* directly (e.g. via devtools) and read or edit employee/
// salary data regardless of what the UI shows them.
function requireHrAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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
function requireFuelAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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
function requirePettyCashAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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
function requireWarehouseAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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

function requireLoanAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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
function requireVendorReadAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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
function requireVendorManagementAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (sessionUser.department !== 'super_admin' && !VENDOR_MANAGEMENT_EMAILS.includes(sessionUser.email || '')) {
    return res.status(403).json({ error: 'You do not have access to Vendor Management.' });
  }
  next();
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
function filterEntryRowsForViewer<T extends { enteredBy?: string }>(rows: T[], sessionUser?: ReturnType<typeof getSessionUser>, fullViewEmails: string[] = []): T[] {
  if (!sessionUser) return [];
  if (sessionUser.department === 'super_admin' || fullViewEmails.includes(sessionUser.email || '')) return rows;
  return rows
    .filter(r => r.enteredBy === sessionUser.username)
    .map(r => { const { enteredBy, ...rest } = r; return rest as T; });
}

// A non-super-admin may only modify (update/delete) a row they themselves
// created - mirrors the read-side filtering above for write operations.
function canModifyEntryRow(row: { enteredBy?: string } | undefined, sessionUser?: ReturnType<typeof getSessionUser>): boolean {
  if (!sessionUser) return false;
  if (sessionUser.department === 'super_admin') return true;
  return !!row && row.enteredBy === sessionUser.username;
}

// Same two rules as above, but for PettyCashAdvance rows, which are keyed by
// `username` (whose ledger the advance belongs to) rather than `enteredBy`
// (who happened to log the row) - the two normally coincide for Petty Cash's
// 3 logins, but `username` is what actually matters for whose balance an
// advance counts toward.
function filterAdvancesForViewer(rows: PettyCashAdvance[], sessionUser?: ReturnType<typeof getSessionUser>): PettyCashAdvance[] {
  if (!sessionUser) return [];
  if (sessionUser.department === 'super_admin') return rows;
  return rows.filter(r => r.username === sessionUser.username);
}

function canModifyAdvance(row: PettyCashAdvance | undefined, sessionUser?: ReturnType<typeof getSessionUser>): boolean {
  if (!sessionUser) return false;
  if (sessionUser.department === 'super_admin') return true;
  return !!row && row.username === sessionUser.username;
}

// Driver Details is location-scoped rather than a single fixed access group -
// each regional handler only sees/manages drivers in their assigned
// location(s); Super Admins see every location. Unassigned categories (HSK
// RIL F&V Drivers, Walkes & Parking Drivers HYD, Cold Star BLR, Swiggy DHL,
// KCM Service Station) stay Super-Admin-only since nobody is scoped to them yet.
const DRIVER_LOCATION_SCOPES: Record<string, DriverLocationCategory[]> = {
  'rajeshwar@kcmlogistics.in': ['Hyd Swiggy', 'Swiggy - Vizag Driver'],
  'nagaraju.linga@kcmlogistics.in': ['Hyd Swiggy', 'Swiggy - Vizag Driver'],
  'ramesh@kcmlogistics.in': ['Nelmangala Reliance', 'Nidaghatta Reliance', 'Chennai Hybrid'],
  'saneel@kcmlogistics.in': ['BLR Swiggy', 'Goa Vehicle'],
  'vinod@kcmlogistics.in': ['BLR Swiggy', 'Vijayawada Drivers Details', 'Market Vehicle Driver Details']
};

// Bhagya and Divya get every location (like a super admin) rather than a
// single region - their roles already span HR/Billing/Fleet/Vendor admin
// duties.
const DRIVER_ALL_LOCATIONS_EMAILS = ['bhagya@kcmlogistics.in', 'divya@kcmlogistics.in'];

function requireDriverAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (
    sessionUser.department !== 'super_admin' &&
    !DRIVER_ALL_LOCATIONS_EMAILS.includes(sessionUser.email || '') &&
    !DRIVER_LOCATION_SCOPES[sessionUser.email || '']
  ) {
    return res.status(403).json({ error: 'You do not have access to Driver Details.' });
  }
  next();
}

// Super admins (and Bhagya) see every location; everyone else only their
// assigned set.
function getAllowedDriverLocations(sessionUser?: ReturnType<typeof getSessionUser>): DriverLocationCategory[] | 'ALL' {
  if (!sessionUser) return [];
  if (sessionUser.department === 'super_admin' || DRIVER_ALL_LOCATIONS_EMAILS.includes(sessionUser.email || '')) return 'ALL';
  return DRIVER_LOCATION_SCOPES[sessionUser.email || ''] || [];
}

function canAccessDriverLocation(location: string, sessionUser?: ReturnType<typeof getSessionUser>): boolean {
  const allowed = getAllowedDriverLocations(sessionUser);
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

  // Builds and sends the compliance digest email right now - listing every
  // vehicle whose insurance/permit/FC/tax expiry falls exactly on the 3, 7,
  // or 15 day milestone today (see calculateMilestoneAlerts), sorted
  // soonest-first - to the Super Admin(s) and the Vehicle Data Manager
  // (Chandana). Used both by the automatic daily schedule and the manual
  // "Send Alerts Now" button; the manual path always sends regardless of
  // whether today's automatic digest already went out.
  async function buildAndSendComplianceDigest(): Promise<{ sent: boolean; count: number; recipients: string[] }> {
    const sortedAlerts = await calculateMilestoneAlerts();
    if (sortedAlerts.length === 0) return { sent: false, count: 0, recipients: [] };

    const usersList = await getUsersWithFallback();
    const recipients = usersList
      .filter((u: any) => u.department === 'super_admin' || u.username === 'chandana')
      .map((u: any) => u.email)
      .filter(Boolean) as string[];

    if (recipients.length === 0) return { sent: false, count: 0, recipients: [] };

    const todayKey = istDateKey();
    const rows = sortedAlerts.map((a: any) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;font-family:monospace;">${a.vehicleRegNo}</td>
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
          <p>The following documents are expiring, please renew before expiry.</p>
          <table style="border-collapse:collapse;font-size:13px;">
            <thead>
              <tr>
                <th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;text-align:left;">Vehicle No</th>
                <th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;text-align:left;">Expiry Type</th>
                <th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;text-align:left;">Expiry Date</th>
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
      message: `Compliance digest emailed to ${recipients.join(', ')} covering ${sortedAlerts.length} expir${sortedAlerts.length === 1 ? 'y' : 'ies'} at the 3/7/15-day mark.`,
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
  app.get('/api/session', (req, res) => {
    res.json(getSessionUser(extractBearerToken(req.headers.authorization)) || null);
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
        const token = createSession(userSession);
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
      const token = createSession(userSession);
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
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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
  app.post('/api/logout', (req, res) => {
    destroySession(extractBearerToken(req.headers.authorization));
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

  // Manually trigger the compliance digest email immediately (Super Admin only),
  // bypassing the once-per-day automatic gate.
  app.post('/api/compliance-digest/send-now', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      if (!sessionUser || sessionUser.department !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Only Super Admin can send the compliance digest.' });
      }

      const result = await buildAndSendComplianceDigest();
      if (!result.sent) {
        return res.json({
          success: true,
          sent: false,
          message: 'No vehicles are currently at the 3/7/15-day expiry mark for insurance, permits, FC, or tax - nothing to send.'
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
      const dynamic = await calculateDynamicAlerts();
      const sec = notifs.filter((n: any) => n.type === 'security');
      res.json({
        alerts: [...dynamic, ...sec]
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Notifications API endpoints
  app.get('/api/notifications', async (req, res) => {
    try {
      const storedNotifs = await getNotifications();
      const dynamic = await calculateDynamicAlerts();
      
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
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(filterEntryRowsForViewer(await getFuelLogs(), sessionUser, FUEL_RQ_ID_ONLY_EMAILS));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/fuel', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      // Divya never creates entries - guard even though the UI never offers
      // her an Add Entry button.
      if (sessionUser?.department !== 'super_admin' && FUEL_RQ_ID_ONLY_EMAILS.includes(sessionUser?.email || '')) {
        return res.status(403).json({ error: 'You cannot add fuel entries.' });
      }
      const result = await saveFuelLog({ ...req.body, enteredBy: sessionUser?.username });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, FUEL_RQ_ID_ONLY_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/fuel/:id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getFuelLogs()).find(l => l.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
      const result = await saveFuelLog({ ...req.body, id: req.params.id, enteredBy: existing?.enteredBy });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser, FUEL_RQ_ID_ONLY_EMAILS) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  // Divya's restricted update path - only ever touches rqId on an existing
  // entry, regardless of what else is in the request body.
  app.put('/api/fuel/:id/rq-id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(filterEntryRowsForViewer(await getPettyCashVouchers(), sessionUser));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/petty-cash', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const result = await savePettyCashVoucher({ ...req.body, enteredBy: sessionUser?.username });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/petty-cash/:id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getPettyCashVouchers()).find(v => v.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
      const result = await savePettyCashVoucher({ ...req.body, id: req.params.id, enteredBy: existing?.enteredBy });
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/petty-cash/:id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getPettyCashVouchers()).find(v => v.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      const result = await deletePettyCashVoucher(req.params.id);
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/market-pod', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(filterEntryRowsForViewer(await getMarketPodEntries(), sessionUser));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/market-pod', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const result = await saveMarketPodEntry({ ...req.body, enteredBy: sessionUser?.username } as MarketPodEntry);
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/market-pod/:id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getMarketPodEntries()).find(e => e.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot modify this entry.' });
      const result = await saveMarketPodEntry({ ...req.body, id: req.params.id, enteredBy: existing?.enteredBy } as MarketPodEntry);
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/market-pod/:id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getMarketPodEntries()).find(e => e.id === req.params.id);
      if (!canModifyEntryRow(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      const result = await deleteMarketPodEntry(req.params.id);
      res.json({ success: true, data: filterEntryRowsForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Petty Cash "Amount Received" advances - each of the 3 logins' running
  // Balance Net ledger opening/top-up entries. Row-scoped by `username`
  // (whose ledger it belongs to) via filterAdvancesForViewer/canModifyAdvance.
  app.get('/api/petty-cash-advances', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(filterAdvancesForViewer(await getPettyCashAdvances(), sessionUser));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/petty-cash-advances', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      // A regular Petty Cash user can only ever add an advance to their own
      // ledger; only a super admin may specify a different `username` (e.g.
      // logging a top-up on someone else's behalf).
      const username = sessionUser?.department === 'super_admin' && req.body.username ? req.body.username : sessionUser?.username;
      const result = await savePettyCashAdvance({ ...req.body, username } as PettyCashAdvance);
      res.json({ success: true, data: filterAdvancesForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/petty-cash-advances/:id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getPettyCashAdvances()).find(a => a.id === req.params.id);
      if (!canModifyAdvance(existing, sessionUser)) return res.status(403).json({ error: 'You cannot delete this entry.' });
      const result = await deletePettyCashAdvance(req.params.id);
      res.json({ success: true, data: filterAdvancesForViewer(result, sessionUser) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/maintenance', async (req, res) => {
    try { res.json(await getMaintenanceRecords()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/maintenance', async (req, res) => {
    try { res.json({ success: true, data: await saveMaintenanceRecord(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/maintenance/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveMaintenanceRecord({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/maintenance/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteMaintenanceRecord(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
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
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      res.json(filterEntryRowsForViewer(await getMileageReports(), sessionUser));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mileage', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const entry: MileageReport = req.body;
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
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
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

  // Driver Details endpoints - location-scoped, see DRIVER_LOCATION_SCOPES.
  app.use('/api/drivers/employees', requireDriverAccess);

  app.get('/api/drivers/employees', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const allowed = getAllowedDriverLocations(sessionUser);
      const all = await getDriverEmployees();
      res.json(allowed === 'ALL' ? all : all.filter(d => allowed.includes(d.location)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/drivers/employees', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const entry: DriverEmployee = req.body;
      if (!canAccessDriverLocation(entry.location, sessionUser)) {
        return res.status(403).json({ error: 'You cannot add a driver in this location.' });
      }
      const result = await saveDriverEmployee(entry);
      const allowed = getAllowedDriverLocations(sessionUser);
      res.json({ success: true, data: allowed === 'ALL' ? result : result.filter(d => allowed.includes(d.location)) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/drivers/employees/:id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getDriverEmployees()).find(d => d.id === req.params.id);
      const targetLocation = req.body.location || existing?.location;
      if (!existing || !canAccessDriverLocation(existing.location, sessionUser) || !canAccessDriverLocation(targetLocation, sessionUser)) {
        return res.status(403).json({ error: 'You cannot modify this driver.' });
      }
      const result = await saveDriverEmployee({ ...req.body, id: req.params.id });
      const allowed = getAllowedDriverLocations(sessionUser);
      res.json({ success: true, data: allowed === 'ALL' ? result : result.filter(d => allowed.includes(d.location)) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/drivers/employees/:id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getDriverEmployees()).find(d => d.id === req.params.id);
      if (!existing || !canAccessDriverLocation(existing.location, sessionUser)) {
        return res.status(403).json({ error: 'You cannot delete this driver.' });
      }
      const result = await deleteDriverEmployee(req.params.id);
      const allowed = getAllowedDriverLocations(sessionUser);
      res.json({ success: true, data: allowed === 'ALL' ? result : result.filter(d => allowed.includes(d.location)) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Driver Attendance - same location scoping, resolved via the driver's own
  // location (attendance rows themselves don't carry a location).
  app.use('/api/drivers/attendance', requireDriverAccess);

  async function assertDriverAccessible(driverId: string, sessionUser?: ReturnType<typeof getSessionUser>) {
    const driver = (await getDriverEmployees()).find(d => d.id === driverId);
    return !!driver && canAccessDriverLocation(driver.location, sessionUser);
  }

  app.get('/api/drivers/attendance', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const allowed = getAllowedDriverLocations(sessionUser);
      const [rows, drivers] = await Promise.all([getDriverAttendance(), getDriverEmployees()]);
      if (allowed === 'ALL') return res.json(rows);
      const allowedDriverIds = new Set(drivers.filter(d => allowed.includes(d.location)).map(d => d.id));
      res.json(rows.filter(r => allowedDriverIds.has(r.driverId)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/drivers/attendance/mark', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const { driverId, date, status, remarks } = req.body;
      if (!(await assertDriverAccessible(driverId, sessionUser))) {
        return res.status(403).json({ success: false, error: 'You cannot mark attendance for this driver.' });
      }
      const id = `${driverId}-${date}`;
      const record: DriverAttendance = { id, driverId, date, status, remarks };
      await saveDriverAttendanceRecord(record);
      res.json({ success: true, data: record });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/drivers/attendance/bulk', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const entries = req.body as Array<{ driverId: string; date: string; status: string }>;
      if (!Array.isArray(entries)) return res.status(400).json({ success: false, error: 'Request body must be an array of attendance entries.' });
      const results: DriverAttendance[] = [];
      for (const entry of entries) {
        if (!(await assertDriverAccessible(entry.driverId, sessionUser))) continue;
        const id = `${entry.driverId}-${entry.date}`;
        const record: DriverAttendance = { id, driverId: entry.driverId, date: entry.date, status: entry.status as DriverAttendance['status'] };
        await saveDriverAttendanceRecord(record);
        results.push(record);
      }
      res.json({ success: true, data: results });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/drivers/attendance/:id', async (req, res) => {
    try {
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const existing = (await getDriverAttendance()).find(r => r.id === req.params.id);
      if (!existing || !(await assertDriverAccessible(existing.driverId, sessionUser))) {
        return res.status(403).json({ error: 'You cannot delete this attendance record.' });
      }
      const [rows, drivers] = await Promise.all([deleteDriverAttendanceRecord(req.params.id), getDriverEmployees()]);
      const allowed = getAllowedDriverLocations(sessionUser);
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
      const sessionUser = getSessionUser(extractBearerToken(req.headers.authorization));
      const { driverId, month } = req.params;
      if (!(await assertDriverAccessible(driverId, sessionUser))) {
        return res.status(403).json({ success: false, error: 'You cannot view this driver.' });
      }
      res.json({ success: true, data: await computeDriverMonthlyAttendanceSummary(driverId, month) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
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
}

startServer();
