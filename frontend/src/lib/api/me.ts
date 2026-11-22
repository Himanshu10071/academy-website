import type { Profile, UpdateProfile } from "@academy/shared";

import { apiRequest } from "./client";

export function getMe(token: string, signal?: AbortSignal) {
  return apiRequest<Profile>("/me", token, { signal });
}

export function updateMe(token: string, updates: UpdateProfile, signal?: AbortSignal) {
  return apiRequest<Profile>("/me", token, { body: updates, signal });
}
