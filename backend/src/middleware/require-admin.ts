import { ERROR_CODE, ROLE, type Profile } from "@academy/shared";
import type { RequestHandler } from "express";

import { AppError } from "../lib/errors.ts";

export const requireAdmin: RequestHandler = (_request, response, next) => {
  const profile: Profile | undefined = response.locals.profile;
  if (profile?.role !== ROLE.ADMIN) {
    throw new AppError(403, ERROR_CODE.FORBIDDEN, "Administrator access is required.");
  }
  next();
};
