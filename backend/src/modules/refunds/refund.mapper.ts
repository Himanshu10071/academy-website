import { REFUND_STATUS, type StudentRefundRequest } from "@academy/shared";

import type { StudentRefundRow } from "./refund.repository.ts";

export function mapStudentRefund(row: StudentRefundRow): StudentRefundRequest {
  return {
    id: row.id, courseName: row.course_name, status: row.status, reason: row.reason,
    adminNote: row.status === REFUND_STATUS.FAILED || row.status === REFUND_STATUS.REJECTED ? row.admin_note : null,
    requestedAt: row.requested_at.toISOString(),
  };
}
