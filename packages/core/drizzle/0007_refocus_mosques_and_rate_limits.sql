ALTER TABLE "mosques"
ADD COLUMN IF NOT EXISTS "source" varchar(100) DEFAULT 'manual' NOT NULL,
ADD COLUMN IF NOT EXISTS "source_id" varchar(255),
ADD COLUMN IF NOT EXISTS "claim_status" text DEFAULT 'unclaimed' NOT NULL,
ADD COLUMN IF NOT EXISTS "claimed_by" uuid,
ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mosques_source_idx" ON "mosques" USING btree ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mosques_claim_status_idx" ON "mosques" USING btree ("claim_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mosque_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mosque_id" uuid NOT NULL,
	"source" varchar(100) NOT NULL,
	"source_id" varchar(255) NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mosque_sources_source_source_id_idx" UNIQUE("source","source_id")
);
--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "mosque_sources" ADD CONSTRAINT "mosque_sources_mosque_id_mosques_id_fk" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mosque_sources_mosque_id_idx" ON "mosque_sources" USING btree ("mosque_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mosque_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mosque_id" uuid NOT NULL,
	"claim_status" text DEFAULT 'unclaimed' NOT NULL,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "mosque_claims" ADD CONSTRAINT "mosque_claims_mosque_id_mosques_id_fk" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF to_regclass('public.admins') IS NOT NULL THEN
		ALTER TABLE "mosque_claims" ADD CONSTRAINT "mosque_claims_claimed_by_admins_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
	END IF;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mosque_claims_mosque_id_idx" ON "mosque_claims" USING btree ("mosque_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mosque_claims_claim_status_idx" ON "mosque_claims" USING btree ("claim_status");
--> statement-breakpoint
ALTER TABLE "prayer_times"
ADD COLUMN "fajr_adhan" varchar(10),
ADD COLUMN "fajr_iqamah" varchar(10),
ADD COLUMN "dhuhr_adhan" varchar(10),
ADD COLUMN "dhuhr_iqamah" varchar(10),
ADD COLUMN "asr_adhan" varchar(10),
ADD COLUMN "asr_iqamah" varchar(10),
ADD COLUMN "maghrib_adhan" varchar(10),
ADD COLUMN "maghrib_iqamah" varchar(10),
ADD COLUMN "isha_adhan" varchar(10),
ADD COLUMN "isha_iqamah" varchar(10),
ADD COLUMN "jummah_adhan" varchar(10),
ADD COLUMN "jummah_iqamah" varchar(10);
--> statement-breakpoint
UPDATE "prayer_times"
SET
	"fajr_adhan" = "fajr",
	"dhuhr_adhan" = "dhuhr",
	"asr_adhan" = "asr",
	"maghrib_adhan" = "maghrib",
	"isha_adhan" = "isha",
	"jummah_adhan" = "jummah";
--> statement-breakpoint
ALTER TABLE "prayer_times"
ALTER COLUMN "fajr_adhan" SET NOT NULL,
ALTER COLUMN "dhuhr_adhan" SET NOT NULL,
ALTER COLUMN "asr_adhan" SET NOT NULL,
ALTER COLUMN "maghrib_adhan" SET NOT NULL,
ALTER COLUMN "isha_adhan" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "prayer_times"
DROP COLUMN "fajr",
DROP COLUMN "dhuhr",
DROP COLUMN "asr",
DROP COLUMN "maghrib",
DROP COLUMN "isha",
DROP COLUMN "jummah";
