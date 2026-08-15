import { describe, expect, it, vi } from "vitest";
import {
  normalizeOutreserveStay,
  outreserveDetailEvidence,
  OutreserveClient,
  outreserveRecords,
  type OutreserveNormalizationContext,
} from "@/worker/locations/connectors/outreserve";

function context(): OutreserveNormalizationContext {
  return {
    countries: new Map([
      ["1", { country: "US", name: "United States" }],
      ["2", { country: "CA", name: "Canada" }],
    ]),
    states: new Map([
      ["10", { region: "WI", name: "Wisconsin", country: "US" }],
      ["20", { region: "BC", name: "British Columbia", country: "CA" }],
    ]),
  };
}

const stay = {
  id: 101,
  uuid: "outreserve-101",
  name: "Revelle's Resort & Campground",
  slug: "revelles-resort-campground",
  latitude: 46.02,
  longitude: -91.48,
  location: "Hayward, WI",
  country_id: 1,
  state_id: 10,
  destination_id: 44,
  avg_rating: 4.8,
  reviews_count: 37,
  currency: "USD",
  instant_book: true,
  pet_friendly: true,
  site_types: [],
};

describe("OutReserve location connector", () => {
  it("normalizes a campground while retaining only affiliate-ready provenance", () => {
    expect(normalizeOutreserveStay(stay, context())).toMatchObject({
      source: "outreserve",
      externalId: "outreserve-101",
      country: "US",
      region: "WI",
      locality: "Hayward",
      locationType: "developed_campground",
      reservationUrl: null,
      website: null,
      raw: {
        outreserve_id: "101",
        outreserve_uuid: "outreserve-101",
        outreserve_slug: "revelles-resort-campground",
        avg_rating: 4.8,
        reviews_count: 37,
        affiliate_program_available: true,
        affiliate_link_status: "not_enabled",
        provider_listing_status: "active",
        provider_status_basis: "active_search_inventory",
      },
    });
  });

  it("counts individual camping units without treating guest capacity as sites", () => {
    expect(
      outreserveDetailEvidence({
        data: {
          status: "active",
          units: [
            { id: 1, unit_type: "RV", max_occupancy: 10 },
            { id: 2, unit_type: "Tent", max_occupancy: 6 },
            { id: 3, unit_type: "Glamping", max_occupancy: 4 },
            { id: 4, unit_type: "Cabin", max_occupancy: 8 },
            { id: 2, unit_type: "Tent", max_occupancy: 6 },
          ],
        },
      }),
    ).toEqual({
      providerStatus: "active",
      canonicalStatus: "active",
      campsiteCount: 3,
      unitTypeCounts: { RV: 1, Tent: 1, Glamping: 1 },
    });
  });

  it("distinguishes permanent, seasonal and uncertain listing status", () => {
    expect(
      outreserveDetailEvidence({ data: { status: "permanently_closed" } }),
    ).toMatchObject({ canonicalStatus: "closed", campsiteCount: null });
    expect(
      outreserveDetailEvidence({ data: { status: "temporarily_closed" } }),
    ).toMatchObject({ canonicalStatus: "seasonal" });
    expect(
      outreserveDetailEvidence({ data: { status: "inactive" } }),
    ).toMatchObject({ canonicalStatus: "review" });
  });

  it("accepts a partner-listed RV park but keeps a generic outdoor stay conservative", () => {
    expect(
      normalizeOutreserveStay(
        { ...stay, uuid: "rv-1", name: "Pine Motorcoach Resort" },
        context(),
      ),
    ).toMatchObject({ locationType: "rv_park" });
    expect(
      normalizeOutreserveStay(
        { ...stay, uuid: "park-1", name: "Tettegouche State Park" },
        context(),
      ),
    ).toMatchObject({ locationType: "other_established_campground" });
  });

  it("still rejects obvious non-campground facilities and invalid coordinates", () => {
    expect(
      normalizeOutreserveStay(
        { ...stay, uuid: "ranger-1", name: "Verlot Ranger Station" },
        context(),
      ),
    ).toMatchObject({
      rejected: true,
      reason: "non_campground_recreation_feature",
    });
    expect(
      normalizeOutreserveStay(
        { ...stay, uuid: "bad-point", longitude: 0, latitude: 0 },
        context(),
      ),
    ).toMatchObject({
      rejected: true,
      reason: "invalid_coordinates",
      invalidCoordinates: true,
    });
  });

  it("does not present a provider street address as the campground city", () => {
    expect(
      normalizeOutreserveStay(
        {
          ...stay,
          uuid: "address-location",
          location: "915 North Walla Walla Street, WA",
        },
        context(),
      ),
    ).toMatchObject({ locality: "Unknown", region: "WI" });
  });

  it("rejects standalone lodging without campground or RV evidence", () => {
    for (const stay of [
      { uuid: "cabin", name: "Kegan Creek Cabin", site_types: ["Cabin"] },
      { uuid: "spa", name: "Savannah Sunset Resort and Spa", site_types: [] },
      { uuid: "lodge", name: "Remote Wilderness Lodge", site_types: [] },
    ]) {
      const result = normalizeOutreserveStay(
        {
          ...stay,
          latitude: "32.5",
          longitude: "-96.8",
          country_id: 1,
          state_id: 10,
        },
        context(),
      );
      expect(result).toMatchObject({
        rejected: true,
        reason: "lodging_only_property",
      });
    }

    expect(
      normalizeOutreserveStay(
        {
          uuid: "rv-lodge",
          name: "Elk Horn RV Lodge",
          latitude: "32.5",
          longitude: "-96.8",
          country_id: 1,
          state_id: 10,
        },
        context(),
      ),
    ).toMatchObject({ source: "outreserve" });
    expect(
      normalizeOutreserveStay(
        { ...stay, uuid: "camper-inn", name: "Camper's Inn, Inc." },
        context(),
      ),
    ).toMatchObject({ source: "outreserve" });
    expect(
      normalizeOutreserveStay(
        { ...stay, uuid: "glamp-inn", name: "The Glamp Inn" },
        context(),
      ),
    ).toMatchObject({ source: "outreserve" });
  });

  it("rejects individual recreation facilities while retaining named parks", () => {
    for (const name of [
      "Fivehole Arch Th",
      "Grandview Shelter 1",
      "Minton Peak Lookout",
      "Govt Mineral Springs Guard Station",
    ]) {
      expect(
        normalizeOutreserveStay(
          { ...stay, uuid: name, name, site_types: ["Glamping"] },
          context(),
        ),
      ).toMatchObject({
        rejected: true,
        reason: "non_campground_recreation_feature",
      });
    }

    expect(
      normalizeOutreserveStay(
        { ...stay, uuid: "cape-lookout", name: "Cape Lookout State Park" },
        context(),
      ),
    ).toMatchObject({ source: "outreserve" });
    expect(
      normalizeOutreserveStay(
        {
          ...stay,
          uuid: "shelter-cove",
          name: "Shelter Cove Resort & Marina",
        },
        context(),
      ),
    ).toMatchObject({ source: "outreserve" });
  });

  it("uses Bearer authentication and spaces requests below the provider limit", async () => {
    let now = 0;
    const waits: number[] = [];
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new OutreserveClient({
      apiKey: "fixture-key",
      fetchImpl: fetchMock,
      now: () => now,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
      },
      requestIntervalMs: 1_100,
    });
    await client.get("countries");
    await client.get("countries");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer fixture-key",
    );
    expect(waits).toEqual([1_100]);
    expect(fetchMock.mock.calls[0][0]).not.toContain("fixture-key");
  });

  it("serializes concurrent request starts below the provider limit", async () => {
    let now = 0;
    const waits: number[] = [];
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const client = new OutreserveClient({
      apiKey: "fixture-key",
      fetchImpl: fetchMock,
      now: () => now,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
      },
      requestIntervalMs: 1_100,
    });
    await Promise.all([
      client.get("one"),
      client.get("two"),
      client.get("three"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1_100, 1_100]);
  });

  it("retries transient provider failures", async () => {
    let now = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200 }),
      );
    const client = new OutreserveClient({
      apiKey: "fixture-key",
      fetchImpl: fetchMock,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      requestIntervalMs: 1_100,
      maxAttempts: 2,
    });
    await expect(client.get("countries")).resolves.toEqual({
      data: [{ id: 1 }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("paginates search results using provider metadata", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/countries"))
        return new Response(
          JSON.stringify({
            data: [
              { id: 1, name: "United States", slug: "united-states" },
              { id: 2, name: "Canada", slug: "canada" },
            ],
            meta: { total_pages: 1 },
          }),
        );
      if (url.pathname.endsWith("/countries/united-states/states"))
        return new Response(
          JSON.stringify({
            data: [{ id: 10, name: "Wisconsin", abbreviation: "WI" }],
            meta: { total_pages: 1 },
          }),
        );
      if (url.pathname.endsWith("/countries/canada/states"))
        return new Response(
          JSON.stringify({
            data: [{ id: 20, name: "British Columbia", abbreviation: "BC" }],
            meta: { total_pages: 1 },
          }),
        );
      const page = Number(url.searchParams.get("page"));
      return new Response(
        JSON.stringify({
          data: [{ ...stay, id: page, uuid: `stay-${page}` }],
          meta: { current_page: page, total_pages: 2, total_count: 2 },
        }),
      );
    });
    const client = new OutreserveClient({
      apiKey: "fixture-key",
      fetchImpl: fetchMock,
      requestIntervalMs: 0,
    });
    const records = [];
    for await (const record of outreserveRecords({ client }))
      records.push(record);

    expect(records.map((record) => record.externalId)).toEqual([
      "stay-1",
      "stay-2",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
