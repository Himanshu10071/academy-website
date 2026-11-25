import type { CheckoutOrder, EnrollmentStatus } from "@academy/shared";

import { apiRequest } from "./client";

export function createCheckoutOrder(courseId: string, token: string, signal: AbortSignal) {
  return apiRequest<CheckoutOrder>(`/courses/${encodeURIComponent(courseId)}/checkout`, token, { method: "POST", signal });
}

export function getEnrollmentStatus(courseId: string, token: string, signal: AbortSignal) {
  return apiRequest<EnrollmentStatus>(`/courses/${encodeURIComponent(courseId)}/enrollment-status`, token, { signal });
}
