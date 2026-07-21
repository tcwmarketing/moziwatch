import "server-only";
import { sqlClient } from "@/db";

export async function recordForecastInterest(campgroundId: string) {
  await sqlClient.begin(async (tx) => {
    await tx`
      INSERT INTO campground_forecast_interest_daily (
        campground_id, activity_date, detail_views, forecast_requests
      ) VALUES (${campgroundId}::uuid, CURRENT_DATE, 1, 1)
      ON CONFLICT (campground_id, activity_date) DO UPDATE SET
        detail_views = campground_forecast_interest_daily.detail_views + 1,
        forecast_requests = campground_forecast_interest_daily.forecast_requests + 1,
        updated_at = now()
    `;
    await tx`
      UPDATE campground_forecast_schedules SET
        last_requested_at = now(),
        daily_until = greatest(coalesce(daily_until, now()), now() + interval '7 days'),
        next_refresh_at = CASE
          WHEN last_forecast_at IS NULL OR last_forecast_at < now() - interval '24 hours'
            THEN now()
          ELSE next_refresh_at
        END,
        updated_at = now()
      WHERE campground_id = ${campgroundId}::uuid
    `;
  });
}
