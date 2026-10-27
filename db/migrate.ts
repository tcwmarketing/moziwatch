import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";
import { maintenanceDatabaseUrl } from "./maintenance-url";
import { assertDataApiSecurity } from "./data-api-security";

const url = maintenanceDatabaseUrl();
const migrationClient = postgres(url, { max: 1, prepare: false });
const migrationDb = drizzle({ client: migrationClient, schema });
try {
  await migrationClient`SET lock_timeout = '5s'`;
  await migrationClient`CREATE SCHEMA IF NOT EXISTS extensions`;
  await migrationClient`CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions`;
  await migrationClient`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions`;
  await migrate(migrationDb, { migrationsFolder: "./drizzle" });
  await assertDataApiSecurity(migrationClient);
  console.log("Database migrations and Data API security checks complete.");
} finally {
  await migrationClient.end();
}
