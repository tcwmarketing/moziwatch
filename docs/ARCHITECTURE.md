# Architecture

## Runtime shape

Camp Signal is a Next.js 16 and React 19 application running on Node.js 24 LTS. PostgreSQL 16 with PostGIS is the source of truth. Drizzle provides typed database access and migrations. Better Auth provides verified email/password sessions plus Google and Facebook OAuth. Passwords use Argon2id with OWASP-aligned minimum memory and iteration settings.

The public map uses one client map engine, MapLibre GL JS. The default basemap is a complete Protomaps Hosted API style JSON. Campground and forecast GeoJSON are sources in the same map and render as MapLibre layers. The basemap adapter can switch to a PMTiles URL without changing application sources or layers.

## Information boundaries

- Campground markers use only published camper reports.
- The heat layer uses only the latest complete published forecast run.
- APIs and labels identify the initial output as an unvalidated beta weather suitability model that is not trained from user reports.
- Production never returns synthetic forecast runs.
- If the database, provider, or configured versioned artifact is unavailable, the forecast is unavailable.

## Forecast flow

`worker/scheduler.ts` starts the configured UTC cron once per day. It launches a single forecast run. The worker loads an explicitly configured versioned artifact, builds a configurable Canada and US grid, fetches Open-Meteo in coordinate batches, stores the raw normalized provider responses, calculates features, scores each cell, and publishes the run only after all batches succeed. The checked-in beta artifact is weather-only; the retained trainer can later replace it with a reviewed temporal-holdout logistic model.

The training command sorts observations by date, uses the first 80 percent for training and the final 20 percent as a temporal holdout, standardizes predictors, fits L2-regularized logistic regression, and records AUC and Brier score. No coefficients ship with the repository. Production remains unavailable until the operator trains and approves an artifact.

## Report concurrency and privacy

Before checking the rolling 24-hour window, a transaction acquires PostgreSQL advisory locks for the campground combined with every available identity: account ID, anonymous token HMAC, and IP HMAC. Requests that share any identity serialize, so concurrent duplicates cannot both pass. Aggregates are recalculated in the same transaction after report creation and after moderation.

Raw IP addresses and browser tokens are not stored. `TRUST_PROXY_HOPS` defaults to zero, so forwarded headers are not trusted without deliberate deployment configuration.

## Security

Server validation uses Zod and SQL is parameterized. Mutating routes enforce same-origin requests. Authentication cookies are secure in production. OAuth state and PKCE are handled by Better Auth. CSP, frame restrictions, MIME sniffing protection, a strict referrer policy, rate limiting, optional Turnstile validation, administrator checks, session revocation, and audit logs are included.
