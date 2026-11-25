import { OPEN_REFUND_STATUSES, REFUND_STATUS, type RefundStatus } from "@academy/shared";
import type { PoolClient } from "pg";

import { database } from "../../lib/db.ts";

export type StudentRefundRow = {
  id: string;
  course_name: string;
  status: RefundStatus;
  reason: string;
  admin_note: string | null;
  requested_at: Date;
};

export async function lockRefundPayment(client: PoolClient, paymentId: string, userId: string | null = null) {
  const { rows } = await client.query<{
    payment_id: string; user_id: string; course_id: string; enrollment_id: string; course_name: string;
    payment_status: string; enrollment_status: string; amount: number; refund_eligible_until: Date | null;
    razorpay_payment_id: string | null;
  }>(
    `SELECT p.id AS payment_id, p.user_id, e.course_id, e.id AS enrollment_id, c.name AS course_name, p.amount,
            p.status AS payment_status, e.status AS enrollment_status, p.refund_eligible_until, p.razorpay_payment_id
       FROM public.payments p
       JOIN public.enrollments e ON e.id = p.enrollment_id AND e.user_id = p.user_id
       JOIN public.courses c ON c.id = e.course_id
      WHERE p.id = $1 AND ($2::uuid IS NULL OR p.user_id = $2)
      FOR NO KEY UPDATE OF p, e`,
    [paymentId, userId],
  );
  return rows[0];
}

export async function hasOpenRefund(client: PoolClient, paymentId: string) {
  const { rows: [row] } = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM public.refund_requests WHERE payment_id = $1 AND status = ANY($2::text[]))",
    [paymentId, OPEN_REFUND_STATUSES],
  );
  return row.exists;
}

export async function insertRefundRequest(client: PoolClient, data: {
  paymentId: string; userId: string; courseId: string; amount: number; reason: string;
}) {
  const { rows: [row] } = await client.query<Omit<StudentRefundRow, "course_name">>(
    `INSERT INTO public.refund_requests (payment_id, user_id, course_id, amount, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, status, reason, admin_note, requested_at`,
    [data.paymentId, data.userId, data.courseId, data.amount, data.reason, REFUND_STATUS.REQUESTED],
  );
  return row;
}

export async function listStudentRefunds(userId: string) {
  const { rows } = await database.query<StudentRefundRow>(
    `SELECT r.id, r.status, r.reason, r.admin_note, r.requested_at, c.name AS course_name
       FROM public.refund_requests r JOIN public.courses c ON c.id = r.course_id
      WHERE r.user_id = $1 ORDER BY r.requested_at DESC, r.id DESC`,
    [userId],
  );
  return rows;
}
