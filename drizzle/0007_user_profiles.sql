CREATE TABLE "user_profiles" (
	"username" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
-- vehicle_incidents was already in schema.ts but missing from the 0006
-- snapshot (the table may already have been created outside the migration
-- history), so drizzle-kit re-emitted it here. IF NOT EXISTS keeps this a
-- no-op wherever the table already exists.
CREATE TABLE IF NOT EXISTS "vehicle_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"reg_no" text,
	"data" text NOT NULL
);
