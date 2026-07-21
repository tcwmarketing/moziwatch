CREATE TABLE "campground_weather_cache" (
	"campground_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(80),
	"forecast" jsonb,
	"fetched_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"refresh_started_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campground_weather_cache" ADD CONSTRAINT "campground_weather_cache_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;