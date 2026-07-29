import { sqlClient } from "@/db";
import { syncForecastSchedules } from "./forecast-schedule";

try {
  const campgroundCount = await syncForecastSchedules();
  console.log(
    `Synchronized forecast cadence and priority for ${campgroundCount} profiled campgrounds.`,
  );
} finally {
  await sqlClient.end();
}
