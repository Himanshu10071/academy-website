import { ERROR_CODE } from "@academy/shared";
import express, { Router } from "express";

import { AppError } from "../../lib/errors.ts";
import { webhookPayload } from "./webhook.schemas.ts";
import { recordWebhook } from "./webhook.service.ts";

export const webhookRoutes = Router();

function parseWebhookBody(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new AppError(400, ERROR_CODE.VALIDATION_FAILED, "Invalid webhook JSON.");
  }
}

webhookRoutes.post("/razorpay", express.raw({ type: "application/json", limit: "1mb", inflate: false }), async (request, response) => {
  const eventId = request.get("X-Razorpay-Event-Id");
  const signature = request.get("X-Razorpay-Signature");
  if (!eventId?.trim() || !signature?.trim() || !Buffer.isBuffer(request.body)) {
    throw new AppError(400, ERROR_CODE.VALIDATION_FAILED, "Webhook headers and a JSON body are required.");
  }

  const rawPayload = parseWebhookBody(request.body);
  const result = webhookPayload.safeParse(rawPayload);
  if (!result.success) throw new AppError(400, ERROR_CODE.VALIDATION_FAILED, "Invalid webhook payload.");

  await recordWebhook({
    rawBody: request.body, rawPayload, payload: result.data, eventId, signature, requestId: response.locals.requestId,
  });
  response.status(200).end();
});
