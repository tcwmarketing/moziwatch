# Camp Signal

A production-oriented, mobile-first Phase 1 application for campground mosquito reports in Canada and the United States. The working name is configured with `NEXT_PUBLIC_APP_NAME`.

## What is included

- One MapLibre GL JS map with a complete configurable Protomaps style, campground GeoJSON, native clustering, and an independently controlled forecast heat layer
- Rolling 30-day and historical campground ratings based only on published camper reports
- Accessible five-level original mosquito rating control with no star icons
- Anonymous and verified account reporting with concurrency-safe 24-hour duplicate prevention
- Better Auth email/password, verification, reset, Google, Facebook, revocation, Argon2id, dashboard, and account deletion
- PostgreSQL/PostGIS schema, Drizzle migrations, fictional seed data, CSV preview/import, duplicate detection, moderation, audit history, user disabling, and health status
- Open-Meteo server adapter, stored raw observations, a versioned weather-only beta model, a retained logistic-regression training path, daily scheduling, cached forecast cells, and fail-closed publication
- Server-rendered campground URLs, metadata, canonical links, sitemap, privacy, terms, architecture, source licensing, and deployment guidance

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

`config/models/current.json` is the initial `mosquito-weather-beta-v1` model. It is an expert-configured weather suitability index, not a trained or validated statistical model and not trained from user reports. It uses Open-Meteo temperature, relative humidity, dew point, current and trailing precipitation, near-surface soil moisture, and wind. Publish it with:

```bash
npm run forecast:run
```

Run `npm run forecast:scheduler` as exactly one singleton process, or schedule `npm run forecast:run` once per day on the hosting platform. A complete run replaces the prior heatmap dataset; a partial or failed run never publishes.

After enough representative labeled observations have been collected and reviewed, prepare a CSV containing `date`, binary `target`, and every feature listed in `config/forecast.ts`. The retained trainer sorts observations chronologically and writes a replacement artifact:

```bash
npm run model:train -- ./private/training.csv ./config/models/current.json
```

The trainer uses an 80/20 chronological split and records AUC and Brier score. Review the output before activation. If a nonzero model coefficient needs wetland or land-cover data while its provider is unavailable, the run fails instead of filling a made-up value. For a continuously running host, start `npm run forecast:scheduler` as one singleton process. Platform cron can call `npm run forecast:run` instead.

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

## Known Phase 1 limitations

- Production campground data is intentionally not bundled. The included records are fictional development data.
- The shipped beta forecast is an unvalidated weather suitability index. It must be labeled beta until a representative model is trained and independently evaluated.
- Wetland, land-cover, official trap-count, and national elevation adapters are researched but not enabled until their ingestion and completeness policies are approved.
- Facebook does not provide a reliable per-email verification claim, so the site requires its own verification before account features.
- The initial forecast grid uses broad Canada and US rectangles. A land mask and tiled output should be added before very high-resolution production runs.

Recommended Phase 2 work: approved environmental adapters, partner mosquito trap agreements, future-date forecast selection, multilingual UI, seasonal historical comparisons, vector-tiled forecast output, and independently reviewed model calibration.
