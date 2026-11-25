# Academy Website

Coaching academy platform for recorded video courses. The project brief and build order are in [AGENTS.md](AGENTS.md).

## Local development

Use Node.js 22.13 or later and npm. Install dependencies from the repository root with `npm ci`.

Run these commands in separate terminals from the repository root.

- `npm run dev:frontend` serves the Prince Academy homepage at `http://localhost:3000`.
- `npm run dev:backend` starts the Express server. Check it at `http://localhost:4000/api/v1/health`.

## Connect Supabase for Google sign-in

1. Apply [the initial migration](supabase/migrations/initial_schema.sql) to your Supabase project before signing in.
2. Enable Google as the only sign-in provider in Supabase Auth. Use the Supabase callback URL shown in the Google provider settings as the authorized redirect URI in Google Cloud. Set the Supabase Site URL to `http://localhost:3000` and allow `http://localhost:3000/` as a redirect URL for local development.
3. Open the project's **Integrations → Data API** settings and disable the Data API. Supabase Auth handles Google sign-in separately. [Supabase data security guide](https://supabase.com/docs/guides/database/secure-data)
4. Copy `backend/.env.example` to `backend/.env` if needed. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY` (anon or publishable key), and `DATABASE_URL`. Set `FRONTEND_URL` to your frontend origin and fill in the remaining backend settings from the template. Use the **Session pooler** URL from Supabase's **Connect** dialog on IPv4-only networks. Replace the password placeholder with your URL-encoded database password. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)
5. Copy `frontend/.env.example` to `frontend/.env.local` if needed. Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL`, which points to the Express server.
6. Start both apps and open `http://localhost:3000`. Express verifies the token with Supabase Auth and loads the profile through PostgreSQL. After signing in, add a phone number or edit your profile from the header. Keep `DATABASE_URL` in the backend environment.

Run `npm run typecheck` to check the TypeScript workspaces and `npm run build` to compile the frontend and backend.

Run `npm test --workspace=backend` for authentication and transaction tests.

## Configure catalog uploads

Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_BUCKET` in the backend environment. Use a private bucket with S3 Block Public Access enabled. Let the backend principal put and inspect objects under `lectures/` and `demos/`. Grant `s3:ListBucket` on this bucket so a missing object returns `404` during confirmation. [AWS HeadObject permissions](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)

In the bucket's CORS settings, allow `PUT` from the app's frontend origin (for example, `http://localhost:3000`) with the `Content-Type` and `If-None-Match` headers. Sign in with an admin account and open **Manage catalog** to upload videos.

Playback uses short-lived S3 GET URLs until CloudFront is configured. The backend AWS identity needs `s3:GetObject` for the lecture and demo objects. Set `SIGNED_URL_TTL_SECONDS` in the backend if you need a shorter expiry for testing. The default is 900 seconds. Keep the bucket private.

For catalog integration tests, point `DATABASE_URL_TEST` to a separate PostgreSQL database with `test` as a segment in its name and the initial schema applied. The tests use dedicated fixtures and mock Supabase Auth and S3. Never set this to the application database.

If PostgreSQL reports `SELF_SIGNED_CERT_IN_CHAIN`, download the Supabase root certificate from **Database Settings → SSL Configuration**. In `DATABASE_URL`, set `sslmode=verify-full` and `sslrootcert` to the URL-encoded certificate path. Resolve relative paths from the backend working directory. [Supabase SSL guide](https://supabase.com/docs/guides/platform/ssl-enforcement)

## Receive Razorpay Test Mode webhooks locally

1. Install `cloudflared` and make it available on your `PATH`. [Cloudflare installation guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
2. Set `RAZORPAY_WEBHOOK_SECRET` in `backend/.env` to the secret you will enter in Razorpay Test Mode. Start the backend with `npm run dev:backend`.
3. From the repository root, run `npm run tunnel` and copy the printed `https://*.trycloudflare.com` address. The tunnel uses `PORT` from `backend/.env`. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
4. In Razorpay Test Mode, set the webhook URL to that address followed by `/api/webhooks/razorpay` and enter the same webhook secret. Update the dashboard URL every time the tunnel restarts and prints a new address. [Razorpay webhook testing guide](https://razorpay.com/docs/webhooks/validate-test)

Subscribe to `payment.captured` and enable automatic capture in Razorpay. Verified captures for matching academy orders are marked processed and grant the enrollment. Other deliveries are recorded for inspection. [Razorpay payment webhooks](https://razorpay.com/docs/webhooks/payments/)
