import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import {
  normalizeName,
  positiveCampsiteCount,
  type GeoJsonGeometry,
  type NormalizedLocation,
} from "../types";

type OSMFeature = {
  type: "Feature";
  id?: string | number;
  geometry?: GeoJsonGeometry;
  properties?: Record<string, unknown>;
};

function text(tags: Record<string, unknown>, key: string) {
  const value = tags[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function osmCampsiteCount(tags: Record<string, unknown>) {
  const total = positiveCampsiteCount(text(tags, "capacity"));
  if (total) return total;
  const pitches = positiveCampsiteCount(text(tags, "capacity:pitches"));
  if (pitches) return pitches;
  // Tent and caravan capacities sometimes describe the same flexible pitches.
  // Use the larger value rather than adding them and inflating the total.
  const typedCapacities = [
    "capacity:tents",
    "capacity:caravans",
    "capacity:motorhome",
  ]
    .map((key) => positiveCampsiteCount(text(tags, key)))
    .filter((value): value is number => value !== null);
  return typedCapacities.length ? Math.max(...typedCapacities) : null;
}

export function normalizeOsmFeature(
  feature: OSMFeature,
  fallbackCountry?: string,
): NormalizedLocation | null {
  const tags = feature.properties || {};
  const tourism = text(tags, "tourism");
  if (
    !feature.geometry ||
    !["camp_site", "caravan_site"].includes(tourism || "")
  )
    return null;
  if (
    tourism === "camp_pitch" ||
    text(tags, "camp_site") === "camp_pitch" ||
    text(tags, "abandoned") === "yes" ||
    text(tags, "disused") === "yes" ||
    text(tags, "abandoned:tourism") ||
    text(tags, "disused:tourism") ||
    text(tags, "informal") === "yes" ||
    text(tags, "impromptu") === "yes" ||
    text(tags, "access") === "private"
  )
    return null;
  const name = text(tags, "name") || text(tags, "official_name");
  if (!name || name.length < 2) return null;
  const weakBasic =
    text(tags, "camp_site") === "basic" &&
    !text(tags, "operator") &&
    !text(tags, "website") &&
    !text(tags, "contact:website") &&
    !text(tags, "capacity") &&
    !text(tags, "capacity:pitches") &&
    !text(tags, "capacity:tents") &&
    !text(tags, "capacity:caravans") &&
    !text(tags, "capacity:motorhome") &&
    !text(tags, "toilets") &&
    !text(tags, "fee");
  if (weakBasic) return null;
  const osmType = text(tags, "@type") || "feature";
  const osmId = text(tags, "@id") || String(feature.id || "");
  if (!osmId) return null;
  const country = (
    text(tags, "addr:country") ||
    fallbackCountry ||
    ""
  ).toUpperCase();
  if (!country) return null;
  const backcountry = text(tags, "backcountry") === "yes";
  const group = text(tags, "group_only") === "yes" || /\bgroup\b/i.test(name);
  const campsiteCount = osmCampsiteCount(tags);
  return {
    source: "openstreetmap",
    externalId: `${osmType}/${osmId}`,
    sourceUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    priority: 60,
    name,
    normalizedName: normalizeName(name),
    locationType:
      tourism === "caravan_site"
        ? "rv_park"
        : backcountry
          ? "backcountry_campground"
          : group
            ? "group_campground"
            : "developed_campground",
    country,
    region: text(tags, "addr:state") || text(tags, "is_in:state") || "Unknown",
    locality:
      text(tags, "addr:city") ||
      text(tags, "addr:town") ||
      text(tags, "addr:village") ||
      "Unknown",
    address:
      [
        text(tags, "addr:housenumber"),
        text(tags, "addr:street"),
        text(tags, "addr:postcode"),
      ]
        .filter(Boolean)
        .join(" ") || "Address not provided",
    geometry: feature.geometry,
    operator: text(tags, "operator"),
    website: text(tags, "contact:website") || text(tags, "website"),
    phone: text(tags, "contact:phone") || text(tags, "phone"),
    reservationUrl: text(tags, "reservation:website"),
    description: text(tags, "description"),
    parentName: text(tags, "is_in") || text(tags, "site"),
    campsiteCount,
    campsiteCountKind: campsiteCount ? "mapped_capacity" : null,
    raw: tags,
  };
}

async function* lines(stream: NodeJS.ReadableStream) {
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of reader) {
    const clean = line.replace(/^\x1e/, "").trim();
    if (clean) yield clean;
  }
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

export async function* osmRecords(file: string, country?: string) {
  if (!file)
    throw new Error("OSM import requires --file=/path/to/extract.osm.pbf");
  if (!file.toLowerCase().endsWith(".pbf")) {
    for await (const line of lines(createReadStream(file))) {
      const record = normalizeOsmFeature(
        JSON.parse(line) as OSMFeature,
        country,
      );
      if (record) yield record;
    }
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), "moziwatch-osm-"));
  const filtered = join(directory, "campgrounds.osm.pbf");
  try {
    await run("osmium", [
      "tags-filter",
      file,
      "nwr/tourism=camp_site,caravan_site",
      "--overwrite",
      "-o",
      filtered,
    ]);
    const child = spawn(
      "osmium",
      ["export", filtered, "-f", "geojsonseq", "--attributes=type,id"],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    const finished = new Promise<void>((resolve, reject) => {
      child.once("error", (error) =>
        reject(
          new Error(
            `Unable to start osmium. Install osmium-tool and ensure it is on PATH. ${error.message}`,
          ),
        ),
      );
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`osmium export exited with ${code}`)),
      );
    });
    for await (const line of lines(child.stdout)) {
      const record = normalizeOsmFeature(
        JSON.parse(line) as OSMFeature,
        country,
      );
      if (record) yield record;
    }
    await finished;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
