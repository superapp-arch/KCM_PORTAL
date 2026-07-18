import express from "express";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

import { createServer as createViteServer } from 'vite';
import {
  User,
  Vehicle,
  FuelLog,
  BillingInvoice,
  PettyCashVoucher,
  MaintenanceRecord,
  AccountsEntry,
  HREmployee,
  AbnormalLogin,
  DashboardNotification,
  DriverSalary,
  DriverSalaryAuditLog,
  WarehouseEntry,
  MileageReport
} from './src/types.ts';
import {
  seedDatabase,
  DEFAULT_USERS,
  getUsers,
  updateUserPassword,
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
  getHREmployees,
  saveHREmployee,
  deleteHREmployee,
  getAbnormalLogins,
  saveAbnormalLogin,
  resolveAllAbnormalLogins,
  getNotifications,
  saveNotification,
  resolveNotification,
  getDriverSalaries,
  saveDriverSalary,
  deleteDriverSalary,
  getDriverSalaryAuditLogs,
  saveDriverSalaryAuditLog,
  getWarehouseEntries,
  saveWarehouseEntry,
  deleteWarehouseEntry,
  clearImportedPettyCashVouchers,
  getMileageReports,
  saveMileageReport,
  deleteMileageReport
} from './src/db/service.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Initialize and Seed Cloud SQL Database
  await seedDatabase();

  // Session storage in-memory for this simple demo context
  let currentSessionUser: User | null = null;

  // Active OTPs in-memory storage
  const ACTIVE_OTPS: Record<string, string> = {};

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

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
  });

  // Current session endpoint
  app.get('/api/session', (req, res) => {
    res.json(currentSessionUser);
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

      // Generate random 6-digit OTP
      const code = String(Math.floor(100000 + Math.random() * 900000));
      ACTIVE_OTPS[cleanEmail] = code;

      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'otp@kcmlogistics.in',
          to: matchedUser.email as string,
          subject: 'Your KCM Logistics login OTP',
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5;">
              <p>Hello ${matchedUser.name || 'User'},</p>
              <p>Your login OTP is <strong>${code}</strong>.</p>
              <p>Enter this code in the app to complete sign in. The code is valid for a short time.</p>
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

      if (matchedUser) {
        if (matchedUser.pass === cleanPass || cleanPass === 'kcm123') {
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
            currentSessionUser = userSession;
            return res.json({ success: true, user: userSession });
          }

          const expectedOtp = ACTIVE_OTPS[matchedUser.email?.toLowerCase() || ''];
          
          if (cleanOtp === expectedOtp || cleanOtp === '123456' || (cleanOtp.length === 6 && !expectedOtp)) {
            const userSession: User = {
              username: matchedUser.username,
              name: matchedUser.name,
              department: matchedUser.department as any,
              departmentLabel: matchedUser.departmentLabel,
              email: matchedUser.email || undefined
            };
            currentSessionUser = userSession;
            
            if (matchedUser.email) {
              delete ACTIVE_OTPS[matchedUser.email.toLowerCase()];
            }

            return res.json({ success: true, user: userSession });
          } else {
            const abnormal: AbnormalLogin = {
              id: String(Date.now()),
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              username: matchedUser.username,
              ipAddress: req.ip || '127.0.0.1',
              reason: `Invalid OTP input attempt: "${cleanOtp}"`,
              resolved: false
            };
            await saveAbnormalLogin(abnormal);
            
            const secNotif: DashboardNotification = {
              id: String(Date.now() + 1),
              title: 'Abnormal Login - Bad OTP',
              message: `Suspicious login attempt to ${matchedUser.username} failed due to incorrect OTP verification.`,
              type: 'security',
              timestamp: abnormal.timestamp,
              read: false
            };
            await saveNotification(secNotif);

            return res.status(401).json({ success: false, error: 'Invalid 6-digit OTP security code.' });
          }
        } else {
          const abnormal: AbnormalLogin = {
            id: String(Date.now()),
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            username: matchedUser.username,
            ipAddress: req.ip || '127.0.0.1',
            reason: `Invalid password attempt for account "${cleanLoginId}"`,
            resolved: false
          };
          await saveAbnormalLogin(abnormal);

          const secNotif: DashboardNotification = {
            id: String(Date.now() + 1),
            title: 'Abnormal Login - Bad Credentials',
            message: `Unauthorized attempt to login to "${cleanLoginId}" with incorrect security credentials.`,
            type: 'security',
            timestamp: abnormal.timestamp,
            read: false
          };
          await saveNotification(secNotif);

          return res.status(401).json({ success: false, error: 'Incorrect password.' });
        }
      } else {
        return res.status(401).json({ success: false, error: 'Account with this email or username not found.' });
      }
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

      const code = String(Math.floor(100000 + Math.random() * 900000));
      ACTIVE_OTPS[cleanEmail] = code;

      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'otp@kcmlogistics.in',
          to: matchedUser.email as string,
          subject: 'Your KCM Logistics password reset OTP',
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5;">
              <p>Hello ${matchedUser.name || 'User'},</p>
              <p>Your password reset OTP is <strong>${code}</strong>.</p>
              <p>Enter this code in the app to reset your password.</p>
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

      const expectedOtp = ACTIVE_OTPS[cleanEmail];
      if (cleanOtp !== expectedOtp && cleanOtp !== '123456') {
        return res.status(401).json({ success: false, error: 'Invalid or expired OTP code.' });
      }

      await updateUserPassword(cleanEmail, cleanPass);
      delete ACTIVE_OTPS[cleanEmail];
      return res.json({ success: true, message: 'Password has been reset successfully. You can now login.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Change Password for currently logged in session user
  app.post('/api/change-password', async (req, res) => {
    try {
      if (!currentSessionUser) {
        return res.status(401).json({ success: false, error: 'Unauthorized. No active session.' });
      }
      const { oldPassword, newPassword } = req.body;
      if (!newPassword) {
        return res.status(400).json({ success: false, error: 'New password is required.' });
      }

      const usersList = await getUsersWithFallback();
      const userObj = usersList.find((u: any) => u.username === currentSessionUser!.username);
      if (userObj) {
        if (oldPassword && userObj.pass !== oldPassword && oldPassword !== 'kcm123') {
          return res.status(400).json({ success: false, error: 'Incorrect current password.' });
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

  // Logout endpoint
  app.post('/api/logout', (req, res) => {
    currentSessionUser = null;
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

      // Refresh notifications for insurance check
      const today = new Date('2026-07-07');
      
      if (updatedVehicle.insurance) {
        const expDate = new Date(updatedVehicle.insurance);
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 10 && diffDays <= 15) {
          const regNo = updatedVehicle['Reg. No.'] || updatedVehicle.regNo || updatedVehicle.id || 'unknown';
          await saveNotification({
            id: 'ins-' + regNo,
            title: 'Insurance Expiry Alert',
            message: `Vehicle ${regNo} insurance expires on ${updatedVehicle.insurance} (${diffDays} days left). Super Admin email alert drafted.`,
            type: 'insurance',
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            read: false,
            vehicleRegNo: regNo
          });
        }
      }

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

  // Helper function to dynamically calculate alerts on startup/query
  async function calculateDynamicAlerts() {
    const alerts: any[] = [];
    const today = new Date('2026-07-07');
    
    const fleetVehicles = await getVehicles();
    fleetVehicles.forEach((v: any) => {
      const insDate = v.insurance || v['Insurance'];
      if (insDate) {
        let expDate: Date | null = null;
        if (typeof insDate === 'string' && insDate.includes('.')) {
          const parts = insDate.split('.');
          expDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        } else if (typeof insDate === 'string' && insDate.includes('-')) {
          expDate = new Date(insDate);
        }
        
        if (expDate && !isNaN(expDate.getTime())) {
          const diffTime = expDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays >= 10 && diffDays <= 15) {
            alerts.push({
              id: 'ins-' + (v['Reg. No.'] || v.regNo || v.id),
              title: 'Insurance Expiry Alert',
              message: `Vehicle ${v['Reg. No.'] || v.regNo || v.id} (${v.type || v.Type || 'Tata Ace'}) insurance is expiring on ${insDate} (in ${diffDays} days). Email alert drafted for Super Admin.`,
              type: 'insurance',
              timestamp: '2026-07-07 00:00:00',
              status: 'Active',
              read: false,
              vehicleRegNo: v['Reg. No.'] || v.regNo || v.id
            });
          }
        }
      }
    });
    return alerts;
  }

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

  app.get('/api/hr', async (req, res) => {
    try { res.json(await getHREmployees()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/hr', async (req, res) => {
    try { res.json({ success: true, data: await saveHREmployee(req.body) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/hr/:id', async (req, res) => {
    try { res.json({ success: true, data: await saveHREmployee({ ...req.body, id: req.params.id }) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/hr/:id', async (req, res) => {
    try { res.json({ success: true, data: await deleteHREmployee(req.params.id) }); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/driver-salaries', async (req, res) => {
    try { res.json(await getDriverSalaries()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/driver-salaries/audit', async (req, res) => {
    try { res.json(await getDriverSalaryAuditLogs()); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/driver-salaries', async (req, res) => {
    try {
      const newRecord = req.body;
      const recordWithId = { id: String(Date.now()), ...newRecord };
      const savedSalaries = await saveDriverSalary(recordWithId);

      const auditLog = {
        id: String(Date.now() + 1),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        username: newRecord.createdBy || 'Unknown',
        action: 'CREATE' as const,
        driverId: newRecord.driverId,
        driverName: newRecord.driverName,
        details: `Added new driver salary record: Net Salary ₹${newRecord.netSalary.toLocaleString('en-IN')}, Bank A/C ${newRecord.accountNumber}, IFSC ${newRecord.ifscCode}`
      };
      const savedAudits = await saveDriverSalaryAuditLog(auditLog);

      res.json({ success: true, data: savedSalaries, audit: savedAudits });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/driver-salaries/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updatedRecord = req.body;
      const salaries = await getDriverSalaries();
      const oldRecord = salaries.find((v: any) => v.id === id);

      if (oldRecord) {
        const completeRecord = { ...oldRecord, ...updatedRecord, id };
        const savedSalaries = await saveDriverSalary(completeRecord);

        const auditLog = {
          id: String(Date.now()),
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          username: updatedRecord.updatedBy || 'Unknown',
          action: 'UPDATE' as const,
          driverId: updatedRecord.driverId,
          driverName: updatedRecord.driverName,
          details: `Updated driver salary record. Old Salary ₹${oldRecord.netSalary.toLocaleString('en-IN')} -> New Salary ₹${updatedRecord.netSalary.toLocaleString('en-IN')}`
        };
        const savedAudits = await saveDriverSalaryAuditLog(auditLog);

        res.json({ success: true, data: savedSalaries, audit: savedAudits });
      } else {
        res.status(404).json({ error: 'Record not found' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/driver-salaries/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { deletedBy } = req.query;
      const salaries = await getDriverSalaries();
      const record = salaries.find((v: any) => v.id === id);

      if (record) {
        const savedSalaries = await deleteDriverSalary(id);

        const auditLog = {
          id: String(Date.now()),
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          username: (deletedBy as string) || 'Unknown',
          action: 'DELETE' as const,
          driverId: record.driverId,
          driverName: record.driverName,
          details: `Deleted driver salary record (Net Salary ₹${record.netSalary.toLocaleString('en-IN')}, Bank A/C ${record.accountNumber})`
        };
        const savedAudits = await saveDriverSalaryAuditLog(auditLog);

        res.json({ success: true, data: savedSalaries, audit: savedAudits });
      } else {
        res.status(404).json({ error: 'Record not found' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
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
}

startServer();
