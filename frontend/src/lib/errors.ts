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
    case ERROR_CODE.FORBIDDEN: return "This account does not have access to this video.";
    case ERROR_CODE.NOT_FOUND: return "This video is no longer available.";
    default: return "Could not load the video. Please try again.";
  }
}

export function checkoutError(error: unknown) {
  const fallback = "Could not start checkout. Please try again.";
  if (!(error instanceof ApiError)) return fallback;
  switch (error.failure.code) {
    case ERROR_CODE.ALREADY_ENROLLED: return "You already own this course. Open My Courses to watch it.";
    case ERROR_CODE.PROFILE_INCOMPLETE: return "Add a phone number to your profile before paying.";
    case ERROR_CODE.AUTH_REQUIRED: return "Your session expired. Sign in again to continue.";
    case ERROR_CODE.ACCOUNT_BLOCKED: return "This account is blocked.";
    case ERROR_CODE.UPSTREAM_FAILED: return "Razorpay Checkout is temporarily unavailable. Please try again.";
    default: return fallback;
  }
}

export function refundError(error: unknown, fallback = "Could not save the refund request. Please try again.") {
  if (!(error instanceof ApiError)) return fallback;
  switch (error.failure.code) {
    case ERROR_CODE.REFUND_NOT_ALLOWED: return "This purchase is no longer eligible for a refund.";
    case ERROR_CODE.REFUND_WINDOW_CLOSED: return "The three-day refund window has closed.";
    case ERROR_CODE.REFUND_ALREADY_OPEN: return "You already have a refund request for this purchase.";
    case ERROR_CODE.CONFLICT: return "This refund request has already changed. Refresh the list to see its current status.";
    case ERROR_CODE.UPSTREAM_FAILED: return "Razorpay could not complete the refund. You can retry it from the Failed filter.";
    default: return fallback;
  }
}
