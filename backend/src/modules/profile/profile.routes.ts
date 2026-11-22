import type { Profile, UpdateProfile } from "@academy/shared";
import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.ts";
import { validate } from "../../middleware/validate.ts";
import { updateProfileSchema } from "./profile.schemas.ts";
import { saveProfile } from "./profile.service.ts";

export const profileRoutes = Router();

profileRoutes.get("/me", authenticate, (_request, response) => {
  const profile: Profile = response.locals.profile;
  response.json(profile);
});

profileRoutes.patch("/me", authenticate, validate(updateProfileSchema), async (_request, response) => {
  const profile: Profile = response.locals.profile;
  const updates: UpdateProfile = response.locals.validated;
  response.json(await saveProfile(profile.id, updates));
});
