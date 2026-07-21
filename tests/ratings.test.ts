import { describe, expect, it } from "vitest";
import { markerStateForAverage, ratingLabel } from "@/config/ratings";

describe("marker thresholds", () => {
  it.each([
    [null, "none"],
    [1, "low"],
    [2, "low"],
    [2.49, "low"],
    [2.5, "moderate"],
    [3, "moderate"],
    [3.5, "high"],
    [4, "high"],
    [4.5, "severe"],
    [5, "severe"],
  ])("maps %s to %s", (average, key) =>
    expect(markerStateForAverage(average).key).toBe(key),
  );
  it("provides a text label for every stored rating", () => {
    for (let rating = 1; rating <= 5; rating++)
      expect(ratingLabel(rating)).not.toBe("Unknown");
  });
  it("uses the existing gray no-report marker for newly imported locations", () => {
    const marker = markerStateForAverage(null);
    expect(marker.key).toBe("none");
    expect(marker.label).toMatch(/no .*reports/i);
  });
});
