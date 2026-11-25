# Project Brief: Coaching Academy Video Course Platform

> Read this file fully at the start of every session. If you change a decision, update this file in the same change.
> This file is used as `CLAUDE.md` (Claude Code) and `AGENTS.md` (Codex). Keep the two identical, or make one point to the other.

## 1. What we are building

A website for a coaching academy that sells **recorded video courses**. Students sign in with Google, pay once per course, and can then watch that course's recorded lectures for life. An admin manages teachers, courses, lectures, and refunds.

- Scale: fewer than 100 students for now.
- Cost goal: as low as possible, but fully working and hosted. This is also a resume project, so every decision must be explainable.
- **The one rule that matters most: a student must never be able to watch a paid lecture without a paid enrollment.**

## 2. Tech stack

| Area | Choice |
|---|---|
| Frontend | Next.js + TypeScript |
| Backend | Node.js + Express + TypeScript, a persistent server (not serverless) |
| Database | PostgreSQL on Supabase, **accessed directly by the backend over a Postgres connection. The Supabase Data API is disabled.** |
| Database driver | `pg` (node-postgres) with plain parameterized SQL (default) |
| Authentication | Supabase Auth, **Google provider only** |
| Video storage | AWS S3, private bucket |
| Video delivery | Temporary S3 presigned GET URLs through a swappable signer. AWS CloudFront with Origin Access Control and signed URLs is planned for launch. |
| Payments | Razorpay (INR) |
| Input validation | Zod |

Supabase project settings (decided): **Data API disabled**, automatic API grants for new tables **off**, automatic Row Level Security on new tables **on**. Supabase is used for two things only: the Postgres database (reached directly) and Google sign-in (Supabase Auth).

Hosting is not final. Proposed: frontend on Vercel, backend on Railway or Render, AWS only for S3 and CloudFront.

Why the backend is separate from Next.js: the payment webhook needs an always-available endpoint, and signed URL generation and future background work do not fit serverless well.

## 3. Repository layout (proposed)

- `frontend/`: the Next.js app.
- `backend/`: the Express app, organised by feature (auth, catalog, playback, payments, refunds). Each feature has routes, services, and data access.
- `shared/`: TypeScript types and constants used by both sides, including status values.
- `supabase/migrations/`: versioned SQL migration files. The database is only ever changed through these.
- `docs/`: schema reference and design notes.

## 4. Architecture rules

1. **Three layers inside each backend feature, with separate jobs:**
   - Routes: receive the request, validate its shape, call a service, return the response. No business rules here.
   - Services: all business rules (access, refund window, publishing rules). No direct SQL here.
   - Data access: the only code that talks to PostgreSQL. Use parameterized SQL. For multi-step writes, run the entire transaction on one checked-out connection.
2. Business rules are small, pure functions where possible, so they can be tested without a server.
3. Keep it a simple modular monolith. Do not add queues, microservices, or extra infrastructure unless asked.
4. Status values (`pending`, `paid`, `captured`, and so on) are defined once in `shared/` and imported everywhere. Never retype them as strings.
5. Do not add features, libraries, or abstractions beyond what the current task asks for.
6. Any change that touches more than one row or table (webhook capture, refund processing, lecture reordering) runs inside **one database transaction**, using the shared transaction helper in `backend/src/lib/db.ts`.

## 5. Roles and users

- Roles: **student** and **admin** only. Teachers are display-only records and never log in.
- Admins are created by hand in the database. No endpoint or signup flow can create an admin.
- Profiles have an `is_blocked` flag. Blocked users are refused everywhere.
- **The role is never read from user input, request bodies, or Google/Supabase user metadata.** It is set to `student` by the profile-creation trigger.

## 6. Business rules (decided, do not change without asking)

- Lifetime access after purchase. No expiry.
- Each course has exactly one teacher.
- Refunds: allowed only within **3 days** of payment, and only after **manual admin approval**.
- A student may buy the same course again after a refund. Each purchase creates a **new enrollment row**.
- Demo lectures are standalone and free. They belong to no course.
- Progress and completion tracking is **not** part of the current scope.
- Phone number is required before checkout (not before login).

## 7. Data model summary

Nine tables. Full field list lives in `docs/schema.md` and the migration files. Summary:

