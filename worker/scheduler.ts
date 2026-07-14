import cron from "node-cron";
import { spawn } from "node:child_process";

const schedule = process.env.FORECAST_CRON || "15 5 * * *";
if (!cron.validate(schedule)) throw new Error("FORECAST_CRON is invalid");
let running = false;

cron.schedule(
  schedule,
  () => {
    if (running)
      return console.warn(
        "Forecast run skipped because the previous run is still active",
      );
    running = true;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "worker/run-forecast.ts"],
      { stdio: "inherit", env: process.env },
    );
    child.on("exit", () => {
      running = false;
    });
  },
  { timezone: "UTC" },
);

console.log(`Forecast scheduler active: ${schedule} UTC`);
