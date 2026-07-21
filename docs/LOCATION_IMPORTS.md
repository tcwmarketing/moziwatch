# Campground import operations

## Coverage audit

Run `npm run locations:audit-coverage` after a full location refresh. The command checks all US and Canadian GeoNames populated places with at least 10,000 residents and rural clusters of strong staged Overture candidates. It stores the latest ranked report in `location_import_runs` under the `coverage-audit` source and makes it visible on the admin page.

The monthly and full refresh commands run this audit automatically after importing, verifying and duplicate scanning. Use `npm run locations:audit-coverage -- --dry-run=true` to inspect the current result without replacing the stored report. See `docs/COVERAGE_GAPS.md` for the radii and classification rules.

Run `npm run db:migrate` first. The canonical `campgrounds` table remains the only public location system. Every provider record is stored in `location_source_records`, where multiple providers may link to one campground. BC sources and existing BC records are outside this phase.

## Source commands

Install the Overture query dependency once on a worker:

```bash
python -m pip install -r requirements-locations.txt
```

Then start with small dry runs:

```bash
npm run locations:import:overture-ca -- --dry-run --limit=25
npm run locations:import:overture-us -- --dry-run --limit=25
npm run locations:import:parks-canada -- --dry-run --limit=25
npm run locations:import:quebec -- --dry-run --limit=25
npm run locations:import:nova-scotia -- --dry-run --limit=25
npm run locations:import:ridb -- --dry-run --limit=25
npm run locations:import:usfs -- --dry-run --limit=25
npm run locations:import:nps -- --dry-run --limit=25
```

Run all enabled non-BC sources with `npm run locations:import:all`. `RIDB_API_KEY` or `RIDB_BULK_FILE` enables RIDB; `NPS_API_KEY` enables the optional NPS supplement. Overture, Parks Canada, Québec, Nova Scotia, and USFS need no API key. `OVERTURE_RELEASE` may pin a release; otherwise the worker resolves the current release from the official STAC catalog. `OVERTURE_PYTHON` may identify a non-default Python executable.

For the first continent-scale load only, `locations:bootstrap:overture-ca`, `locations:bootstrap:overture-us`, `locations:bootstrap:ridb`, and `locations:bootstrap:usfs` use set-based source upserts. They automatically link one unambiguous exact-name match within 250 metres and preserve all existing canonical rows and manual locks; every other accepted record receives a deterministic canonical ID/slug. Normal scheduled refreshes use the full field-by-field matcher.

All commands accept `--dry-run`, `--limit=N`, `--batch=N`, `--country=CA`, `--region=ON`, `--dataset-version=value`, and `--resume=RUN_UUID`. Overture supports `--region` at query time. Dry and limited runs never increase missing-record counters.

## Inclusion and retention policy

The centralized classifier accepts named, established campgrounds with explicit camping evidence. It rejects individual pitches/campsites, RV-only parks, residential/mobile-home parks, non-camping recreation features, invalid WGS84 coordinates, and permanently closed records. “RV” in a campground name is not by itself grounds for rejection. Overture discovery requires `campground` as the **primary** category and confidence of at least `0.70`; an alternate category alone is insufficient. Camp-named locations remain eligible for later review, but conference/retreat centres, residential communities, retailers/service businesses, and clearly non-campground facilities are excluded.

Parks Canada accommodation points are consolidated into one record per named campground. Nova Scotia duplicate entrances are consolidated. RIDB resolves the Camping activity identifier from the live activities endpoint and imports facilities, never campsite inventory.

## Matching, provenance, and removals

Source precedence is manual lock/review (100), authoritative official sources (80-90), Overture (60), then unverified data. An official record that matches an Overture campground keeps the canonical ID and adds another source relationship. Higher-priority usable fields may enrich the canonical row; manual locks are never overwritten.

Each source record retains source/external ID, all discovered email addresses and HTTP(S) URLs, authoritative flag, release, source-updated timestamp, first/last seen timestamps, hash, a compact normalized payload, optional non-point source geometry, canonical link, priority, and import status. Licence and attribution are stored once per provider in `location_source_providers`. Overture raw payloads are reduced to category, alternate categories, confidence, operating status, and feature version. Other providers retain only source-specific raw fields needed for campsite capacity, maintenance, facilities, or verification. Complete provider responses and unused descriptions are not retained in PostgreSQL. A missing record increments `consecutive_missing_count` only after a complete production run.

