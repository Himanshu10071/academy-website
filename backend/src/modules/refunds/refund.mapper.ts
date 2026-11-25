import { REFUND_STATUS, type AdminPaymentPage, type AdminRefundRequest, type StudentRefundRequest } from "@academy/shared";

import type { AdminPaymentRow, AdminRefundRow, StudentRefundRow } from "./refund.repository.ts";

export function mapStudentRefund(row: StudentRefundRow): StudentRefundRequest {
  return {
    id: row.id, courseName: row.course_name, status: row.status, reason: row.reason,
    adminNote: row.status === REFUND_STATUS.FAILED || row.status === REFUND_STATUS.REJECTED ? row.admin_note : null,
    requestedAt: row.requested_at.toISOString(),
  };
}

export function mapAdminRefund(row: AdminRefundRow): AdminRefundRequest {
  return {
    ...mapStudentRefund(row),
    adminNote: row.admin_note,
    studentName: row.student_name,
    studentEmail: row.student_email,
    amountPaise: row.amount,
    paymentId: row.payment_id,
  };
}

export function mapAdminPayment(row: AdminPaymentRow): AdminPaymentPage["items"][number] {
  return {
    id: row.id, studentName: row.student_name, courseName: row.course_name, amountPaise: row.amount,
    status: row.status, paidAt: row.paid_at?.toISOString() ?? null,
  };
}
