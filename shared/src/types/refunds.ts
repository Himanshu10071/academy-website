import type { PAYMENT_STATUS, REFUND_STATUS } from "../constants/status.js";

export type RefundStatus = typeof REFUND_STATUS[keyof typeof REFUND_STATUS];
export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

export type StudentRefundRequest = {
  id: string;
  courseName: string;
  status: RefundStatus;
  reason: string;
  adminNote: string | null;
  requestedAt: string;
};

export type AdminRefundRequest = StudentRefundRequest & {
  studentName: string;
  studentEmail: string;
  amountPaise: number;
  paymentId: string;
};

export type AdminPaymentPage = {
  items: {
    id: string;
    studentName: string;
    courseName: string;
    amountPaise: number;
    status: PaymentStatus;
    paidAt: string | null;
  }[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};
