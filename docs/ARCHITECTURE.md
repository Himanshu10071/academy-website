# Architecture Guide

This document tells the coding agent **where every piece of code lives, what each kind of file is allowed to do, and how to trace a problem when something breaks.** It works together with `CLAUDE.md` (decisions and security rules) and `docs/schema.md` (database fields). If the three ever disagree, stop and ask.

Save this file as `docs/ARCHITECTURE.md`.

Items marked **(default)** are my suggested choices that the owner has not explicitly confirmed. Confirm or change them before the first build step, then remove the marker.

---

## 1. System overview

```
Browser (Next.js app)
   |  1. Google sign-in only, through Supabase's browser library
   |  2. Everything else: HTTPS calls to our backend with the session token
   v
Backend (Node + Express + TypeScript)  <-- the ONLY thing that touches data
   |--> Supabase Postgres   (direct Postgres connection; Data API disabled; RLS on, no policies)
   |--> Supabase Auth       (token verification only)
   |--> S3                  (private bucket: upload links, existence checks, temporary signed playback)
   |--> CloudFront          (planned signed playback)
   |--> Razorpay            (create orders, refunds; receives webhooks)

Browser --> S3 (private, temporary presigned GET URL)
At launch: Browser --> CloudFront (signed URL) --> S3 (private with Origin Access Control)
Razorpay --> Backend webhook endpoint (signature verified)
```

The browser never reads or writes the database. The backend is the only gate.

---

## 2. Repository structure

```
/
├── CLAUDE.md                  agent rules (copy as AGENTS.md for Codex)
├── README.md                  how to install, run, test, deploy
├── package.json               npm workspaces: frontend, backend, shared
├── tsconfig.base.json         shared TypeScript settings
├── .gitignore                 must include .env files and key files
├── .github/workflows/ci.yml   lint, type-check, test on every push (default)
│
├── docs/
│   ├── ARCHITECTURE.md        this file
│   ├── schema.md              field-level schema reference
│   └── decisions.md           dated log of every decision and change of mind
│
├── supabase/
│   ├── migrations/            versioned .sql files, never edited after merging
│   └── seed.sql               fake development data only, no real secrets
│
├── shared/                    code used by BOTH frontend and backend
│   └── src/
│       ├── constants/         status values, roles, error codes, limits
│       ├── types/             API request and response types (DTOs)
│       └── index.ts
│
├── backend/                   see section 3
└── frontend/                  see section 4
```

Rules for the root:
- Only `shared/` is imported by both apps. The frontend never imports from `backend/`, and the backend never imports from `frontend/`.
- Anything both sides must agree on (status names, role names, error codes, response shapes) lives in `shared/` and nowhere else.

---

## 3. Backend structure

```
backend/
├── Dockerfile                 if deployed as a container (default)
├── .env.example               every variable, with fake values
└── src/
    ├── server.ts              starts the HTTP server. Nothing else.
    ├── app.ts                 builds the Express app: middleware order, route mounting
    │
    ├── config/
    │   ├── env.ts             reads and validates ALL environment variables
    │   └── constants.ts       fixed values (refund window days, URL lifetime)
    │
    ├── lib/                   thin wrappers around outside systems
    │   ├── db.ts              Postgres connection pool and the transaction helper
    │   ├── supabase-auth.ts   token verification (public URL and anon key only)
    │   ├── s3.ts              presigned upload links, object existence check
    │   ├── video-signer.ts    signed playback URL creation
    │   ├── razorpay.ts        order creation, refund call, signature verification
    │   ├── logger.ts          plain-text terminal logger
    │   └── errors.ts          AppError class and helpers
    │
    ├── middleware/
    │   ├── request-id.ts      gives every request an id
    │   ├── authenticate.ts    verifies the token, loads the profile, rejects blocked users
    │   ├── require-admin.ts   rejects non-admins
    │   ├── validate.ts        runs a Zod schema against body, params, or query
    │   └── error-handler.ts   the single place errors become responses
    │
    ├── modules/               one folder per feature (section 3.1)
    │   ├── profile/
    │   ├── catalog/           teachers, courses, lectures, demo lectures
    │   ├── uploads/           S3 upload links and upload confirmation
    │   ├── playback/          the access rule and signed playback URLs
    │   ├── payments/          checkout, webhook
    │   └── refunds/
    │
    └── test-utils/            helpers shared by tests (fake users, fake events)
```

