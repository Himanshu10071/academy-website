import { z } from "zod";
import { PAYMENT_STATUS } from "@academy/shared";

import { refundEntity } from "../../lib/razorpay.ts";

export const webhookPayload = z.object({
  event: z.string().refine((value) => value.trim().length > 0),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        amount: z.number().int().min(0).max(2_147_483_647).nullish(),
        order_id: z.string().nullish(),
      }).nullish(),
    }).nullish(),
  }).nullish(),
});

const unixSeconds = z.number().int().min(0).max(8_640_000_000).optional();

export const capturedPayment = z.object({
  event: z.literal("payment.captured"),
  created_at: unixSeconds,
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
        order_id: z.string().startsWith("order_"),
        amount: z.number().int().positive().max(2_147_483_647),
        currency: z.string(),
        status: z.literal(PAYMENT_STATUS.CAPTURED),
        created_at: unixSeconds,
      }),
    }),
  }),
});

export const refundNotification = z.object({
  event: z.enum(["refund.processed", "refund.failed"]),
  payload: z.object({ refund: z.object({ entity: refundEntity }) }),
});