- `profiles`: one per auth user (same id). Role, is_blocked, name, email (unique), phone.
- `teachers`: display info (name, bio, photo, active flag). Email and phone are admin-only.
- `courses`: name, slug (unique), price in paise, one teacher, is_published, lecture_count (maintained by a trigger).
- `lectures`: belong to a course, ordered by lecture_number (unique per course, deferrable), video_key, video_status (`uploaded`, `processing`, `ready`), is_hidden, uploaded_by.
- `demo_lectures`: standalone, published flag, display order.
- `enrollments`: student plus course, status `pending`, `paid`, or `revoked`.
- `payments`: one per payment attempt, linked to an enrollment. Amount is a snapshot of the price at order time.
- `payment_events`: log of Razorpay webhook deliveries. The raw payload stays immutable. Capture and refund handling update only the processing fields.
- `refund_requests`: linked to a payment, with its own status lifecycle.

Key constraints the database enforces:

- Only **one active enrollment (pending or paid) per student and course**. Any number of revoked ones.
- Razorpay order id and payment id are unique.
- Webhook event ids are unique **only among signature-verified events**, so a forged event cannot block a real one.
- Only one open refund request per payment (requested, approved, or failed counts as open).
- Money is an integer in paise. Durations are integers in seconds. Ids are uuids. Timestamps are timestamptz in UTC.
- Foreign keys to financial or historical rows restrict deletion. Hide or deactivate instead of deleting.

Row Level Security is **enabled on every table with no policies**, and the Supabase Data API is **disabled**, so the tables cannot be reached over HTTP at all. Only the backend, connecting directly to Postgres, reads or writes data. Never enable the Data API and never write policies that open tables to the public key.

## 8. Security rules (non-negotiable)

1. The backend is the only gate. The frontend never decides access.
2. Every endpoint requires a logged-in user unless it is deliberately public or authenticates the sender through a webhook signature.
3. **Lecture video access is decided in exactly one function.** Regular playback requires an unblocked user, a `ready` and visible lecture, and a `paid` enrollment for that lecture's course. The dedicated admin preview endpoint allows an unblocked admin to preview a `ready` lecture, including hidden lectures and lectures in unpublished courses. The backend chooses the access mode. Do not copy these checks elsewhere.
4. Never trust the client for prices, amounts, or statuses. Always read them from the database.
5. Only the **verified Razorpay webhook** can mark a payment captured or an enrollment paid. The frontend success page only polls the backend for status.
6. The **database connection string** (`DATABASE_URL`), AWS keys, the CloudFront private key, the Razorpay key secret and the webhook secret live only in backend environment variables. They never appear in code, logs, the frontend, commits, or prompts. The Supabase service key is not used anywhere in this project.
7. Never return a permanent video URL. Only short-lived signed URLs.
8. Admin-only data (teacher email and phone, payment details, refund queue) must never be returned by student-facing endpoints.
9. Retries and double-clicks must never cause double effects (double charge, double enrollment, double refund).
10. Never log tokens, secrets, or full webhook bodies in application logs. The raw payload belongs only in `payment_events`.
11. **All SQL is parameterized.** Never build a query by joining strings that contain user input.

## 9. Flows

### 9.1 Login and profile creation
1. The frontend uses the Supabase browser library **only** for Google sign-in.
2. After login, the frontend sends the session access token to the backend as a bearer token. The backend verifies it by asking Supabase Auth (it needs only the public Supabase URL and anon key), then loads the profile from the database and checks `is_blocked`.
3. When Supabase creates a new auth user, a database trigger creates the `profiles` row: name and email from Google, role `student`, phone empty.
4. If phone is empty, the app shows a profile completion prompt. Students can add a phone number and edit their name through their profile. The phone is required before checkout. Email is read-only.

### 9.2 Video playback
1. Student requests playback for a lecture. The endpoint is authenticated.
2. The access function (section 8, rule 3) runs.
3. If allowed, the backend calls `lib/video-signer.ts` for a signed playback URL. It uses S3 presigned GET URLs with a 15-minute default until CloudFront is ready.
4. The player uses that URL. When it expires, the frontend asks the backend for a new one, which re-runs the access check.
5. The S3 bucket is private. Unsigned S3 reads are denied. At launch, CloudFront with Origin Access Control will serve videos using CloudFront signed URLs.
6. MVP uses a single compressed MP4 per lecture served with range requests. Adaptive streaming (HLS) is a possible future upgrade.
7. Admins can preview ready uploads from the admin lecture list. Preview issues a temporary URL through the same signer and rechecks admin authorization on renewal. It creates no enrollment or payment.

### 9.3 Purchase
1. Student asks to buy a course. The backend checks the course is published and the profile is complete.
2. It looks for an existing active enrollment for that student and course. If it is `paid`, stop. If it is `pending`, reuse it. If none exists, create a `pending` one. If creation collides with the unique rule (double-click), read the existing row instead of failing.
3. If a pending enrollment has an open order, return that order and its saved amount. Otherwise create a Razorpay order using the **price from the database**, save the payment attempt, and return its order ID, amount in paise, and currency.
4. The Razorpay checkout runs in the browser. The success callback opens the confirmation page, which polls enrollment status. A paid response triggers a redirect to the current course and a one-time success toast.

