import { ENROLLMENT_STATUS, PAYMENT_STATUS, type CheckoutOrder, type EnrollmentStatus } from "@academy/shared";
import type { PoolClient } from "pg";

import { database } from "../../lib/db.ts";

export async function lockCheckoutProfile(client: PoolClient, userId: string) {
  const { rows } = await client.query<{ role: string; phone_number: string | null; is_blocked: boolean }>(
    "SELECT role, phone_number, is_blocked FROM public.profiles WHERE id = $1 FOR NO KEY UPDATE",
    [userId],
  );
  return rows[0];
}

export async function lockPublishedCourse(client: PoolClient, courseId: string) {
  const { rows } = await client.query<{ price: number }>(
    "SELECT price FROM public.courses WHERE id = $1 AND is_published FOR SHARE",
    [courseId],
  );
  return rows[0];
}

export async function findActiveEnrollment(client: PoolClient, userId: string, courseId: string) {
  const { rows } = await client.query<{ id: string; status: EnrollmentStatus["status"] }>(
    `SELECT id, status FROM public.enrollments
      WHERE user_id = $1 AND course_id = $2 AND status IN ($3, $4)
      FOR NO KEY UPDATE`,
    [userId, courseId, ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.PAID],
  );
  return rows[0];
}

export async function createPendingEnrollment(client: PoolClient, userId: string, courseId: string) {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO public.enrollments (user_id, course_id, status) VALUES ($1, $2, $3) RETURNING id",
    [userId, courseId, ENROLLMENT_STATUS.PENDING],
  );
  return rows[0].id;
}

export async function findOpenOrder(client: PoolClient, enrollmentId: string) {
  const { rows } = await client.query<{ razorpay_order_id: string; amount: number; currency: CheckoutOrder["currency"] }>(
    `SELECT razorpay_order_id, amount, currency FROM public.payments
      WHERE enrollment_id = $1 AND status = $2 ORDER BY created_at DESC, id LIMIT 1`,
    [enrollmentId, PAYMENT_STATUS.CREATED],
  );
  return rows[0];
}

export async function saveOrder(client: PoolClient, enrollmentId: string, userId: string, order: CheckoutOrder) {
  await client.query(
    `INSERT INTO public.payments (user_id, enrollment_id, razorpay_order_id, amount, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, enrollmentId, order.orderId, order.amount, order.currency, PAYMENT_STATUS.CREATED],
  );
}

export async function findEnrollmentStatus(userId: string, courseId: string) {
  const { rows } = await database.query<{ slug: string; is_published: boolean; status: EnrollmentStatus["status"] }>(
    `SELECT c.slug, c.is_published, e.status FROM public.courses c
     LEFT JOIN LATERAL (
       SELECT status FROM public.enrollments WHERE user_id = $1 AND course_id = c.id
       ORDER BY (status = $3) DESC, (status = $4) DESC, created_at DESC, id LIMIT 1
     ) e ON TRUE
     WHERE c.id = $2`,
    [userId, courseId, ENROLLMENT_STATUS.PAID, ENROLLMENT_STATUS.PENDING],
  );
  return rows[0];
}