### 3.1 The file types inside a module

Every feature folder uses the same file kinds. The suffix tells you what a file is allowed to do.

| File | Job | Must NOT |
|---|---|---|
| `x.routes.ts` | Declares URLs, attaches middleware, calls one service function, sends the response. Keep handlers a few lines long. | Contain business rules or database calls |
| `x.schemas.ts` | Zod definitions for request bodies, params, and queries | Contain logic |
| `x.service.ts` | **All business rules.** Decides, orchestrates, calls repositories and `lib/` wrappers | Know about Express (`req`, `res`) or write SQL |
| `x.repository.ts` | **The only code that talks to the database.** One function per query. | Contain business decisions |
| `x.mapper.ts` | Converts database rows (snake_case) into response objects (camelCase) and **chooses which fields leave the server** | Query anything |
| `x.service.test.ts` | Unit tests sitting next to the code | |

Dependency direction (never reversed):

```
routes  ->  service  ->  repository  ->  database
                 \-->  lib/ (S3, CloudFront, Razorpay)
```

- A module may call another module's **service**, never its repository.
- Nothing outside `repository` files (and `lib/db.ts` itself) runs SQL or imports the database pool. `authenticate.ts` may use `supabase-auth.ts` for token checks only.
- Multi-step changes use the transaction helper: the service opens one transaction and passes it to each repository function it calls, so everything commits together or not at all. The webhook capture and refund processing must work this way.
- All SQL is parameterized (placeholders, never string joining).
- Nothing outside `config/env.ts` reads `process.env`.
- Every response goes through a mapper. Never return a raw database row, because rows contain fields students must not see (for example teacher email and phone).

### 3.2 The two files that deserve special care

- `modules/playback/access.ts` contains the single function that authorizes lecture video access. Routine playback requires an unblocked user, a ready and visible lecture, and a paid enrollment for that course. The admin preview endpoint selects an explicit mode that requires an unblocked admin and a ready lecture. It also covers hidden lectures and lectures in unpublished courses.
- `modules/payments/webhook.routes.ts`: receives Razorpay events. It must be mounted **before** the JSON body parser, using the raw body, because the signature is computed over the exact raw bytes. Parsing first breaks verification. This is the most common cause of "webhook signature always fails."

### 3.3 Request lifecycle (the order is fixed)

