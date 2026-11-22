import { ERROR_CODE } from "@academy/shared";
import cors from "cors";
import express from "express";

import { env } from "./config/env.ts";
import { checkDatabase } from "./lib/db.ts";
import { AppError } from "./lib/errors.ts";
import { logger } from "./lib/logger.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { requestId } from "./middleware/request-id.ts";
import { profileRoutes } from "./modules/profile/profile.routes.ts";

export const app = express();
app.disable("x-powered-by");
app.use(requestId);
app.use((request, response, next) => {
  response.on("finish", () => logger.info({
    requestId: response.locals.requestId,
    userId: response.locals.userId,
    module: "http",
    action: "request_completed",
    method: request.method,
    status: response.statusCode,
  }));
  next();
});
const frontendOrigin = new URL(env.FRONTEND_URL).origin;
app.use(cors({
  origin: (origin, callback) => callback(null, origin === frontendOrigin),
  methods: ["GET", "PATCH", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  exposedHeaders: ["x-request-id"],
}));
app.use(express.json());

app.get("/api/v1/health", async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  try {
    await checkDatabase();
  } catch {
    throw new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "The database is temporarily unavailable.");
  }
  response.json({ status: "ok", database: "reachable" });
});
app.use("/api/v1", profileRoutes);
app.use((_request, _response, next) => next(new AppError(404, ERROR_CODE.NOT_FOUND, "Route not found.")));
app.use(errorHandler);
