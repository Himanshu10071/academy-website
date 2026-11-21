import { createClient } from "@supabase/supabase-js";

import { config } from "../config.ts";
import { database } from "../database.ts";

const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

export async function verifyAccessToken(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error && (!error.status || error.status >= 500 || error.status === 429)) {
    throw error;
  }
  return error ? null : data.user;
}

type ProfileRow = {
  id: string;
  user_name: string;
  email: string;
  phone_number: string | null;
  role: string;
  is_blocked: boolean;
};

export async function findProfile(userId: string) {
  const { rows: [data] } = await database.query<ProfileRow>(
    `SELECT id, user_name, email, phone_number, role, is_blocked
     FROM public.profiles
     WHERE id = $1`,
    [userId],
  );
  if (!data) return null;

  return {
    id: data.id,
    name: data.user_name,
    email: data.email,
    phoneNumber: data.phone_number,
    role: data.role,
    isBlocked: data.is_blocked,
  };
}
