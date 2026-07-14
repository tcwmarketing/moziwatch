import { describe, expect, it } from "vitest";
import { markerStateForAverage, ratingLabel } from "@/config/ratings";

describe("marker thresholds", () => {
  it.each([
    [null, "none"],
    [1, "low"],
    [1.99, "low"],
    [2, "moderate"],
    [2.99, "moderate"],
    [3, "high"],
    [3.99, "high"],
    [4, "severe"],
    [5, "severe"],
  ])("maps %s to %s", (average, key) =>
    expect(markerStateForAverage(average).key).toBe(key),
  );
  it("provides a text label for every stored rating", () => {
    for (let rating = 1; rating <= 5; rating++)
      expect(ratingLabel(rating)).not.toBe("Unknown");
  });
});
