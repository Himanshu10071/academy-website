import { ERROR_CODE, type ApiFailure } from "@academy/shared";
import type { ErrorRequestHandler } from "express";

import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) return next(error);

  let failure = error instanceof AppError ? error : undefined;
  if (!failure && typeof error === "object" && error !== null && "type" in error) {
    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
      failure = new AppError(error.type === "entity.too.large" ? 413 : 400, ERROR_CODE.VALIDATION_FAILED, "Invalid request body.");
    }
  }
  failure ??= new AppError(500, ERROR_CODE.INTERNAL_ERROR, "Something went wrong.");

  const requestId: string = response.locals.requestId;
  logger.error(`${request.method} ${failure.status} ${failure.code} (request ${requestId})`);

  const body: ApiFailure = { error: { code: failure.code, message: failure.message, requestId } };
  response.status(failure.status).json(body);
};
