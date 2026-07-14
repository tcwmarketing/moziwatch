import { describe, expect, it } from "vitest";
import { assertDisposableTestDatabase } from "@/lib/test-database";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
describe.skipIf(!enabled)("database duplicate concurrency", () => {
  it("serializes concurrent matching reports so only one succeeds", async () => {
    process.env.DATABASE_URL = assertDisposableTestDatabase();
    const { sqlClient } = await import("@/db");
    const { createReport, DuplicateReportError } =
      await import("@/lib/reports");
    const campground = await sqlClient<
      { id: string }[]
    >`INSERT INTO campgrounds (name, slug, address, city, region, country, postal_code, latitude, longitude) VALUES ('Concurrency Test', ${`concurrency-${Date.now()}`}, '1 Test', 'Test', 'Ontario', 'CA', 'K0K0K0', 45, -75) RETURNING id`;
    const input = {
      campgroundId: campground[0].id,
      rating: 3,
      comment: null,
      accountId: null,
      anonymousTokenHash: `token-${Date.now()}`,
      ipHash: `ip-${Date.now()}`,
    };
    const results = await Promise.allSettled([
      createReport(input),
      createReport(input),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(DuplicateReportError);
    await sqlClient`DELETE FROM campgrounds WHERE id = ${campground[0].id}::uuid`;
    await sqlClient.end();
  });
});