### 9.4 Razorpay webhook
The receiver verifies and records deliveries and applies verified `payment.captured`, `refund.processed`, and `refund.failed` events.

1. Use the **raw request body**. Compute HMAC-SHA256 with the webhook secret and compare to the `X-Razorpay-Signature` header using a constant-time comparison.
2. Require the event ID and signature headers and a valid JSON event. Store each accepted delivery with `signature_verified` true or false and `processed = false`. Return 400 for a bad signature after storing its event.
3. Acknowledge repeated verified event IDs with 200. Unknown event types are stored.
4. For a captured payment: confirm the order, amount, currency and pending enrollment, then in **one database transaction** set the payment to `captured` with `paid_at`, set `refund_eligible_until` to `paid_at` plus 3 days, set the enrollment to `paid`, and mark the event processed.
5. Respond with 200 quickly. Unknown event types are stored and ignored, not rejected.
6. The Razorpay account must use automatic capture so that successful payments reach the captured state.

### 9.5 Refunds
1. Student requests a refund. Allowed only if: the payment is `captured`, the request time is at or before `refund_eligible_until`, the enrollment is `paid`, and no open request exists for that payment. The reason is required.
2. An admin approves or rejects (with a note shown to the student).
3. A conditional update claims the approval before the backend calls Razorpay for the full saved amount. A pending Razorpay refund leaves the request approved.
4. A processed refund updates the request, payment, and enrollment in one transaction. Their statuses become `processed`, `refunded`, and `revoked` respectively.
5. Failed requests include a note and can be retried by an admin. Uncertain retries reuse the saved Razorpay attempt key. A confirmed failure rotates the key.

## 10. Conventions

- Make one independently reviewable change per commit. Split a task when its parts can be reviewed separately. Keep implementation, related tests, and relevant docs together, and group minor edits that support the same change. Each commit should build, pass its relevant tests, and have a descriptive message.
- Database columns are snake_case. TypeScript uses camelCase. Convert in the data access layer.
- Validate all input at the route boundary. Reject unknown fields where it matters.
- Return errors in one consistent shape with proper HTTP status codes. Do not leak internal details.
- Configuration is read once from environment variables, validated at startup, and the app refuses to start if something required is missing. Provide a `.env.example` without real values. `.env` is gitignored.
- All schema changes go through new migration files, never edits to old ones.

## 11. Testing requirements

Write tests for the dangerous paths. A task touching these is not done without tests:

- Unauthenticated, blocked, unpaid, pending, and revoked users are refused video access. A paid user is allowed.
- A lecture that is not `ready` or is hidden is not playable.
- A forged webhook with valid headers and JSON writes only an unverified event row.
- A repeated webhook has no additional effect.
- A webhook with a mismatching amount does not mark anything paid.
- Double-clicking Buy never creates two active enrollments.
- A refund requested after the 3-day window is rejected. A second open request for the same payment is rejected.
- A student cannot use admin endpoints.
- Admin preview requires an unblocked admin and a ready lecture. It can preview hidden and unpublished content without granting regular course playback.


## 12. Build order and status

Status: initial schema, authentication and profile completion, admin catalog and S3 uploads, public catalog pages, paid lecture playback, admin lecture preview, Razorpay Test Mode checkout, and full refunds are implemented. Playback uses a temporary S3 signer. Verified captures grant course access, and confirmed full refunds revoke it.

0. Repo setup, this brief, folder layout, environment handling.
1. Database migrations, RLS on, triggers (updated_at, lecture_count, profile creation).
2. Backend skeleton: token verification, role and blocked checks.
3. Google login on the frontend, plus the add-phone step.
4. Admin: teachers, courses, lecture upload to S3.
5. Playback endpoint with the access function and temporary S3 signer. Replace the signer with CloudFront before launch.
6. Razorpay order creation and the webhook.
7. Refunds.
8. Student and admin screens.
9. Deployment and hardening.

## 13. Open decisions

- Final hosting providers.
- Keep the UI simple and polished. Use clear visual hierarchy, consistent spacing, and responsive layouts while prioritizing working features.
- Whether demo lecture videos use signed URLs or a public CloudFront path.
- Whether partial refunds are ever needed.
- Whether to add email and password login later.
- Whether the backend should use a dedicated least-privilege database role instead of the default `postgres` role.
