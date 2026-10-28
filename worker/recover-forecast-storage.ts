import postgres from "postgres";
import { maintenanceDatabaseUrl } from "@/db/maintenance-url";

// An explicit, one-time operation. Never called by the forecast or scheduler.
const apply = process.argv.includes("--apply");
const client = postgres(maintenanceDatabaseUrl(), {
  max: 1,
  prepare: false,
  connect_timeout: 15,
});
const session = await client.reserve();
try {
  const [before] = await session`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size,
      pg_size_pretty(pg_total_relation_size('public.weather_observations')) AS weather_size,
      current_setting('default_transaction_read_only') AS read_only,
      pg_is_in_recovery() AS replica
  `;
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          apply,
          before,
          operation: "VACUUM FULL weather_observations; retain every row",
          lockTimeout: "3 seconds",
          statementTimeout: "180 seconds",
          approvalRequired:
            "Temporarily takes an exclusive lock on the raw-weather table and enables writes for this maintenance session only.",
        },
        null,
        2,
      ),
    );
  } else {
    if (before.replica)
      throw new Error("Refusing storage recovery on a read replica");
    await session`SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE`;
    await session`SET lock_timeout = '3s'`;
    await session`SET statement_timeout = '180s'`;
    await session.unsafe("VACUUM (FULL, ANALYZE) public.weather_observations");
    const [after] = await session`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size,
        pg_size_pretty(pg_total_relation_size('public.weather_observations')) AS weather_size
    `;
    console.log(
      JSON.stringify({ apply, before, after, deletedRows: 0 }, null, 2),
    );
  }
} finally {
  // Do not leave READ WRITE state behind on a pooled maintenance connection.
  try {
    await session`RESET default_transaction_read_only`;
  } finally {
    session.release();
    await client.end();
  }
}
