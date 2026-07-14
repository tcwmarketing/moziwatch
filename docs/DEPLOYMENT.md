# Deployment and operations

## Production checklist

1. Provision Supabase PostgreSQL with PostGIS, encrypted connections, automated backups, point-in-time recovery where required, and a least-privilege application role.
2. Set every variable from `.env.example`. Generate independent secrets for Better Auth and IP HMAC. Do not reuse credentials.
3. Register the Protomaps production origin on the API key. Confirm sponsorship for commercial use.
4. Configure Google redirect URI `/api/auth/callback/google` and Facebook redirect URI `/api/auth/callback/facebook`. Request only name, email, `openid`, and basic profile scopes. Facebook emails receive site verification because Meta does not provide a reliable verification claim.
5. Configure Resend, verify its sending domain, and publish SPF, DKIM, and preferably DMARC. Local development logs links when Resend is omitted.
6. Review the beta model configuration and configure the appropriate commercial or self-hosted Open-Meteo endpoint. Replace the beta artifact only after a trained model has representative data and temporal evaluation.
7. Run database migrations before the application rollout. Run the scheduler as exactly one process, or use the hosting platform cron to execute `npm run forecast:run` once per day.
8. Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies. Leave it at zero for direct traffic.
9. Replace the placeholder privacy contact and obtain jurisdiction-specific privacy and terms review.

## Backups and migrations

Take a logical backup before every schema migration and retain daily encrypted backups separately from the primary region. Test restoration quarterly. Deploy additive migrations before code that requires them, then remove obsolete columns in a later release. Forecast cells can be regenerated; user, campground, report, moderation, audit, and authentication tables cannot.

For Supabase, use the transaction pooler URL as `DATABASE_URL` for serverless application traffic and the direct connection URL as `DIRECT_DATABASE_URL` for migrations. Direct Supabase hosts require IPv6 unless the project has the IPv4 add-on; the session pooler is an acceptable migration fallback from IPv4-only networks. Never point `TEST_DATABASE_URL` at the production project.

## OAuth setup

- Google: create a Web Application OAuth client and add `http://localhost:3000/api/auth/callback/google` plus the production HTTPS equivalent.
- Facebook: create a Business app using a user access token configuration, request `email` and `public_profile`, and add the same callback pattern ending in `/facebook`.

## Forecast operations

The worker needs outbound HTTPS to Open-Meteo and database access. Alert when the latest published run is older than 36 hours or when a run is failed. Do not publish partial runs. API caching may continue serving the previous complete run during a provider outage.
