import { classifyCampground, validWgs84 } from "../classification";
import {
  normalizeName,
  type LocationImportItem,
  type NormalizedLocation,
  type RejectedLocation,
} from "../types";

const DEFAULT_BASE_URL = "https://outreserve.com/api/v1";
const DEFAULT_REQUEST_INTERVAL_MS = 1_100;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 6;
const PAGE_SIZE = 100;

type CollectionMeta = {
  current_page?: number;
  total_pages?: number;
  total_count?: number;
};

type CollectionResponse<T> = {
  data?: T[];
  meta?: CollectionMeta;
};

export type OutreserveCountry = {
  id?: number | string;
  name?: string;
  slug?: string;
  abbreviation?: string;
};

export type OutreserveState = {
  id?: number | string;
  name?: string;
  slug?: string;
  abbreviation?: string;
  country_id?: number | string;
};

export type OutreserveStay = {
  id?: number | string;
  uuid?: string;
  name?: string;
  slug?: string;
  latitude?: number | string;
  longitude?: number | string;
  avg_rating?: number | string | null;
  reviews_count?: number | string | null;
  currency?: string | null;
  instant_book?: boolean | null;
  pet_friendly?: boolean | null;
  featured?: boolean | null;
  location?: string | null;
  site_types?: unknown[] | null;
  destination_id?: number | string | null;
  state_id?: number | string | null;
  country_id?: number | string | null;
};

type CountryContext = {
  country: "US" | "CA";
  name: string;
};

type StateContext = {
  region: string;
  name: string;
  country: "US" | "CA";
};

export type OutreserveNormalizationContext = {
  countries: Map<string, CountryContext>;
  states: Map<string, StateContext>;
};

type FetchLike = typeof fetch;

export type OutreserveClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  requestIntervalMs?: number;
  timeoutMs?: number;
  maxAttempts?: number;
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const identifier = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value).trim();

const limited = (value: unknown, maximumLength: number) =>
  text(value)?.slice(0, maximumLength) || null;

const numeric = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function siteTypeLabels(siteTypes: unknown[] | null | undefined) {
  return (siteTypes || [])
    .map((value) => {
      if (typeof value === "string") return value.trim();
      if (!value || typeof value !== "object") return "";
      const row = value as Record<string, unknown>;
      return String(row.name || row.label || row.type || "").trim();
    })
    .filter(Boolean)
    .slice(0, 20);
}

function localityFromLocation(value: unknown, region: string) {
  const location = limited(value, 160);
  if (!location) return "Unknown";
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1 && parts.at(-1)?.toUpperCase() === region.toUpperCase())
    parts.pop();
  const locality = parts[0]?.slice(0, 100) || "";
  const addressShaped =
    /^\d{1,6}\s+.+\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|highway|hwy|route|lane|ln|drive|dr|court|ct|way)\b\.?$/i.test(
      locality,
    );
  return locality && !addressShaped ? locality : "Unknown";
}

function rejected(
  row: OutreserveStay,
  reason: string,
  invalidCoordinates = false,
): RejectedLocation {
  return {
    rejected: true,
    source: "outreserve",
    externalId: identifier(row.uuid) || identifier(row.id),
    reason,
    invalidCoordinates,
  };
}

