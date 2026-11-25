import { ENROLLMENT_STATUS, ERROR_CODE, PAYMENT_STATUS } from "@academy/shared";
import type { z } from "zod";

import { withTransaction } from "../../lib/db.ts";
import { activateEnrollment, capturePayment, lockPaymentForCapture } from "./capture.repository.ts";
import { finishWebhookEvent, insertWebhookEvent, type WebhookEvent } from "./webhook.repository.ts";
import type { capturedPayment } from "./webhook.schemas.ts";

const REFUND_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function recordCapture(event: WebhookEvent, details: z.infer<typeof capturedPayment>) {
  return withTransaction(async (client) => {
    const entity = details.payload.payment.entity;
    // Lock the payment before the event insert takes a foreign-key lock on it.
    const payment = await lockPaymentForCapture(client, entity.order_id);
    const eventRowId = await insertWebhookEvent(event, client);
    if (!eventRowId) return undefined;

    if (!payment) {
      await finishWebhookEvent(client, eventRowId, "No payment matched the captured order.");
    } else if (payment.amount !== entity.amount || payment.currency !== entity.currency) {
      await finishWebhookEvent(client, eventRowId, ERROR_CODE.PAYMENT_AMOUNT_MISMATCH);
    } else if (payment.razorpay_payment_id === entity.id &&
        (payment.payment_status === PAYMENT_STATUS.CAPTURED || payment.payment_status === PAYMENT_STATUS.REFUNDED)) {
      await finishWebhookEvent(client, eventRowId);
    } else if (payment.payment_status !== PAYMENT_STATUS.CREATED || payment.enrollment_status !== ENROLLMENT_STATUS.PENDING) {
      await finishWebhookEvent(client, eventRowId, "Payment or enrollment was ineligible for capture.");
    } else {
      const timestamp = entity.created_at ?? details.created_at;
      const paidAt = timestamp === undefined ? new Date() : new Date(timestamp * 1000);
      const eligibleUntil = new Date(paidAt.getTime() + REFUND_WINDOW_MS);
      await capturePayment(client, payment.id, entity.id, paidAt, eligibleUntil);
      await activateEnrollment(client, payment.enrollment_id);
      await finishWebhookEvent(client, eventRowId);
    }
    return eventRowId;
  });
}
