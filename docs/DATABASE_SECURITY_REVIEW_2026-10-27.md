# Database security review — 27 October 2026

Reviewed by The Complete Webdesigner.

## Finding and immediate correction

The recurring `rls_disabled_in_public` alert identifies Supabase project
`usfakxvqzcntkufgzmbz`. Despite its dashboard name "Moziwatch Website", this is
the project configured as `TEST_DATABASE_URL`. The live VPS connection was
checked independently and uses `sorlxgqcrxdxnlnqvuxm`.

The test project's `public.campground_weather_cache` had RLS disabled and
effective read/write permissions for both `anon` and `authenticated`. The
weather cache was omitted from migration `0020_lock_data_api_tables`. The table
was immediately secured, then migration `0022_data_api_security_guard` was
applied and verified on the test database. No records were deleted by the fix.

Production inspection found RLS enabled on all 36 application tables, with no
effective table permissions for `anon` or `authenticated`. No custom functions
or views were present in `public`. Both projects still had automatic grants for
new objects before this work. This review establishes the permissions observed
at review time; it does not establish historical access or the absence of a
past incident.

## Preventive implementation

- Declare `.enableRLS()` on all Drizzle table definitions and enforce it with a
  schema test, so generated migrations include RLS for new tables.
- Revoke application-object grants from `PUBLIC`, `anon`, `authenticated`, and
  `service_role`, including tables, views, sequences, and custom routines.
  Extension-owned objects and internal Supabase schemas are excluded.
- Remove the migration creator's automatic grants for new objects. Revoke its
  global default function EXECUTE grant to `PUBLIC`, because a schema-specific
  revoke cannot override that PostgreSQL default.
- Fail migrations if the metadata audit finds missing RLS, effective Data API
  grants, callable custom routines, or unsafe creator defaults. Fail closed if
  the audit cannot run. Use a five-second lock timeout for migrations.
- Run the lightweight audit in daily maintenance. It reads catalog metadata
  only, not user, report, contact, or payment data.

Better Auth and the server's private PostgreSQL connection remain the access
path. No Supabase client, Auth conversion, or public RLS policy is required.

## Validation

- Test database migration: passed; 36 tables protected, zero audit findings.
- Dedicated database regression tests: 11 passed, including security probes,
  report concurrency, and location ingestion.
- Unit suite on the production security revision: 238 passed; 11 database tests skipped without test credentials
  (those 11 were run separately against the dedicated database).
- TypeScript, targeted ESLint, formatting, and whitespace checks: passed.
- Live health endpoint, homepage, and Bear Creek page: HTTP 200.

The security integration test creates temporary probe objects inside a
transaction and rolls them back. It verifies private defaults for a new table,
sequence, and function; detection of missing RLS and an accidental grant; and
that an anonymous role sees no protected rows even with SELECT permission.

## Deployment state

The owner explicitly approved immediate implementation on 27 October 2026.
Migration `0022_data_api_security_guard` is now applied to production as well as
the test project. Independent metadata audits of both projects found all 36
application tables protected and zero findings. No application records were
deleted. The published change includes the migration guard, tests, audit command,
and daily maintenance audit. The maintenance files were installed on the VPS
after backing up the replaced files. An audit executed from the VPS using its
own production environment also found 36 protected tables and zero findings.
The running application did not require a rebuild or restart for these changes.

For future deployments, run `npm run db:migrate`, then
`npm run db:audit-security`, and repeat public-site smoke checks.
Supabase's next advisor scan should no longer find an application table with
RLS disabled in the corrected project. Advisor results were not separately
refreshed through the dashboard during this review.

Reference: [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api).
