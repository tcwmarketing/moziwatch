# Supabase and GitHub setup

The production Supabase project is `sorlxgqcrxdxnlnqvuxm`. Its application schema and PostGIS extension are already migrated. The application uses Supabase as managed PostgreSQL only; authentication remains Better Auth.

## 1. Copy the database connection strings

Open the [Supabase project Connect page](https://supabase.com/dashboard/project/sorlxgqcrxdxnlnqvuxm?showConnect=true). Supabase does not expose the database password through MCP, so this step must be completed by the project owner.

- Use the transaction pooler connection on port 6543 as `DATABASE_URL` for a serverless web deployment. The Postgres.js client has prepared statements disabled for Supavisor compatibility.
- Use the direct connection as `DIRECT_DATABASE_URL` for migrations. If the deployment network is IPv4-only, use the session pooler on port 5432 instead.
- Keep both values server-side. Never prefix them with `NEXT_PUBLIC_` or commit them to Git.

## 2. Enable the daily forecast in GitHub

In GitHub, open **Settings -> Secrets and variables -> Actions** for `tcwmarketing/moziwatch`.

Add this repository secret:

- `DATABASE_URL`: the Supabase runtime/pooler connection string.

Optional forecast settings:

- Secret `OPEN_METEO_API_KEY` when the selected Open-Meteo plan requires one.
- Variable `OPEN_METEO_BASE_URL` for a commercial or self-hosted endpoint.
- Variable `FORECAST_MODEL_MODE`; leave it unset or set `v3-shadow` until shadow review is complete.

The `Staggered mosquito forecast` workflow runs a maximum of 200 prioritized campgrounds at minute 17 of every hour and can also be started manually from the Actions tab. Set the optional repository variable `FORECAST_HOURLY_TARGET_COUNT` only when measured provider and database capacity justify a different cap. The separate `Daily forecast maintenance` workflow runs at 04:47 UTC to refresh cadence, report-summary phrases and retention without repeating those database-wide operations in every hourly batch. Both workflows safely do nothing while `DATABASE_URL` is absent.

Before the first scheduled run, migrate the database and populate active habitat profiles with the offline North American habitat workflow. Provisional prototype seeders were removed after measured production coverage was established.

## 3. Configure the deployed Next.js application

At minimum, configure the deployment variables documented in [ENVIRONMENT.md](./ENVIRONMENT.md):

- `DATABASE_URL`
- `DIRECT_DATABASE_URL` for migration operations
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `IP_HASH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_PROTOMAPS_API_KEY`
- `EMAIL_PROVIDER=brevo`
- `BREVO_API_KEY`
- `EMAIL_FROM`

The project does not require a Supabase URL, anon key, service-role key, or Supabase Auth settings.

MoziWatch does not query the Supabase Data API from the browser. Application tables have row-level security enabled and direct grants to the `anon` and `authenticated` Data API roles revoked; server routes use the private PostgreSQL connection instead. Run `npm run prelaunch:audit` after migrations to confirm no application table is missing RLS or unexpectedly exposed through those roles.

## 4. Add production campground data

The checked-in seed command contains fictional development records and must not be run against production. Import a licensed campground CSV through the administrator interface after creating and promoting the first Better Auth account.

## 5. Create a dedicated test database

Create a second disposable Supabase project or isolated PostGIS database. Store its connection string only as `TEST_DATABASE_URL`, set `TEST_DATABASE_DISPOSABLE=true` for the test run, and execute `npm run test:integration`. The safety guard rejects production connection strings.
