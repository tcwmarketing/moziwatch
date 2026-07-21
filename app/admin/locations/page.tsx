import Link from "next/link";
import type { Metadata } from "next";
import {
  LocationDataAdmin,
  type CanonicalDuplicateCandidate,
  type CoverageAudit,
  type DuplicateQueueSummary,
  type LocationCandidate,
  type LocationDeletionCandidate,
  type LocationImportRun,
  type ManagedLocation,
} from "@/components/location-data-admin";
import { sqlClient } from "@/db";
import { requireAdmin } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Campground data administration",
  robots: { index: false, follow: false },
};

type DuplicateQueueSummaryRow = {
  pending_review: number;
  pending_automatic: number;
  priority_review: number;
  medium_priority: number;
  low_priority: number;
  automatic_merged: number;
  total_merged: number;
};

export default async function AdminLocationsPage() {
  await requireAdmin();
  const [
    locationRuns,
    mergeCandidates,
    canonicalDuplicates,
    deletionCandidates,
    locations,
    coverageAudits,
    duplicateQueueRows,
  ] = await Promise.all([
    sqlClient<LocationImportRun[]>`
      SELECT id, source, status, started_at, completed_at,
        max(completed_at) FILTER (WHERE status = 'completed')
          OVER (PARTITION BY source) AS last_successful_at,
        records_downloaded, records_accepted, records_excluded,
        invalid_coordinates, duplicates_prevented, records_inserted,
        records_updated, records_unchanged, records_matched,
        merge_candidates_created, records_skipped, errors
      FROM location_import_runs
      ORDER BY started_at DESC LIMIT 30
    `,
    sqlClient<LocationCandidate[]>`
      SELECT m.id, s.source, s.normalized_payload->>'name' AS source_name,
        c.name AS canonical_name, m.match_score, m.distance_meters, m.reasons,
        s.normalized_payload,
        jsonb_build_object(
          'name', c.name, 'type', c.location_type, 'operator', c.operator,
          'website', c.website, 'phone', c.phone, 'address', c.address,
          'city', c.city, 'region', c.region, 'country', c.country,
          'latitude', c.latitude, 'longitude', c.longitude,
          'provenance', c.field_provenance
        ) AS canonical_payload
      FROM location_merge_candidates m
      JOIN location_source_records s ON s.id = m.source_record_id
      JOIN campgrounds c ON c.id = m.suggested_campground_id
      WHERE m.status = 'pending'
      ORDER BY m.match_score DESC LIMIT 100
    `,
    sqlClient<CanonicalDuplicateCandidate[]>`
      WITH classified_candidates AS (
        SELECT d.*,
          CASE
            WHEN (d.distance_meters <= 150 AND d.name_similarity >= 0.90)
              OR (d.website_match AND d.name_similarity >= 0.75)
              OR (d.address_match AND d.name_similarity >= 0.75)
              OR (d.phone_match AND d.name_similarity >= 0.85)
              THEN 'priority'
            WHEN d.match_score >= 0.85 THEN 'medium'
            ELSE 'low'
          END AS triage_tier
        FROM canonical_duplicate_candidates d
        WHERE d.status = 'pending'
      ), ranked_candidates AS (
        SELECT classified_candidates.*,
          row_number() OVER (
            PARTITION BY triage_tier
            ORDER BY match_score DESC, last_detected_at DESC
          ) AS tier_rank
        FROM classified_candidates
      ), selected_ids AS (
        SELECT left_campground_id AS campground_id
        FROM ranked_candidates WHERE tier_rank <= 100
        UNION
        SELECT right_campground_id AS campground_id
        FROM ranked_candidates WHERE tier_rank <= 100
      ), source_stats AS (
        SELECT source.campground_id, count(*)::int AS source_count,
          string_agg(DISTINCT source.source, ', ' ORDER BY source.source)
            AS source_names,
          (array_agg(source.campsite_count ORDER BY
            (source.campsite_count_kind = 'official_total') DESC,
            source.authoritative DESC, source.source_priority DESC,
            source.campsite_count_checked_at DESC NULLS LAST
          ) FILTER (WHERE source.campsite_count IS NOT NULL))[1]::int
            AS campsite_count
        FROM location_source_records source
        WHERE source.campground_id IN (SELECT campground_id FROM selected_ids)
        GROUP BY source.campground_id
      )
      SELECT d.id, d.triage_tier,
        left_location.id AS left_id, left_location.name AS left_name,
        left_location.slug AS left_slug, left_location.city AS left_city,
        left_location.region AS left_region,
        left_location.country AS left_country,
        left_location.address AS left_address,
        left_location.operator AS left_operator,
        left_location.website AS left_website,
        left_location.phone AS left_phone,
        left_location.verification_status AS left_verification_status,
        coalesce(left_sources.source_count, 0)::int AS left_source_count,
        left_sources.source_names AS left_source_names,
        left_sources.campsite_count AS left_campsite_count,
        right_location.id AS right_id, right_location.name AS right_name,
        right_location.slug AS right_slug, right_location.city AS right_city,
        right_location.region AS right_region,
        right_location.country AS right_country,
        right_location.address AS right_address,
        right_location.operator AS right_operator,
        right_location.website AS right_website,
        right_location.phone AS right_phone,
        right_location.verification_status AS right_verification_status,
        coalesce(right_sources.source_count, 0)::int AS right_source_count,
        right_sources.source_names AS right_source_names,
        right_sources.campsite_count AS right_campsite_count,
        survivor.id AS suggested_survivor_id,
        survivor.name AS suggested_survivor_name, d.match_score,
        d.recommendation, d.distance_meters, d.reasons
      FROM ranked_candidates d
      JOIN campgrounds left_location ON left_location.id = d.left_campground_id
      JOIN campgrounds right_location ON right_location.id = d.right_campground_id
      JOIN campgrounds survivor ON survivor.id = d.suggested_survivor_id
      LEFT JOIN source_stats left_sources
        ON left_sources.campground_id = left_location.id
      LEFT JOIN source_stats right_sources
        ON right_sources.campground_id = right_location.id
      WHERE d.tier_rank <= 100
      ORDER BY CASE d.triage_tier
        WHEN 'priority' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        d.match_score DESC, d.last_detected_at DESC
    `,
    sqlClient<LocationDeletionCandidate[]>`
      SELECT d.id, c.name, c.slug, c.city, c.region, c.country,
        d.confidence, d.reason_codes, d.reasons, d.evidence
      FROM location_deletion_candidates d
      JOIN campgrounds c ON c.id = d.campground_id
      WHERE d.status = 'pending'
      ORDER BY d.confidence DESC, d.last_detected_at DESC
      LIMIT 100
    `,
    sqlClient<ManagedLocation[]>`
      SELECT id, name, operator, website, phone, operational_status,
        verification_status, manual_locks, field_provenance
      FROM campgrounds ORDER BY updated_at DESC LIMIT 50
    `,
    sqlClient<CoverageAudit[]>`
      SELECT completed_at, checkpoint
      FROM location_import_runs
      WHERE source = 'coverage-audit' AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 1
    `,
    sqlClient<DuplicateQueueSummaryRow[]>`
      SELECT
        count(*) FILTER (
          WHERE status = 'pending' AND recommendation = 'review'
        )::int AS pending_review,
        count(*) FILTER (
          WHERE status = 'pending' AND recommendation = 'automatic'
        )::int AS pending_automatic,
        count(*) FILTER (
          WHERE status = 'pending' AND (
            (distance_meters <= 150 AND name_similarity >= 0.90)
            OR (website_match AND name_similarity >= 0.75)
            OR (address_match AND name_similarity >= 0.75)
            OR (phone_match AND name_similarity >= 0.85)
          )
        )::int AS priority_review,
        count(*) FILTER (
          WHERE status = 'pending'
            AND NOT (
              (distance_meters <= 150 AND name_similarity >= 0.90)
              OR (website_match AND name_similarity >= 0.75)
              OR (address_match AND name_similarity >= 0.75)
              OR (phone_match AND name_similarity >= 0.85)
            )
            AND match_score >= 0.85
        )::int AS medium_priority,
        count(*) FILTER (
          WHERE status = 'pending'
            AND NOT (
              (distance_meters <= 150 AND name_similarity >= 0.90)
              OR (website_match AND name_similarity >= 0.75)
              OR (address_match AND name_similarity >= 0.75)
              OR (phone_match AND name_similarity >= 0.85)
            )
            AND match_score < 0.85
        )::int AS low_priority,
        (
          SELECT count(*)::int FROM admin_audit_logs
          WHERE action = 'merge_canonical_locations'
            AND details->>'mode' = 'automatic-high-confidence'
        ) AS automatic_merged,
        (
          SELECT count(*)::int FROM admin_audit_logs
          WHERE action = 'merge_canonical_locations'
        ) AS total_merged
      FROM canonical_duplicate_candidates
    `,
  ]);
  const coverageAudit = coverageAudits[0];
  const duplicateQueueRow = duplicateQueueRows[0];
  const duplicateQueueSummary: DuplicateQueueSummary = {
    pendingReview: duplicateQueueRow?.pending_review || 0,
    pendingAutomatic: duplicateQueueRow?.pending_automatic || 0,
    priorityReview: duplicateQueueRow?.priority_review || 0,
    mediumPriority: duplicateQueueRow?.medium_priority || 0,
    lowPriority: duplicateQueueRow?.low_priority || 0,
    automaticMerged: duplicateQueueRow?.automatic_merged || 0,
    totalMerged: duplicateQueueRow?.total_merged || 0,
  };

  return (
    <div className="content-page admin-page admin-locations-page">
      <header>
        <p className="eyebrow">Secured administration</p>
        <h1>Campground data operations.</h1>
      </header>
      <nav className="admin-section-nav" aria-label="Administration areas">
        <Link href="/admin">Profiles and submissions</Link>
        <Link className="active" href="/admin/locations">
          Campground data
        </Link>
      </nav>
      <div className="dashboard-grid">
        <LocationDataAdmin
          candidates={mergeCandidates}
          canonicalDuplicates={canonicalDuplicates}
          deletionCandidates={deletionCandidates}
          runs={locationRuns}
          locations={locations}
          duplicateQueueSummary={duplicateQueueSummary}
          coverageAudit={coverageAudit || null}
        />
      </div>
    </div>
  );
}
