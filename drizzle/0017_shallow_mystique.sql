ALTER TABLE "donations" DROP CONSTRAINT "donations_amount_check";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "home_city" varchar(120);--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_amount_check" CHECK ("donations"."amount_minor" BETWEEN 100 AND 50000);