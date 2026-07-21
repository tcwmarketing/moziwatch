"use client";

import { useState } from "react";

export type LocationCandidate = {
  id: string;
  source: string;
  source_name: string;
  canonical_name: string;
  match_score: number;
  distance_meters: number | null;
  reasons: string[];
  normalized_payload: Record<string, unknown>;
  canonical_payload: Record<string, unknown>;
};
export type CanonicalDuplicateCandidate = {
  id: string;
  triage_tier: "priority" | "medium" | "low";
  left_id: string;
  left_name: string;
  left_slug: string;
  left_city: string;
  left_region: string;
  left_country: string;
  left_address: string;
  left_operator: string | null;
  left_website: string | null;
  left_phone: string | null;
  left_verification_status: string;
  left_source_count: number;
  left_source_names: string | null;
  left_campsite_count: number | null;
  right_id: string;
  right_name: string;
  right_slug: string;
  right_city: string;
  right_region: string;
  right_country: string;
  right_address: string;
  right_operator: string | null;
  right_website: string | null;
  right_phone: string | null;
  right_verification_status: string;
  right_source_count: number;
  right_source_names: string | null;
  right_campsite_count: number | null;
  suggested_survivor_id: string;
  suggested_survivor_name: string;
  match_score: number;
  recommendation: "automatic" | "review";
  distance_meters: number | null;
  reasons: string[];
};
export type LocationDeletionCandidate = {
  id: string;
  name: string;
  slug: string;
  city: string;
  region: string;
  country: string;
  confidence: number;
  reason_codes: string[];
  reasons: string[];
  evidence: Record<string, unknown>;
};
export type LocationImportRun = {
  id: string;
  source: string;
  status: string;
  started_at: string | Date;
  completed_at: string | Date | null;
  last_successful_at: string | Date | null;
  records_downloaded: number;
  records_accepted: number;
  records_excluded: number;
  invalid_coordinates: number;
  duplicates_prevented: number;
  records_inserted: number;
  records_updated: number;
  records_unchanged: number;
  records_matched: number;
  merge_candidates_created: number;
  records_skipped: number;
  errors: Array<{ message?: string }>;
};

export type ManagedLocation = {
  id: string;
  name: string;
  operator: string | null;
  website: string | null;
  phone: string | null;
  operational_status: "active" | "seasonal" | "closed" | "review";
  verification_status: string;
  manual_locks: string[];
  field_provenance: Record<string, unknown>;
};
export type DuplicateQueueSummary = {
  pendingReview: number;
  pendingAutomatic: number;
  priorityReview: number;
  mediumPriority: number;
  lowPriority: number;
  automaticMerged: number;
  totalMerged: number;
};
export type CoverageAudit = {
  completed_at: string | Date;
  checkpoint: {
    summary?: {
      placesExamined?: number;
      representativeGapCount?: number;
    };
    gaps?: Array<{
      geonameId: string;
      name: string;
      kind: "populated_place" | "staged_cluster";
      country: string;
      region: string;
      population: number;
      nearestPublicDistanceKm: number | null;
      stagedCandidateCount: number;
      classification: "source_gap" | "publication_gap";
    }>;
  };
};

type LocationAdminTab =
  | "duplicates"
  | "source-matches"
  | "removals"
  | "records"
  | "imports"
  | "coverage";

