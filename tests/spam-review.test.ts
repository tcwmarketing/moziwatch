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

  it("routes a multi-signal search-ranking solicitation to spam", () => {
    const result = reviewSubmissionContent(
      "Your website was not showing up in Google, Yahoo, or Bing search results. We provide SEO, AEO, and GEO services for Squarespace, Shopify, Wix, WordPress, and GoDaddy websites.",
    );
    expect(result.isSpam).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "solicitation:search-visibility-pitch",
        "solicitation:optimization-acronyms",
        "solicitation:website-platform-list",
      ]),
    );
  });

  it("does not treat a request for contact details as spam by itself", () => {
    expect(
      reviewSubmissionContent(
        "Could you send me the correct name, phone number, and email for the campground manager?",
      ),
    ).toEqual({ isSpam: false, reasons: [] });
  });
});
