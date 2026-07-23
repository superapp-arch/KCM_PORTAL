import { pgTable, serial, text } from 'drizzle-orm/pg-core';

// Users table for application authentication and authorization
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  department: text('department').notNull(),
  departmentLabel: text('department_label').notNull(),
  email: text('email'),
  pass: text('pass'),
});

// Vehicles table
export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  regNo: text('reg_no'),
  data: text('data').notNull(), // JSON string representing the full Vehicle object
});

// Fuel logs table
export const fuelLogs = pgTable('fuel_logs', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full FuelLog object
});

// Billing invoices table
export const billingInvoices = pgTable('billing_invoices', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full BillingInvoice object
});

// Petty cash vouchers table
export const pettyCashVouchers = pgTable('petty_cash_vouchers', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full PettyCashVoucher object
});

// Maintenance records table
export const maintenanceRecords = pgTable('maintenance_records', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full MaintenanceRecord object
});

// Accounts entries table
export const accountsEntries = pgTable('accounts_entries', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full AccountsEntry object
});

// Staff employees table (Employee Master)
export const staffEmployees = pgTable('staff_employees', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full StaffEmployee object
});

// Staff salary detail table (CTC + advance)
export const staffSalaryDetails = pgTable('staff_salary_details', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffSalaryDetail object
});

// Staff salary hikes table (one row per hike cycle, rather than a new column per cycle)
export const staffSalaryHikes = pgTable('staff_salary_hikes', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffSalaryHike object
});

// Staff advance deductions table (one row per monthly deduction against an advance)
export const staffAdvanceDeductions = pgTable('staff_advance_deductions', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffAdvanceDeduction object
});

// Staff provident fund / monthly payroll breakdown table
export const staffProvidentFund = pgTable('staff_provident_fund', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffProvidentFund object
});

// Staff attendance adjustments table (manual LOP override per emp/month)
export const staffAttendanceAdjustments = pgTable('staff_attendance_adjustments', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffAttendanceAdjustment object
});

// Staff bank detail table
export const staffBankDetails = pgTable('staff_bank_details', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffBankDetail object
});

// Staff attendance table
export const staffAttendance = pgTable('staff_attendance', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffAttendance object
});

// Staff holiday calendar table
export const staffHolidays = pgTable('staff_holidays', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full StaffHoliday object
});

// Abnormal logins audit log table
export const abnormalLogins = pgTable('abnormal_logins', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full AbnormalLogin object
});

// Dashboard notifications table
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full DashboardNotification object
});

// Warehouse details/entries table
export const warehouseEntries = pgTable('warehouse_entries', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full WarehouseEntry object
});

// Mileage Reports table
export const mileageReports = pgTable('mileage_reports', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full MileageReport object
});


