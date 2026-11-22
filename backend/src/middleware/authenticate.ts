import { ERROR_CODE } from "@academy/shared";
import type { RequestHandler } from "express";

import { AppError } from "../lib/errors.ts";
import { verifyAccessToken } from "../lib/supabase-auth.ts";
import { getActiveProfile } from "../modules/profile/profile.service.ts";

export const authenticate: RequestHandler = async (request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  const token = /^Bearer ([^\s]+)$/i.exec(request.get("Authorization") ?? "")?.[1];
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) throw new AppError(401, ERROR_CODE.AUTH_REQUIRED, "Sign in to continue.");
  if (user.app_metadata.provider !== "google") {
    throw new AppError(403, ERROR_CODE.FORBIDDEN, "Use Google to sign in.");
  }
  response.locals.userId = user.id;
  response.locals.profile = await getActiveProfile(user.id);
  next();
};
