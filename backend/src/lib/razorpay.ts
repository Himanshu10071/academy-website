import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(body: Buffer, signature: string, secret: string) {
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const supplied = Buffer.from(signature);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
