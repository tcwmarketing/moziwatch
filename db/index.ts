import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (typeof window !== "undefined")
  throw new Error("The database client can only be used on the server");

const globalForDb = globalThis as unknown as {
  postgresClient?: ReturnType<typeof postgres>;
};

function getClient() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured");
  const client =
    globalForDb.postgresClient ??
    postgres(process.env.DATABASE_URL, {
      max: process.env.NODE_ENV === "production" ? 10 : 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  if (process.env.NODE_ENV !== "production")
    globalForDb.postgresClient = client;
  return client;
}

export const sqlClient = getClient();
export const db = drizzle({ client: sqlClient, schema });
