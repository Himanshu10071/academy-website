import { ERROR_CODE } from "@academy/shared";
import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { AppError } from "../lib/errors.ts";

export function validate(schema: ZodType, source: "body" | "params" | "query" = "body"): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      throw new AppError(400, ERROR_CODE.VALIDATION_FAILED, "Check the submitted fields and try again.");
    }
    if (source === "params") response.locals.validatedParams = result.data;
    else if (source === "query") response.locals.validatedQuery = result.data;
    else response.locals.validated = result.data;
    next();
  };
}
