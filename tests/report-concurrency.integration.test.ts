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
    const campgroundIds = [campground[0].id];
    const input = {
      campgroundId: campground[0].id,
      rating: 3,
      comment: null,
      accountId: null,
      anonymousTokenHash: `token-${Date.now()}`,
      ipHash: `ip-${Date.now()}`,
      observedOn: "2025-01-15",
    };
    try {
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
      const aggregates = await sqlClient<
        { recent_count: number; historical_count: number }[]
      >`
        SELECT recent_count, historical_count FROM campground_aggregates
        WHERE campground_id = ${campground[0].id}::uuid
      `;
      expect(aggregates[0]).toMatchObject({
        recent_count: 0,
        historical_count: 1,
      });

      const spamCampground = await sqlClient<{ id: string }[]>`
        INSERT INTO campgrounds (
          name, slug, address, city, region, country, postal_code,
          latitude, longitude
        ) VALUES (
          'Spam Review Test', ${`spam-review-${Date.now()}`}, '2 Test',
          'Test', 'Ontario', 'CA', 'K0K0K0', 45.1, -75.1
        ) RETURNING id
      `;
      campgroundIds.push(spamCampground[0].id);
      const spamReport = await createReport({
        ...input,
        campgroundId: spamCampground[0].id,
        anonymousTokenHash: `spam-token-${Date.now()}`,
        ipHash: `spam-ip-${Date.now()}`,
        comment: "See https://spam.example for a backlink service.",
      });
      const reviewed = await sqlClient<
        { moderation_status: string; spam_reasons: string[] }[]
      >`
        SELECT moderation_status, spam_reasons
        FROM reports WHERE id = ${spamReport.id}::uuid
      `;
      expect(reviewed[0].moderation_status).toBe("spam");
      expect(reviewed[0].spam_reasons).toEqual(
        expect.arrayContaining(["contains-url", "restricted:backlink service"]),
      );
      const spamAggregates = await sqlClient<{ historical_count: number }[]>`
        SELECT historical_count FROM campground_aggregates
        WHERE campground_id = ${spamCampground[0].id}::uuid
      `;
      expect(spamAggregates[0].historical_count).toBe(0);
    } finally {
      await sqlClient.begin(async (tx) => {
        await tx`DELETE FROM reports WHERE campground_id = ANY(${campgroundIds}::uuid[])`;
        await tx`DELETE FROM campground_aggregates WHERE campground_id = ANY(${campgroundIds}::uuid[])`;
        await tx`DELETE FROM campgrounds WHERE id = ANY(${campgroundIds}::uuid[])`;
      });
      await sqlClient.end();
    }
  });
});
