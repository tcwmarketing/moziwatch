import { describe, expect, it } from "vitest";
import { reviewSubmissionContent } from "@/lib/spam-review";

describe("submission spam review", () => {
  it("routes ordinary URLs and deliberately obfuscated URLs to review", () => {
    expect(
      reviewSubmissionContent("See https://spam.example/offer").reasons,
    ).toContain("contains-url");
    expect(
      reviewSubmissionContent("Visit cheap-traffic [dot] xyz today").reasons,
    ).toContain("contains-url");
  });

  it("matches restricted phrases without relying on letter case", () => {
    const result = reviewSubmissionContent(
      "We offer a GUEST POST and a backlink service.",
    );
    expect(result.isSpam).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "restricted:guest post",
        "restricted:backlink service",
      ]),
    );
  });

  it("does not flag an ordinary campground report", () => {
    expect(
      reviewSubmissionContent(
        "Moderate mosquitoes after sunset near the marsh. Repellent helped.",
      ),
    ).toEqual({ isSpam: false, reasons: [] });
  });

  it("does not reject an empty optional report comment", () => {
    expect(reviewSubmissionContent("")).toEqual({
      isSpam: false,
      reasons: [],
    });
  });
});
