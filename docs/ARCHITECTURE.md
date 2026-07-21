# Architecture

## Runtime shape

MoziWatch is a Next.js 16 and React 19 application running on Node.js 24 LTS. PostgreSQL 16 with PostGIS is the source of truth. Drizzle provides typed database access and migrations. Better Auth provides verified email/password sessions plus Google and Facebook OAuth.

The public map uses one client engine: MapLibre GL JS. The default basemap is a complete Protomaps Hosted API style JSON, with a PMTiles adapter for later self-hosting. Campground groups, report markers, and optional forecast halos are layers in that one map instance.

Map requests are bounded to the visible viewport and include the current zoom. At continental and regional zooms, PostgreSQL/PostGIS returns compact server-side groups from the campground spatial index. At local zooms it returns lightweight marker properties. Source provenance, facilities, capacity and descriptions are fetched from a one-campground detail endpoint only after a marker is selected. Requests are debounced and stale requests are cancelled, so moving the map cannot queue increasingly outdated multi-megabyte responses.

## Information boundaries

- Campground marker fill uses only published camper reports for the selected Past 30 Days or Historical period.
- Modeled forecast score, confidence, and factors live in separate forecast tables and properties.
- Forecast halos are a separate layer behind markers, are hidden below a 0.30 score, and appear only at local zoom after clusters expand.
- The former continent-wide point heatmap is not loaded or rendered.
- The checked-in model is an expert-configured beta prototype, has `usesUserReports=false`, and is not represented as trained.
- A partial or failed daily run never becomes published.

## Static habitat profiles

`habitat_profile_versions` records the calculation method and source manifest. `campground_habitat_profiles` stores one active, versioned profile per campground with distance-ring wetland, marsh, seasonal-water and forest coverage; small/stagnant water; lake shoreline and open-water signals; fast/slow river signals; elevation; slope; drainage; rainfall climate; land cover; provenance and confidence.

Static profiles are calculated separately from daily weather. The implemented offline extractor uses ESA WorldCover, JRC Global Surface Water, Copernicus GLO-30 and NASA POWER as its consistent North American baseline. It enriches US locations with NWI, Canadian locations with CWIM3A, and British Columbia locations with the Freshwater Atlas. Expensive raster/vector analysis never runs in a visitor or daily-weather request.

`habitat-north-america-v1` is the measured profile version. A resumable scheduled backfill processes unprofiled campgrounds in bounded batches. Earlier `habitat-prototype-na-v1` rows remain frozen, low-confidence archetypes for regression tests and historical comparison; they are not measured GIS results.

## Daily forecast flow

`worker/scheduler.ts` starts the configured UTC cron once per day. `worker/run-forecast.ts`:

1. Loads frozen v2 and experimental v3 artifacts according to `FORECAST_MODEL_MODE`.
2. Reads only scheduled campgrounds with active habitat profiles.
3. Fetches 60 past and sixteen forecast days from Open-Meteo in batches of ten and shares the response between v2 and shadow v3. The extra provider days cover UTC/local-date rollover and weather derivation; both models publish the product's eight-night horizon.
4. Stores normalized daily history plus run-specific weather provenance.
5. Scores frozen v2 and, by default, v3 shadow. V3 combines a multiplicatively gated environmental result with robust recent and same-season historical report signals.
6. Stores component results, included report IDs/weights, confidence reasons and production/shadow designation.
7. Publishes only after every selected campground succeeds.

The refresh scheduler is deliberately separate from the scoring model. Notable, recently reported, frequently saved/viewed or recently requested campgrounds refresh daily. Other established campgrounds with profiles refresh weekly. A deterministic campground-ID hash staggers newly eligible weekly locations across seven days instead of queueing the entire minor directory at once. Closed, review-state or unsupported campgrounds are paused. Public forecast views are aggregated by campground and day without storing a visitor identifier. Full v3 formulas and activation controls are in `FORECAST_V3.md`.

Schedule synchronization calculates cadence in application code and writes the
results through bounded 500-row PostgreSQL upserts. It does not issue one
database transaction per campground.

## Monthly outlook flow

`worker/run-monthly-outlooks.ts` runs after the monthly ECMWF SEAS5 update and publishes up to seven month-level periods for the bounded major/daily tier (1,500 campgrounds by default). It stores one seasonal provider payload per campground rather than duplicating it for every month. It combines the static habitat and long-term rainfall-climate baseline with Open-Meteo monthly ensemble mean temperature and precipitation anomalies. The source is approximately 36 km and not bias-corrected, so confidence falls with horizon and the UI labels it as regional seasonal guidance rather than a date-specific forecast. The versioned beta monthly model does not use camper reports.
External HTTP calls occur outside database transactions. Inserts are batched in short transactions. The map API joins tonight's latest published row to campground features; the detail page reads the complete eight-night run.

The separate five-day weather card is fully on demand. Opening a campground
detail page reads its PostgreSQL cache and only contacts Open-Meteo when that
campground has no cached weather or its cached copy is more than twelve hours
old. There is no scheduled sweep of campground weather cards, so locations
that receive no visitors generate no five-day-weather requests.

## Future trained replacement

The beta artifact deliberately excludes reports. After enough representative, quality-controlled reports are available, a separate research workflow can build campground/time labels, use spatial and temporal holdouts, evaluate calibration and subgroup performance, and publish a reviewed replacement artifact. Changing that artifact must not change map/report semantics or the versioned habitat interface.

## Report concurrency and privacy

Before checking the rolling 24-hour window, a transaction acquires PostgreSQL advisory locks for the campground combined with every available identity: account ID, anonymous token HMAC, and IP HMAC. Requests that share any identity serialize, so concurrent duplicates cannot both pass. Aggregates are recalculated in the same transaction after report creation and moderation.

Reports retain two distinct dates. `submitted_at` is the immutable server timestamp used for duplicate prevention, rate limits and edit windows. `observed_on` is the user-selected campground observation date used for Past 30 Days and historical aggregation. Choosing the subjective Recent option records `observed_on` as today; choosing Older date requires an explicit non-future date.

Raw IP addresses and browser tokens are not stored. `TRUST_PROXY_HOPS` defaults to zero, so forwarded headers are not trusted without deliberate deployment configuration.
