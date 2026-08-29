CREATE TABLE "vehicle_maintenance_reference" (
	"vehicle_no" text PRIMARY KEY NOT NULL,
	"responsible" text,
	"last_service_done_km" integer,
	"warranty_period" text,
	"service_period" integer,
	"updated_at" text
);
