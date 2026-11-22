# Academy Website

Coaching academy platform for recorded video courses. The project brief and build order are in [AGENTS.md](AGENTS.md).

## Local development

Use Node.js 22.13 or later and npm. Install dependencies from the repository root with `npm ci`.

Run these commands in separate terminals from the repository root.

- `npm run dev:frontend` serves the Google sign-in page at `http://localhost:3000`.
- `npm run dev:backend` starts the Express server. Check it at `http://localhost:4000/health`.

## Connect Supabase for Google sign-in

1. Apply [the initial migration](supabase/migrations/initial_schema.sql) to your Supabase project before signing in.
2. Enable Google as the only sign-in provider in Supabase Auth. Use the Supabase callback URL shown in the Google provider settings as the authorized redirect URI in Google Cloud. Set the Supabase Site URL to `http://localhost:3000` and allow `http://localhost:3000/` as a redirect URL for local development.
3. Open the project's **Integrations → Data API** settings and disable the Data API. Supabase Auth handles Google sign-in separately. [Supabase data security guide](https://supabase.com/docs/guides/database/secure-data)
4. Fill in the project URL, publishable key, and `DATABASE_URL` in `backend/.env`. Copy `backend/.env.example` if the local file is missing. Use the **Session pooler** URL from Supabase's **Connect** dialog if the backend runs on an IPv4-only network. A direct URL works when the backend can reach its database host. Replace the password placeholder with your URL-encoded database password. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)
5. Fill in the same project URL and publishable key in `frontend/.env.local`. Copy `frontend/.env.example` if the local file is missing. Set `BACKEND_URL` if Express runs at an address other than `http://localhost:4000`.
6. Start both apps and open `http://localhost:3000`. Express verifies the access token with Supabase Auth and reads the account profile through PostgreSQL. Keep `DATABASE_URL` in the backend environment.

Run `npm run typecheck` to check the TypeScript workspaces and `npm run build` to compile the frontend and backend.

Run `npm test --workspace=backend` for authentication and transaction tests.

If PostgreSQL reports `SELF_SIGNED_CERT_IN_CHAIN`, download the Supabase root certificate from **Database Settings → SSL Configuration**. In `DATABASE_URL`, set `sslmode=verify-full` and `sslrootcert` to the URL-encoded certificate path. Resolve relative paths from the backend working directory. [Supabase SSL guide](https://supabase.com/docs/guides/platform/ssl-enforcement)
