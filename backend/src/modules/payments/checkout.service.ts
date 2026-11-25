import { ENROLLMENT_STATUS, ERROR_CODE, ROLE, type CheckoutOrder, type EnrollmentStatus } from "@academy/shared";

import { withTransaction } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { createRazorpayOrder } from "../../lib/razorpay.ts";
import {
  createPendingEnrollment, findActiveEnrollment, findEnrollmentStatus, findOpenOrder, lockCheckoutProfile, lockPublishedCourse, saveOrder,
} from "./checkout.repository.ts";

export function checkout(userId: string, courseId: string): Promise<CheckoutOrder> {
  return withTransaction(async (client) => {
    // Serialize purchases for this student before checking or creating an order.
    const profile = await lockCheckoutProfile(client, userId);
    if (profile?.is_blocked) throw new AppError(403, ERROR_CODE.ACCOUNT_BLOCKED, "This account is blocked.");
    if (profile?.role !== ROLE.STUDENT) throw new AppError(403, ERROR_CODE.FORBIDDEN, "Student access is required.");

    const course = await lockPublishedCourse(client, courseId);
    if (!course) throw new AppError(404, ERROR_CODE.NOT_FOUND, "Course not found.");
    const enrollment = await findActiveEnrollment(client, userId, courseId);
    if (enrollment?.status === ENROLLMENT_STATUS.PAID) {
      throw new AppError(409, ERROR_CODE.ALREADY_ENROLLED, "You already own this course.");
    }
    if (!profile.phone_number?.trim()) throw new AppError(400, ERROR_CODE.PROFILE_INCOMPLETE, "Add a phone number before checkout.");

    const enrollmentId = enrollment?.id ?? await createPendingEnrollment(client, userId, courseId);
    const existing = await findOpenOrder(client, enrollmentId);
    if (existing) return { orderId: existing.razorpay_order_id, amount: existing.amount, currency: existing.currency };

    const order = await createRazorpayOrder(course.price);
    await saveOrder(client, enrollmentId, userId, order);
    return order;
  });
}

export async function enrollmentStatus(userId: string, courseId: string): Promise<EnrollmentStatus> {
  const row = await findEnrollmentStatus(userId, courseId);
  if (!row || (!row.is_published && !row.status)) throw new AppError(404, ERROR_CODE.NOT_FOUND, "Course not found.");
  return {
    status: row.status,
    courseSlug: row.status === ENROLLMENT_STATUS.PAID && row.is_published ? row.slug : null,
  };
}
