CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkout_session_id" varchar(255) NOT NULL,
	"payment_intent_id" varchar(255),
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"donor_email" varchar(320),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donations_checkout_session_id_unique" UNIQUE("checkout_session_id"),
	CONSTRAINT "donations_amount_check" CHECK ("donations"."amount_minor" BETWEEN 200 AND 50000)
);
--> statement-breakpoint
ALTER TABLE "campground_aggregates" ADD COLUMN "report_summary_phrases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "campground_aggregates" ADD COLUMN "report_summary_report_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campground_aggregates" ADD COLUMN "report_summary_generated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "donations_status_created_idx" ON "donations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "donations_payment_intent_idx" ON "donations" USING btree ("payment_intent_id");
