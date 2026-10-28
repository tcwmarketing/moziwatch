import type { Sql } from "postgres";

type BatchOptions = { size: number; delayMs: number };

export function maintenanceBatchOptions(
  environment: Partial<NodeJS.ProcessEnv> = process.env,
): BatchOptions {
  const number = (value: string | undefined, fallback: number) =>
    Number.isFinite(Number(value)) && Number(value) > 0
      ? Number(value)
      : fallback;
  return {
    size: Math.max(
      1,
      Math.min(
        500,
        Math.floor(number(environment.FORECAST_CLEANUP_BATCH_SIZE, 100)),
      ),
    ),
    delayMs: Math.max(
      250,
      Math.min(
        10_000,
        number(environment.FORECAST_CLEANUP_BATCH_DELAY_MS, 1_000),
      ),
    ),
  };
}

/** Each callback is one committed statement, allowing WAL recycling between batches. */
export async function runMaintenanceBatches(
  execute: (limit: number) => Promise<{ count: number }>,
  options = maintenanceBatchOptions(),
  wait = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
) {
  let total = 0;
  for (;;) {
    const result = await execute(options.size);
    total += result.count;
    if (result.count < options.size) return total;
    await wait(options.delayMs);
  }
}

export async function deleteExpiredForecastRun(
  client: Sql,
  runId: string,
  options = maintenanceBatchOptions(),
  wait?: (milliseconds: number) => Promise<void>,
) {
  let removedRows = 0;
  for (const table of [
    "campground_forecasts",
    "campground_monthly_outlooks",
    "campground_weather_observations",
    "weather_observations",
    "forecast_job_logs",
  ] as const) {
    removedRows += await runMaintenanceBatches(
      (limit) =>
        client.unsafe(
          `DELETE FROM public.${table} WHERE ctid IN (SELECT ctid FROM public.${table} WHERE run_id = $1::uuid LIMIT $2)`,
          [runId, limit],
        ),
      options,
      wait,
    );
  }
  await client`DELETE FROM forecast_runs WHERE id = ${runId}::uuid`;
  return removedRows;
}
