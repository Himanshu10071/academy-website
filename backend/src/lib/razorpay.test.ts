import { ERROR_CODE, REFUND_STATUS } from "@academy/shared";
import { afterEach, expect, it, vi } from "vitest";

import { fetchRefundsForPayment, RazorpayAlreadyRefunded, refundPayment } from "./razorpay.ts";

vi.mock("../config/env.ts", () => ({ env: { RAZORPAY_KEY_ID: "rzp_test_Fixture", RAZORPAY_KEY_SECRET: "fixture-secret" } }));

const refund = { id: "rfnd_Fixture", payment_id: "pay_Fixture", amount: 34900, status: REFUND_STATUS.PROCESSED };

afterEach(() => vi.unstubAllGlobals());

it("sends a full amount and the same idempotency key and receipt for retries", async () => {
  const fakeFetch = vi.fn(async (_url: string, _action: RequestInit) => Response.json(refund));
  vi.stubGlobal("fetch", fakeFetch);
  const attempt = "10000000-0000-4000-8000-000000000001";
  await expect(refundPayment("pay_Fixture", 34900, attempt)).resolves.toEqual(refund);
  await refundPayment("pay_Fixture", 34900, attempt);
  expect(fakeFetch).toHaveBeenCalledTimes(2);
  for (const [url, action] of fakeFetch.mock.calls) {
    expect(url).toBe("https://api.razorpay.com/v1/payments/pay_Fixture/refund");
    expect(action.method).toBe("POST");
    expect(new Headers(action.headers).get("X-Refund-Idempotency")).toBe(attempt);
    expect(JSON.parse(String(action.body))).toEqual({ amount: 34900, speed: "normal", receipt: `ar_${attempt}` });
  }
});

it("distinguishes an already refunded payment and fetches refund records", async () => {
  const fakeFetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ error: { description: "The payment has been fully refunded already." } }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ items: [refund] }))
    .mockResolvedValueOnce(Response.json({ error: { description: "Private provider error" } }, { status: 400 }));
  vi.stubGlobal("fetch", fakeFetch);
  await expect(refundPayment("pay_Fixture", 34900)).rejects.toBeInstanceOf(RazorpayAlreadyRefunded);
  await expect(fetchRefundsForPayment("pay_Fixture")).resolves.toEqual([refund]);
  expect(fakeFetch.mock.calls[1][0]).toBe("https://api.razorpay.com/v1/payments/pay_Fixture/refunds?count=100&skip=0");
  await expect(refundPayment("pay_Fixture", 34900)).rejects.toMatchObject({ code: ERROR_CODE.UPSTREAM_FAILED });
});
