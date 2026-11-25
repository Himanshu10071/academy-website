import { REFUND_STATUS, type RefundStatus } from "@academy/shared";

export const refundStatusLabel: Record<RefundStatus, string> = {
  [REFUND_STATUS.REQUESTED]: "Requested",
  [REFUND_STATUS.APPROVED]: "Approved",
  [REFUND_STATUS.REJECTED]: "Rejected",
  [REFUND_STATUS.PROCESSED]: "Processed",
  [REFUND_STATUS.FAILED]: "Failed",
};

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

export function formatPaymentDate(value: string) {
  return dateFormat.format(new Date(value));
}