/** Normalize one licensed OutReserve outdoor-stay record without fetching details. */
export function normalizeOutreserveStay(
  row: OutreserveStay,
  context: OutreserveNormalizationContext,
): LocationImportItem {
  const externalId = identifier(row.uuid) || identifier(row.id);
  const sourceName = limited(row.name, 160);
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!externalId) return rejected(row, "missing_external_id");
  if (!sourceName) return rejected(row, "missing_name");
  if (!validWgs84(longitude, latitude))
    return rejected(row, "invalid_coordinates", true);

  const countryContext = context.countries.get(String(row.country_id));
  const stateContext = context.states.get(String(row.state_id));
  const country = countryContext?.country || stateContext?.country;
  if (!country || !["US", "CA"].includes(country))
    return rejected(row, "outside_supported_countries");

  const labels = siteTypeLabels(row.site_types);
  const facilityType = labels.join(" ");
  const hasCampgroundIdentity =
    /\b(campgrounds?|camping|camp ?sites?|campers?|glamp(?:ing)?|rv|motorhome|koa)\b/i.test(
      sourceName,
    );
  const hasParkIdentity =
    /\b(?:state|provincial|national|county|regional) park\b/i.test(sourceName);
  const obviousNonCampgroundStay =
    !hasCampgroundIdentity &&
    !hasParkIdentity &&
    !/\bshelter cove\b/i.test(sourceName) &&
    (/\b(ranger station|guard station|work cent(?:er|re)|barrack|shelter|pavilion|lookout|trail ?head)\b/i.test(
      sourceName,
    ) ||
      /(?:\s|-)t\.?h\.?$/i.test(sourceName));
  if (obviousNonCampgroundStay)
    return rejected(row, "non_campground_recreation_feature");
  const hasCampingInventory = labels.some((label) =>
    /\b(rv|tent|camp|primitive|walk[- ]?in|backcountry)\b/i.test(label),
  );
  const lodgingOnly =
    !hasCampgroundIdentity &&
    !hasCampingInventory &&
    ((labels.length > 0 &&
      labels.every((label) =>
        /\b(cabin|cottage|chalet|lodge)\b/i.test(label),
      )) ||
      /\b(cabin|cottage|chalet|hotel|motel|inn|lodge|hostel|bed (?:and|&) breakfast|guest ?house|spa)\b/i.test(
        sourceName,
      ));
  if (lodgingOnly) return rejected(row, "lodging_only_property");
  const decision = classifyCampground({
    name: sourceName,
    facilityType,
    hasTentOrMixedSites: hasCampingInventory,
    outdoorStayProperty: true,
    allowRvOnly: true,
  });
  if (!decision.accepted) return rejected(row, decision.reason);

  const region =
    limited(stateContext?.region, 100) ||
    limited(stateContext?.name, 100) ||
    "Unknown";
  const normalized: NormalizedLocation = {
    source: "outreserve",
    externalId,
    sourceUrl: "https://outreserve.com",
    sourceRecordUrl: null,
    sourceRelease: "api-v1",
    license: "OutReserve Partner API agreement",
    attribution: "Location data supplied by OutReserve",
    priority: 80,
    authoritative: true,
    confidence: null,
    name: sourceName,
    normalizedName: normalizeName(sourceName),
    locationType: decision.locationType,
    country,
    region,
    locality: localityFromLocation(row.location, region),
    address: "Address not provided",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: null,
    website: null,
    phone: null,
    reservationUrl: null,
    description: null,
    parentName: null,
    raw: {
      outreserve_id: identifier(row.id),
      outreserve_uuid: identifier(row.uuid),
      outreserve_slug: limited(row.slug, 180),
      destination_id: identifier(row.destination_id),
      state_id: identifier(row.state_id),
      country_id: identifier(row.country_id),
      avg_rating: numeric(row.avg_rating),
      reviews_count: numeric(row.reviews_count),
      currency: limited(row.currency, 12),
      instant_book: row.instant_book === true,
      pet_friendly: row.pet_friendly === true,
      featured: row.featured === true,
      site_types: labels,
      location: limited(row.location, 160),
      affiliate_program_available: true,
      affiliate_link_status: "not_enabled",
    },
  };
  return normalized;
}

