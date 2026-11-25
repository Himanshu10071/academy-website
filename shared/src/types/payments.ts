import type { PAYMENT_CURRENCY } from "../constants/payments.js";
import type { ENROLLMENT_STATUS } from "../constants/status.js";

export type CheckoutOrder = {
  orderId: string;
  amount: number;
  currency: typeof PAYMENT_CURRENCY;
};

export type EnrollmentStatus = {
  status: typeof ENROLLMENT_STATUS[keyof typeof ENROLLMENT_STATUS] | null;
  courseSlug: string | null;
};
