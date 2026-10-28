import { describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { assertDisposableTestDatabase } from "@/lib/test-database";
import { maintenanceDatabaseUrl } from "@/db/maintenance-url";
import { deleteExpiredForecastRun } from "@/worker/maintenance-batches";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "paced forecast-run retention",
  () => {
    it("drains only the selected run in bounded statements before removing its parent", async () => {
      const client = postgres(
        maintenanceDatabaseUrl({
          DATABASE_URL: assertDisposableTestDatabase(),
        }),
        { max: 1, prepare: false },
      );
      const rollback = new Error("rollback retention fixture");
      try {
        await expect(
          client.begin(async (tx) => {
            const [model] = await tx<{ id: string }[]>`
          INSERT INTO forecast_models (version, model_kind, artifact, evaluation, model_created_at)
          VALUES (${`retention-test-${Date.now()}`}, 'test', '{}', '{}', now()) RETURNING id
        `;
            const runs = await tx<{ id: string }[]>`
          INSERT INTO forecast_runs (model_id, forecast_date)
          VALUES (${model.id}::uuid, CURRENT_DATE), (${model.id}::uuid, CURRENT_DATE - interval '1 day') RETURNING id
        `;
            for (const run of runs)
              await tx`
          INSERT INTO weather_observations (run_id,cell_key,latitude,longitude,observed_for,provider,variables,raw_payload)
          SELECT ${run.id}::uuid, 'fixture-' || n, 49, -119, now(), 'fixture', '{}', '{}'
          FROM generate_series(1,27) n
        `;
            const wait = vi.fn().mockResolvedValue(undefined);
            const removed = await deleteExpiredForecastRun(
              tx as unknown as postgres.Sql,
              runs[0].id,
              { size: 10, delayMs: 1000 },
              wait,
            );
            expect(removed).toBe(27);
            expect(wait).toHaveBeenCalledTimes(2);
            expect(
              await tx`SELECT id FROM forecast_runs WHERE id = ${runs[0].id}::uuid`,
            ).toHaveLength(0);
            expect(
              await tx`SELECT id FROM weather_observations WHERE run_id = ${runs[1].id}::uuid`,
            ).toHaveLength(27);
            throw rollback;
          }),
        ).rejects.toBe(rollback);
      } finally {
        await client.end();
      }
    });
  },
);
