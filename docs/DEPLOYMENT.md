# Deployment and operations

## InterWorx VPS runtime

MoziWatch runs as the dedicated `moziwatc` SiteWorx shell user. The checked-in
PM2 configuration binds Next.js to `127.0.0.1:4288`, keeping it private and
separate from other applications on the same VPS. Apache must proxy the
`moziwatch.com` virtual host to that address and preserve the forwarded host,
protocol and client address headers. Set `TRUST_PROXY_HOPS=1` for this single
controlled Apache proxy.

The tested SiteWorx proxy rules are stored in
`deploy/apache/moziwatch.htaccess`. Install that file as
`~/moziwatch.com/html/.htaccess`; it keeps ACME validation local to Apache and
proxies every other request to the private Next.js port. The domain root and a
static route must both return HTTP 200 through Apache before DNS is changed.

Prepare a production environment from a private staging copy with:

```bash
node scripts/prepare-production-env.mjs \
  /private/path/source.env \
  .env.example \
  /private/path/.env.production.local \
  --delete-source
```

The helper copies only variables documented in `.env.example`, excludes test
database and command-only seed variables, applies the `moziwatch.com` runtime
overrides, requires the current map/auth/Google/Stripe launch settings, writes
mode `0600`, and can delete the staging copy. It never prints secret values.

Build and start a release from its release directory with:

```bash
npm ci
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

The PM2 process must be registered for boot by a server administrator once;
routine releases remain owned and managed by `moziwatc`.

## Stripe donation checkout

1. Production uses `STRIPE_MODE=live` with a Stripe `sk_live_...` key. Keep `STRIPE_MODE=test` only in local or sandbox environments.
2. In Stripe Dashboard, add an HTTPS webhook endpoint at `https://moziwatch.com/api/stripe/webhook`.
3. Subscribe it to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`.
4. Add the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`.
5. Set `NEXT_PUBLIC_APP_URL=https://moziwatch.com` so Checkout returns to the correct production site.

The application accepts one-time CAD contributions from $1 through $500 and stores only payment identifiers, amount, status and the email Stripe returns; card details never enter the application. Checkout adds the card statement suffix `MOZIWATCH`, so the brand appears on card transactions without changing the legal Stripe business name.

## reCAPTCHA Enterprise

Public report, contact, and campground-suggestion forms obtain a single-use score-based token with a distinct action name. The server creates an assessment through the reCAPTCHA Enterprise v1 API, verifies token validity, action, production hostname, and the configurable score threshold, then fails closed when verification is unavailable. Production requires `BOT_PROTECTION_PROVIDER=recaptcha-enterprise`, `GOOGLE_API_KEY`, `GOOGLE_CLOUD_PROJECT_ID`, and `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`. The initial `RECAPTCHA_MIN_SCORE=0.3` blocks the highest-risk score while the site-specific model learns; review production scores before tightening it.

## Production checklist

1. Provision Supabase PostgreSQL with PostGIS, encrypted connections, automated backups, point-in-time recovery where required, and a least-privilege application role.
2. Set every production-required variable documented in `ENVIRONMENT.md`. Generate independent secrets for Better Auth and IP HMAC. Do not reuse credentials, and never deploy `TEST_DATABASE_URL` or `TEST_DATABASE_DISPOSABLE`.
3. Register the Protomaps production origin on the API key. Confirm sponsorship for commercial use.
4. Configure Google redirect URI `/api/auth/callback/google` and Facebook redirect URI `/api/auth/callback/facebook`. Request only name, email, `openid`, and basic profile scopes. Facebook emails receive site verification because Meta does not provide a reliable verification claim.
5. Configure Brevo transactional email, authenticate `moziwatch.com`, publish the generated DKIM, DMARC, and branded-subdomain records, and authorize the VPS outbound IP in Brevo. Local development logs links when `EMAIL_PROVIDER=console`.
6. Review the beta model configuration and configure the appropriate commercial or self-hosted Open-Meteo endpoint. Replace the beta artifact only after a trained model has representative data and temporal evaluation.
7. Run database migrations before the application rollout. Keep the checked-in GitHub Actions forecast workflow as the only daily scheduler; do not also start a long-running Node forecast scheduler.
8. Configure RIDB/NPS credentials, install `osmium-tool` on the import worker, and complete the dry-run/full-import sequence in `LOCATION_IMPORTS.md`. Run one location scheduler or platform cron, not both.
9. Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies. Leave it at zero for direct traffic.
10. Set `CONTACT_RECIPIENT_EMAIL` to a monitored private inbox, confirm contact submissions appear in the protected Admin inbox, and obtain jurisdiction-specific privacy, terms, RIDB, BC Open Government Licence, and ODbL review.
11. Set both `NEXT_PUBLIC_APP_URL=https://moziwatch.com` and `BETTER_AUTH_URL=https://moziwatch.com` before building. These values control canonical URLs, authentication callbacks and email links.
12. Register the production Stripe webhook as `https://moziwatch.com/api/stripe/webhook` and store that endpoint's live-mode `whsec_...` signing secret as `STRIPE_WEBHOOK_SECRET`.
13. Restrict the reCAPTCHA Enterprise website key to `moziwatch.com`, restrict the API key to the reCAPTCHA Enterprise API, and monitor action scores after launch.
14. After launch, submit `/sitemap.xml` in Google Search Console and monitor indexing, Core Web Vitals and crawl errors.

