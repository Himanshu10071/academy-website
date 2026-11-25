import { ENROLLMENT_STATUS, OPEN_REFUND_STATUSES, PAYMENT_STATUS, REFUND_STATUS, type PaymentStatus, type RefundStatus } from "@academy/shared";
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

export type AdminRefundRow = StudentRefundRow & {
  student_name: string;
  student_email: string;
  amount: number;
  payment_id: string;
};

const adminRefundSelect = `
  SELECT r.id, r.status, r.reason, r.admin_note, r.requested_at, r.amount, r.payment_id,
         c.name AS course_name, u.user_name AS student_name, u.email AS student_email
    FROM public.refund_requests r
    JOIN public.courses c ON c.id = r.course_id
    JOIN public.profiles u ON u.id = r.user_id`;

export async function listAdminRefunds(status?: RefundStatus) {
  const { rows } = await database.query<AdminRefundRow>(
    `${adminRefundSelect} WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.requested_at, r.id`,
    [status ?? null],
  );
  return rows;
}

export async function findAdminRefund(id: string) {
  const { rows } = await database.query<AdminRefundRow>(`${adminRefundSelect} WHERE r.id = $1`, [id]);
  return rows[0];
}

export async function rejectPendingRefund(id: string, adminId: string, note: string) {
  const { rows } = await database.query<{ user_id: string }>(
    `UPDATE public.refund_requests SET status = $2, reviewed_by = $3, reviewed_at = now(), admin_note = $4
      WHERE id = $1 AND status = $5 RETURNING user_id`,
    [id, REFUND_STATUS.REJECTED, adminId, note, REFUND_STATUS.REQUESTED],
  );
  return rows[0];
}

export async function claimRefundApproval(id: string, adminId: string) {
  const { rows } = await database.query<{
    id: string; user_id: string; razorpay_attempt_key: string; razorpay_payment_id: string; amount: number;
  }>(
    `UPDATE public.refund_requests r
        SET status = $2, reviewed_by = $3, reviewed_at = now(), admin_note = NULL
       FROM public.payments p JOIN public.enrollments e ON e.id = p.enrollment_id AND e.user_id = p.user_id
      WHERE r.id = $1 AND r.status = ANY($4::text[])
        AND r.payment_id = p.id AND r.user_id = p.user_id AND r.course_id = e.course_id
        AND p.status = $5 AND e.status = $6 AND r.amount = p.amount AND p.razorpay_payment_id IS NOT NULL
      RETURNING r.id, r.user_id, r.razorpay_attempt_key, p.razorpay_payment_id, p.amount`,
    [id, REFUND_STATUS.APPROVED, adminId, [REFUND_STATUS.REQUESTED, REFUND_STATUS.FAILED],
      PAYMENT_STATUS.CAPTURED, ENROLLMENT_STATUS.PAID],
  );
  return rows[0];
}

export async function savePendingRefundId(id: string, attemptKey: string, providerId: string) {
  await database.query(
    `UPDATE public.refund_requests SET razorpay_refund_id = $3
      WHERE id = $1 AND razorpay_attempt_key = $2 AND status = $4
        AND (razorpay_refund_id IS NULL OR razorpay_refund_id = $3)`,
    [id, attemptKey, providerId, REFUND_STATUS.APPROVED],
  );
}

export async function failApprovedRefund(
  id: string, attemptKey: string, note: string, confirmed: boolean, client?: PoolClient,
) {
  const { rows } = await (client ?? database).query<{ id: string; user_id: string }>(
    `UPDATE public.refund_requests
        SET status = $3, admin_note = $4,
            razorpay_attempt_key = CASE WHEN $5 THEN gen_random_uuid() ELSE razorpay_attempt_key END,
            razorpay_refund_id = CASE WHEN $5 THEN NULL ELSE razorpay_refund_id END
      WHERE id = $1 AND razorpay_attempt_key = $2 AND status = $6 RETURNING id, user_id`,
    [id, attemptKey, REFUND_STATUS.FAILED, note, confirmed, REFUND_STATUS.APPROVED],
  );
  return rows[0];
}

export async function findRefundPaymentId(client: PoolClient, id: string) {
  const { rows } = await client.query<{ payment_id: string }>(
    "SELECT payment_id FROM public.refund_requests WHERE id = $1",
    [id],
  );
  return rows[0]?.payment_id;
}

export async function lockRefundRequest(client: PoolClient, id: string) {
  const { rows } = await client.query<{
    id: string; user_id: string; course_id: string; amount: number; status: RefundStatus;
    razorpay_refund_id: string | null; razorpay_attempt_key: string;
  }>("SELECT id, user_id, course_id, amount, status, razorpay_refund_id, razorpay_attempt_key FROM public.refund_requests WHERE id = $1 FOR UPDATE", [id]);
  return rows[0];
}

export async function findRefundForWebhook(client: PoolClient, paymentId: string, providerId: string) {
  const { rows } = await client.query<{ id: string }>(
    `SELECT r.id FROM public.refund_requests r
       JOIN public.payments p ON p.id = r.payment_id
      WHERE p.razorpay_payment_id = $1
        AND (r.razorpay_refund_id = $2 OR (r.status = $3 AND r.razorpay_refund_id IS NULL))
      ORDER BY (r.razorpay_refund_id = $2) DESC NULLS LAST, r.id LIMIT 1
      FOR NO KEY UPDATE OF p`,
    [paymentId, providerId, REFUND_STATUS.APPROVED],
  );
  return rows[0]?.id;
}

export async function markRefundProcessed(client: PoolClient, refundId: string, providerId: string) {
  await client.query(
    `UPDATE public.refund_requests SET status = $2, processed_at = now(), razorpay_refund_id = $3, admin_note = NULL
      WHERE id = $1`,
    [refundId, REFUND_STATUS.PROCESSED, providerId],
  );
}

export async function markPaymentRefunded(client: PoolClient, paymentId: string) {
  await client.query("UPDATE public.payments SET status = $2, refunded_at = now() WHERE id = $1", [paymentId, PAYMENT_STATUS.REFUNDED]);
}

export async function revokeEnrollment(client: PoolClient, enrollmentId: string) {
  await client.query("UPDATE public.enrollments SET status = $2, revoked_at = now() WHERE id = $1", [enrollmentId, ENROLLMENT_STATUS.REVOKED]);
}

export type AdminPaymentRow = {
  id: string; student_name: string; course_name: string; amount: number; status: PaymentStatus; paid_at: Date | null;
};

export async function listAdminPayments(page: number, pageSize: number) {
  const { rows } = await database.query<AdminPaymentRow>(
    `SELECT p.id, u.user_name AS student_name, c.name AS course_name, p.amount, p.status, p.paid_at
       FROM public.payments p
       JOIN public.profiles u ON u.id = p.user_id
       JOIN public.enrollments e ON e.id = p.enrollment_id
       JOIN public.courses c ON c.id = e.course_id
      ORDER BY p.created_at DESC, p.id DESC LIMIT $1 OFFSET $2`,
    [pageSize + 1, (page - 1) * pageSize],
  );
  return rows;
}
