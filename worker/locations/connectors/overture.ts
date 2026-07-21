import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { classifyCampground, validWgs84 } from "../classification";
import {
  normalizeName,
  type LocationImportItem,
  type NormalizedLocation,
} from "../types";
import { overtureRetentionReason } from "../overture-retention";

type Country = "CA" | "US";

export async function resolveOvertureRelease() {
  if (process.env.OVERTURE_RELEASE) return process.env.OVERTURE_RELEASE;
  const response = await fetch("https://stac.overturemaps.org/catalog.json");
  if (!response.ok)
    throw new Error(`Overture STAC request failed (${response.status})`);
  const payload = (await response.json()) as { latest?: string };
  if (!payload.latest)
    throw new Error("Overture STAC catalog did not provide latest release");
  return payload.latest;
}

export function normalizeOverturePlace(
  row: Record<string, unknown>,
  country: Country,
  release: string,
): LocationImportItem {
  const id = typeof row.id === "string" ? row.id : null;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const region = typeof row.region === "string" ? row.region.trim() : "";
  const longitude = Number(row.longitude);
  const latitude = Number(row.latitude);
  if (!id || !validWgs84(longitude, latitude))
    return {
      rejected: true,
      source: country === "CA" ? "overture-ca" : "overture-us",
      externalId: id,
      reason: "invalid_coordinates",
      invalidCoordinates: true,
    };
  const alternateCategories =
    typeof row.alternate_categories === "string"
      ? JSON.parse(row.alternate_categories)
      : [];
  const primaryCategory =
    typeof row.primary_category === "string" ? row.primary_category : null;
  if (
    primaryCategory !== "campground" &&
    !(
      Array.isArray(alternateCategories) &&
      alternateCategories.includes("campground")
    )
  )
    return {
      rejected: true,
      source: country === "CA" ? "overture-ca" : "overture-us",
      externalId: id,
      reason: "overture_category_not_exact_campground",
    };
  const confidence = Number.isFinite(Number(row.confidence))
    ? Number(row.confidence)
    : null;
  if (row.operating_status === "permanently_closed")
    return {
      rejected: true,
      source: country === "CA" ? "overture-ca" : "overture-us",
      externalId: id,
      reason: "permanently_closed",
    };
  const retentionReason = overtureRetentionReason({
    name,
    primaryCategory,
    confidence,
  });
  if (retentionReason)
    return {
      rejected: true,
      source: country === "CA" ? "overture-ca" : "overture-us",
      externalId: id,
      reason: `overture_${retentionReason}`,
    };
  const decision = classifyCampground({
    name,
    category: primaryCategory,
    alternateCategories: Array.isArray(alternateCategories)
      ? alternateCategories
      : [],
    permanentlyClosed: row.operating_status === "permanently_closed",
  });
  const source = country === "CA" ? "overture-ca" : "overture-us";
  if (country === "CA" && ["BC", "British Columbia"].includes(region))
    return {
      rejected: true,
      source,
      externalId: id,
      reason: "british_columbia_excluded",
    };
  if (!decision.accepted)
    return { rejected: true, source, externalId: id, reason: decision.reason };
  return {
    source,
    externalId: id,
    sourceUrl: `https://docs.overturemaps.org/guides/places/`,
    sourceRecordUrl: null,
    sourceRelease: release,
    sourceUpdatedAt: null,
    license:
      "Overture Maps Foundation data licenses (record-level source provenance retained)",
    attribution: "Overture Maps Foundation",
    priority: 60,
    authoritative: false,
    confidence,
    name,
    normalizedName: normalizeName(name),
    locationType: decision.locationType,
    country,
    region: region || "Unknown",
    locality:
      typeof row.locality === "string" && row.locality
        ? row.locality
        : "Unknown",
    address:
      typeof row.address === "string" && row.address
        ? row.address
        : "Address not provided",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: null,
    website: typeof row.website === "string" ? row.website : null,
    phone: null,
    reservationUrl: null,
    description:
      "Campground discovered from Overture Places primary campground category.",
    parentName: null,
    raw: { ...row, overtureRelease: release },
  } satisfies NormalizedLocation;
}

export async function* overtureRecords(
  country: Country,
  release: string,
  options: { region?: string; limit?: number } = {},
): AsyncGenerator<LocationImportItem> {
  const python = process.env.OVERTURE_PYTHON || "python";
  const args = [
    "worker/locations/overture-query.py",
    "--release",
    release,
    "--country",
    country,
  ];
  if (options.region) args.push("--region", options.region);
  if (options.limit) args.push("--limit", String(options.limit));
  const localPackages = resolve(".tools/locations");
  const pythonPath = [
    existsSync(localPackages) ? localPackages : null,
    process.env.PYTHONPATH,
  ]
    .filter(Boolean)
    .join(process.platform === "win32" ? ";" : ":");
  const child = spawn(python, args, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...(pythonPath ? { PYTHONPATH: pythonPath } : {}) },
  });
  const exitPromise = new Promise<number | null>((resolve) =>
    child.once("close", resolve),
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));
  const lines = createInterface({ input: child.stdout });
  for await (const line of lines) {
    if (line.trim())
      yield normalizeOverturePlace(JSON.parse(line), country, release);
  }
  const exitCode = await exitPromise;
  if (exitCode !== 0)
    throw new Error(`Overture query failed (${exitCode}): ${stderr.trim()}`);
}
