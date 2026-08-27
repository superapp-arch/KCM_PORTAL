CREATE TABLE "service_station_inspections" (
        "id" text PRIMARY KEY NOT NULL,
        "reg_no" text,
        "data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_station_spare_parts" (
        "id" text PRIMARY KEY NOT NULL,
        "reg_no" text,
        "data" text NOT NULL
);
