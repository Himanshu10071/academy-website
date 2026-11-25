import { ENROLLMENT_STATUS, PAYMENT_STATUS } from "@academy/shared";
import type { PoolClient } from "pg";

export async function lockPaymentForCapture(client: PoolClient, orderId: string) {
  const { rows } = await client.query<{
    id: string; enrollment_id: string; payment_status: string; enrollment_status: string;
    razorpay_payment_id: string | null; amount: number; currency: string;
  }>(
    `SELECT p.id, p.enrollment_id, p.razorpay_payment_id, p.amount, p.currency,
            p.status AS payment_status, e.status AS enrollment_status
       FROM public.payments p JOIN public.enrollments e ON e.id = p.enrollment_id AND e.user_id = p.user_id
      WHERE p.razorpay_order_id = $1
      FOR UPDATE OF p, e`,
    [orderId],
  );
  return rows[0];
}

export async function capturePayment(client: PoolClient, paymentId: string, providerId: string, paidAt: Date, eligibleUntil: Date) {
  await client.query(
    `UPDATE public.payments SET status = $2, razorpay_payment_id = $3, paid_at = $4, refund_eligible_until = $5
      WHERE id = $1`,
    [paymentId, PAYMENT_STATUS.CAPTURED, providerId, paidAt, eligibleUntil],
  );
}

export async function activateEnrollment(client: PoolClient, enrollmentId: string) {
  await client.query("UPDATE public.enrollments SET status = $2 WHERE id = $1", [enrollmentId, ENROLLMENT_STATUS.PAID]);
}
