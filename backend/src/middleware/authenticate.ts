import { ERROR_CODE } from "@academy/shared";
import type { Request, RequestHandler, Response } from "express";

import { AppError } from "../lib/errors.ts";
import { verifyAccessToken } from "../lib/supabase-auth.ts";
import { getActiveProfile } from "../modules/profile/profile.service.ts";

async function identify(request: Request, response: Response) {
  response.setHeader("Cache-Control", "no-store");
  const token = /^Bearer ([^\s]+)$/i.exec(request.get("Authorization") ?? "")?.[1];
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) throw new AppError(401, ERROR_CODE.AUTH_REQUIRED, "Sign in to continue.");
  response.locals.userId = user.id;
  if (user.app_metadata.provider !== "google") {
    throw new AppError(403, ERROR_CODE.FORBIDDEN, "Use Google to sign in.");
  }
  return user.id;
}

export const authenticateIdentity: RequestHandler = async (request, response, next) => {
  await identify(request, response);
  next();
};

export const authenticate: RequestHandler = async (request, response, next) => {
  const userId = await identify(request, response);
  response.locals.profile = await getActiveProfile(userId);
  next();
};