1. `request-id` gives the request an id, returned in the `x-request-id` response header.
2. Logging and CORS (only the frontend's address is allowed).
3. The webhook route is handled here, with the raw body, before JSON parsing.
4. JSON body parsing.
5. `authenticate` (skipped only on deliberately public routes).
6. `require-admin` where needed.
7. `validate` against the Zod schema.
8. The route handler calls the service.
9. The service calls repositories and `lib/` wrappers.
10. Any thrown error reaches `error-handler`, which writes the response.

### 3.4 API surface

All routes are under `/api/v1` except the webhook. Names below are the agreed starting contract. Change them only by updating this file.

**Public (no login)**
- `GET /health`: verifies database connectivity and returns `503` when the database is unavailable.
- `GET /courses`: published courses with teacher name, bio, and photo.
- `GET /courses/:slug`: published course and teacher details, plus lecture ID, number, name, and duration for ready, visible lectures.
- `GET /demos`: published demo metadata ordered by display order.
- `POST /demos/:id/playback`: signed playback URL for a published demo. Unknown or unpublished demos return `NOT_FOUND`.
- Public catalog responses exclude video keys and teacher email and phone.

**Student (login required)**
- `GET /me`: returns `id`, `name`, `email`, `phone`, and `role`.
- `PATCH /me`: accepts only `name` and `phone`. Returns the updated profile.
- `GET /me/enrollments` returns paid courses with the caller's local captured payment ID, refund deadline, and whether a refund request is open.
- `POST /lectures/:id/playback`: verifies the Google session, loads profile, lecture, and course enrollment together, and runs the single access rule. Returns the signed URL, expiry, and lecture metadata with cache disabled. The player requests a replacement once for an expired URL and restores its position.
- `POST /courses/:id/checkout` accepts an empty body from a student with a phone number. It returns `{ orderId, amount, currency }` using the amount in paise and INR from the saved order. A retry reuses the pending order.
- `GET /courses/:id/enrollment-status` returns `{ status, courseSlug }` for the signed-in account. The status is null before an enrollment exists. The current slug is returned for a paid enrollment in a published course.
- `POST /refund-requests` takes a local payment ID and reason. The backend checks refund eligibility and looks up the amount and owner. `GET /me/refund-requests` returns the caller's refund history.

**Webhook (no login, signature verified)**
- `POST /api/webhooks/razorpay` receives raw JSON with a 1 MB limit and requires the Razorpay event ID and signature headers. A verified capture checks the saved order, amount and currency, then updates the payment, enrollment and event together. Duplicate verified IDs return 200. Invalid signatures return 400 after logging the delivery. Missing headers or invalid JSON return 400 without inserting an event.
- Verified `refund.processed` and `refund.failed` events match an approved request by refund ID or payment ID and full amount. The event and refund state commit together. Processed refunds use the same finalizer as admin approval.

**Admin (login and admin role)**
- `GET` and `POST /admin/teachers`, `PATCH /admin/teachers/:id`: list, create, edit, and set `isActive`.
- `GET` and `POST /admin/courses`, `GET` and `PATCH /admin/courses/:id`: list, create, read, and edit. Prices are in paise. Slugs are generated on creation and can be edited.
- `PATCH /admin/courses/:id/publication`: toggle `isPublished`. Publishing requires a teacher, a description, a thumbnail, and at least one ready, visible lecture.
- `GET /admin/courses/:id/lectures`, `PATCH /admin/lectures/:id`, `PUT /admin/courses/:id/lectures/order`: list, rename or hide, and reorder using the full set of lecture IDs.
- `POST /admin/lectures/upload-url`: create an uploaded lecture and return a 15-minute S3 MP4 PUT URL and its required headers.
- `POST /admin/lectures/:id/confirm-upload`: verify the S3 object, save duration in seconds, and set the lecture `ready`.
- `POST /admin/lectures/:id/preview` returns a temporary signed URL, expiry, and lecture metadata for a ready lecture. The admin lecture list opens an inline player and requests a replacement through this endpoint when the URL expires. Every request checks the current admin role and blocked status. Responses use `Cache-Control: no-store`.
- `GET /admin/demos`, `POST /admin/demos/upload-url`, `PATCH /admin/demos/:id`, `PATCH /admin/demos/:id/publication`: list, upload an unpublished demo, edit metadata and display order, and toggle publication. Publishing verifies the S3 object.
- `GET /admin/payments` accepts `page` and `pageSize` and returns payments newest first. `GET /admin/refund-requests` accepts a refund `status` filter and returns requests oldest first.
- `POST /admin/refund-requests/:id/approve` claims a requested or failed refund before calling Razorpay. Pending provider responses remain approved. `POST /admin/refund-requests/:id/reject` requires `adminNote` and only accepts requested refunds.

### 3.5 Video upload flow

1. Admin asks for an upload link. The backend creates the lecture row (status `uploaded`) with a generated key such as `lectures/<courseId>/<uuid>.mp4`, and returns a short-lived presigned upload URL.
2. The browser reads the video duration and uploads directly to the private bucket with the signed `Content-Type: video/mp4` and `If-None-Match: *` headers. The conditional PUT prevents reuse of the signed URL to overwrite a completed upload.
3. The admin confirms. The backend checks the object exists, then sets the status to `ready`. The `lecture_count` trigger updates the course.

The bucket needs CORS configured to allow `PUT`, `Content-Type`, and `If-None-Match` from the frontend's address. Demos use `demos/<uuid>.mp4` and are verified when published. Maximum lecture size is an open decision (a single upload link supports up to 5 GB).

---

## 4. Frontend structure

```
frontend/
├── .env.example
└── src/
    ├── app/                          Next.js App Router: one folder per URL
    │   ├── (public)/                 course list, course page, demos (server-rendered)
    │   ├── login/
    │   ├── (student)/                my-courses, watch/[lectureId], checkout/[slug], payment/processing/[courseId]
    │   └── (admin)/admin/            teachers, courses, lectures, demos, payments, refunds
    │
    ├── components/
    │   ├── ui/                       small generic pieces (buttons, inputs, dialogs)
    │   ├── layout/                   header, footer, navigation
    │   ├── course/                   course card, curriculum list
    │   ├── player/                   video player and expiry handling
    │   └── admin/                    admin tables and forms
    │
    ├── lib/
    │   ├── api/                      ONE typed client, one file per feature (courses.ts, me.ts, ...)
    │   ├── supabase-browser.ts       used for Google sign-in and session ONLY
    │   ├── errors.ts                 maps backend error codes to friendly messages
    │   └── utils.ts
    │
    └── hooks/                        useSession, useEnrollmentStatus, and similar
```

Rules:
- **Public pages are server-rendered** (for search visibility). The player, checkout, and dashboards are client-side.
- **The frontend never queries the database or Supabase tables.** It calls the Supabase library only to sign in and to get the session token. All data comes from the backend through `lib/api/`.
- Every protected API call attaches the session token. Public catalog pages fetch metadata on the server. Redirects for protected routes are a convenience. **The backend is what actually protects data.**
- The frontend shows what the backend allows and never decides access. A hidden button is not security.
- Components are PascalCase `.tsx` files, hooks start with `use`, and other files are kebab-case.
- Only `NEXT_PUBLIC_` variables exist in the frontend. If a value is secret, it must not be there.
- Payment success pages only poll the backend for the enrollment status. They never mark anything as paid.
- Confirmation polls every three seconds for up to 90 seconds. A paid response redirects to the course slug from the backend or to My Courses and shows the success toast at the destination.
- Checkout uses the order ID and amount returned by the backend.

---

## 5. Shared package

`shared/src/` holds:
- `constants/`: role names, enrollment, payment, lecture, and refund status values, the error code list, and limits.
- `types/`: the shape of every API request and response.

Status values are imported from here everywhere, so a typo becomes a compile error instead of a silent bug. The SQL migration also lists these values, so changing one means updating both, and adding a migration.

---

## 6. Database files and rules

- `supabase/migrations/`: one `.sql` file per change. The existing first migration is `initial_schema.sql`. Use a timestamp prefix for new migrations.
- **Never edit a migration that has been applied or merged.** Write a new one.
- The Supabase **Data API is disabled** and Row Level Security is on for every table with no policies. **Never enable the Data API, never add a policy**, and never use the public key for data.
- Every new table needs: a uuid id, `created_at`, `updated_at` with the shared trigger (unless insert-only), RLS enabled, and an entry in `docs/schema.md`.
- `seed.sql` is for local development with fake data only.

---

## 7. Configuration and secrets

`backend/.env.example` lists every variable, with fake values. The real `.env` is never committed. The app refuses to start if a required variable is missing or malformed.

Backend variables:
- App: `NODE_ENV`, `PORT`, `FRONTEND_URL` (for CORS)
- Database: `DATABASE_URL`, `DATABASE_POOL_MAX`
- Supabase Auth (token verification only): `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- AWS: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`
- Playback: `SIGNED_URL_TTL_SECONDS` (900 by default, 900 maximum).
- CloudFront (planned): `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY`.
- Razorpay webhook: `RAZORPAY_WEBHOOK_SECRET`
- Razorpay checkout: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` enable order creation when both are set. Checkout accepts Test Mode keys in this milestone.
- Business: `REFUND_WINDOW_DAYS` (3)

Validate the app, database, Supabase Auth, and AWS upload settings at startup. Introduce the CloudFront, Razorpay, and business settings when their features are implemented.

Frontend variables are `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the Test Mode `NEXT_PUBLIC_RAZORPAY_KEY_ID`. The Supabase key variables accept a legacy anon key or a publishable key.

Secret hygiene:
- The database connection string, AWS keys, CloudFront private key, Razorpay secret, and webhook secret exist only on the backend host. The Supabase service key is not used anywhere.
- The AWS user must have the narrowest permissions possible: upload to and read from one bucket, nothing else.
- Use Razorpay test keys and a separate development Supabase project until launch.
- Never paste real secrets into a prompt, a log, or a commit.

Authentication check: the backend verifies the token by asking Supabase Auth who it belongs to, then loads the profile from the database and checks `is_blocked`.

Database connection:
- Use the connection string from the Supabase dashboard. Prefer the **session pooler** string, because the direct connection may require IPv6.
- Keep the pool small (for example a maximum of 5 to 10 connections), because the free tier has a limited number of connections.
- Require SSL.
- The default `postgres` role bypasses Row Level Security, which is why the backend can read and write while the tables stay closed to everyone else. This connection string is now the most powerful secret in the project, so guard it accordingly.
- Migrations are applied with the Supabase CLI or the SQL editor, never by the app at runtime.

---

## 8. Errors, logging, and tracing problems

This section exists so that any problem can be located quickly.

### 8.1 One error shape

Every failure returns the same structure: an error object with a machine-readable `code`, a human `message`, and the `requestId`. Codes come from `shared/constants/error-codes` and are used by both sides. Starting list:

| Code | Meaning |
|---|---|
| `AUTH_REQUIRED` | no or invalid token |
| `ACCOUNT_BLOCKED` | profile is blocked |
| `FORBIDDEN` | logged in but not allowed (for example, not an admin) |
| `NOT_ENROLLED` | no paid enrollment for this lecture's course |
| `LECTURE_NOT_READY` | lecture is not ready or is hidden |
| `VALIDATION_FAILED` | request shape is wrong |
| `CONFLICT` | refund request is ineligible for the requested state change |
| `NOT_FOUND` | the thing does not exist |
| `PROFILE_INCOMPLETE` | phone number missing at checkout |
| `ALREADY_ENROLLED` | the student already owns the course |
| `PAYMENT_AMOUNT_MISMATCH` | webhook amount differs from the stored amount |
| `WEBHOOK_SIGNATURE_INVALID` | webhook failed verification |
| `REFUND_WINDOW_CLOSED` | past `refund_eligible_until` |
| `REFUND_ALREADY_OPEN` | an open request already exists for this payment |
| `REFUND_NOT_ALLOWED` | payment not captured, or enrollment not paid |
| `UPSTREAM_FAILED` | S3, CloudFront, or Razorpay returned an error |
| `INTERNAL_ERROR` | unexpected server error |
| `COURSE_NOT_PUBLISHABLE` | course is missing published-course requirements |
| `COURSE_SLUG_TAKEN` | course slug already exists |
| `UPLOAD_NOT_FOUND` | video object is missing from S3 |

Services throw an `AppError` with one of these codes. Only `error-handler.ts` turns errors into responses. Unknown errors become a generic server error with no internal details exposed.

### 8.2 Logging

- Requests log one plain-text line with the HTTP method, path without query parameters, status, and total elapsed time. Skip successful CORS preflights.
- Failed requests also log the error code and request ID so the response can be traced.
- Log the key business events: login rejected, playback granted or denied, order created, webhook received, webhook rejected, payment captured, refund requested, approved, processed, or failed.
- **Never log:** tokens, secrets, signed URLs, or full webhook payloads. The raw payload lives only in `payment_events`.
- No `console.log`. Use the logger.

### 8.3 Where to look when something breaks

| Symptom | Look first at |
|---|---|
| Student paid but cannot watch | `payment_events` (was the webhook received, verified, processed, any `error_note`?), then `payments.status`, then `enrollments.status` |
| Webhook signature always fails | raw-body handling in `webhook.routes.ts`, then `RAZORPAY_WEBHOOK_SECRET` |
| Same payment processed twice | the verified-event unique index and the idempotency check in the payments service |
| Student has access without paying | `playback/access.ts`, then whether any route bypasses it |
| Video plays then stops after some minutes | signed URL lifetime (`SIGNED_URL_TTL_SECONDS`) and the player's refresh handling |
| Video link returns 403 | the signed link expiration, S3 access policy, or the CloudFront key group once CloudFront is in place |
| Unsigned S3 link works | the bucket access policy |
| Cannot buy a course | `PROFILE_INCOMPLETE`, then the active-enrollment unique rule, then the course's `is_published` |
| Refund rejected unexpectedly | `payments.refund_eligible_until` against the request time, then any open request |
| Refund approved but access remains | the transaction that marks the refund `processed`, the payment `refunded`, and the enrollment `revoked` |
| Backend cannot connect to the database | `DATABASE_URL` (use the pooler string), SSL, pool size, and the Supabase connection limit |
| Course shows the wrong lecture count | the `lecture_count` trigger and lecture status and hidden flags |
| Login works but the profile is missing | the `on_auth_user_created` trigger |
| A change "does nothing" | check the browser network tab for the response `x-request-id`, then search the backend logs for it |

**Debugging method:** take the `requestId` from the failing response, search the logs for it, and follow that single request through the layers.

### 8.4 Health and observability

- `GET /api/v1/health` returns OK and confirms the database is reachable. No sensitive details.
- The Razorpay receiver marks successful captures processed. Verified captures that cannot be applied stay unprocessed with an `error_note`. Database failures roll back the event and payment changes so Razorpay can retry. The event log includes only the request ID, event ID, event type, and signature verification result.

---

## 9. Testing structure

Test tools: Vitest for unit and integration tests, Supertest for HTTP-level tests.

- Unit tests sit next to the code as `*.test.ts` (access rule, refund-window rule, webhook signature check, mappers).
- HTTP contract tests with mocked external dependencies live in `backend/tests/http/`.
- Integration tests live in `backend/tests/integration/` and run against a separate test database (`DATABASE_URL_TEST`), never the real one.
- The required security tests are listed in `CLAUDE.md` section 11. A change to the access rule, the webhook, checkout, or refunds is not complete without them.
- CI runs lint, type-check, and tests on every push. Merging is blocked if any fail.

---

## 10. Coding conventions

- TypeScript strict mode. No `any` unless explained in a comment.
- Database columns are snake_case. TypeScript is camelCase. Mappers convert.
- Money is integer paise. Durations are integer seconds. Times are UTC.
- Status strings come from `shared/constants`, never typed by hand.
- File names are kebab-case with the suffix indicating the role (`course.service.ts`). React components are PascalCase.
- One responsibility per function. Business rules are small and pure where possible.
- Comments explain **why**, not what.

---

## 11. Working rules for the agent

1. Do one slice per task. Do not add features, packages, or abstractions beyond the task.
2. Before touching the access rule, the webhook, checkout, or refunds, write a short plan and wait for approval.
3. Put new code in the right file kind (section 3.1). If unsure, ask.
4. Every behavior change updates the relevant document in the same commit: `CLAUDE.md`, `docs/schema.md`, this file, and a dated line in `docs/decisions.md`.
5. New environment variable: add it to `config/env.ts` and `.env.example`.
6. New error case: add a code to `shared/constants` and use it. Do not invent ad hoc messages.
7. New table or column: new migration file, then update `docs/schema.md`.
8. Finish every task with a short summary: what changed, which files, which tests, and anything that needs a human decision.

### Commit scope

Split work at boundaries reviewers can evaluate independently. For example, commit the Razorpay receiver with its tests and endpoint documentation, then commit the local tunnel script with its README instructions. Group supporting edits within each commit so the review covers one complete change.

### Slice checklist before calling a task done

- Types check and tests pass.
- Nothing outside a repository file touches the database.
- No secret appears in code, logs, or the frontend.
- Every new endpoint has authentication, a validation schema, and a mapper.
- The dangerous cases (unpaid, blocked, repeated request, forged input) are tested.
- Documents are updated.

---

## 12. Open decisions

- Whether lecture titles and durations are public on the course page (assumed yes; video keys never).
- Whether demo videos use signed URLs or a public CloudFront path.
- Maximum lecture file size and whether to support multipart upload.
- Hosting providers and whether the backend ships as a container.
- UI styling approach and design system.
- Whether to add a small query helper on top of `pg`.
- Whether the backend should use a dedicated least-privilege database role instead of the default `postgres` role.
