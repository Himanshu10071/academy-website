import type { PoolClient } from "pg";

import { database } from "../../lib/db.ts";

export type WebhookEvent = {
  eventId: string;
  eventType: string;
  orderId: string | null;
  amount: number | null;
  rawPayload: unknown;
  signatureVerified: boolean;
  errorNote?: string;
};

export async function insertWebhookEvent(event: WebhookEvent, client?: PoolClient) {
  const { rows } = await (client ?? database).query<{ payment_event_id: string }>(
    `INSERT INTO public.payment_events
       (razorpay_event_id, event_type, payment_id, amount, raw_payload, signature_verified, processed, error_note)
     VALUES ($1, $2, (SELECT id FROM public.payments WHERE razorpay_order_id = $3), $4, $5::jsonb, $6, FALSE, $7)
     ON CONFLICT (razorpay_event_id) WHERE signature_verified = TRUE DO NOTHING
     RETURNING payment_event_id`,
    [event.eventId, event.eventType, event.orderId, event.amount, JSON.stringify(event.rawPayload),
      event.signatureVerified, event.errorNote ?? null],
  );
  return rows[0]?.payment_event_id;
}
