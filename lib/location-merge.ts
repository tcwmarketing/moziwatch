import { sqlClient } from "@/db";
import { recalculateCampgroundAggregates } from "./reports";
import { toPostgresJson } from "./postgres-json";

export type CanonicalLocationMergeMapping = {
  survivorId: string;
  duplicateId: string;
};

export class UnsafeCanonicalLocationMergeError extends Error {
  constructor(
    public dependencies: Array<{ table_name: string; row_count: number }>,
  ) {
    super(
      "The duplicate batch contains forecast or habitat data that requires a reviewed merge",
    );
  }
}

export async function mergeCanonicalLocationMappings(
  mappings: CanonicalLocationMergeMapping[],
  actorId: string,
) {
  if (!mappings.length) return { merged: 0, survivorCount: 0 };
  const duplicateIds = new Set<string>();
  const survivorIds = new Set<string>();
  for (const mapping of mappings) {
    if (mapping.survivorId === mapping.duplicateId)
      throw new Error("A location cannot be merged into itself");
    if (duplicateIds.has(mapping.duplicateId))
      throw new Error("A duplicate location can only occur once per batch");
    duplicateIds.add(mapping.duplicateId);
    survivorIds.add(mapping.survivorId);
  }
  for (const survivorId of survivorIds)
    if (duplicateIds.has(survivorId))
      throw new Error("A batch survivor cannot also be a duplicate");

  const mappingJson = toPostgresJson(
    mappings.map((mapping) => ({
      survivor_id: mapping.survivorId,
      duplicate_id: mapping.duplicateId,
    })),
  );
  const allIds = [...new Set([...duplicateIds, ...survivorIds])].sort();
  const now = new Date().toISOString();

  return sqlClient.begin(async (tx) => {
    const locked = await tx<{ id: string; slug: string }[]>`
      SELECT id, slug FROM campgrounds
      WHERE id = ANY(${allIds}::uuid[])
      ORDER BY id FOR UPDATE
    `;
    if (locked.length !== allIds.length)
      throw new Error("Every canonical location in the merge batch must exist");

    const dependencies = await tx<
      Array<{ table_name: string; row_count: number }>
    >`
      SELECT table_name, count(*)::int AS row_count FROM (
        SELECT 'campground_habitat_profiles' AS table_name, campground_id
          FROM campground_habitat_profiles
        UNION ALL SELECT 'campground_weather_observations', campground_id
          FROM campground_weather_observations
        UNION ALL SELECT 'campground_weather_cache', campground_id
          FROM campground_weather_cache
        UNION ALL SELECT 'campground_weather_history_daily', campground_id
          FROM campground_weather_history_daily
        UNION ALL SELECT 'campground_forecasts', campground_id
          FROM campground_forecasts
        UNION ALL SELECT 'campground_forecast_schedules', campground_id
          FROM campground_forecast_schedules
        UNION ALL SELECT 'campground_forecast_interest_daily', campground_id
          FROM campground_forecast_interest_daily
        UNION ALL SELECT 'campground_monthly_outlooks', campground_id
          FROM campground_monthly_outlooks
      ) dependent
      WHERE campground_id = ANY(${[...duplicateIds]}::uuid[])
      GROUP BY table_name ORDER BY table_name
    `;
    if (dependencies.length)
      throw new UnsafeCanonicalLocationMergeError(dependencies);

    await tx`
      WITH mapping AS (
        SELECT survivor_id::uuid, duplicate_id::uuid
        FROM jsonb_to_recordset(${mappingJson}::jsonb)
          AS x(survivor_id text, duplicate_id text)
      )
      INSERT INTO location_aliases (slug, campground_id)
      SELECT c.slug, mapping.survivor_id
      FROM mapping JOIN campgrounds c ON c.id = mapping.duplicate_id
      ON CONFLICT (slug) DO UPDATE
        SET campground_id = excluded.campground_id
    `;
    await tx`
      WITH mapping AS (
        SELECT survivor_id::uuid, duplicate_id::uuid
        FROM jsonb_to_recordset(${mappingJson}::jsonb)
          AS x(survivor_id text, duplicate_id text)
      )
      UPDATE location_aliases aliases SET campground_id = mapping.survivor_id
      FROM mapping WHERE aliases.campground_id = mapping.duplicate_id
    `;
    await tx`
      WITH mapping AS (
        SELECT survivor_id::uuid, duplicate_id::uuid
        FROM jsonb_to_recordset(${mappingJson}::jsonb)
          AS x(survivor_id text, duplicate_id text)
      )
      INSERT INTO saved_campgrounds (account_id, campground_id, created_at)
      SELECT saved.account_id, mapping.survivor_id, saved.created_at
      FROM saved_campgrounds saved
      JOIN mapping ON mapping.duplicate_id = saved.campground_id
      ON CONFLICT (account_id, campground_id) DO NOTHING
    `;
    await tx`
      DELETE FROM saved_campgrounds
      WHERE campground_id = ANY(${[...duplicateIds]}::uuid[])
    `;
    await tx`
      WITH mapping AS (
        SELECT survivor_id::uuid, duplicate_id::uuid
        FROM jsonb_to_recordset(${mappingJson}::jsonb)
          AS x(survivor_id text, duplicate_id text)
      )
      UPDATE reports SET campground_id = mapping.survivor_id
      FROM mapping WHERE reports.campground_id = mapping.duplicate_id
    `;
    await tx`
      WITH mapping AS (
        SELECT survivor_id::uuid, duplicate_id::uuid
        FROM jsonb_to_recordset(${mappingJson}::jsonb)
          AS x(survivor_id text, duplicate_id text)
      )
      UPDATE location_source_records sources
      SET campground_id = mapping.survivor_id, updated_at = now()
      FROM mapping WHERE sources.campground_id = mapping.duplicate_id
    `;
    await tx`
      WITH mapping AS (
        SELECT survivor_id::uuid, duplicate_id::uuid
        FROM jsonb_to_recordset(${mappingJson}::jsonb)
          AS x(survivor_id text, duplicate_id text)
      )
      UPDATE campgrounds children SET parent_id = mapping.survivor_id
      FROM mapping
      WHERE children.parent_id = mapping.duplicate_id
        AND children.id <> mapping.survivor_id
    `;
    await tx`
      WITH mapping AS (
        SELECT survivor_id::uuid, duplicate_id::uuid
        FROM jsonb_to_recordset(${mappingJson}::jsonb)
          AS x(survivor_id text, duplicate_id text)
      )
      UPDATE location_suggestions suggestions
      SET campground_id = mapping.survivor_id
      FROM mapping WHERE suggestions.campground_id = mapping.duplicate_id
    `;
    await tx`
      DELETE FROM location_merge_candidates
      WHERE suggested_campground_id = ANY(${[...duplicateIds]}::uuid[])
    `;
    await tx`
      DELETE FROM campground_aggregates
      WHERE campground_id = ANY(${[...duplicateIds]}::uuid[])
    `;
    await tx`
      WITH mapping AS (
        SELECT survivor_id::uuid, duplicate_id::uuid
        FROM jsonb_to_recordset(${mappingJson}::jsonb)
          AS x(survivor_id text, duplicate_id text)
      ), details AS (
        SELECT mapping.survivor_id, mapping.duplicate_id, c.slug
        FROM mapping JOIN campgrounds c ON c.id = mapping.duplicate_id
      )
      INSERT INTO admin_audit_logs (
        actor_id, action, target_type, target_id, details
      )
      SELECT ${actorId}, 'merge_canonical_locations', 'campground',
        survivor_id::text,
        jsonb_build_object('duplicateId', duplicate_id, 'oldSlug', slug,
          'mode', 'automatic-high-confidence')
      FROM details
    `;
    await tx`
      DELETE FROM campgrounds
      WHERE id = ANY(${[...duplicateIds]}::uuid[])
    `;
    await tx`
      WITH survivors AS (
        SELECT DISTINCT survivor_id::uuid AS campground_id
        FROM jsonb_to_recordset(${mappingJson}::jsonb)
          AS x(survivor_id text, duplicate_id text)
      )
      INSERT INTO campground_aggregates (
        campground_id, recent_average, recent_count, historical_average,
        historical_count, most_recent_report_at, calculated_at
      )
      SELECT survivors.campground_id,
        avg(reports.rating) FILTER (
          WHERE reports.observed_on >= (${now}::timestamptz - interval '30 days')::date
        )::real,
        count(reports.id) FILTER (
          WHERE reports.observed_on >= (${now}::timestamptz - interval '30 days')::date
        )::int,
        avg(reports.rating)::real, count(reports.id)::int,
        max(reports.observed_on)::timestamptz, ${now}::timestamptz
      FROM survivors
      LEFT JOIN reports ON reports.campground_id = survivors.campground_id
        AND reports.moderation_status = 'published'
        AND reports.deleted_at IS NULL
      GROUP BY survivors.campground_id
      ON CONFLICT (campground_id) DO UPDATE SET
        recent_average = excluded.recent_average,
        recent_count = excluded.recent_count,
        historical_average = excluded.historical_average,
        historical_count = excluded.historical_count,
        most_recent_report_at = excluded.most_recent_report_at,
        calculated_at = excluded.calculated_at
    `;
    return { merged: mappings.length, survivorCount: survivorIds.size };
  });
}