After deploying the storage migration, compact records imported by an older application version with:

```bash
npm run locations:cleanup:storage
```

The cleanup extracts emails and URLs before reducing provider JSON, removes duplicate point-shaped source geometry, compacts normalized payloads and field provenance, and analyzes the affected tables. It is idempotent. Full polygon and multipolygon source geometry remains available for habitat and boundary processing.

After reviewing the logical cleanup, reclaim physical disk space during a maintenance window without reprocessing rows:

```bash
npm run locations:cleanup:storage -- --vacuum-only --full-vacuum
```

The public map and directory show canonical locations verified by an authoritative source or by a conservative publication rule. Overture-only records normally remain an internal unverified staging set. `npm run locations:verify:overture` previews the nationwide `overture-established-campground-v2` rule; add `-- --apply=true` to publish it. The rule requires the exact Overture `campground` primary category, explicit established-campground naming, and confidence of at least 0.95, reduced to 0.80 when a website is present. An abbreviated RV name is accepted at 0.90 only when its website URL independently identifies a campground, camping, RV park, or RV resort. Standalone RV-hookup and mobile-home facilities remain staged. The rule also excludes camps, schools, religious/youth facilities, retailers, residential communities, visitor facilities, and other common category mistakes. Automatic duplicate matches and virtually identical names within 500 metres are held back rather than publishing a second marker. When a later official source matches an Overture canonical record, the importer promotes that canonical record without changing its stable ID or report relationships.

Run `npm run locations:cleanup:overture` for a read-only cleanup preview. Apply the exact previewed cohort with:

```bash
npm run locations:cleanup:overture -- --apply=true --batch=500
```

The cleanup removes rejected Overture source records and orphaned unverified canonical locations only when they have no reports or saves. It stores a compact `(source, external_id)` tombstone with the rejection rule, name, approximate location, confidence, release, and checksum. Both normal and bootstrap import paths check tombstones before creating or updating records. Retained Overture payloads are compacted and the affected tables are vacuumed/analyzed. The rule version is `overture-retention-v1`; the minimum confidence is `0.70`.

Ordinary vacuuming makes deleted space reusable inside PostgreSQL but does not reduce the physical table file. During a planned maintenance window, add `--full-vacuum=true` for a one-time physical rewrite. This takes an exclusive lock on `campgrounds` and `location_source_records` while each small table is rewritten.

Run history persists dataset version, downloaded, accepted, created, updated, unchanged, matched, excluded, invalid-coordinate, duplicate-prevention, review-candidate, error and timing timestamps. Inspect with `npm run locations:import:status`; review uncertain matches in `/admin`.

## Catalogue cleanup queues

Run `npm run locations:duplicates` to refresh the canonical duplicate queue. High-confidence pairs still require administrator approval before a transactional merge. The matcher treats nearby ranger stations, public service facilities, marinas, day-use areas, and other separately named facilities as distinct from campgrounds instead of relying on name similarity alone.

Run `npm run locations:deletion-candidates` to refresh the potential-removal queue. The audit flags precise non-campground names such as ranger stations, visitor centres, trailheads, picnic/day-use areas, rest areas, individual numbered facilities, stale source records, and weak generic Overture city labels. It never removes a location automatically. Review candidates in `/admin`; approval performs a reversible soft removal (`active = false`, operational status `closed`) and preserves source records, reports, aliases, and the audit trail. Dismissal keeps the campground public.

Weekly and monthly refreshes update both queues after their source imports. Pending machine-generated removal candidates that no longer match the current audit rules are removed from the queue without changing their campground records. Reviewed decisions remain stored.

## Campsite-count enrichment

Run `npm run locations:enrich-capacity` after migrations. It first backfills typed campsite counts already present in the official BC Recreation, BC Parks, and Québec tourism source payloads. It then checks the official RIDB campsite-inventory endpoint for linked U.S. RIDB facilities, with two concurrent requests, a maximum of 500 facilities per run, and database checkpoints every 100 facilities by default.

RIDB counts are stored as `reservable_inventory`, because the campsite endpoint may omit non-reservable or first-come sites. BC and Québec values are stored as `official_total`. A future OpenStreetMap import stores an explicit `capacity` tag as `mapped_capacity`; component capacity tags are not added together because they may overlap. Zero or missing values remain unknown rather than being displayed as zero campsites.

