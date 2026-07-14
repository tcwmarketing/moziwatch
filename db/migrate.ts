import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DIRECT_DATABASE_URL or DATABASE_URL is required");
const migrationClient = postgres(url, { max: 1, prepare: false });
const migrationDb = drizzle({ client: migrationClient, schema });
await migrationClient`CREATE SCHEMA IF NOT EXISTS extensions`;
await migrationClient`CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions`;
await migrate(migrationDb, { migrationsFolder: "./drizzle" });
await migrationClient.end();
console.log("Database migrations complete.");
