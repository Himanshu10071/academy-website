import type { EnrollmentStatus } from "@academy/shared";

import { apiRequest } from "./client";

export function getEnrollmentStatus(courseId: string, token: string, signal: AbortSignal) {
  return apiRequest<EnrollmentStatus>(`/courses/${encodeURIComponent(courseId)}/enrollment-status`, token, { signal });
}