## Backups and migrations

Take a logical backup before every schema migration and retain daily encrypted backups separately from the primary region. Test restoration quarterly. Deploy additive migrations before code that requires them, then remove obsolete columns in a later release. Forecast cells can be regenerated; user, campground, report, moderation, audit, and authentication tables cannot.

Before a large launch or after a one-time habitat/location backfill, run `npm run prelaunch:audit`, then `npm run prelaunch:optimize -- --vacuum` during a quiet maintenance window. The optimizer updates planner statistics for location and forecast tables and vacuums only high-churn forecast storage; it does not use `VACUUM FULL` or lock tables for a rewrite.

For Supabase, use the transaction pooler URL as `DATABASE_URL` for serverless application traffic and the direct connection URL as `DIRECT_DATABASE_URL` for migrations. Direct Supabase hosts require IPv6 unless the project has the IPv4 add-on; the session pooler is an acceptable migration fallback from IPv4-only networks. Never point `TEST_DATABASE_URL` at the production project.

## OAuth setup

- Google: create a Web Application OAuth client and add `http://localhost:3000/api/auth/callback/google` plus the production HTTPS equivalent.
- Facebook: create a Business app using a user access token configuration, request `email` and `public_profile`, and add the same callback pattern ending in `/facebook`.

## Forecast operations

The worker needs outbound HTTPS to Open-Meteo and database access. Alert when the latest published run is older than 36 hours or when a run is failed. Do not publish partial runs. API caching may continue serving the previous complete run during a provider outage. The daily workflow runs `forecast:cleanup` even after a failed weather run: incomplete runs are retained for two days, daily forecast provenance and shared provider payloads for three days, monthly outlooks for 550 days, and normalized backfill history for 90 days. Full and normalized Open-Meteo inputs are stored once per shared weather target instead of being duplicated for every campground. Per-campground observation rows retain compact daily values and a reference to that shared source record.

The Admin forecast-coverage export lists up to 5,000 prioritized campgrounds that have both an active versioned habitat profile and a current outlook. Daily schedules are processed before weekly schedules, with the highest priority scores first.

## Moderation operations

The protected Admin area contains Profiles, Submissions and Spam tabs. Account bans revoke active sessions and block future authenticated access; reactivation clears the ban. Deleting an account anonymizes its reports before removing the profile. Report comments and contact messages containing a URL or a configured restricted spam phrase are routed to Spam for manual review. Review both Inbox and Spam regularly; automatic classification is reversible and does not silently delete user content.

## Location import operations

The import worker needs database access, Python with `requirements-locations.txt`, and outbound HTTPS to Overture/STAC, Parks Canada, Québec Tourinsoft, Nova Scotia Socrata, RIDB, NPS, and USDA Forest Service. Run `npm run locations:scheduler` as one singleton: official feeds refresh weekly and Overture/Nova Scotia monthly. OSM is not part of this phase. Alert on failed or stale sources, back up before the first full import, and review merge candidates before advertising coverage.
