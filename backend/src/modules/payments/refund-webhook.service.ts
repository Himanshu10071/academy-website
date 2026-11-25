import { REFUND_STATUS } from "@academy/shared";
import type { z } from "zod";

import { withTransaction } from "../../lib/db.ts";
import { logRefund, matchRefundWebhook, processRefundWebhook } from "../refunds/refund.service.ts";
import { finishWebhookEvent, insertWebhookEvent, type WebhookEvent } from "./webhook.repository.ts";
import type { refundNotification } from "./webhook.schemas.ts";

export async function recordRefundWebhook(event: WebhookEvent, details: z.infer<typeof refundNotification>, requestId: string) {
  const refund = details.payload.refund.entity;
  const expected = details.event === "refund.processed" ? REFUND_STATUS.PROCESSED : REFUND_STATUS.FAILED;
  const refundEvent = { ...event, orderId: null, amount: refund.amount, providerPaymentId: refund.payment_id };
  if (refund.status !== expected) {
    return insertWebhookEvent({ ...refundEvent, errorNote: "Refund status did not match the Razorpay event type." });
  }

  const result = await withTransaction(async (client) => {
    // Lock the payment before inserting the event's foreign key.
    const refundId = await matchRefundWebhook(client, refund);
    const eventRowId = await insertWebhookEvent(refundEvent, client);
    if (!eventRowId) return undefined;
    const { change, errorNote } = await processRefundWebhook(client, refundId, refund);
    await finishWebhookEvent(client, eventRowId, errorNote);
    return { eventRowId, change };
  });
  if (result?.change) logRefund(result.change.status, requestId, result.change.userId, result.change.refundId);
  return result?.eventRowId;
}