Useful options are `--limit=N`, `--batch=N`, `--concurrency=N`, `--stale-days=N`, and `--skip-ridb`. `RIDB_API_KEY` is required unless `--skip-ridb` is used. Successfully checked RIDB facilities are not requested again until their configured stale interval expires, including facilities for which RIDB currently returns no campsite inventory. The worker stops its run after repeated HTTP 429 responses and leaves unprocessed facilities eligible for a later run instead of continuing to pressure the provider.

## Coordinate-derived locality enrichment

Run `npm run locations:enrich-localities` after a large USFS refresh. It first fills `Unknown` city/region fields from stronger linked source records. Remaining verified US or Canadian records are assigned the nearest populated place and administrative code from the offline GeoNames `cities500` dataset. The download is cached under `data/locations/geonames`, is not committed, and is licensed CC BY 4.0. The locality is shown without a “Near” prefix; it is a nearest-place label and does not claim the campground is inside municipal boundaries. Manual locks are never changed, and field provenance records `geonames-cities500` at priority 70.

The same command repairs the occasional unsigned western USFS longitude and removes zero-coordinate placeholders from public results when they have no camper reports. The USFS normalizer now rejects new `(0, 0)` placeholders. Weekly and full location refreshes run locality enrichment automatically.

## Schedule

- Overture Canada and U.S., plus Nova Scotia: monthly (`LOCATION_MONTHLY_CRON`, default first day 08:00 UTC).
- Parks Canada, Québec, RIDB, USFS, and configured NPS: weekly (`LOCATION_REFRESH_CRON`, default Monday 07:00 UTC).
- Campsite-count enrichment: part of the weekly refresh. It checks at most 500 currently stale or unmeasured RIDB facilities per run and stops early on repeated rate-limit responses.

Run `npm run locations:scheduler` as one singleton. The legacy OSM importer is deliberately absent from refresh and schedule paths.

If a worker is terminated between checkpoints, run `npm run locations:reconcile` after confirming that no import has legitimately been running for more than ten minutes. It marks only stale run-log rows as `partial`; it does not change source records or campgrounds. All source imports are idempotent and may then be rerun.

Use `npm run locations:audit` for a compact production-only source summary, canonical counts by country, pending merge count, preserved BC-source count, and the Overture-to-BC leakage check.

## Overpass resilience and private-campground coverage

The targeted OSM gap-fill command rotates between the main public Overpass
endpoint and a public fallback so a single overloaded endpoint does not stop a
coverage run. Set `OVERPASS_API_URLS` to a comma-separated allowlist when a
deployment uses its own or another permitted Overpass instance. Keep batches
small; this is a gap-filling supplement, not a continent-scale source.

Overture remains the broad discovery source, but Overture-only places are held
back unless they pass the conservative publication rules above. The preferred
next source for established private campgrounds is an authorized OHI /
GoCampingAmerica or Spot2Nite partner feed. OutReserve's developer API is a
documented alternative supplement after an API key and usage approval are
obtained. These commercial feeds must be imported through a licensed agreement;
the worker must not scrape KOA, GoCampingAmerica, booking marketplaces, or other
commercial directories.

Until a feed is authorized, use OSM gap fill and official sources as corroboration
rather than lowering the Overture confidence threshold. This avoids restoring the
low-confidence facilities and non-campgrounds removed during catalogue cleanup.

## Official validation references for remaining Canada coverage

The initial baseline for provinces/territories not covered by an authoritative adapter is Overture. Before adding an adapter, confirm a stable machine-readable endpoint and redistribution licence. Validation starting points:

- Alberta: <https://open.alberta.ca/opendata>
- Saskatchewan: <https://publications.saskatchewan.ca/#/categories/46>
- Manitoba: <https://geoportal.gov.mb.ca/>
- Ontario: <https://data.ontario.ca/>
- New Brunswick: <https://www.snb.ca/geonb1/e/DC/catalogue-E.asp>
- Prince Edward Island: <https://data.princeedwardisland.ca/>
- Newfoundland and Labrador: <https://opendata.gov.nl.ca/>
- Yukon: <https://open.yukon.ca/data/>
- Northwest Territories: <https://www.geomatics.gov.nt.ca/>
- Nunavut: <https://www.canada.ca/en/services/science/open-data.html>

Do not scrape provincial tourism pages, Google Maps, KOA, Hipcamp, The Dyrt, Campendium, AllStays, iOverlander, or other commercial directories without a licensed feed or written permission.
