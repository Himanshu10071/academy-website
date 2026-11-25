import { ERROR_CODE } from "@academy/shared";
import cors from "cors";
import express from "express";

import { env } from "./config/env.ts";
import { checkDatabase } from "./lib/db.ts";
import { authenticate } from "./middleware/authenticate.ts";
import { requireAdmin } from "./middleware/require-admin.ts";
import { AppError } from "./lib/errors.ts";
import { logger } from "./lib/logger.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { requestId } from "./middleware/request-id.ts";
import { profileRoutes } from "./modules/profile/profile.routes.ts";
import { adminCatalogRoutes, publicCatalogRoutes } from "./modules/catalog/catalog.routes.ts";
import { uploadRoutes } from "./modules/uploads/uploads.routes.ts";
import { adminPlaybackRoutes, playbackRoutes } from "./modules/playback/playback.routes.ts";
import { checkoutRoutes } from "./modules/payments/checkout.routes.ts";
import { webhookRoutes } from "./modules/payments/webhook.routes.ts";
import { adminRefundRoutes, refundRoutes } from "./modules/refunds/refund.routes.ts";

export const app = express();
app.disable("x-powered-by");
app.use(requestId);
app.use((request, response, next) => {
  const startedAt = performance.now();
  const path = request.originalUrl.split(/[?#]/, 1)[0];
  response.on("finish", () => {
    if (request.method === "OPTIONS" && response.statusCode < 400) return;

    const duration = Math.round(performance.now() - startedAt);
    const line = `${request.method} ${path} ${response.statusCode} in ${duration}ms`;
    if (response.statusCode >= 400) {
      const code = response.locals.errorCode ? ` ${response.locals.errorCode}` : "";
      logger.error(`${line}${code} (request ${response.locals.requestId})`);
    } else {
      logger.info(line);
    }
  });
  next();
});
const frontendOrigin = new URL(env.FRONTEND_URL).origin;
app.use(cors({
  origin: (origin, callback) => callback(null, origin === frontendOrigin),
  methods: ["GET", "POST", "PATCH", "PUT", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  exposedHeaders: ["x-request-id"],
}));
app.use("/api/webhooks", webhookRoutes);
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
app.use("/api/v1", publicCatalogRoutes);
app.use("/api/v1", playbackRoutes);
app.use("/api/v1", checkoutRoutes);
app.use("/api/v1", refundRoutes);
app.use("/api/v1/admin", authenticate, requireAdmin, adminCatalogRoutes, uploadRoutes, adminPlaybackRoutes, adminRefundRoutes);
app.use((_request, _response, next) => next(new AppError(404, ERROR_CODE.NOT_FOUND, "Route not found.")));
app.use(errorHandler);
