import type { REFUND_STATUS } from "../constants/status.js";

export type RefundStatus = typeof REFUND_STATUS[keyof typeof REFUND_STATUS];

export type StudentRefundRequest = {
  id: string;
  courseName: string;
  status: RefundStatus;
  reason: string;
  adminNote: string | null;
  requestedAt: string;
};
