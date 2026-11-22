import { ERROR_CODE } from "@academy/shared";
import { createClient } from "@supabase/supabase-js";

import { env } from "../config/env.ts";
import { AppError } from "./errors.ts";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

export async function verifyAccessToken(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error && (!error.status || error.status >= 500 || error.status === 429)) {
    throw new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "Sign-in is temporarily unavailable.");
  }
  return error ? null : data.user;
}
