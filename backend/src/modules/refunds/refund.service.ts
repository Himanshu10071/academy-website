import { ENROLLMENT_STATUS, ERROR_CODE, PAYMENT_STATUS, type RefundStatus } from "@academy/shared";

import { withTransaction } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { mapStudentRefund } from "./refund.mapper.ts";
import { hasOpenRefund, insertRefundRequest, listStudentRefunds, lockRefundPayment } from "./refund.repository.ts";

export function logRefund(status: RefundStatus, requestId: string, userId: string, refundId: string) {
  logger.info(JSON.stringify({ event: `refund.${status}`, requestId, userId, refundId }));
}

function refundAlreadyOpen() {
  return new AppError(409, ERROR_CODE.REFUND_ALREADY_OPEN, "This payment already has an open refund request.");
}

export async function requestRefund(userId: string, paymentId: string, reason: string, requestId: string) {
  try {
    const refund = await withTransaction(async (client) => {
      const payment = await lockRefundPayment(client, paymentId, userId);
      if (payment?.payment_status !== PAYMENT_STATUS.CAPTURED || payment.enrollment_status !== ENROLLMENT_STATUS.PAID) {
        throw new AppError(403, ERROR_CODE.REFUND_NOT_ALLOWED, "This payment is not eligible for a refund.");
      }
      if (!payment.refund_eligible_until || Date.now() > payment.refund_eligible_until.getTime()) {
        throw new AppError(400, ERROR_CODE.REFUND_WINDOW_CLOSED, "The three-day refund window has closed.");
      }
      if (await hasOpenRefund(client, paymentId)) throw refundAlreadyOpen();

      const row = await insertRefundRequest(client, {
        paymentId, reason, userId: payment.user_id, courseId: payment.course_id, amount: payment.amount,
      });
      return mapStudentRefund({ ...row, course_name: payment.course_name });
    });
    logRefund(refund.status, requestId, userId, refund.id);
    return refund;
  } catch (error) {
    if (typeof error === "object" && error !== null &&
        "code" in error && error.code === "23505" &&
        "constraint" in error && error.constraint === "uq_refund_requests_one_open_per_payment") {
      throw refundAlreadyOpen();
    }
    throw error;
  }
}

export async function studentRefunds(userId: string) {
  return (await listStudentRefunds(userId)).map(mapStudentRefund);
}
