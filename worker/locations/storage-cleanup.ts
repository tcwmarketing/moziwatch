import { createHash } from "node:crypto";
import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";
import {
  compactRawPayload,
  compactStoredNormalizedPayload,
  retainedContacts,
} from "./storage-retention";
import { compactProvenance, type Provenance } from "./provenance";
import type { LocationSource } from "./types";

const batchSize = Math.max(
  50,
  Number(
    process.argv.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1],
  ) || 500,
);
const vacuumOnly = process.argv.includes("--vacuum-only");
const fullVacuum = process.argv.includes("--full-vacuum");
const provenanceOnly = process.argv.includes("--provenance-only");

let cursor = "00000000-0000-0000-0000-000000000000";
let processed = 0;
let provenanceCursor = "00000000-0000-0000-0000-000000000000";
let provenanceProcessed = 0;

for (; !vacuumOnly;) {
  const rows = await sqlClient<
    Array<{ id: string; field_provenance: Provenance }>
  >`
    SELECT id, field_provenance FROM campgrounds
    WHERE id > ${provenanceCursor}::uuid
    ORDER BY id
    LIMIT ${batchSize}
  `;
  if (!rows.length) break;
  const updates = rows.map((row) => ({
    id: row.id,
    provenance: compactProvenance(row.field_provenance),
  }));
  await sqlClient`
    WITH input AS (
      SELECT id::uuid, provenance
      FROM jsonb_to_recordset(${toPostgresJson(updates)}::jsonb) AS x(
        id text, provenance jsonb
      )
    )
    UPDATE campgrounds campground SET
      field_provenance = input.provenance,
      updated_at = now()
    FROM input
    WHERE campground.id = input.id
      AND campground.field_provenance IS DISTINCT FROM input.provenance
  `;
  provenanceCursor = rows.at(-1)!.id;
  provenanceProcessed += rows.length;
}

for (; !vacuumOnly && !provenanceOnly;) {
  const rows = await sqlClient<
    Array<{
      id: string;
      source: LocationSource;
      raw_payload: Record<string, unknown>;
      normalized_payload: Record<string, unknown>;
      source_url: string | null;
      source_record_url: string | null;
      contact_emails: string[];
      related_urls: string[];
    }>
  >`
    SELECT id, source, raw_payload, normalized_payload, source_url,
      source_record_url, contact_emails, related_urls
    FROM location_source_records
    WHERE id > ${cursor}::uuid
    ORDER BY id
    LIMIT ${batchSize}
  `;
  if (!rows.length) break;

  const updates = rows.map((row) => {
    const normalized = compactStoredNormalizedPayload(row.normalized_payload);
    const raw = compactRawPayload(row.source, row.raw_payload);
    const contacts = retainedContacts({
      raw: { source: row.raw_payload, normalized: row.normalized_payload },
      sourceUrl: row.source_url,
      sourceRecordUrl: row.source_record_url,
      website:
        typeof row.normalized_payload.website === "string"
          ? row.normalized_payload.website
          : null,
      reservationUrl:
        typeof row.normalized_payload.reservationUrl === "string"
          ? row.normalized_payload.reservationUrl
          : null,
    });
    const emails = [
      ...new Set([...row.contact_emails, ...contacts.emails]),
    ].sort();
    const urls = [...new Set([...row.related_urls, ...contacts.urls])].sort();
    const checksum = createHash("sha256")
      .update(JSON.stringify({ raw, normalized, contacts: { emails, urls } }))
      .digest("hex");
    return { id: row.id, raw, normalized, emails, urls, checksum };
  });

  await sqlClient`
    WITH input AS (
      SELECT id::uuid, raw, normalized, emails, urls, checksum
      FROM jsonb_to_recordset(${toPostgresJson(updates)}::jsonb) AS x(
        id text, raw jsonb, normalized jsonb, emails text[], urls text[], checksum text
      )
    )
    UPDATE location_source_records record SET
      raw_payload = input.raw,
      normalized_payload = input.normalized,
      contact_emails = input.emails,
      related_urls = input.urls,
      source_geometry = CASE
        WHEN record.source_geometry->>'type' = 'Point' THEN NULL
        ELSE record.source_geometry
      END,
      checksum = input.checksum,
      updated_at = now()
    FROM input
    WHERE record.id = input.id
  `;
  cursor = rows.at(-1)!.id;
  processed += rows.length;
  console.log(JSON.stringify({ event: "location_storage_cleanup", processed }));
}

if (fullVacuum) {
  await sqlClient.unsafe("VACUUM (FULL, ANALYZE) campgrounds");
  await sqlClient.unsafe("VACUUM (FULL, ANALYZE) location_source_records");
} else {
  await sqlClient`ANALYZE campgrounds`;
  await sqlClient`ANALYZE location_source_records`;
}
console.log(
  JSON.stringify({
    event: "location_storage_cleanup_complete",
    processed,
    provenanceProcessed,
    fullVacuum,
  }),
);
await sqlClient.end();