export async function mergeCanonicalLocations(
  survivorId: string,
  duplicateId: string,
  actorId: string,
) {
  if (survivorId === duplicateId)
    throw new Error("A location cannot be merged into itself");
  return sqlClient.begin(async (tx) => {
    const locked = await tx<{ id: string; slug: string }[]>`
      SELECT id, slug FROM campgrounds
      WHERE id IN (${survivorId}::uuid, ${duplicateId}::uuid)
      ORDER BY id FOR UPDATE
    `;
    if (locked.length !== 2)
      throw new Error("Both canonical locations must exist");
    const duplicate = locked.find((row) => row.id === duplicateId)!;
    await tx`
      INSERT INTO location_aliases (slug, campground_id)
      VALUES (${duplicate.slug}, ${survivorId}::uuid)
      ON CONFLICT (slug) DO UPDATE SET campground_id = excluded.campground_id
    `;
    await tx`
      UPDATE location_aliases SET campground_id = ${survivorId}::uuid
      WHERE campground_id = ${duplicateId}::uuid
    `;
    await tx`
      INSERT INTO saved_campgrounds (account_id, campground_id, created_at)
      SELECT account_id, ${survivorId}::uuid, created_at FROM saved_campgrounds
      WHERE campground_id = ${duplicateId}::uuid
      ON CONFLICT (account_id, campground_id) DO NOTHING
    `;
    await tx`DELETE FROM saved_campgrounds WHERE campground_id = ${duplicateId}::uuid`;
    await tx`UPDATE reports SET campground_id = ${survivorId}::uuid WHERE campground_id = ${duplicateId}::uuid`;
    await tx`UPDATE location_source_records SET campground_id = ${survivorId}::uuid WHERE campground_id = ${duplicateId}::uuid`;
    await tx`UPDATE campgrounds SET parent_id = ${survivorId}::uuid WHERE parent_id = ${duplicateId}::uuid`;
    await tx`UPDATE location_suggestions SET campground_id = ${survivorId}::uuid WHERE campground_id = ${duplicateId}::uuid`;
    await tx`DELETE FROM location_merge_candidates WHERE suggested_campground_id = ${duplicateId}::uuid`;
    await tx`DELETE FROM campground_aggregates WHERE campground_id = ${duplicateId}::uuid`;
    await tx`DELETE FROM campgrounds WHERE id = ${duplicateId}::uuid`;
    await recalculateCampgroundAggregates(tx, survivorId);
    await tx`
      INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, details)
      VALUES (${actorId}, 'merge_canonical_locations', 'campground', ${survivorId},
        ${toPostgresJson({ duplicateId, oldSlug: duplicate.slug })}::jsonb)
    `;
    return { survivorId, redirectedSlug: duplicate.slug };
  });
}
