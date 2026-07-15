import { describe, expect, it } from "vitest";
import { toPostgresJson } from "@/lib/postgres-json";

describe("Postgres JSON serialization", () => {
  it("returns a JSON string instead of a driver object parameter", () => {
    expect(toPostgresJson({ version: "beta-v1", active: true })).toBe(
      '{"version":"beta-v1","active":true}',
    );
  });

  it("rejects values that JSON cannot represent", () => {
    expect(() => toPostgresJson(undefined)).toThrow(TypeError);
  });
});
