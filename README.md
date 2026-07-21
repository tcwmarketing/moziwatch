# MoziWatch

A production-oriented, mobile-first Phase 1 application for campground mosquito reports in Canada and the United States. The working name is configured with `NEXT_PUBLIC_APP_NAME`.

## What is included

- One MapLibre GL JS map with a complete configurable Protomaps style, campground GeoJSON, native clustering, report-colored markers, and optional local forecast halos
- Rolling 30-day and historical campground ratings based on each published report's observation date, with Recent as the default and an older-date option
- A non-map campground directory with major-campground default, report and forecast filters, and severity sorting
- Accessible five-level original mosquito rating control with no star icons
- Anonymous and verified account reporting with concurrency-safe 24-hour duplicate prevention
- Better Auth email/password, verification, reset, Google, Facebook, revocation, Argon2id, dashboard, and account deletion
- PostgreSQL/PostGIS schema, Drizzle migrations, fictional seed data, CSV preview/import, duplicate detection, moderation, audit history, user disabling, and health status
- Open-Meteo batched server adapters, 60-day weather history, versioned habitat profiles, frozen v2 plus experimental report-adjusted v3 shadow forecasts, factor explanations, tiered scheduling, and a separate seven-month seasonal outlook
- Server-rendered campground URLs, metadata, canonical links, sitemap, privacy, terms, architecture, source licensing, and deployment guidance
- Canonical campground ingestion from streaming OpenStreetMap PBF extracts, RIDB, NPS, and official BC open data, with provenance, PostGIS matching, idempotent refresh, merge review, manual locks, and public corrections

## Local setup

Requirements: Node.js 24 LTS, PostgreSQL 16 with PostGIS (local Docker or Supabase), and a Protomaps API key.

```bash
cp .env.example .env.local
# For local PostgreSQL only:
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. Without `RESEND_API_KEY`, verification links are logged by the development server only. Production fails email delivery closed when Resend is missing. Add a real Protomaps key to `.env.local`; the application does not substitute another basemap provider.

To create an administrator, sign up and verify an account, then run:

```bash
SEED_ADMIN_EMAIL=you@example.com npm run db:seed
```

## Forecast setup

`config/models/v2.json` is the frozen report-independent baseline. `config/models/v3.json` is the transparent experimental weather/habitat/report index. The default `v3-shadow` mode stores both but keeps v2 in production. Neither is a calibrated probability or machine-learning model. Publish tonight plus seven nights with:

```bash
npm run forecast:run
npm run forecast:run-monthly
npm run forecast:compare-shadow
```

GitHub Actions runs `npm run forecast:run` once per day and follows it with `npm run forecast:cleanup`; do not launch a second long-running forecast scheduler in production. Schedule `npm run forecast:run-monthly` after the ECMWF SEAS5 update on the 5th of each month. The daily worker refreshes notable, recently active or requested campgrounds daily and lower-interest profiled campgrounds weekly. A page view can queue a stale campground and temporarily promote it to daily refresh; this activity changes cadence only, never risk.

The North American habitat worker reads small cloud windows from WorldCover, JRC surface water, Copernicus elevation, CWIM/NWI and permitted BC Freshwater Atlas layers. It processes resumable batches independently from daily weather:

```bash
npm run habitat:export
npm run habitat:process -- --only-unprofiled --limit 25 --output data/habitat/batches/north-america-v1.json
npm run habitat:publish -- data/habitat/batches/north-america-v1.json
npm run habitat:verify
```

See [the complete v3 formula and operations guide](docs/FORECAST_V3.md), including offline habitat processing and weather-history backfill commands. Do not set `FORECAST_MODEL_MODE=v3` until shadow results have been reviewed across seasons.

## Campground location imports

Migrate first, install `requirements-locations.txt`, then dry-run each source. RIDB and NPS require keys; the other sources below do not. The combined command intentionally excludes BC and OSM.

```bash
npm run locations:import:overture-ca -- --dry-run --limit=25
npm run locations:import:overture-us -- --dry-run --limit=25
npm run locations:import:parks-canada -- --dry-run --limit=25
npm run locations:import:quebec -- --dry-run --limit=25
npm run locations:import:nova-scotia -- --dry-run --limit=25
npm run locations:import:ridb -- --dry-run --limit=25
npm run locations:import:usfs -- --dry-run --limit=25
npm run locations:import:nps -- --dry-run --limit=25
npm run locations:import:all -- --dry-run --limit=25
```

See [Campground import operations](docs/LOCATION_IMPORTS.md) before a full import.

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Database integration tests use `TEST_DATABASE_URL` and are skipped by the general suite when it is absent. `npm run test:integration` first migrates that database and refuses to run unless `TEST_DATABASE_DISPOSABLE=true` and the URL differs from both production-capable URLs.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Data sources and licences](docs/DATA_SOURCES.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Environment configuration](docs/ENVIRONMENT.md)
- [Supabase and GitHub setup](docs/SUPABASE_SETUP.md)
- [Anti-abuse and security](docs/SECURITY.md)
- [Canonical location architecture](docs/LOCATION_DATA.md)
- [Campground import operations](docs/LOCATION_IMPORTS.md)
- [Coverage gaps](docs/COVERAGE_GAPS.md)

## Known Phase 1 limitations

- Production campground data is not bundled in Git. It is populated by the licensed source connectors after deployment; seed records remain fictional development data.
- The forecast remains experimental and must not be described as trained or calibrated from reports. Measured habitat improves its inputs but does not make the result scientifically validated.
- North American habitat extraction is implemented and backfilling in bounded batches. Provincial enrichment is currently specific to British Columbia; other Canadian provinces use the national baseline with a documented confidence reduction.
- Facebook does not provide a reliable per-email verification claim, so the site requires its own verification before account features.
- Only campgrounds with an active habitat profile receive an outlook; the current publication covers the five representative prototype sites.

Recommended next work: implement and audit the production habitat extractor, expand profiles to every canonical campground, add partner mosquito-trap validation, and independently review model calibration before training a replacement from reports.
