import postgres from "postgres";
import { auditDataApiSecurity } from "@/db/data-api-security";
import { maintenanceDatabaseUrl } from "@/db/maintenance-url";
import { assertDisposableTestDatabase } from "@/lib/test-database";

const url = process.argv.includes("--test")
  ? maintenanceDatabaseUrl({ DATABASE_URL: assertDisposableTestDatabase() })
  : maintenanceDatabaseUrl();
const client = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
try {
  await client`SET statement_timeout = '15s'`;
  const audit = await auditDataApiSecurity(client);
  console.log(
    JSON.stringify(
      {
        target: process.argv.includes("--test") ? "test" : "application",
        checkedAt: new Date().toISOString(),
        ...audit,
      },
      null,
      2,
    ),
  );
  if (audit.issues.length) process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
