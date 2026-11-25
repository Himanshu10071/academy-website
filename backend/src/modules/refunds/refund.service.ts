import { ENROLLMENT_STATUS, ERROR_CODE, PAYMENT_STATUS, REFUND_STATUS, type AdminPaymentPage, type RefundStatus } from "@academy/shared";
import type { PoolClient } from "pg";

import { withTransaction } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { fetchRefundsForPayment, RazorpayAlreadyRefunded, refundPayment, refundReceipt, type RazorpayRefund } from "../../lib/razorpay.ts";
import { mapAdminPayment, mapAdminRefund, mapStudentRefund } from "./refund.mapper.ts";
import {
  claimRefundApproval, failApprovedRefund, findAdminRefund, findRefundForWebhook, findRefundPaymentId, hasOpenRefund,
  insertRefundRequest, listAdminPayments, listAdminRefunds, listStudentRefunds, lockRefundPayment, lockRefundRequest,
  markPaymentRefunded, markRefundProcessed, rejectPendingRefund, revokeEnrollment, savePendingRefundId,
} from "./refund.repository.ts";

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

export async function adminRefunds(status?: RefundStatus) {
  return (await listAdminRefunds(status)).map(mapAdminRefund);
}

export async function adminPayments(page: number, pageSize: number): Promise<AdminPaymentPage> {
  const rows = await listAdminPayments(page, pageSize);
  return { items: rows.slice(0, pageSize).map(mapAdminPayment), page, pageSize, hasMore: rows.length > pageSize };
}

function refundConflict() {
  return new AppError(409, ERROR_CODE.CONFLICT, "This refund request can no longer be changed in its current state.");
}

async function adminRefund(id: string) {
  const row = await findAdminRefund(id);
  if (!row) throw new AppError(404, ERROR_CODE.NOT_FOUND, "Refund request not found.");
  return mapAdminRefund(row);
}

export async function rejectRefund(id: string, adminId: string, note: string, requestId: string) {
  const row = await rejectPendingRefund(id, adminId, note);
  if (!row) throw refundConflict();
  logRefund(REFUND_STATUS.REJECTED, requestId, row.user_id, id);
  return adminRefund(id);
}

function matchesFullRefund(refund: RazorpayRefund, paymentId: string, amount: number) {
  return refund.payment_id === paymentId && refund.amount === amount;
}

const failedNote = "Razorpay reported that the refund failed. An administrator can retry it.";
const unconfirmedNote = "Razorpay could not confirm the refund. An administrator can retry it.";

async function recordUpstreamFailure(id: string, attemptKey: string, requestId: string, confirmed: boolean) {
  const failed = await failApprovedRefund(id, attemptKey, confirmed ? failedNote : unconfirmedNote, confirmed);
  if (!failed) return adminRefund(id);
  logRefund(REFUND_STATUS.FAILED, requestId, failed.user_id, id);
  throw new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "Razorpay could not complete the refund. Please try again.");
}

async function issueRefund(paymentId: string, amount: number, attemptKey: string) {
  try {
    return await refundPayment(paymentId, amount, attemptKey);
  } catch (error) {
    if (!(error instanceof RazorpayAlreadyRefunded)) throw error;
    const existing = (await fetchRefundsForPayment(paymentId)).find((refund) =>
      matchesFullRefund(refund, paymentId, amount) && refund.status !== REFUND_STATUS.FAILED);
    if (!existing) throw error;
    return existing;
  }
}

export async function approveRefund(id: string, adminId: string, requestId: string) {
  const approval = await claimRefundApproval(id, adminId);
  if (!approval) throw refundConflict();
  logRefund(REFUND_STATUS.APPROVED, requestId, approval.user_id, id);

  const attemptKey = approval.razorpay_attempt_key;
  let result: RazorpayRefund;
  try {
    result = await issueRefund(approval.razorpay_payment_id, approval.amount, attemptKey);
  } catch {
    return recordUpstreamFailure(id, attemptKey, requestId, false);
  }

  if (!matchesFullRefund(result, approval.razorpay_payment_id, approval.amount)) {
    return recordUpstreamFailure(id, attemptKey, requestId, false);
  }

  if (result.status === REFUND_STATUS.FAILED) return recordUpstreamFailure(id, attemptKey, requestId, true);
  if (result.status === REFUND_STATUS.PROCESSED) {
    const outcome = await finalizeRefund(id, result, attemptKey);
    if (outcome.change) logRefund(outcome.change.status, requestId, outcome.change.userId, outcome.change.refundId);
    if (outcome.errorNote) return recordUpstreamFailure(id, attemptKey, requestId, false);
  } else {
    await savePendingRefundId(id, attemptKey, result.id);
  }
  return adminRefund(id);
}

