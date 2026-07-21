# Canonical campground location data

The public map, reports, saved campgrounds, ratings, and detail pages continue to use the existing `campgrounds` table. Imported data never creates a competing public location system.

## Data model

- `campgrounds` is the canonical public record. It contains one generated PostGIS point, normalized name, location type, optional parent, operating and verification status, optional non-point source geometry, contact fields, compact deterministic field provenance, and manual locks. Unused provider descriptions and the legacy duplicate geography point are not stored.
- `location_source_providers` stores each provider's licence, attribution, and default priority once.
- `location_source_records` stores each retained provider record's stable external ID, source and record URLs, every extracted contact email and HTTP(S) URL, fetched/last-seen timestamps, missing count, checksum, compact source-specific/normalized JSON, optional non-point geometry, and canonical link. Point coordinates live once in the indexed `representative_point`. `(source, external_id)` is unique.
- `location_source_tombstones` stores a compact rejection record for removed provider IDs. Importers check it before recreating a location; it intentionally does not retain the discarded raw provider payload.
- `location_import_runs` records checkpoints, counts, errors, dataset version, dry-run state, and completion status.
- `location_merge_candidates` stores uncertain matches and the signals that produced the score.
- `location_aliases` redirects old public slugs after a transactional canonical merge.
- `location_suggestions` is a moderated inbox. Public submissions do not write to `campgrounds`.

Individual OSM `tourism=camp_pitch` features are rejected and never become public locations. Parent-child records allow a park to contain multiple distinct campgrounds without merging the park into a campground.

## Matching and field selection

Candidate lookup uses the PostGIS GiST point indexes and a 50 km maximum search radius. Scoring uses normalized-name trigram similarity, distance, country/region compatibility, normalized website identity, normalized phone number, operator, parent park, and normalized address. A separate campground-name identity comparison ignores provider filler terms such as `camp`, `campground`, `RV`, `cabins`, `family`, `KOA`, and `holiday`; the stored public name is never simplified. The identity score is still gated by distance and the other match evidence, so distance alone can never reach the review threshold. Shared provider domains such as `koa.com`, `bcparks.ca`, `nps.gov`, and `recreation.gov` match only when their complete page paths match.

The defaults are:

- automatic match: `0.90`
- admin review: `0.62`
- maximum candidate distance: `50000` metres

They can be adjusted with the `LOCATION_MATCH_*` environment variables. Adjust them only after reviewing false-positive and false-negative samples.

Existing canonical records can be audited by jurisdiction without changing data:

```bash
npm run locations:duplicates -- --country=US --region=WA --max-distance=1000
```

Confirmed pairs can be merged with `locations:merge`; corrected official fields can be locked with `locations:verify`. Both maintenance actions require the single local operator account and write an audit record. Broad audit runs should be split by country/region so the spatial self-join remains bounded.

Field priority is deterministic: admin manual values and locks (100), NPS/RIDB/BC authoritative records (80–82), then OpenStreetMap (60). A scheduled import cannot replace a locked field. Lower-priority sources can still fill empty fields. Every selected canonical field records its source and priority in `field_provenance`.

## Merge safety

Canonical merges lock both rows in stable UUID order and run in one transaction. The operation reassigns reports, saved records, source records, children, and suggestions; recalculates ratings; saves the removed slug in `location_aliases`; removes the duplicate; and creates an admin audit entry. Failed transactions leave both locations unchanged.

## Public and admin behavior

The public bounding-box API and directory return active, verified canonical records only. Unverified Overture discovery records, source records, tombstones, and pending merge candidates cannot appear as map markers. A canonical campground without published mosquito reports uses the existing gray marker and accepts normal report submissions. Missing locations can be submitted through the moderated “suggest a campground” workflow.

The protected admin page shows import health/history, failed run messages, counts, merge comparisons and review actions, recent canonical locations, field provenance, manual locks, and closed/restored status. Location detail pages show source-specific attribution separately from basemap attribution.
