import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ERROR_CODE, PAYMENT_CURRENCY, type CheckoutOrder } from "@academy/shared";
import { z } from "zod";

import { env } from "../config/env.ts";
import { AppError } from "./errors.ts";

const orderResponse = z.object({
  id: z.string().startsWith("order_"),
  amount: z.number().int().positive(),
  currency: z.literal(PAYMENT_CURRENCY),
});

export async function createRazorpayOrder(amount: number): Promise<CheckoutOrder> {
  const { RAZORPAY_KEY_ID: key, RAZORPAY_KEY_SECRET: secret } = env;
  if (!key || !secret) {
    throw new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "Checkout is temporarily unavailable.");
  }

  try {
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount, currency: PAYMENT_CURRENCY, receipt: randomUUID(), partial_payment: false }),
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error("Order request failed.");
    const order = orderResponse.parse(await response.json());
    if (order.amount !== amount) throw new Error("Order amount did not match.");
    return { orderId: order.id, amount: order.amount, currency: order.currency };
  } catch {
    throw new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "Could not prepare a Razorpay order.");
  }
}

export function verifyWebhookSignature(body: Buffer, signature: string, secret: string) {
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const supplied = Buffer.from(signature);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
