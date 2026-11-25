import { createHmac, randomUUID } from "node:crypto";
import { ENROLLMENT_STATUS, ERROR_CODE, PAYMENT_CURRENCY, PAYMENT_STATUS, REFUND_STATUS, ROLE } from "@academy/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.ts";
import { database } from "../../src/lib/db.ts";
import { RazorpayAlreadyRefunded, refundReceipt, type RazorpayRefund } from "../../src/lib/razorpay.ts";
import { finalizeRefund } from "../../src/modules/refunds/refund.service.ts";

const { verifyAccessToken, createRazorpayOrder, refundPayment, fetchRefundsForPayment, testDatabaseUrl, secret } = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  createRazorpayOrder: vi.fn(),
  refundPayment: vi.fn(),
  fetchRefundsForPayment: vi.fn(),
  testDatabaseUrl: process.env.DATABASE_URL_TEST,
  secret: "test-refund-webhook-secret",
}));

vi.mock("../../src/config/env.ts", () => ({ env: {
  NODE_ENV: "test", FRONTEND_URL: "http://localhost:3000", DATABASE_POOL_MAX: 3,
  DATABASE_URL: testDatabaseUrl ?? "postgresql://test@127.0.0.1:1/unused?sslmode=disable",
  RAZORPAY_WEBHOOK_SECRET: secret,
} }));
vi.mock("../../src/lib/supabase-auth.ts", () => ({ verifyAccessToken }));
vi.mock("../../src/lib/razorpay.ts", async (original) => ({
  ...await original<typeof import("../../src/lib/razorpay.ts")>(),
  createRazorpayOrder, refundPayment, fetchRefundsForPayment,
}));

const studentId = randomUUID();
const otherStudentId = randomUUID();
const adminId = randomUUID();
const teacherId = randomUUID();
const courseIds: string[] = [];
const webhookIds: string[] = [];
const reason = "I bought the wrong course.";
const amount = 34900;
let courseId: string;
let enrollmentId: string;
let paymentId: string;
let providerPaymentId: string;
let deadline: Date;
let prepared = false;

function studentRequest(token = "student") {
  return request(app).post("/api/v1/refund-requests").set("Authorization", `Bearer ${token}`);
}

function ownedCourses() {
  return request(app).get("/api/v1/me/enrollments").set("Authorization", "Bearer student");
}

function history(token = "student") {
  return request(app).get("/api/v1/me/refund-requests").set("Authorization", `Bearer ${token}`);
}

const adminRefunds = "/api/v1/admin/refund-requests";
const adminPayments = "/api/v1/admin/payments";

function approve(id: string, token = "admin") {
  return request(app).post(`${adminRefunds}/${id}/approve`).set("Authorization", `Bearer ${token}`);
}

function reject(id: string, token = "admin") {
  return request(app).post(`${adminRefunds}/${id}/reject`).set("Authorization", `Bearer ${token}`);
}

async function createRequest(): Promise<string> {
  const response = await studentRequest().send({ paymentId, reason });
  expect(response.status).toBe(201);
  return response.body.id;
}

function providerRefund(status: RazorpayRefund["status"] = REFUND_STATUS.PROCESSED, id = `rfnd_${paymentId.replaceAll("-", "")}`): RazorpayRefund {
  return { id, payment_id: providerPaymentId, amount, currency: PAYMENT_CURRENCY, status };
}

function sendRefundEvent(refund: RazorpayRefund, valid = true, eventId = randomUUID()) {
  webhookIds.push(eventId);
  const body = JSON.stringify({ event: `refund.${refund.status}`, payload: { refund: { entity: refund } } });
  const signature = valid ? createHmac("sha256", secret).update(body).digest("hex") : "bad-signature";
  return request(app).post("/api/webhooks/razorpay").type("application/json").send(body)
    .set("X-Razorpay-Event-Id", eventId).set("X-Razorpay-Signature", signature);
}

