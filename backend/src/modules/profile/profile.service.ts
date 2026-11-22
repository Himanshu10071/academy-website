import { ERROR_CODE, ROLE, type UpdateProfile } from "@academy/shared";

import { AppError } from "../../lib/errors.ts";
import { mapProfile } from "./profile.mapper.ts";
import { findProfile, updateProfile, type ProfileRow } from "./profile.repository.ts";

function activeProfile(row: ProfileRow | undefined) {
  if (row?.is_blocked) throw new AppError(403, ERROR_CODE.ACCOUNT_BLOCKED, "This account is blocked.");
  if (!row || (row.role !== ROLE.STUDENT && row.role !== ROLE.ADMIN)) {
    throw new AppError(403, ERROR_CODE.FORBIDDEN, "This account cannot access the academy.");
  }
  return mapProfile(row, row.role);
}

export async function getActiveProfile(id: string) {
  return activeProfile(await findProfile(id));
}

export async function saveProfile(id: string, updates: UpdateProfile) {
  const phone = updates.phone;
  const row = await updateProfile(id, { name: updates.name, phone: phone && (phone.startsWith("+91") ? phone : `+91${phone}`) });
  // Check the current state if access changed between authentication and the update.
  if (!row) activeProfile(await findProfile(id));
  return activeProfile(row);
}
