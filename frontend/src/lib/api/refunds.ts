import type { AdminPaymentPage, AdminRefundRequest, RefundStatus, StudentRefundRequest } from "@academy/shared";

import { apiRequest } from "./client";

export function requestRefund(token: string, paymentId: string, reason: string) {
  return apiRequest<StudentRefundRequest>("/refund-requests", token, { method: "POST", body: { paymentId, reason } });
}

export function listMyRefunds(token: string, signal: AbortSignal) {
  return apiRequest<StudentRefundRequest[]>("/me/refund-requests", token, { signal });
}

export function listAdminRefunds(token: string, status?: RefundStatus) {
  const search = status ? `?${new URLSearchParams({ status })}` : "";
  return apiRequest<AdminRefundRequest[]>(`/admin/refund-requests${search}`, token);
}

export function listAdminPayments(token: string, page: number) {
  const search = new URLSearchParams({ page: String(page) });
  return apiRequest<AdminPaymentPage>(`/admin/payments?${search}`, token);
}

export function approveRefund(token: string, id: string) {
  return apiRequest<AdminRefundRequest>(`/admin/refund-requests/${encodeURIComponent(id)}/approve`, token, { method: "POST" });
}

export function rejectRefund(token: string, id: string, adminNote: string) {
  return apiRequest<AdminRefundRequest>(`/admin/refund-requests/${encodeURIComponent(id)}/reject`, token, {
    method: "POST", body: { adminNote },
  });
}
