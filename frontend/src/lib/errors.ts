import { ERROR_CODE } from "@academy/shared";

import { ApiError } from "./api/client";

export function profileError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  switch (error.failure.code) {
    case ERROR_CODE.AUTH_REQUIRED: return "Your session expired. Sign in again to continue.";
    case ERROR_CODE.ACCOUNT_BLOCKED: return "This account is blocked.";
    case ERROR_CODE.FORBIDDEN: return "This account cannot access Prince Academy.";
    case ERROR_CODE.VALIDATION_FAILED: return "Enter a valid name or a 10-digit Indian mobile number.";
    default: return fallback;
  }
}

export function playbackError(error: unknown) {
  if (!(error instanceof ApiError)) return "Could not load the video. Please try again.";
  switch (error.failure.code) {
    case ERROR_CODE.NOT_ENROLLED: return "You need a paid enrollment in this course to watch this lecture.";
    case ERROR_CODE.LECTURE_NOT_READY: return "This lecture is not available to watch right now.";
    case ERROR_CODE.ACCOUNT_BLOCKED: return "This account is blocked and cannot watch lectures.";
    case ERROR_CODE.AUTH_REQUIRED: return "Sign in with Google to watch this lecture.";
    case ERROR_CODE.NOT_FOUND: return "This video is no longer available.";
    default: return "Could not load the video. Please try again.";
  }
}
