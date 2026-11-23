import type { DemoPlayback, LecturePlayback, OwnedCourse } from "@academy/shared";

import { apiRequest } from "./client";

export function listOwnedCourses(token: string, signal: AbortSignal) {
  return apiRequest<OwnedCourse[]>("/me/enrollments", token, { signal });
}

export function getLecturePlayback(id: string, token: string, signal: AbortSignal) {
  return apiRequest<LecturePlayback>(`/lectures/${encodeURIComponent(id)}/playback`, token, { signal, method: "POST" });
}

export function getDemoPlayback(id: string, signal: AbortSignal) {
  return apiRequest<DemoPlayback>(`/demos/${encodeURIComponent(id)}/playback`, undefined, { signal, method: "POST" });
}
