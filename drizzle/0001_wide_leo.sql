CREATE INDEX "admin_audit_logs_actor_idx" ON "admin_audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "campground_imports_actor_idx" ON "campground_imports" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "forecast_job_logs_run_idx" ON "forecast_job_logs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "report_audit_report_idx" ON "report_audit" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_audit_actor_idx" ON "report_audit" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "saved_campgrounds_campground_idx" ON "saved_campgrounds" USING btree ("campground_id");