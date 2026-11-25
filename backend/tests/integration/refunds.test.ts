import { randomUUID } from "node:crypto";
import { ENROLLMENT_STATUS, ERROR_CODE, PAYMENT_STATUS, REFUND_STATUS, ROLE } from "@academy/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.ts";
import { database } from "../../src/lib/db.ts";

const { verifyAccessToken, testDatabaseUrl } = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  testDatabaseUrl: process.env.DATABASE_URL_TEST,
}));

vi.mock("../../src/config/env.ts", () => ({ env: {
  NODE_ENV: "test", FRONTEND_URL: "http://localhost:3000", DATABASE_POOL_MAX: 3,
  DATABASE_URL: testDatabaseUrl ?? "postgresql://test@127.0.0.1:1/unused?sslmode=disable",
} }));
vi.mock("../../src/lib/supabase-auth.ts", () => ({ verifyAccessToken }));

const studentId = randomUUID();
const otherStudentId = randomUUID();
const adminId = randomUUID();
const teacherId = randomUUID();
const courseIds: string[] = [];
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
});
