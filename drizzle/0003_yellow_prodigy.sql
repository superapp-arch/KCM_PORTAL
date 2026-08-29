CREATE TABLE "diesel_bunk_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"bunk_name" text,
	"data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diesel_bunk_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"bunk_id" text,
	"data" text NOT NULL
);
