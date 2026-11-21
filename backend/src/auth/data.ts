import { createClient } from "@supabase/supabase-js";

import { config } from "../config.ts";

const supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

export async function verifyAccessToken(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error && (!error.status || error.status >= 500 || error.status === 429)) {
    throw error;
  }
  return error ? null : data.user;
}

export async function findProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,user_name,email,phone_number,role,is_blocked")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    name: data.user_name as string,
    email: data.email as string,
    phoneNumber: data.phone_number as string | null,
    role: data.role as string,
    isBlocked: data.is_blocked as boolean,
  };
}
