import { describe, expect, it } from "vitest";
import { maintenanceDatabaseUrl } from "@/db/maintenance-url";

describe("maintenanceDatabaseUrl", () => {
  it("prefers an explicitly configured direct connection", () => {
    expect(
      maintenanceDatabaseUrl({
        DATABASE_URL: "postgresql://app:secret@pool.example:6543/postgres",
        DIRECT_DATABASE_URL:
          "postgresql://app:secret@direct.example:5432/postgres",
      }),
    ).toBe("postgresql://app:secret@direct.example:5432/postgres");
  });

  it("uses the Supabase session pooler for maintenance when only the transaction pooler is configured", () => {
    expect(
      maintenanceDatabaseUrl({
        DATABASE_URL:
          "postgresql://postgres.project:secret@aws-1-us-west-2.pooler.supabase.com:6543/postgres",
      }),
    ).toBe(
      "postgresql://postgres.project:secret@aws-1-us-west-2.pooler.supabase.com:5432/postgres",
    );
  });

  it("does not rewrite non-Supabase database URLs", () => {
    const url = "postgresql://app:secret@localhost:6543/moziwatch";
    expect(maintenanceDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });
});
