CREATE TABLE "abnormal_logins" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_salaries" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_salary_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_employees" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mileage_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petty_cash_vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"department_label" text NOT NULL,
	"email" text,
	"pass" text,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"reg_no" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