export function LocationDataAdmin({
  candidates,
  canonicalDuplicates,
  deletionCandidates,
  runs,
  locations,
  duplicateQueueSummary,
  coverageAudit,
}: {
  candidates: LocationCandidate[];
  canonicalDuplicates: CanonicalDuplicateCandidate[];
  deletionCandidates: LocationDeletionCandidate[];
  runs: LocationImportRun[];
  locations: ManagedLocation[];
  duplicateQueueSummary: DuplicateQueueSummary;
  coverageAudit: CoverageAudit | null;
}) {
  const [tab, setTab] = useState<LocationAdminTab>("duplicates");
  const [duplicateTier, setDuplicateTier] = useState<
    "priority" | "medium" | "low"
  >("priority");
  const [message, setMessage] = useState("");
  const sourceHealth = Array.from(
    new Map(runs.map((run) => [run.source, run])).values(),
  );
  const coverageGaps = coverageAudit?.checkpoint?.gaps || [];
  const visibleCanonicalDuplicates = canonicalDuplicates.filter(
    (candidate) => candidate.triage_tier === duplicateTier,
  );
  async function review(id: string, action: "approve" | "reject" | "separate") {
    const response = await fetch(`/api/admin/location-merges/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setMessage(
      response.ok
        ? "Review saved. Refresh to see the updated queue."
        : "The review could not be saved.",
    );
  }

  async function reviewCanonicalDuplicate(
    id: string,
    action: "approve" | "reject" | "separate",
  ) {
    const response = await fetch(`/api/admin/canonical-duplicates/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setMessage(
      response.ok
        ? action === "approve"
          ? "The duplicate was merged. Refresh to see the updated queue."
          : "The duplicate review was saved."
        : "The duplicate review could not be saved.",
    );
  }

  async function reviewDeletionCandidate(
    id: string,
    action: "approve" | "dismiss",
  ) {
    const response = await fetch(`/api/admin/location-deletions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setMessage(
      response.ok
        ? action === "approve"
          ? "The location was removed from public listings."
          : "The location was kept and dismissed from this queue."
        : "The deletion review could not be saved.",
    );
  }

  async function saveLocation(
    event: React.FormEvent<HTMLFormElement>,
    id: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const locks = ["name", "operator", "website", "phone"].filter(
      (field) => form.get(`lock-${field}`) === "on",
    );
    const response = await fetch(`/api/admin/locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        operator: form.get("operator") || null,
        website: form.get("website") || null,
        phone: form.get("phone") || null,
        operationalStatus: form.get("operationalStatus"),
        locks,
      }),
    });
    setMessage(
      response.ok
        ? "Location and field locks saved."
        : "The location could not be saved.",
    );
  }
  return (
    <>
      <section className="content-card admin-management">
        <div className="admin-management-heading">
          <div>
            <p className="eyebrow">Campground data</p>
            <h2>Choose one task</h2>
          </div>
          <div
            className="admin-tabs"
            role="tablist"
            aria-label="Campground data sections"
          >
            {(
              [
                [
                  "duplicates",
                  `Duplicate review (${duplicateQueueSummary.priorityReview})`,
                ],
                ["source-matches", `Source matches (${candidates.length})`],
                ["removals", `Removal review (${deletionCandidates.length})`],
                ["records", `Records (${locations.length})`],
                ["imports", "Import history"],
                ["coverage", "Coverage gaps"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {message ? (
          <p className="admin-message" role="status">
            {message}
          </p>
        ) : null}
      </section>
      <section className="content-card" hidden={tab !== "imports"}>
        <h2>Location import history</h2>
        <p className="muted">
          Source health is based on the latest run shown for each source. Failed
          records remain available here for inspection and safe restart.
        </p>
        <div className="admin-table">
          {sourceHealth.map((run) => (
            <div key={`health-${run.source}`}>
              <strong>{run.source}</strong>
              <span>
                {run.status === "completed" ? "Healthy" : "Needs attention"}
              </span>
              <span>
                Last successful:{" "}
                {run.last_successful_at
                  ? new Date(run.last_successful_at).toLocaleString()
                  : "never"}
              </span>
            </div>
          ))}
        </div>
        {runs.length ? (
          <div className="admin-table">
            {runs.map((run) => (
              <div key={run.id}>
                <strong>{run.source}</strong>
                <span>{run.status}</span>
                <time>{new Date(run.started_at).toLocaleString()}</time>
                <span>{run.records_downloaded} downloaded</span>
                <span>
                  {run.records_accepted} accepted, {run.records_excluded}{" "}
                  excluded, {run.invalid_coordinates} invalid coordinates
                </span>
                <span>
                  {run.records_inserted} new, {run.records_updated} updated,{" "}
                  {run.records_unchanged} unchanged, {run.records_matched}{" "}
                  matched, {run.merge_candidates_created} review candidates,{" "}
                  {run.duplicates_prevented} duplicates prevented,{" "}
                  {run.records_skipped} skipped
                </span>
                {run.errors?.length ? (
                  <details>
                    <summary>{run.errors.length} import error(s)</summary>
                    {run.errors.map((error, index) => (
                      <p key={index}>
                        {error.message || "Unspecified import error"}
                      </p>
                    ))}
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">No location imports have run yet.</p>
        )}
      </section>
      <section className="content-card" hidden={tab !== "duplicates"}>
        <h2>Existing campground duplicate queue</h2>
        <p className="muted">
          {duplicateQueueSummary.automaticMerged.toLocaleString()} automatic
          high-confidence duplicates have already been merged. The remaining
          candidates are grouped by the strength of their evidence so the
          clearest decisions can be handled first. A score alone is not enough
          to merge records because distinct facilities can share coordinates,
          reservation phone numbers, or source details. Only the priority group
          is the active review queue. Medium candidates can be revisited later,
          and weak matches are retained for audit without requiring action.
        </p>
        <div className="admin-queue-summary">
          <span>
            <strong>
              {duplicateQueueSummary.priorityReview.toLocaleString()}
            </strong>
            priority candidates
          </span>
          <span>
            <strong>
              {duplicateQueueSummary.mediumPriority.toLocaleString()}
            </strong>
            medium candidates
          </span>
          <span>
            <strong>
              {duplicateQueueSummary.lowPriority.toLocaleString()}
            </strong>
            weak matches; no action required
          </span>
        </div>
        <div
          className="admin-tabs duplicate-tier-tabs"
          role="tablist"
          aria-label="Duplicate evidence groups"
        >
          {(
            [
              [
                "priority",
                `Priority (${duplicateQueueSummary.priorityReview})`,
              ],
              ["medium", `Medium (${duplicateQueueSummary.mediumPriority})`],
              ["low", `Weak (${duplicateQueueSummary.lowPriority})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={duplicateTier === value}
              className={duplicateTier === value ? "active" : ""}
              onClick={() => setDuplicateTier(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted duplicate-result-note">
          Showing up to 100 candidates in this group. Resolve candidates and
          refresh to load the next set.
        </p>
        {visibleCanonicalDuplicates.length ? (
          visibleCanonicalDuplicates.map((item) => (
            <article className="merge-review duplicate-review" key={item.id}>
              <div className="duplicate-review-heading">
                <div>
                  <strong>{Math.round(item.match_score * 100)}% match</strong>
                  <span>
                    {item.distance_meters !== null
                      ? `${Math.round(item.distance_meters).toLocaleString()} m apart`
                      : "Distance unavailable"}
                  </span>
                </div>
                <small>{item.reasons.join(" · ")}</small>
              </div>
              <div className="duplicate-comparison-grid">
                <DuplicateCampgroundRecord
                  name={item.left_name}
                  slug={item.left_slug}
                  city={item.left_city}
                  region={item.left_region}
                  country={item.left_country}
                  address={item.left_address}
                  operator={item.left_operator}
                  website={item.left_website}
                  phone={item.left_phone}
                  verificationStatus={item.left_verification_status}
                  sourceCount={item.left_source_count}
                  sourceNames={item.left_source_names}
                  campsiteCount={item.left_campsite_count}
                  suggested={item.suggested_survivor_id === item.left_id}
                />
                <DuplicateCampgroundRecord
                  name={item.right_name}
                  slug={item.right_slug}
                  city={item.right_city}
                  region={item.right_region}
                  country={item.right_country}
                  address={item.right_address}
                  operator={item.right_operator}
                  website={item.right_website}
                  phone={item.right_phone}
                  verificationStatus={item.right_verification_status}
                  sourceCount={item.right_source_count}
                  sourceNames={item.right_source_names}
                  campsiteCount={item.right_campsite_count}
                  suggested={item.suggested_survivor_id === item.right_id}
                />
              </div>
              <div hidden>
                <p>
                  <strong>{item.left_name}</strong> and{" "}
                  <strong>{item.right_name}</strong>
                </p>
                <p>
                  {Math.round(item.match_score * 100)}% score
                  {item.distance_meters !== null
                    ? `, ${Math.round(item.distance_meters)} m apart`
                    : ""}
                  {item.recommendation === "automatic"
                    ? " — high confidence"
                    : " — needs review"}
                </p>
                <small>{item.reasons.join(", ")}</small>
                <p>
                  Suggested record to keep:{" "}
                  <strong>{item.suggested_survivor_name}</strong>
                </p>
              </div>
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() => reviewCanonicalDuplicate(item.id, "approve")}
                >
                  Merge records
                </button>
                <button
                  className="button secondary"
                  onClick={() => reviewCanonicalDuplicate(item.id, "separate")}
                >
                  Keep separate
                </button>
                <button
                  className="button danger"
                  onClick={() => reviewCanonicalDuplicate(item.id, "reject")}
                >
                  Dismiss candidate
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">
            No existing campground duplicates need review.
          </p>
        )}
      </section>
      <section className="content-card" hidden={tab !== "source-matches"}>
        <h2>Merge review queue</h2>
        {candidates.length ? (
          candidates.map((item) => (
            <article className="merge-review" key={item.id}>
              <p>
                <strong>{item.source_name}</strong>{" "}
                <small>from {item.source}</small>
              </p>
              <p>
                Suggested match: <strong>{item.canonical_name}</strong>
              </p>
              <p>
                {Math.round(item.match_score * 100)}% score
                {item.distance_meters !== null
                  ? `, ${Math.round(item.distance_meters)} m apart`
                  : ""}
              </p>
              <small>{item.reasons.join(", ")}</small>
              <details>
                <summary>Compare source and canonical fields</summary>
                <div className="form-row">
                  <pre>{JSON.stringify(item.normalized_payload, null, 2)}</pre>
                  <pre>{JSON.stringify(item.canonical_payload, null, 2)}</pre>
                </div>
              </details>
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() => review(item.id, "approve")}
                >
                  Approve match
                </button>
                <button
                  className="button secondary"
                  onClick={() => review(item.id, "separate")}
                >
                  Create separate
                </button>
                <button
                  className="button danger"
                  onClick={() => review(item.id, "reject")}
                >
                  Reject
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">
            No uncertain duplicate matches need review.
          </p>
        )}
      </section>
      <section className="content-card" hidden={tab !== "removals"}>
        <h2>Potential location removals</h2>
        <p className="muted">
          These records look like non-campground facilities, individual sites,
          stale locations, or weak generic imports. Nothing is removed
          automatically. Removing a location is a reversible soft removal that
          preserves reports and audit history.
        </p>
        {deletionCandidates.length ? (
          deletionCandidates.map((item) => (
            <article className="merge-review" key={item.id}>
              <p>
                <strong>{item.name}</strong>
              </p>
              <p>
                {item.city}, {item.region}, {item.country} —{" "}
                {Math.round(item.confidence * 100)}% review confidence
              </p>
              {item.reasons.map((reason) => (
                <small key={reason}>{reason}</small>
              ))}
              <p>
                <a
                  href={`/campgrounds/${item.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open campground page
                </a>
              </p>
              <details>
                <summary>Review evidence</summary>
                <pre>{JSON.stringify(item.evidence, null, 2)}</pre>
              </details>
              <div className="button-row">
                <button
                  className="button danger"
                  onClick={() => reviewDeletionCandidate(item.id, "approve")}
                >
                  Remove from public listings
                </button>
                <button
                  className="button secondary"
                  onClick={() => reviewDeletionCandidate(item.id, "dismiss")}
                >
                  Keep location
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">
            No locations currently need removal review.
          </p>
        )}
      </section>
      <section className="content-card" hidden={tab !== "records"}>
        <h2>Canonical location management</h2>
        <p className="muted">
          Manual locks prevent future lower-priority imports from replacing the
          selected fields.
        </p>
        {locations.map((location) => (
          <details key={location.id}>
            <summary>
              {location.name} — {location.operational_status} (
              {location.verification_status})
            </summary>
            <form
              className="report-form compact"
              onSubmit={(event) => saveLocation(event, location.id)}
            >
              {(["name", "operator", "website", "phone"] as const).map(
                (field) => (
                  <div className="form-row" key={field}>
                    <label>
                      {field[0].toUpperCase() + field.slice(1)}
                      <input
                        name={field}
                        type={field === "website" ? "url" : "text"}
                        defaultValue={location[field] || ""}
                        required={field === "name"}
                      />
                    </label>
                    <label>
                      Protect from imports
                      <input
                        name={`lock-${field}`}
                        type="checkbox"
                        defaultChecked={location.manual_locks.includes(field)}
                      />
                    </label>
                  </div>
                ),
              )}
              <label>
                Operational status
                <select
                  name="operationalStatus"
                  defaultValue={location.operational_status}
                >
                  <option value="active">Active</option>
                  <option value="seasonal">Seasonal</option>
                  <option value="review">Needs review</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <details>
                <summary>View field provenance</summary>
                <pre>{JSON.stringify(location.field_provenance, null, 2)}</pre>
              </details>
              <button className="button primary" type="submit">
                Save and lock fields
              </button>
            </form>
          </details>
        ))}
      </section>
      <section className="content-card" hidden={tab !== "coverage"}>
        <h2>North American coverage gaps</h2>
        {coverageAudit ? (
          <>
            <p>
              Automatically checked{" "}
              {coverageAudit.checkpoint.summary?.placesExamined?.toLocaleString() ||
                "the configured"}{" "}
              populated places plus rural candidate clusters. Last run{" "}
              {new Date(coverageAudit.completed_at).toLocaleString()}.
            </p>
            <p>
              <strong>
                {coverageAudit.checkpoint.summary?.representativeGapCount ||
                  coverageGaps.length}
              </strong>{" "}
              representative regions need source coverage or candidate review.
            </p>
            <div className="admin-table" role="table">
              {coverageGaps.slice(0, 30).map((gap) => (
                <div role="row" key={gap.geonameId}>
                  <span>
                    <strong>{gap.name}</strong>
                    <br />
                    {gap.region || gap.country}, {gap.country}
                  </span>
                  <span>
                    {gap.kind === "populated_place"
                      ? `${gap.population.toLocaleString()} residents`
                      : `${gap.stagedCandidateCount} staged candidates`}
                  </span>
                  <span>
                    {gap.nearestPublicDistanceKm === null
                      ? "No published campground"
                      : `${gap.nearestPublicDistanceKm} km to published campground`}
                  </span>
                  <span>
                    {gap.classification === "publication_gap"
                      ? `Review ${gap.stagedCandidateCount} candidate${gap.stagedCandidateCount === 1 ? "" : "s"}`
                      : "Additional source needed"}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="empty-state">
            No coverage audit has run yet. Run npm run locations:audit-coverage.
          </p>
        )}
      </section>
    </>
  );
}

const EMPTY_LOCATION_VALUES = new Set([
  "",
  "unknown",
  "address not provided",
  "not available",
]);

function displayableLocationValue(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return EMPTY_LOCATION_VALUES.has(trimmed.toLowerCase()) ? null : trimmed;
}

function DuplicateCampgroundRecord({
  name,
  slug,
  city,
  region,
  country,
  address,
  operator,
  website,
  phone,
  verificationStatus,
  sourceCount,
  sourceNames,
  campsiteCount,
  suggested,
}: {
  name: string;
  slug: string;
  city: string;
  region: string;
  country: string;
  address: string;
  operator: string | null;
  website: string | null;
  phone: string | null;
  verificationStatus: string;
  sourceCount: number;
  sourceNames: string | null;
  campsiteCount: number | null;
  suggested: boolean;
}) {
  const location = [city, region, country]
    .map(displayableLocationValue)
    .filter(Boolean)
    .join(", ");
  const visibleAddress = displayableLocationValue(address);
  const visibleOperator = displayableLocationValue(operator);
  const visiblePhone = displayableLocationValue(phone);
  const visibleSources = displayableLocationValue(sourceNames);

  return (
    <section className="duplicate-record">
      <header>
        <div>
          <h3>{name}</h3>
          {suggested ? <span>Suggested record to keep</span> : null}
        </div>
        <a href={`/campgrounds/${slug}`} target="_blank" rel="noreferrer">
          Open campground page
        </a>
      </header>
      <dl>
        <div>
          <dt>Location</dt>
          <dd>{location || "Not identified"}</dd>
        </div>
        {visibleAddress ? (
          <div>
            <dt>Address</dt>
            <dd>{visibleAddress}</dd>
          </div>
        ) : null}
        {visibleOperator ? (
          <div>
            <dt>Operator</dt>
            <dd>{visibleOperator}</dd>
          </div>
        ) : null}
        <div>
          <dt>Campsites</dt>
          <dd>{campsiteCount ?? "Not available"}</dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd>{verificationStatus.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Imported sources</dt>
          <dd>
            {sourceCount.toLocaleString()}
            {visibleSources ? `: ${visibleSources}` : ""}
          </dd>
        </div>
        {visiblePhone ? (
          <div>
            <dt>Phone</dt>
            <dd>{visiblePhone}</dd>
          </div>
        ) : null}
        {website ? (
          <div>
            <dt>Source website</dt>
            <dd>
              <a href={website} target="_blank" rel="noreferrer">
                Open website
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
