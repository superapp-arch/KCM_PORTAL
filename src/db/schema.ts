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

// HR Employees table
export const hrEmployees = pgTable('hr_employees', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full HREmployee object
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

// Driver salaries table
export const driverSalaries = pgTable('driver_salaries', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full DriverSalary object
});

// Driver salary audit logs table
export const driverSalaryAuditLogs = pgTable('driver_salary_audit_logs', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // JSON string representing the full DriverSalaryAuditLog object
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


