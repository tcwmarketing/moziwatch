# Anti-abuse, privacy, and security

## Duplicate prevention

A report is rejected only when it targets the same campground within the previous 24 hours and matches the account ID, anonymous browser-token HMAC, or normalized IP HMAC. Advisory locks cover each campground and identity pair inside the transaction. Reports for another campground remain allowed. The boundary is half-open: a report exactly 24 hours later is accepted.

The browser token is 256 random bits in an HTTP-only, same-site cookie. It is not a fingerprint. IP addresses are normalized and immediately HMACed with a separate server secret. Raw IPs and raw anonymous tokens are never inserted into the database.

General report traffic is limited to ten submissions per protected IP per hour. Production public submissions use reCAPTCHA Enterprise action tokens that are assessed on the server and fail closed when verification is unavailable. Contact messages add a signed form-age proof, a honeypot, protected IP and email limits, repeated-template detection, and content review. Scores below the contact inbox threshold are retained in Spam without generating an email. Assessment scores and IDs are stored without retaining browser tokens; confirmed administrator decisions are sent back to Google as annotations.

## Proxy trust

`TRUST_PROXY_HOPS=0` ignores `X-Forwarded-For`. Set an exact number only when every hop is controlled and overwrites inbound forwarding headers. The application selects the address immediately before the trusted proxy chain.

## Authentication

Email passwords use Argon2id. Verification and password-reset links expire. Sessions can be revoked and are removed on account deletion or administrative disabling. Google and Facebook scopes are limited to basic identity and email. Facebook users must complete site verification because Meta does not provide a reliable per-email verification flag.

## Application controls

- Same-origin checks on mutating application routes
- Better Auth CSRF, OAuth state, and PKCE handling
- Zod server validation and parameterized SQL
- HTTP-only, same-site, secure production cookies
- CSP, frame denial, MIME sniffing protection, and restrictive permissions policy
- Server-side administrator authorization and immutable audit events
- No public API exposes account IDs, names, emails, token hashes, or IP hashes

Secrets belong in a deployment secret manager. Rotate the authentication secret using a planned session invalidation. Rotating the IP HMAC secret intentionally breaks duplicate matching against older protected values, so schedule it with additional abuse monitoring.
