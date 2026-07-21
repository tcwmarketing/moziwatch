import cron from "node-cron";
import { spawn } from "node:child_process";

const weekly = process.env.LOCATION_REFRESH_CRON || "0 7 * * 1";
const monthly = process.env.LOCATION_MONTHLY_CRON || "0 8 1 * *";
if (!cron.validate(weekly)) throw new Error("LOCATION_REFRESH_CRON is invalid");
if (!cron.validate(monthly))
  throw new Error("LOCATION_MONTHLY_CRON is invalid");

let running = false;
function run(command: "weekly" | "monthly") {
  if (running) {
    console.warn(
      JSON.stringify({
        event: "location_refresh_skipped",
        reason: "already_running",
      }),
    );
    return;
  }
  running = true;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "worker/locations/cli.ts", command],
    { stdio: "inherit", env: process.env },
  );
  child.on("exit", (code) => {
    running = false;
    if (code)
      console.error(
        JSON.stringify({ event: "location_refresh_failed", command, code }),
      );
  });
}

cron.schedule(weekly, () => run("weekly"), { timezone: "UTC" });
cron.schedule(monthly, () => run("monthly"), { timezone: "UTC" });
console.log(
  JSON.stringify({
    event: "location_scheduler_active",
    weekly,
    monthly,
    timezone: "UTC",
  }),
);
