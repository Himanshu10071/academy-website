import type { UpdateProfile } from "@academy/shared";

import { database } from "../../lib/db.ts";

export type ProfileRow = {
  id: string;
  user_name: string;
  email: string;
  phone_number: string | null;
  role: string;
  is_blocked: boolean;
};

export async function findProfile(id: string) {
  const { rows } = await database.query<ProfileRow>(
    `SELECT id, user_name, email, phone_number, role, is_blocked
       FROM public.profiles WHERE id = $1`,
    [id],
  );
  return rows[0];
}

export async function updateProfile(id: string, updates: UpdateProfile) {
  const { rows } = await database.query<ProfileRow>(
    `UPDATE public.profiles
       SET user_name = COALESCE($2, user_name), phone_number = COALESCE($3, phone_number)
       WHERE id = $1 AND NOT is_blocked
       RETURNING id, user_name, email, phone_number, role, is_blocked`,
    [id, updates.name ?? null, updates.phone ?? null],
  );
  return rows[0];
}
