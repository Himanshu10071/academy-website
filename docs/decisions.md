# Decisions

- 2026-11-23 — Confirmed npm workspaces, `pg`, Zod, Pino, Vitest, and Supertest for the backend skeleton. Added database health and self-service profile endpoints under `/api/v1`, and a server-rendered Prince Academy homepage with a browser-local profile completion prompt for accounts missing a phone number.
- 2026-11-23 — Use plain-text backend logs. Omit successful CORS preflights and include request IDs on failures for troubleshooting.
- 2026-11-23 — Added admin catalog, private MP4 uploads with 15-minute conditional PUT links, transactional lecture ordering, and server-rendered public catalog metadata.
- 2026-11-24 — Add the request path and elapsed milliseconds to backend terminal logs. Keep the error code and request ID on failures.
- 2026-11-24 — Use a temporary S3 playback signer for paid lectures and published demos, to be replaced by the CloudFront signer before launch.
- 2026-11-25 — Add admin lecture preview before Razorpay integration. Unblocked admins can review ready uploads in the admin lecture list, including hidden lectures and lectures in unpublished courses. Preview reuses the temporary playback signer and creates no financial records.
- 2026-11-25 — Add the Razorpay receiver for signature verification and insert-only event logging. Use a Cloudflare Quick Tunnel for local Test Mode deliveries. Capture and enrollment updates are deferred.
- 2026-11-25 — Split larger tasks into independently reviewable commits. Keep each change with its related tests and documentation.
- 2026-11-25 — Enable Test Mode order creation with backend-only keys. Serialize checkout per student and reuse an existing order. Return the current published course slug from the paid enrollment status.
- 2026-11-25 — Apply verified Razorpay captures atomically. Record mismatches for investigation and keep access unchanged when the amount, currency, or enrollment does not match.
- 2026-11-25 — Add student payment confirmation. The URL uses only the course ID. The backend resolves the destination after capture, and the destination displays a one-time success toast.
- 2026-11-25 — Open Razorpay Checkout from a published course with a saved backend order. The browser callback starts confirmation.
- 2026-11-25 — Accept full refund requests within the saved refund window for the caller's captured payment and paid enrollment. Expose the local payment ID and eligibility on owned courses.
- 2026-11-25 — Keep approved refunds open until Razorpay confirms processing. Use a durable idempotency key for safe retry and a single transaction to revoke enrollment on confirmed refunds.
- 2026-11-25 — Add the student refund request action to My Courses and show status and admin notes in refund history.
- 2026-11-25 — Combine admin payment history and the refund queue in one Payments page with a view filter and refund status filter.
