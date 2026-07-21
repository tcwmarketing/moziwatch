import { describe, expect, it } from "vitest";
import { products, recommendedProducts } from "@/config/products";

describe("campground product recommendations", () => {
  it("uses the finalized catalog and newly verified products", () => {
    const expectedAsins = [
      "B004H89KFC",
      "B019ZTXU2G",
      "B003AOA3UA",
      "B07BSN5YLN",
      "B0DP5DZ57B",
      "B00KJS6BQA",
      "B0BTR2DTWM",
      "B0F2MDGFLW",
      "B07CD9NFB4",
      "B0051OJ9DO",
      "B06XK6XXV3",
      "B07DKZ1BVV",
      "B0FM6SLRZ8",
      "B07MBPHZZ1",
      "B000ECUFI6",
      "B07TK5CWYW",
      "B093KZ2J1K",
      "B0GL18H87K",
      "B073GNV5SX",
      "B0CSKDNBMP",
      "B01LWLFB5U",
      "B0GZTN9882",
      "B07TXBB49X",
      "B07DKFTQQT",
      "B0F8VLS7HB",
      "B07PJ5TNPP",
      "B001CUX6N0",
    ];

    expect(products.map((product) => product.asin).sort()).toEqual(
      expectedAsins.sort(),
    );
    expect(new Set(products.map((product) => product.url)).size).toBe(27);
    expect(
      products.every((product) => product.image.includes("m.media-amazon.com")),
    ).toBe(true);
  });

  it("returns exactly three mixed products when forecast data is unavailable", () => {
    expect(recommendedProducts({})).toHaveLength(3);
  });

  it("caps severity-based recommendations at three products", () => {
    for (const forecastLevel of ["Light", "Moderate", "Heavy", "Severe"])
      expect(recommendedProducts({ forecastLevel })).toHaveLength(3);
  });
});
