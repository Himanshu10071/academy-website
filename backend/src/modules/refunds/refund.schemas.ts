import { z } from "zod";

export const createRefundBody = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(1).max(1_000),
});
