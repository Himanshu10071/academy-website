import type { Profile, Role } from "@academy/shared";

import type { ProfileRow } from "./profile.repository.ts";

export function mapProfile(row: ProfileRow, role: Role): Profile {
  return { id: row.id, name: row.user_name, email: row.email, phone: row.phone_number, role };
}
