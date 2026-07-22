import { describe, expect, it, vi } from "vitest";
import { requiresCooperativeMapGestures } from "@/lib/map-interactions";

describe("requiresCooperativeMapGestures", () => {
  it("uses normal map gestures for a desktop mouse", () => {
    const matchMedia = vi.fn(() => ({ matches: false }));

    expect(requiresCooperativeMapGestures(matchMedia)).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith(
      "(hover: none) and (pointer: coarse)",
    );
  });

  it("keeps cooperative gestures for a touch-first device", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));

    expect(requiresCooperativeMapGestures(matchMedia)).toBe(true);
  });
});
