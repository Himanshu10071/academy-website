export const VIDEO_STATUS = {
  UPLOADED: "uploaded",
  PROCESSING: "processing",
  READY: "ready",
} as const;

export const ENROLLMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  REVOKED: "revoked",
} as const;

export const PAYMENT_STATUS = {
  CREATED: "created",
  CAPTURED: "captured",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;

export const REFUND_STATUS = {
  REQUESTED: "requested",
  APPROVED: "approved",
  REJECTED: "rejected",
  PROCESSED: "processed",
  FAILED: "failed",
} as const;
