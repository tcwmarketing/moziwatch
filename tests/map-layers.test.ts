import { describe, expect, it } from "vitest";
import { findWaterMaskPlacement } from "@/lib/map-layers";

describe("findWaterMaskPlacement", () => {
  it("finds the Protomaps water fill and the following layer", () => {
    expect(
      findWaterMaskPlacement([
        { id: "earth", type: "fill", "source-layer": "earth" },
        { id: "water", type: "fill", "source-layer": "water" },
        { id: "water_river", type: "line", "source-layer": "water" },
      ]),
    ).toEqual({
      layer: { id: "water", type: "fill", "source-layer": "water" },
      beforeId: "water_river",
    });
  });

  it("does not select a water line because it cannot mask the heat layer", () => {
    expect(
      findWaterMaskPlacement([
        { id: "water_stream", type: "line", "source-layer": "water" },
      ]),
    ).toBeUndefined();
  });
});
