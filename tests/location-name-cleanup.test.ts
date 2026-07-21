import { describe, expect, it } from "vitest";
import { cleanDisplayName, normalizeName } from "@/worker/locations/types";

describe("campground display-name cleanup", () => {
  it("removes a phone number and its trailing separator", () => {
    expect(cleanDisplayName("233 Trailhead: (936) 344-6205")).toBe(
      "233 Trailhead",
    );
  });

  it("removes leading feed bullets without changing meaningful numbers", () => {
    expect(cleanDisplayName("- 233 Trailhead")).toBe("233 Trailhead");
  });

  it("handles international-prefix and extension formatting", () => {
    expect(cleanDisplayName("Example Camp - +1 403-555-0199 ext. 4")).toBe(
      "Example Camp",
    );
  });

  it("produces a matching normalized name after cleanup", () => {
    const cleaned = cleanDisplayName("- Pine Lake Campground (250) 555-0100");
    expect(normalizeName(cleaned)).toBe("pine lake");
  });
});
