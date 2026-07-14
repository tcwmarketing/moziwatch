import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { assertDisposableTestDatabase } from "@/lib/test-database";
import * as schema from "./schema";

const client = postgres(assertDisposableTestDatabase(), {
  max: 1,
  prepare: false,
});
const database = drizzle({ client, schema });
await client`CREATE SCHEMA IF NOT EXISTS extensions`;
await client`CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions`;
await migrate(database, { migrationsFolder: "./drizzle" });
await client.end();
console.log("Dedicated test database migrations complete.");