type RefundOutcome = {
  change?: { refundId: string; userId: string; status: RefundStatus };
  errorNote?: string;
};

async function lockRefundContext(client: PoolClient, id: string) {
  const paymentId = await findRefundPaymentId(client, id);
  if (!paymentId) return undefined;
  const payment = await lockRefundPayment(client, paymentId);
  const refund = await lockRefundRequest(client, id);
  if (!payment || !refund || refund.user_id !== payment.user_id || refund.course_id !== payment.course_id) return undefined;
  return { payment, refund };
}

type RefundContext = NonNullable<Awaited<ReturnType<typeof lockRefundContext>>>;

function refundMismatch(context: RefundContext, result: RazorpayRefund, attemptKey?: string) {
  const { payment, refund } = context;
  return payment.razorpay_payment_id === null ||
    !matchesFullRefund(result, payment.razorpay_payment_id, payment.amount) || refund.amount !== payment.amount ||
    (attemptKey !== undefined && attemptKey !== refund.razorpay_attempt_key) ||
    (refund.razorpay_refund_id !== null && refund.razorpay_refund_id !== result.id) ||
    (result.receipt?.startsWith("ar_") && result.receipt !== refundReceipt(refund.razorpay_attempt_key));
}

function isApprovedRefund({ payment, refund }: RefundContext) {
  return refund.status === REFUND_STATUS.APPROVED && payment.payment_status === PAYMENT_STATUS.CAPTURED &&
    payment.enrollment_status === ENROLLMENT_STATUS.PAID;
}

export function finalizeRefund(id: string, result: RazorpayRefund, attemptKey?: string, transaction?: PoolClient): Promise<RefundOutcome> {
  async function apply(client: PoolClient): Promise<RefundOutcome> {
    const context = await lockRefundContext(client, id);
    if (!context) return { errorNote: "No payment matched the refund request." };
    if (context.payment.payment_status === PAYMENT_STATUS.REFUNDED) return {};
    if (result.status !== REFUND_STATUS.PROCESSED || !isApprovedRefund(context) || refundMismatch(context, result, attemptKey)) {
      return { errorNote: "Refund did not match the approved full refund." };
    }

    await markRefundProcessed(client, id, result.id);
    await markPaymentRefunded(client, context.payment.payment_id);
    await revokeEnrollment(client, context.payment.enrollment_id);
    return { change: { refundId: id, userId: context.refund.user_id, status: REFUND_STATUS.PROCESSED } };
  }
  return transaction ? apply(transaction) : withTransaction(apply);
}

export function matchRefundWebhook(client: PoolClient, result: RazorpayRefund) {
  return findRefundForWebhook(client, result.payment_id, result.id);
}

export async function processRefundWebhook(client: PoolClient, id: string | undefined, result: RazorpayRefund): Promise<RefundOutcome> {
  if (!id) return { errorNote: "No refund request matched the Razorpay event." };
  if (result.status === REFUND_STATUS.PROCESSED) return finalizeRefund(id, result, undefined, client);

  const context = await lockRefundContext(client, id);
  if (!context || !isApprovedRefund(context) || refundMismatch(context, result)) {
    return { errorNote: "Refund failure did not match an approved refund attempt." };
  }
  const failed = await failApprovedRefund(id, context.refund.razorpay_attempt_key, failedNote, true, client);
  return failed ? { change: { refundId: id, userId: failed.user_id, status: REFUND_STATUS.FAILED } } : {};
}
