import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";
import { maintenanceDatabaseUrl } from "./maintenance-url";

const url = maintenanceDatabaseUrl();
const migrationClient = postgres(url, { max: 1, prepare: false });
const migrationDb = drizzle({ client: migrationClient, schema });
await migrationClient`CREATE SCHEMA IF NOT EXISTS extensions`;
await migrationClient`CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions`;
await migrationClient`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions`;
await migrate(migrationDb, { migrationsFolder: "./drizzle" });
await migrationClient.end();
console.log("Database migrations complete.");
