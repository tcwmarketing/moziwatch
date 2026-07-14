import { describe, expect, it } from "vitest";
import { flagLikelyDuplicates, parseCampgroundCsv } from "@/lib/csv-import";

const csv = `name,slug,address,city,region,country,postalCode,latitude,longitude\nTest Camp,test-camp,1 Road,Town,Ontario,CA,K0K 0K0,45,-75`;
describe("campground CSV import", () => {
  it("validates required fields and coordinates", () =>
    expect(parseCampgroundCsv(csv)).toMatchObject({
      total: 1,
      errors: [],
      valid: [{ rowNumber: 2, name: "Test Camp" }],
    }));
  it("flags name and nearby coordinate duplicates before commit", () => {
    const parsed = parseCampgroundCsv(csv);
    expect(
      flagLikelyDuplicates(parsed.valid, [
        { id: "1", name: "Another", latitude: 45.001, longitude: -75.001 },
      ])[0].duplicateOf,
    ).toContain("Another");
  });
  it("reports invalid coordinates", () =>
    expect(
      parseCampgroundCsv(csv.replace(",45,-75", ",145,-75")).errors,
    ).toHaveLength(1));
});
