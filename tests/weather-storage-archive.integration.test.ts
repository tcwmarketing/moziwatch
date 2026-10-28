import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename, dirname, resolve } from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { assertDisposableTestDatabase } from "@/lib/test-database";
import { maintenanceDatabaseUrl } from "@/db/maintenance-url";
import {
  backupWeather,
  compactWeatherFromArchive,
} from "@/worker/weather-storage-archive";

describe.skipIf(
  !process.env.TEST_DATABASE_URL ||
    process.env.WEATHER_STORAGE_RECOVERY_TEST !== "true",
)("weather archive recovery", () => {
  it("preserves every weather value and ID through backup, compaction and resumable restoration", async () => {
    const client = postgres(
      maintenanceDatabaseUrl({
        DATABASE_URL: assertDisposableTestDatabase(),
      }),
      { max: 1, prepare: false },
    );
    const session = await client.reserve();
    const directory = await mkdtemp(join(tmpdir(), "weather-storage-test-"));
    const path = join(directory, "weather-backup.jsonl.gz");
    let modelId: string | undefined;
    try {
      const [initial] =
        await session`SELECT count(*)::int AS rows FROM weather_observations`;
      if (initial.rows !== 0)
        throw new Error(
          "Run recovery test alone with an empty disposable weather table",
        );
      const [model] = await session`
        INSERT INTO forecast_models (version,model_kind,artifact,evaluation,model_created_at)
        VALUES (${`weather-recovery-test-${Date.now()}`},'test','{}','{}',now()) RETURNING id
      `;
      modelId = model.id;
      const [run] =
        await session`INSERT INTO forecast_runs (model_id,forecast_date) VALUES (${modelId!}::uuid,now()) RETURNING id`;
      await session`
        INSERT INTO weather_observations (run_id,cell_key,latitude,longitude,observed_for,provider,variables,raw_payload)
        SELECT ${run.id}::uuid,'fixture-' || n,49.25,-119.75,now(),'fixture',
          '{"temperature":-1.20,"rain":null}', '{"series":[1.20,-2.50,null],"units":"°C","note":"line\\nbreak"}'
        FROM generate_series(1,7) n
      `;
      const archive = await backupWeather(session, path);
      expect(archive.rows).toBe(7);
      expect(await compactWeatherFromArchive(session, path)).toEqual({
        rowsRestored: 7,
        allRowChecksumsMatch: true,
      });
      expect(await compactWeatherFromArchive(session, path, true)).toEqual({
        rowsRestored: 7,
        allRowChecksumsMatch: true,
      });
      const [security] =
        await session`SELECT relrowsecurity AS rls FROM pg_class WHERE oid='public.weather_observations'::regclass`;
      expect(security.rls).toBe(true);
      await session`UPDATE weather_observations SET provider='changed' WHERE run_id=${run.id}::uuid`;
      await expect(compactWeatherFromArchive(session, path)).rejects.toThrow(
        "Weather changed since backup",
      );
      const [unchanged] =
        await session`SELECT count(*)::int AS rows FROM weather_observations WHERE provider='changed'`;
      expect(unchanged.rows).toBe(7);
    } finally {
      if (modelId) {
        await session`DELETE FROM forecast_runs WHERE model_id=${modelId}::uuid`;
        await session`DELETE FROM forecast_models WHERE id=${modelId}::uuid`;
      }
      session.release();
      await client.end();
      if (
        resolve(dirname(directory)) !== resolve(tmpdir()) ||
        !basename(directory).startsWith("weather-storage-test-")
      )
        throw new Error("Unexpected test cleanup path");
      await rm(directory, { recursive: true, force: true });
    }
  });
});
