import { createHmac, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { ENROLLMENT_STATUS, ERROR_CODE, PAYMENT_STATUS } from "@academy/shared";
import { Client } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.ts";
import { database } from "../../src/lib/db.ts";
import { logger } from "../../src/lib/logger.ts";

const { secret, testDatabaseUrl } = vi.hoisted(() => ({
  secret: "test-only-webhook-secret",
  testDatabaseUrl: process.env.DATABASE_URL_TEST,
}));

vi.mock("../../src/config/env.ts", () => ({ env: {
  NODE_ENV: "test", FRONTEND_URL: "http://localhost:3000", DATABASE_POOL_MAX: 2,
  DATABASE_URL: testDatabaseUrl ?? "postgresql://test@127.0.0.1:1/unused?sslmode=disable",
  RAZORPAY_WEBHOOK_SECRET: secret,
} }));
vi.mock("../../src/lib/supabase-auth.ts", () => ({ verifyAccessToken: vi.fn() }));

const endpoint = "/api/webhooks/razorpay";
const userId = randomUUID();
const teacherId = randomUUID();
const courseId = randomUUID();
const enrollmentId = randomUUID();
const paymentId = randomUUID();
const orderId = `order_${randomUUID()}`;
const event = {
  event: "payment.captured",
  payload: { payment: { entity: { order_id: orderId, amount: 34000 } } },
  extra: "परीक्षण-payload-marker",
};
const rawEvent = `  ${JSON.stringify(event, null, 2)}\n`;
let client: Client;
let eventId: string;
let prepared = false;

function sign(body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function deliver(body: string, options: { id?: string | null; signature?: string | null } = {}) {
  const { id = eventId, signature = sign(body) } = options;
  const delivery = request(app).post(endpoint).type("application/json").send(body);
  if (id !== null) delivery.set("X-Razorpay-Event-Id", id);
  if (signature !== null) delivery.set("X-Razorpay-Signature", signature);
  return delivery;
}

async function readEvents() {
  const { rows } = await client.query(
    `SELECT event_type, payment_id, amount, raw_payload, signature_verified, processed
       FROM public.payment_events WHERE razorpay_event_id = $1`,
    [eventId],
  );
  return rows;
}

async function touchedTables() {
  const { rows } = await client.query<{ relname: string }>(
    `SELECT relname FROM pg_stat_xact_user_tables
      WHERE n_tup_ins + n_tup_upd + n_tup_del > 0`,
  );
  return rows.map(({ relname }) => relname);
}

describe.skipIf(!testDatabaseUrl)("Razorpay webhook with PostgreSQL", () => {
  beforeAll(async () => {
    const { rows: [row] } = await database.query<{ name: string }>("SELECT current_database() AS name");
    if (!/(?:^|_)test(?:_|$)/.test(row.name)) throw new Error("DATABASE_URL_TEST must point to a separate test database.");
    prepared = true;
    await database.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [userId, `${userId}@example.test`]);
    await database.query("INSERT INTO public.teachers (id, name) VALUES ($1, 'Webhook teacher')", [teacherId]);
    await database.query(
      "INSERT INTO public.courses (id, name, slug, description, price, teacher_id) VALUES ($1, 'Webhook course', $2, 'Test course', 49900, $3)",
      [courseId, `webhook-${courseId}`, teacherId],
    );
    await database.query(
      "INSERT INTO public.enrollments (id, user_id, course_id, status) VALUES ($1, $2, $3, $4)",
      [enrollmentId, userId, courseId, ENROLLMENT_STATUS.PENDING],
    );
    await database.query(
      "INSERT INTO public.payments (id, user_id, enrollment_id, razorpay_order_id, amount, status) VALUES ($1, $2, $3, $4, 49900, $5)",
      [paymentId, userId, enrollmentId, orderId, PAYMENT_STATUS.CREATED],
    );
  });

  beforeEach(async () => {
    eventId = randomUUID();
    client = new Client({ connectionString: testDatabaseUrl, ssl: { rejectUnauthorized: true } });
    await client.connect();
    await client.query("BEGIN");
    // The real SQL runs in this transaction so PostgreSQL can report every table it touched.
    vi.spyOn(database, "query").mockImplementation(client.query.bind(client));
  });

  afterEach(async () => {
    try {
      expect((await touchedTables()).filter((table) => table !== "payment_events")).toEqual([]);
    } finally {
      vi.restoreAllMocks();
      try {
        await client.query("ROLLBACK");
      } finally {
        await client.end();
      }
    }
  });

  afterAll(async () => {
    try {
      if (!prepared) return;
      await database.query("DELETE FROM public.payments WHERE id = $1", [paymentId]);
      await database.query("DELETE FROM public.enrollments WHERE id = $1", [enrollmentId]);
      await database.query("DELETE FROM public.courses WHERE id = $1", [courseId]);
      await database.query("DELETE FROM public.teachers WHERE id = $1", [teacherId]);
      await database.query("DELETE FROM public.profiles WHERE id = $1", [userId]);
      await database.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    } finally {
      await database.end();
    }
  });

  it("verifies the exact bytes and stores the original JSON, linked payment and reported amount", async () => {
    const info = vi.spyOn(logger, "info");
    const signature = sign(rawEvent);
    const response = await deliver(rawEvent, { signature });
    expect(response.status).toBe(200);
    expect(await readEvents()).toEqual([{
      event_type: event.event, payment_id: paymentId, amount: 34000, raw_payload: event,
      signature_verified: true, processed: false,
    }]);
    expect(info).toHaveBeenCalledWith(JSON.stringify({
      requestId: response.headers["x-request-id"], eventId, eventType: event.event, signature_verified: true,
    }));
    expect(info.mock.calls.flat().join("\n")).not.toContain(event.extra);
    expect(info.mock.calls.flat().join("\n")).not.toContain(signature);
  });

  it.each(["0".repeat(64), "short-signature"])("stores an invalid signature and responds with 400", async (signature) => {
    const response = await deliver(rawEvent, { signature });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODE.WEBHOOK_SIGNATURE_INVALID);
    expect(await readEvents()).toEqual([{
      event_type: event.event, payment_id: paymentId, amount: 34000, raw_payload: event,
      signature_verified: false, processed: false,
    }]);
  });

  it.each([{ signature: null }, { id: null }])("returns 400 and stores nothing if a header is missing (%j)", async (options) => {
    const response = await deliver(rawEvent, options);
    expect(response.status).toBe(400);
    expect(await touchedTables()).toEqual([]);
  });

  it.each(['{"event":', '{"payload": {}}'])("returns 400 and stores nothing for an invalid JSON event", async (body) => {
    const response = await deliver(body);
    expect(response.status).toBe(400);
    expect(await touchedTables()).toEqual([]);
  });

  it("rejects compressed or oversized bodies without writing any rows", async () => {
    const compressed = await request(app).post(endpoint).type("application/json")
      .set("Content-Encoding", "gzip")
      .set("X-Razorpay-Event-Id", eventId)
      .set("X-Razorpay-Signature", sign(rawEvent))
      .send(gzipSync(rawEvent));
    expect(compressed.status).toBe(415);
    const oversized = await deliver(JSON.stringify({ event: event.event, extra: "x".repeat(1024 * 1024) }));
    expect(oversized.status).toBe(413);
    expect(await touchedTables()).toEqual([]);
  });

  it("acknowledges a repeated verified event ID and keeps one verified row", async () => {
    expect((await deliver(rawEvent)).status).toBe(200);
    expect((await deliver(rawEvent)).status).toBe(200);
    expect((await readEvents()).map(({ signature_verified }) => signature_verified)).toEqual([true]);
  });

  it("records a valid event after an invalid event with the same ID", async () => {
    expect((await deliver(rawEvent, { signature: "bad" })).status).toBe(400);
    expect((await deliver(rawEvent)).status).toBe(200);
    expect((await readEvents()).map(({ signature_verified }) => signature_verified).sort()).toEqual([false, true]);
  });

  it("stores an unknown event type without requiring payment data", async () => {
    const unknown = { event: "future.event", payload: { unfamiliar: { details: "retained" } } };
    expect((await deliver(JSON.stringify(unknown))).status).toBe(200);
    expect(await readEvents()).toEqual([{
      event_type: unknown.event, payment_id: null, amount: null, raw_payload: unknown,
      signature_verified: true, processed: false,
    }]);
  });

  it.each([null, "order_unmatched"])("stores the amount and a null payment link for order %s", async (order) => {
    const body = { ...event, payload: { payment: { entity: { order_id: order, amount: 0 } } } };
    expect((await deliver(JSON.stringify(body))).status).toBe(200);
    expect(await readEvents()).toEqual([{
      event_type: event.event, payment_id: null, amount: 0, raw_payload: body,
      signature_verified: true, processed: false,
    }]);
  });
});
