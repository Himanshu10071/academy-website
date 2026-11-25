# Decisions

- 2026-11-23 — Confirmed npm workspaces, `pg`, Zod, Pino, Vitest, and Supertest for the backend skeleton. Added database health and self-service profile endpoints under `/api/v1`, and a server-rendered Prince Academy homepage with a browser-local profile completion prompt for accounts missing a phone number.
- 2026-11-23 — Use plain-text backend logs. Omit successful CORS preflights and include request IDs on failures for troubleshooting.
- 2026-11-23 — Added admin catalog, private MP4 uploads with 15-minute conditional PUT links, transactional lecture ordering, and server-rendered public catalog metadata.
- 2026-11-24 — Add the request path and elapsed milliseconds to backend terminal logs. Keep the error code and request ID on failures.
- 2026-11-24 — Use a temporary S3 playback signer for paid lectures and published demos, to be replaced by the CloudFront signer before launch.
- 2026-11-25 — Add admin lecture preview before Razorpay integration. Unblocked admins can review ready uploads in the admin lecture list, including hidden lectures and lectures in unpublished courses. Preview reuses the temporary playback signer and creates no financial records.
- 2026-11-25 — Add the Razorpay receiver for signature verification and insert-only event logging. Use a Cloudflare Quick Tunnel for local Test Mode deliveries. Capture and enrollment updates are deferred.
- 2026-11-25 — Split larger tasks into independently reviewable commits. Keep each change with its related tests and documentation.
