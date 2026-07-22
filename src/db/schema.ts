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

// Staff salary structure table
export const staffSalaryStructures = pgTable('staff_salary_structures', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffSalaryStructure object
});

// Staff salary deductions table
export const staffSalaryDeductions = pgTable('staff_salary_deductions', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffSalaryDeduction object
});

// Staff salary history table (processed/paid salary runs)
export const staffSalaryHistory = pgTable('staff_salary_history', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffSalaryHistory object
});

// Staff attendance table
export const staffAttendance = pgTable('staff_attendance', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffAttendance object
});

// Staff leave balances table
export const staffLeaveBalances = pgTable('staff_leave_balances', {
  id: text('id').primaryKey(),
  empId: text('emp_id'),
  data: text('data').notNull(), // JSON string representing the full StaffLeaveBalance object
});

// Staff holiday calendar table
export const staffHolidays = pgTable('staff_holidays', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full StaffHoliday object
});

// Staff module settings table (singleton row, id = 'default')
export const staffSettings = pgTable('staff_settings', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full StaffSettings object
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


