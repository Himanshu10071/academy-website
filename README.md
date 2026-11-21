# Academy Website

Coaching academy platform for recorded video courses. The project brief and build order are in [AGENTS.md](AGENTS.md).

## Local development

Use Node.js 22.13 or later and npm. Install dependencies from the repository root with `npm ci`.

Run these commands in separate terminals from the repository root.

- `npm run dev:frontend` serves the Next.js starter page at `http://localhost:3000`.
- `npm run dev:backend` starts the Express server. Check it at `http://localhost:4000/health`.

## Connect Supabase for Google sign-in

1. Apply [the initial migration](supabase/migrations/initial_schema.sql) to your Supabase project before signing in.
2. Enable Google as the only sign-in provider in Supabase Auth. Use the Supabase callback URL shown in the Google provider settings as the authorized redirect URI in Google Cloud. Set the Supabase Site URL to `http://localhost:3000` and allow `http://localhost:3000/` as a redirect URL for local development.
3. Copy `backend/.env.example` to `backend/.env` and enter the project URL and a Supabase secret key. The backend uses port 4000 by default.
4. Copy `frontend/.env.example` to `frontend/.env.local` and enter the same project URL and the publishable key. Set `BACKEND_URL` if the Express server runs at a different address.
5. Start both apps and open `http://localhost:3000`. After Google redirects back, the frontend calls the Express backend to verify the Supabase access token and read the profile. Keep the secret key in the backend environment.

Run `npm run typecheck` to check the TypeScript workspaces and `npm run build` to compile the frontend and backend.
