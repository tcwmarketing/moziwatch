import { describe, expect, it } from "vitest";
import { reportInput } from "@/lib/validation";

const base = {
  campgroundId: "00000000-0000-4000-8000-000000000001",
  rating: 3,
  comment: "",
};

describe("report observation date validation", () => {
  it("defaults to the subjective Recent option", () => {
    const result = reportInput.parse(base);
    expect(result.observationMode).toBe("recent");
    expect(result.observedOn).toBeUndefined();
  });

  it("requires a date for an older report", () => {
    expect(
      reportInput.safeParse({ ...base, observationMode: "older" }).success,
    ).toBe(false);
  });

  it("accepts an older date and rejects future dates", () => {
    expect(
      reportInput.safeParse({
        ...base,
        observationMode: "older",
        observedOn: "2025-07-01",
      }).success,
    ).toBe(true);
    const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(
      reportInput.safeParse({
        ...base,
        observationMode: "older",
        observedOn: tomorrow,
      }).success,
    ).toBe(false);
  });
});
