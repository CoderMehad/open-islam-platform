CREATE TABLE "application_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" varchar(36),
	"level" varchar(10) NOT NULL,
	"message" varchar(1000) NOT NULL,
	"source" varchar(100) NOT NULL,
	"attributes" jsonb,
	"error_stack" text
);
--> statement-breakpoint
CREATE TABLE "request_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" varchar(36) NOT NULL,
	"method" varchar(10) NOT NULL,
	"path" varchar(255) NOT NULL,
	"status_code" smallint NOT NULL,
	"response_time" integer NOT NULL,
	"response_size" integer,
	"api_key_prefix" varchar(8),
	"user_agent" varchar(500),
	"client_ip" varchar(45),
	"route_matched" varchar(100)
);
--> statement-breakpoint
CREATE INDEX "application_logs_timestamp_idx" ON "application_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "application_logs_request_id_idx" ON "application_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "application_logs_level_idx" ON "application_logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "application_logs_source_idx" ON "application_logs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "application_logs_attributes_idx" ON "application_logs" USING gin ("attributes");--> statement-breakpoint
CREATE INDEX "request_logs_timestamp_idx" ON "request_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "request_logs_api_key_prefix_idx" ON "request_logs" USING btree ("api_key_prefix");--> statement-breakpoint
CREATE INDEX "request_logs_path_timestamp_idx" ON "request_logs" USING btree ("path","timestamp");--> statement-breakpoint
CREATE INDEX "request_logs_request_id_idx" ON "request_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_logs_status_code_idx" ON "request_logs" USING btree ("status_code");