import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DIRECT_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://moziwatch:moziwatch@localhost:5432/moziwatch",
  },
});
