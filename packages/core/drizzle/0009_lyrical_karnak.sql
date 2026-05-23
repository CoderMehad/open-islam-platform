CREATE TABLE "prayer_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mosque_id" uuid NOT NULL,
	"fajr_adhan" varchar(10) NOT NULL,
	"fajr_iqamah" varchar(10),
	"dhuhr_adhan" varchar(10) NOT NULL,
	"dhuhr_iqamah" varchar(10),
	"asr_adhan" varchar(10) NOT NULL,
	"asr_iqamah" varchar(10),
	"maghrib_adhan" varchar(10) NOT NULL,
	"maghrib_iqamah" varchar(10),
	"isha_adhan" varchar(10) NOT NULL,
	"isha_iqamah" varchar(10),
	"jummah_times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prayer_schedules_mosque_id_unique" UNIQUE("mosque_id")
);
--> statement-breakpoint
ALTER TABLE "prayer_schedules" ADD CONSTRAINT "prayer_schedules_mosque_id_mosques_id_fk" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE cascade ON UPDATE no action;