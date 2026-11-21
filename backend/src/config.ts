const port = Number(process.env.PORT ?? "4000");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer from 1 to 65535.");
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!supabaseUrl || !/^https?:$/.test(URL.parse(supabaseUrl)?.protocol ?? "")) {
  throw new Error("SUPABASE_URL must be an HTTP or HTTPS URL.");
}

if (!supabasePublishableKey) {
  throw new Error("SUPABASE_PUBLISHABLE_KEY is required.");
}

const database = databaseUrl ? URL.parse(databaseUrl) : null;
if (!database?.hostname || !/^postgres(?:ql)?:$/.test(database.protocol)) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
}

export const config = Object.freeze({ port, supabaseUrl, supabasePublishableKey, databaseUrl });
