CREATE TABLE "audit_logs" (
    "id" text PRIMARY KEY NOT NULL,
    "created_at" text NOT NULL,
    "user_id" text,
    "user_name" text,
    "user_role" text,
    "action" text NOT NULL,
    "module" text NOT NULL,
    "entity_type" text,
    "entity_id" text,
    "description" text NOT NULL,
    "old_data" text,
    "new_data" text,
    "ip_address" text,
    "user_agent" text
);
--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "audit_logs_module_idx" ON "audit_logs" USING btree ("module");
--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");