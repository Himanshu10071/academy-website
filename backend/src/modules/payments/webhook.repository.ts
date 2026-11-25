import type { PoolClient } from "pg";

import { database } from "../../lib/db.ts";

export type WebhookEvent = {
  eventId: string;
  eventType: string;
  orderId: string | null;
  providerPaymentId?: string;
  amount: number | null;
  rawPayload: unknown;
  signatureVerified: boolean;
  errorNote?: string;
};

export async function insertWebhookEvent(event: WebhookEvent, client?: PoolClient) {
  const { rows } = await (client ?? database).query<{ payment_event_id: string }>(
    `INSERT INTO public.payment_events
       (razorpay_event_id, event_type, payment_id, amount, raw_payload, signature_verified, processed, error_note)
     VALUES ($1, $2, (SELECT id FROM public.payments
                      WHERE razorpay_order_id = $3 OR ($3::text IS NULL AND razorpay_payment_id = $8)), $4, $5::jsonb, $6, FALSE, $7)
     ON CONFLICT (razorpay_event_id) WHERE signature_verified = TRUE DO NOTHING
     RETURNING payment_event_id`,
    [event.eventId, event.eventType, event.orderId, event.amount, JSON.stringify(event.rawPayload),
      event.signatureVerified, event.errorNote ?? null, event.providerPaymentId ?? null],
  );
  return rows[0]?.payment_event_id;
}

export async function finishWebhookEvent(client: PoolClient, id: string, errorNote: string | null = null) {
  await client.query(
    "UPDATE public.payment_events SET processed = $2, error_note = $3 WHERE payment_event_id = $1",
    [id, errorNote === null, errorNote],
  );
}
