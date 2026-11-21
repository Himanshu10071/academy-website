const port = Number(process.env.PORT ?? "4000");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer from 1 to 65535.");
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();

if (!supabaseUrl || !/^https?:$/.test(URL.parse(supabaseUrl)?.protocol ?? "")) {
  throw new Error("SUPABASE_URL must be an HTTP or HTTPS URL.");
}

if (!supabaseSecretKey) {
  throw new Error("SUPABASE_SECRET_KEY is required.");
}

export const config = Object.freeze({ port, supabaseUrl, supabaseSecretKey });
