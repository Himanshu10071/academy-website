import { ERROR_CODE } from "@academy/shared";
import type { z } from "zod";

import { env } from "../../config/env.ts";
import { AppError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { verifyWebhookSignature } from "../../lib/razorpay.ts";
import { recordCapture } from "./capture.service.ts";
import { insertWebhookEvent } from "./webhook.repository.ts";
import { capturedPayment, type webhookPayload } from "./webhook.schemas.ts";

type Webhook = {
  rawBody: Buffer;
  rawPayload: unknown;
  payload: z.infer<typeof webhookPayload>;
  eventId: string;
  signature: string;
  requestId: string;
};

export async function recordWebhook({ rawBody, rawPayload, payload, eventId, signature, requestId }: Webhook) {
  const signatureVerified = verifyWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET);
  const entity = payload.payload?.payment?.entity;
  const eventType = payload.event;
  const event = {
    eventId, eventType, rawPayload, signatureVerified,
    amount: entity?.amount ?? null,
    orderId: entity?.order_id ?? null,
  };
  const capture = signatureVerified && eventType === "payment.captured" ? capturedPayment.safeParse(rawPayload) : undefined;
  const inserted = capture?.success
    ? await recordCapture(event, capture.data)
    : await insertWebhookEvent({ ...event, errorNote: capture && "Captured payment details could not be validated." });
  if (inserted) {
    logger.info(JSON.stringify({ requestId, eventId, eventType, signature_verified: signatureVerified }));
  }
  if (!signatureVerified) {
    throw new AppError(400, ERROR_CODE.WEBHOOK_SIGNATURE_INVALID, "Invalid webhook signature.");
  }
}
