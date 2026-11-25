import type { StudentRefundRequest } from "@academy/shared";

import { apiRequest } from "./client";

export function requestRefund(token: string, paymentId: string, reason: string) {
  return apiRequest<StudentRefundRequest>("/refund-requests", token, { method: "POST", body: { paymentId, reason } });
}

export function listMyRefunds(token: string, signal: AbortSignal) {
  return apiRequest<StudentRefundRequest[]>("/me/refund-requests", token, { signal });
}
