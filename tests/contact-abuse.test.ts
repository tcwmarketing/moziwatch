import { describe, expect, it } from "vitest";
import {
  contactContentFingerprint,
  fingerprintDistance,
} from "@/lib/contact-abuse";

describe("contact template fingerprint", () => {
  it("recognizes near-identical long solicitation templates", () => {
    const first = contactContentFingerprint(
      "Your website is missing from many search results. We can improve visibility on Google, Bing, and AI platforms using SEO and optimization services. Please reply if you would like more information.",
    );
    const second = contactContentFingerprint(
      "Your website is missing from most search results. We can improve visibility on Google, Bing, and AI platforms using SEO and optimization services. Please respond if you would like more information.",
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(fingerprintDistance(first!, second!)).toBeLessThanOrEqual(16);
  });

  it("does not fingerprint very short ordinary questions", () => {
    expect(
      contactContentFingerprint("Is this campground open in May?"),
    ).toBeNull();
  });
});
