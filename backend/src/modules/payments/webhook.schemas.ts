import { z } from "zod";

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