async function readState(id: string) {
  const { rows } = await database.query(
    `SELECT r.status, r.razorpay_refund_id, r.razorpay_attempt_key, r.processed_at, r.admin_note, r.reviewed_by,
            p.status AS payment_status, p.refunded_at, e.status AS enrollment_status, e.revoked_at
       FROM public.refund_requests r JOIN public.payments p ON p.id = r.payment_id
       JOIN public.enrollments e ON e.id = p.enrollment_id
      WHERE r.id = $1`,
    [id],
  );
  return rows[0];
}

describe.skipIf(!testDatabaseUrl)("refunds with PostgreSQL", () => {
  beforeAll(async () => {
    const { rows: [row] } = await database.query<{ name: string }>("SELECT current_database() AS name");
    if (!/(?:^|_)test(?:_|$)/.test(row.name)) throw new Error("DATABASE_URL_TEST must point to a separate test database.");
    prepared = true;
    const tokens = new Map([["student", studentId], ["other", otherStudentId], ["admin", adminId]]);
    for (const [name, id] of tokens) {
      await database.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)",
        [id, `${id}@example.test`, { name }]);
    }
    await database.query("UPDATE public.profiles SET role = $2 WHERE id = $1", [adminId, ROLE.ADMIN]);
    await database.query("UPDATE public.profiles SET phone_number = '+919876543210' WHERE id = $1", [studentId]);
    await database.query("INSERT INTO public.teachers (id, name) VALUES ($1, 'Refund teacher')", [teacherId]);
    verifyAccessToken.mockImplementation(async (token: string) => {
      const id = tokens.get(token);
      return id ? { id, app_metadata: { provider: "google" } } : null;
    });
  });

  beforeEach(async () => {
    courseId = randomUUID();
    enrollmentId = randomUUID();
    paymentId = randomUUID();
    providerPaymentId = `pay_${paymentId.replaceAll("-", "")}`;
    refundPayment.mockReset().mockImplementation(async () => providerRefund());
    fetchRefundsForPayment.mockReset().mockResolvedValue([]);
    createRazorpayOrder.mockReset().mockImplementation(async (amount: number) => ({
      orderId: `order_${randomUUID()}`, amount, currency: PAYMENT_CURRENCY,
    }));
    deadline = new Date(Date.now() + 86_400_000);
    courseIds.push(courseId);
    await database.query(
      "INSERT INTO public.courses (id, name, slug, description, price, teacher_id, is_published) VALUES ($1, 'Refund course', $2, 'Fixture', 49900, $3, TRUE)",
      [courseId, `refund-${courseId}`, teacherId],
    );
    await database.query("INSERT INTO public.enrollments (id, user_id, course_id, status) VALUES ($1, $2, $3, $4)",
      [enrollmentId, studentId, courseId, ENROLLMENT_STATUS.PAID]);
    await database.query(
      `INSERT INTO public.payments (id, user_id, enrollment_id, razorpay_order_id, razorpay_payment_id, amount, status, paid_at, refund_eligible_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [paymentId, studentId, enrollmentId, `order_${paymentId}`, providerPaymentId, amount,
        PAYMENT_STATUS.CAPTURED, new Date(deadline.getTime() - 3 * 86_400_000), deadline],
    );
  });

  afterAll(async () => {
    try {
      if (!prepared) return;
      await database.query("DELETE FROM public.payment_events WHERE razorpay_event_id = ANY($1::text[])", [webhookIds]);
      await database.query("DELETE FROM public.lectures WHERE course_id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.refund_requests WHERE course_id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.payments WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE course_id = ANY($1::uuid[]))", [courseIds]);
      await database.query("DELETE FROM public.enrollments WHERE course_id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.courses WHERE id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.teachers WHERE id = $1", [teacherId]);
      await database.query("DELETE FROM public.profiles WHERE id = ANY($1::uuid[])", [[studentId, otherStudentId, adminId]]);
      await database.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[studentId, otherStudentId, adminId]]);
    } finally {
      await database.end();
    }
  });

  it("enforces the refund deadline and caller's ownership", async () => {
    expect((await studentRequest("other").send({ paymentId, reason })).body.error.code).toBe(ERROR_CODE.REFUND_NOT_ALLOWED);
    await database.query("UPDATE public.payments SET refund_eligible_until = NOW() - INTERVAL '1 second' WHERE id = $1", [paymentId]);
    expect((await studentRequest().send({ paymentId, reason })).body.error.code).toBe(ERROR_CODE.REFUND_WINDOW_CLOSED);
    expect((await studentRequest().send({ paymentId, reason: "   " })).body.error.code).toBe(ERROR_CODE.VALIDATION_FAILED);
  });

  it.each([PAYMENT_STATUS.CREATED, PAYMENT_STATUS.FAILED, PAYMENT_STATUS.REFUNDED])(
    "rejects payments in state %s", async (status) => {
      await database.query("UPDATE public.payments SET status = $2, refunded_at = $3 WHERE id = $1",
        [paymentId, status, status === PAYMENT_STATUS.REFUNDED ? new Date() : null]);
      expect((await studentRequest().send({ paymentId, reason })).body.error.code).toBe(ERROR_CODE.REFUND_NOT_ALLOWED);
    },
  );

  it("requires a paid enrollment even when the payment is captured", async () => {
    await database.query("UPDATE public.enrollments SET status = $2 WHERE id = $1", [enrollmentId, ENROLLMENT_STATUS.PENDING]);
    expect((await studentRequest().send({ paymentId, reason })).body.error.code).toBe(ERROR_CODE.REFUND_NOT_ALLOWED);
  });

  it("uses saved ownership and amount and exposes only the caller's refund and eligibility", async () => {
    const before = (await ownedCourses()).body.find((course: { id: string }) => course.id === courseId);
    expect(before).toMatchObject({ paymentId, refundEligibleUntil: deadline.toISOString(), hasOpenRefund: false });
    const response = await studentRequest().send({ paymentId, reason, amount: 1, userId: otherStudentId, courseId: randomUUID() });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String), courseName: "Refund course", status: REFUND_STATUS.REQUESTED, reason,
      adminNote: null, requestedAt: expect.any(String),
    });
    const { rows } = await database.query("SELECT amount, user_id, course_id FROM public.refund_requests WHERE id = $1", [response.body.id]);
    expect(rows).toEqual([{ amount, user_id: studentId, course_id: courseId }]);
    const after = (await ownedCourses()).body.find((course: { id: string }) => course.id === courseId);
    expect(after.hasOpenRefund).toBe(true);
    expect((await history()).body).toContainEqual(response.body);
    expect((await history("other")).body).toEqual([]);
  });

  it("allows only one open request across concurrent submissions", async () => {
    const responses = await Promise.all([studentRequest().send({ paymentId, reason }), studentRequest().send({ paymentId, reason })]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409)?.body.error.code).toBe(ERROR_CODE.REFUND_ALREADY_OPEN);
  });

  it("guards the admin refund and payment endpoints", async () => {
    const id = await createRequest();
    expect((await request(app).get(adminRefunds).set("Authorization", "Bearer student")).status).toBe(403);
    expect((await request(app).get(adminPayments).set("Authorization", "Bearer student")).status).toBe(403);
    expect((await approve(id, "student")).status).toBe(403);
    expect((await reject(id, "student").send({ adminNote: "Do not accept" })).status).toBe(403);
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("requires a rejection note and only rejects a requested refund", async () => {
    const id = await createRequest();
    expect((await reject(id).send({ adminNote: "   " })).body.error.code).toBe(ERROR_CODE.VALIDATION_FAILED);
    const response = await reject(id).send({ adminNote: "This purchase was reviewed." });
    expect(response.body).toMatchObject({ id, status: REFUND_STATUS.REJECTED, adminNote: "This purchase was reviewed." });
    expect((await readState(id)).reviewed_by).toBe(adminId);
    expect((await history()).body).toContainEqual(expect.objectContaining({ id, adminNote: "This purchase was reviewed." }));
    expect((await reject(id).send({ adminNote: "Again" })).body.error.code).toBe(ERROR_CODE.CONFLICT);
    expect((await approve(id)).body.error.code).toBe(ERROR_CODE.CONFLICT);
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("finalizes all rows together, blocks playback and allows a fresh purchase", async () => {
    const id = await createRequest();
    const lectureId = randomUUID();
    await database.query(
      `INSERT INTO public.lectures (id, course_id, lecture_name, lecture_number, video_key, video_status, duration, uploaded_by)
       VALUES ($1, $2, 'Refund lesson', 1, $3, 'ready', 8, $4)`,
      [lectureId, courseId, `lectures/${courseId}/${lectureId}.mp4`, adminId],
    );
    const response = await approve(id);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe(REFUND_STATUS.PROCESSED);
    const processed = await readState(id);
    expect(processed).toMatchObject({
      status: REFUND_STATUS.PROCESSED, payment_status: PAYMENT_STATUS.REFUNDED, enrollment_status: ENROLLMENT_STATUS.REVOKED,
      razorpay_refund_id: providerRefund().id, processed_at: expect.any(Date),
      refunded_at: expect.any(Date), revoked_at: expect.any(Date),
    });
    expect(processed.processed_at).toEqual(processed.refunded_at);
    expect(processed.refunded_at).toEqual(processed.revoked_at);
    expect(refundPayment).toHaveBeenCalledExactlyOnceWith(providerPaymentId, amount, processed.razorpay_attempt_key);
    expect(await finalizeRefund(id, providerRefund())).toEqual({});
    expect(await readState(id)).toEqual(processed);
    const playback = await request(app).post(`/api/v1/lectures/${lectureId}/playback`).set("Authorization", "Bearer student");
    expect(playback.body.error.code).toBe(ERROR_CODE.NOT_ENROLLED);
    await expect(ownedCourses().then((response) => response.body.some((course: { id: string }) => course.id === courseId))).resolves.toBe(false);

    const order = await request(app).post(`/api/v1/courses/${courseId}/checkout`).set("Authorization", "Bearer student");
    expect(order.status).toBe(200);
    const { rows } = await database.query("SELECT id, status FROM public.enrollments WHERE course_id = $1", [courseId]);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ id: enrollmentId, status: ENROLLMENT_STATUS.REVOKED });
    expect(rows.find((row) => row.status === ENROLLMENT_STATUS.PENDING)?.id).not.toBe(enrollmentId);
  });

  it("records upstream failure, keeps access, and reuses the attempt key on retry", async () => {
    const id = await createRequest();
    const before = await readState(id);
    refundPayment.mockRejectedValueOnce(new Error("Private provider details"));
    const response = await approve(id);
    expect(response.body.error.code).toBe(ERROR_CODE.UPSTREAM_FAILED);
    expect(await readState(id)).toMatchObject({
      status: REFUND_STATUS.FAILED, payment_status: PAYMENT_STATUS.CAPTURED, enrollment_status: ENROLLMENT_STATUS.PAID,
      razorpay_attempt_key: before.razorpay_attempt_key,
    });
    expect(JSON.stringify((await history()).body)).not.toContain("Private provider details");
    expect((await approve(id)).body.status).toBe(REFUND_STATUS.PROCESSED);
    expect(refundPayment.mock.calls).toEqual([
      [providerPaymentId, amount, before.razorpay_attempt_key], [providerPaymentId, amount, before.razorpay_attempt_key],
    ]);
  });

  it("claims one concurrent approval before calling Razorpay", async () => {
    const id = await createRequest();
    let finish!: (refund: RazorpayRefund) => void;
    refundPayment.mockImplementationOnce(() => new Promise<RazorpayRefund>((resolve) => { finish = resolve; }));
    const first = approve(id).then((response) => response);
    await vi.waitFor(() => expect(refundPayment).toHaveBeenCalledTimes(1));
    expect((await approve(id)).status).toBe(409);
    finish(providerRefund());
    expect((await first).body.status).toBe(REFUND_STATUS.PROCESSED);
    expect(refundPayment).toHaveBeenCalledTimes(1);
  });

  it("waits for confirmation and applies only a matching verified full-refund webhook", async () => {
    const id = await createRequest();
    refundPayment.mockResolvedValueOnce(providerRefund("pending"));
    expect((await approve(id)).body.status).toBe(REFUND_STATUS.APPROVED);
    expect((await readState(id)).enrollment_status).toBe(ENROLLMENT_STATUS.PAID);
    expect((await sendRefundEvent(providerRefund(), false)).status).toBe(400);
    expect((await sendRefundEvent({ ...providerRefund(), amount: amount - 1 })).status).toBe(200);
    expect((await readState(id)).status).toBe(REFUND_STATUS.APPROVED);
    const eventId = randomUUID();
    expect((await sendRefundEvent(providerRefund(), true, eventId)).status).toBe(200);
    const processed = await readState(id);
    expect(processed.status).toBe(REFUND_STATUS.PROCESSED);
    expect((await sendRefundEvent(providerRefund(), true, eventId)).status).toBe(200);
    expect(await readState(id)).toEqual(processed);
  });

  it("rotates the key after a confirmed failure and ignores an old webhook during retry", async () => {
    const id = await createRequest();
    const firstAttempt = (await readState(id)).razorpay_attempt_key;
    refundPayment.mockResolvedValueOnce(providerRefund("pending"));
    expect((await approve(id)).body.status).toBe(REFUND_STATUS.APPROVED);
    const oldFailure = { ...providerRefund(REFUND_STATUS.FAILED), receipt: refundReceipt(firstAttempt) };
    expect((await sendRefundEvent(oldFailure)).status).toBe(200);
    const failed = await readState(id);
    expect(failed.status).toBe(REFUND_STATUS.FAILED);
    expect(failed.razorpay_attempt_key).not.toBe(firstAttempt);
    const next = { ...providerRefund("pending", "rfnd_NewAttempt"), receipt: refundReceipt(failed.razorpay_attempt_key) };
    refundPayment.mockImplementationOnce(async () => {
      expect((await sendRefundEvent(oldFailure)).status).toBe(200);
      expect((await readState(id)).status).toBe(REFUND_STATUS.APPROVED);
      return next;
    });
    expect((await approve(id)).body.status).toBe(REFUND_STATUS.APPROVED);
    expect((await sendRefundEvent({ ...next, status: REFUND_STATUS.PROCESSED })).status).toBe(200);
    expect((await readState(id)).status).toBe(REFUND_STATUS.PROCESSED);
  });

  it("reconciles a full refund that Razorpay says already exists", async () => {
    const id = await createRequest();
    refundPayment.mockRejectedValueOnce(new RazorpayAlreadyRefunded());
    fetchRefundsForPayment.mockResolvedValueOnce([{ ...providerRefund(), amount: 1 }, providerRefund()]);
    expect((await approve(id)).body.status).toBe(REFUND_STATUS.PROCESSED);
    expect(fetchRefundsForPayment).toHaveBeenCalledExactlyOnceWith(providerPaymentId);
    expect((await readState(id)).razorpay_refund_id).toBe(providerRefund().id);
  });

  it("filters the refund queue and pages the payment list", async () => {
    const id = await createRequest();
    await reject(id).send({ adminNote: "No refund." });
    const filtered = await request(app).get(adminRefunds).query({ status: REFUND_STATUS.REJECTED }).set("Authorization", "Bearer admin");
    expect(filtered.status).toBe(200);
    expect(filtered.body).toContainEqual(expect.objectContaining({ id, studentEmail: expect.any(String), amountPaise: amount, paymentId }));
    expect(filtered.body.every((item: { status: string }) => item.status === REFUND_STATUS.REJECTED)).toBe(true);
    const page = await request(app).get(adminPayments).query({ page: 1, pageSize: 1 }).set("Authorization", "Bearer admin");
    expect(page.body).toMatchObject({ items: [expect.objectContaining({ studentName: expect.any(String), paidAt: expect.anything() })], page: 1, pageSize: 1, hasMore: true });
  });
});
