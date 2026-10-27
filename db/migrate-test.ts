import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { assertDisposableTestDatabase } from "@/lib/test-database";
import * as schema from "./schema";
import { assertDataApiSecurity } from "./data-api-security";
import { maintenanceDatabaseUrl } from "./maintenance-url";

const client = postgres(
  maintenanceDatabaseUrl({ DATABASE_URL: assertDisposableTestDatabase() }),
  {
    max: 1,
    prepare: false,
  },
);
const database = drizzle({ client, schema });
try {
  await client`SET lock_timeout = '5s'`;
  await client`CREATE SCHEMA IF NOT EXISTS extensions`;
  await client`CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions`;
  await client`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions`;
  await migrate(database, { migrationsFolder: "./drizzle" });
  await assertDataApiSecurity(client);
  console.log(
    "Dedicated test database migrations and security checks complete.",
  );
} finally {
  await client.end();
}
