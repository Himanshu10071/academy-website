import { database } from "../../lib/db.ts";

type PaymentEvent = {
  eventId: string;
  eventType: string;
  orderId: string | null;
  amount: number | null;
  rawPayload: unknown;
  signatureVerified: boolean;
};

export async function insertWebhookEvent(event: PaymentEvent) {
  const result = await database.query(
    `INSERT INTO public.payment_events
       (razorpay_event_id, event_type, payment_id, amount, raw_payload, signature_verified, processed)
     VALUES ($1, $2, (SELECT id FROM public.payments WHERE razorpay_order_id = $3), $4, $5::jsonb, $6, FALSE)
     ON CONFLICT (razorpay_event_id) WHERE signature_verified = TRUE DO NOTHING`,
    [event.eventId, event.eventType, event.orderId, event.amount, JSON.stringify(event.rawPayload), event.signatureVerified],
  );
  return result.rowCount === 1;
}
