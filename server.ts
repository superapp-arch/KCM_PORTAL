import express from "express";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

import { createServer as createViteServer } from 'vite';
import { verifyPassword } from './src/auth/password.ts';
import { createSession, getSessionUser, destroySession, extractBearerToken } from './src/auth/session.ts';
import { issueOtp, verifyOtp } from './src/auth/otp.ts';
import { istTimestamp, istDateKey } from './src/auth/time.ts';
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
  MileageReport
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
  clearImportedPettyCashVouchers,
  getMileageReports,
  saveMileageReport,
  deleteMileageReport
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
    attendancePercentage, rows
  };
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
      const expDate = parseFlexibleDate(raw);
      if (!expDate || isNaN(expDate.getTime())) continue;

      const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < check.minDays || diffDays > check.maxDays) continue;

      const notifId = `${check.idPrefix}-${regNo}`;
      const existing = existingNotifs.find((n: any) => n.id === notifId);
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
          expiryDate: raw,
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
      subject: `KCM Fleet Compliance Digest - ${sortedAlerts.length} Expir${sortedAlerts.length === 1 ? 'y' : 'ies'} at 3/7/15-Day Mark (${todayKey})`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;">
          <p>Hello,</p>
          <p>The following documents are expiring in exactly 3, 7, or 15 days (soonest first):</p>
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
  app.post(
  "/api/upload",
  upload.single("file"),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const module = req.body.module;
      const vehicle = req.body.vehicle;

      const relativePath =
        `uploads/${module}/${vehicle}/${req.file.filename}`;

      res.json({
        success: true,

        file: {
          fileName: req.file.originalname,
          filePath: relativePath,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
        },
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
      });
    }
  }
);
app.post("/api/upload/vehicle", upload.single("file"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        return res.json({
            success: true,
            filename: req.file.filename,
            path: req.file.path.replace(/\\/g, "/"),
            originalName: req.file.originalname,
            size: req.file.size
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            message: "Upload failed"
        });
    }
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

  // API endpoints for all departments
  app.get('/api/fuel', async (req, res) => {
    try { res.json(await getFuelLogs()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/fuel', async (req, res) => {
    try { res.json({ success: true, data: await saveFuelLog(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/fuel/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveFuelLog({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/fuel/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteFuelLog(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
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

  app.get('/api/petty-cash', async (req, res) => {
    try { res.json(await getPettyCashVouchers()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/petty-cash', async (req, res) => {
    try { res.json({ success: true, data: await savePettyCashVoucher(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/petty-cash/:id', async (req, res) => {
    try { res.json({ success: true, data: await savePettyCashVoucher({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/petty-cash/:id', async (req, res) => {
    try { res.json({ success: true, data: await deletePettyCashVoucher(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
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
          totalDays: attendance.totalDays, workingDays: attendance.workingDays, lopDays: attendance.lopDays,
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

      const [employees, attendanceRows] = await Promise.all([getStaffEmployees(), getStaffAttendance()]);
      const employee = employees.find(e => e.id === empId);
      const summaries = await Promise.all(monthKeys.map(m => computeMonthlyAttendanceSummary(empId, m)));
      const rows = attendanceRows.filter(a => a.empId === empId && monthKeys.includes(a.date.slice(0, 7)));

      res.json({ success: true, data: { employee, monthKeys, summaries, rows } });
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

      const employees = await getStaffEmployees();
      const perEmployee = await Promise.all(employees.map(async e => ({
        empId: e.id, name: e.name,
        summaries: await Promise.all(monthKeys.map(m => computeMonthlyAttendanceSummary(e.id, m)))
      })));

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

  // Warehouse Details endpoints
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

  // Clear Imported Petty Cash Vouchers
  app.post('/api/petty-cash/clear-imported', async (req, res) => {
    try {
      const result = await clearImportedPettyCashVouchers();
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mileage Reports endpoints
  app.get('/api/mileage', async (req, res) => {
    try {
      res.json(await getMileageReports());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mileage', async (req, res) => {
    try {
      const entry: MileageReport = req.body;
      const result = await saveMileageReport(entry);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/mileage/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await deleteMileageReport(id);
      res.json({ success: true, data: result });
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
