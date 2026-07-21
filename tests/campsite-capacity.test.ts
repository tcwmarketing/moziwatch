import { describe, expect, it } from "vitest";
import { ridbCampsiteCount } from "@/worker/locations/capacity-values";
import { positiveCampsiteCount } from "@/worker/locations/types";

describe("campground campsite capacity", () => {
  it("reads the documented RIDB total-count metadata", () => {
    expect(
      ridbCampsiteCount({
        METADATA: { RESULTS: { TOTAL_COUNT: 87 } },
        RECDATA: [{}],
      }),
    ).toBe(87);
    expect(
      ridbCampsiteCount({
        METADATA: { RESULTS: { TOTAL_COUNT: 0 } },
        RECDATA: [],
      }),
    ).toBeNull();
  });

  it("rejects invalid or implausible campsite counts", () => {
    expect(positiveCampsiteCount("24")).toBe(24);
    expect(positiveCampsiteCount("24.5")).toBeNull();
    expect(positiveCampsiteCount(-1)).toBeNull();
    expect(() => ridbCampsiteCount({ METADATA: {} })).toThrow(
      "valid total count",
    );
  });
});
