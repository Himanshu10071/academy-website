import { z } from "zod";
import { REFUND_STATUS } from "@academy/shared";

export const createRefundBody = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(1).max(1_000),
});

export const refundIdParams = z.object({ id: z.uuid() });
export const rejectRefundBody = z.strictObject({ adminNote: z.string().trim().min(1).max(1_000) });
export const refundListQuery = z.object({ status: z.enum(REFUND_STATUS).optional() });
export const paymentPageQuery = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
