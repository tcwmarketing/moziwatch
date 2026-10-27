import { describe, expect, it } from "vitest";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

describe("application schema security", () => {
  it("declares RLS on every application table, including future additions", () => {
    const tables = Object.values(schema).filter((value) => is(value, PgTable));
    expect(tables.length).toBeGreaterThan(0);
    const missing = tables
      .map((table) => getTableConfig(table))
      .filter((table) => !table.enableRLS)
      .map((table) => table.name);
    expect(missing).toEqual([]);
  });
});
