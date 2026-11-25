import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ERROR_CODE, PAYMENT_CURRENCY, REFUND_STATUS, type CheckoutOrder } from "@academy/shared";
import { z } from "zod";

import { env } from "../config/env.ts";
import { AppError } from "./errors.ts";

const orderResponse = z.object({
  id: z.string().startsWith("order_"),
  amount: z.number().int().positive(),
  currency: z.literal(PAYMENT_CURRENCY),
});

export const refundEntity = z.object({
  id: z.string().regex(/^rfnd_[A-Za-z0-9]+$/),
  payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  amount: z.number().int().positive().max(2_147_483_647),
  currency: z.literal(PAYMENT_CURRENCY).optional(),
  receipt: z.string().nullish(),
  status: z.enum(["pending", REFUND_STATUS.PROCESSED, REFUND_STATUS.FAILED]),
});

export type RazorpayRefund = z.infer<typeof refundEntity>;

export class RazorpayAlreadyRefunded extends Error {}

export function refundReceipt(attemptKey: string) {
  return `ar_${attemptKey}`;
}

function refundUnavailable() {
  return new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "Could not complete the refund through Razorpay.");
}

async function refundRequest(path: string, options?: RequestInit) {
  const { RAZORPAY_KEY_ID: key, RAZORPAY_KEY_SECRET: secret } = env;
  if (!key || !secret) throw refundUnavailable();

  try {
    const headers = new Headers(options?.headers);
    headers.set("Authorization", `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`);
    return await fetch(`https://api.razorpay.com/v1/payments/${path}`, {
      ...options,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    throw refundUnavailable();
  }
}

export async function refundPayment(razorpayPaymentId: string, amountPaise: number, attemptKey: string = randomUUID()) {
  const response = await refundRequest(`${encodeURIComponent(razorpayPaymentId)}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Refund-Idempotency": attemptKey },
    body: JSON.stringify({ amount: amountPaise, speed: "normal", receipt: refundReceipt(attemptKey) }),
  });
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = z.object({ error: z.object({ description: z.string() }) }).safeParse(data);
    if (response.status === 400 && error.success &&
        /fully refunded already|already been (?:fully refunded|refunded fully)|already fully refunded|refund (?:has )?already been processed/i.test(error.data.error.description)) {
      throw new RazorpayAlreadyRefunded();
    }
    throw refundUnavailable();
  }
  const refund = refundEntity.safeParse(data);
  if (!refund.success) throw refundUnavailable();
  return refund.data;
}

export async function fetchRefundsForPayment(razorpayPaymentId: string) {
  const refunds: RazorpayRefund[] = [];
  const pageSize = 100;
  const collection = z.object({ items: z.array(refundEntity).max(pageSize) });
  for (let skip = 0; ; skip += pageSize) {
    const response = await refundRequest(`${encodeURIComponent(razorpayPaymentId)}/refunds?count=${pageSize}&skip=${skip}`);
    if (!response.ok) throw refundUnavailable();
    const page = collection.safeParse(await response.json().catch(() => undefined));
    if (!page.success) throw refundUnavailable();
    refunds.push(...page.data.items);
    if (page.data.items.length < pageSize) return refunds;
  }
}

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
