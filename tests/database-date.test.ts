import { describe, expect, it } from "vitest";
import { parseDatabaseDate } from "@/lib/database-date";

describe("parseDatabaseDate", () => {
  it("normalizes PostgreSQL timestamp strings", () => {
    expect(
      parseDatabaseDate("2026-07-15 06:04:18.029792+00").toISOString(),
    ).toBe("2026-07-15T06:04:18.029Z");
  });

  it("preserves valid Date values", () => {
    const value = new Date("2026-07-15T00:00:00.000Z");
    expect(parseDatabaseDate(value)).toBe(value);
  });

  it("rejects invalid values", () => {
    expect(() => parseDatabaseDate("not-a-date")).toThrow(
      "Database returned an invalid date value",
    );
  });
});
