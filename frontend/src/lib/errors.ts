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