export class OutreserveClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly requestIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private lastRequestStartedAt: number | null = null;

  constructor(options: OutreserveClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.OUTRESERVE_API || "";
    if (!this.apiKey) throw new Error("OUTRESERVE_API is required");
    this.baseUrl = (
      options.baseUrl ||
      process.env.OUTRESERVE_BASE_URL ||
      DEFAULT_BASE_URL
    ).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl || fetch;
    this.sleep =
      options.sleep ||
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now || Date.now;
    const configuredInterval = Number(
      process.env.OUTRESERVE_REQUEST_INTERVAL_MS || DEFAULT_REQUEST_INTERVAL_MS,
    );
    this.requestIntervalMs =
      options.requestIntervalMs === undefined
        ? Math.max(
            DEFAULT_REQUEST_INTERVAL_MS,
            Number.isFinite(configuredInterval)
              ? configuredInterval
              : DEFAULT_REQUEST_INTERVAL_MS,
          )
        : Math.max(0, options.requestIntervalMs);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  private async throttle() {
    if (this.lastRequestStartedAt !== null) {
      const wait =
        this.requestIntervalMs - (this.now() - this.lastRequestStartedAt);
      if (wait > 0) await this.sleep(wait);
    }
    this.lastRequestStartedAt = this.now();
  }

  async get<T>(path: string, parameters: Record<string, string | number> = {}) {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(parameters))
      url.searchParams.set(key, String(value));

    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      await this.throttle();
      try {
        const response = await this.fetchImpl(url.toString(), {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.ok) return (await response.json()) as T;
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        if (!retryable)
          throw new Error(`OutReserve returned HTTP ${response.status}`);
        lastError = new Error(
          `Retryable OutReserve response ${response.status}`,
        );
        if (attempt < this.maxAttempts - 1) {
          const retryAfterSeconds = Number(response.headers.get("retry-after"));
          await this.sleep(
            Number.isFinite(retryAfterSeconds)
              ? retryAfterSeconds * 1_000
              : Math.min(30_000, 1_000 * 2 ** attempt),
          );
        }
      } catch (error) {
        lastError = error;
        if (
          error instanceof Error &&
          error.message.startsWith("OutReserve returned HTTP")
        )
          throw error;
        if (attempt < this.maxAttempts - 1)
          await this.sleep(Math.min(30_000, 1_000 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("OutReserve request failed");
  }
}

async function collectPages<T>(client: OutreserveClient, path: string) {
  const output: T[] = [];
  for (let page = 1; ; page++) {
    const response = await client.get<CollectionResponse<T>>(path, {
      limit: PAGE_SIZE,
      page,
    });
    const rows = response.data || [];
    output.push(...rows);
    const totalPages = Number(response.meta?.total_pages || 0);
    if (totalPages ? page >= totalPages : rows.length < PAGE_SIZE) break;
  }
  return output;
}

function countryCode(country: OutreserveCountry): "US" | "CA" | null {
  const identity =
    `${country.name || ""} ${country.slug || ""} ${country.abbreviation || ""}`.toLowerCase();
  if (/united states|\busa?\b/.test(identity)) return "US";
  if (/canada|\bca\b/.test(identity)) return "CA";
  return null;
}

function stateRegion(state: OutreserveState) {
  const abbreviation = limited(state.abbreviation, 100);
  if (abbreviation) return abbreviation.toUpperCase();
  const slug = limited(state.slug, 100);
  if (slug && slug.length <= 3) return slug.toUpperCase();
  return limited(state.name, 100) || "Unknown";
}

export async function outreserveContext(client = new OutreserveClient()) {
  const countries = await collectPages<OutreserveCountry>(client, "countries");
  const context: OutreserveNormalizationContext = {
    countries: new Map(),
    states: new Map(),
  };
  for (const country of countries) {
    const id = identifier(country.id);
    const code = countryCode(country);
    if (!id || !code) continue;
    context.countries.set(id, {
      country: code,
      name: limited(country.name, 100) || code,
    });
    const slug = limited(country.slug, 100);
    if (!slug) continue;
    const states = await collectPages<OutreserveState>(
      client,
      `countries/${encodeURIComponent(slug)}/states`,
    );
    for (const state of states) {
      const stateId = identifier(state.id);
      if (!stateId) continue;
      context.states.set(stateId, {
        region: stateRegion(state),
        name: limited(state.name, 100) || "Unknown",
        country: code,
      });
    }
  }
  return context;
}

export type OutreserveRecordsOptions = {
  client?: OutreserveClient;
  startPage?: number;
};

/**
 * Streams the accessible OutReserve search inventory. The provider currently
 * caps search at 10,000 rows, so callers must treat every run as partial and
 * must not infer that unseen source records were deleted.
 */
export async function* outreserveRecords(
  options: OutreserveRecordsOptions = {},
): AsyncGenerator<LocationImportItem> {
  const client = options.client || new OutreserveClient();
  const context = await outreserveContext(client);
  for (let page = options.startPage || 1; ; page++) {
    const response = await client.get<CollectionResponse<OutreserveStay>>(
      "stays/search",
      { limit: PAGE_SIZE, page },
    );
    const rows = response.data || [];
    for (const row of rows) yield normalizeOutreserveStay(row, context);
    const totalPages = Number(response.meta?.total_pages || 0);
    if (totalPages ? page >= totalPages : rows.length < PAGE_SIZE) break;
  }
}
