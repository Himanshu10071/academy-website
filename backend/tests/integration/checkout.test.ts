import { randomUUID } from "node:crypto";
import { ENROLLMENT_STATUS, ERROR_CODE, PAYMENT_CURRENCY, PAYMENT_STATUS, ROLE } from "@academy/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.ts";
import { database } from "../../src/lib/db.ts";
import { AppError } from "../../src/lib/errors.ts";

const { createRazorpayOrder, verifyAccessToken, testDatabaseUrl } = vi.hoisted(() => ({
  createRazorpayOrder: vi.fn(), verifyAccessToken: vi.fn(), testDatabaseUrl: process.env.DATABASE_URL_TEST,
}));

vi.mock("../../src/config/env.ts", () => ({ env: {
  NODE_ENV: "test", FRONTEND_URL: "http://localhost:3000", DATABASE_POOL_MAX: 3,
  DATABASE_URL: testDatabaseUrl ?? "postgresql://test@127.0.0.1:1/unused?sslmode=disable",
} }));
vi.mock("../../src/lib/supabase-auth.ts", () => ({ verifyAccessToken }));
vi.mock("../../src/lib/razorpay.ts", async (original) => ({
  ...await original<typeof import("../../src/lib/razorpay.ts")>(), createRazorpayOrder,
}));

const studentId = randomUUID();
const noPhoneId = randomUUID();
const blockedId = randomUUID();
const adminId = randomUUID();
const teacherId = randomUUID();
const courseIds: string[] = [];
let courseId: string;
let prepared = false;

function checkout(token = "student", id = courseId) {
  return request(app).post(`/api/v1/courses/${id}/checkout`).set("Authorization", `Bearer ${token}`);
}

function status(token = "student") {
  return request(app).get(`/api/v1/courses/${courseId}/enrollment-status`).set("Authorization", `Bearer ${token}`);
}

async function rows() {
  return (await database.query(
    `SELECT e.status AS enrollment_status, p.status AS payment_status, p.amount, p.razorpay_order_id
     FROM public.enrollments e LEFT JOIN public.payments p ON p.enrollment_id = e.id WHERE e.course_id = $1`,
    [courseId],
  )).rows;
}

describe.skipIf(!testDatabaseUrl)("student checkout with PostgreSQL", () => {
  beforeAll(async () => {
    const { rows: [row] } = await database.query<{ name: string }>("SELECT current_database() AS name");
    if (!/(?:^|_)test(?:_|$)/.test(row.name)) throw new Error("DATABASE_URL_TEST must point to a separate test database.");
    prepared = true;
    const users = new Map([["student", studentId], ["no-phone", noPhoneId], ["blocked", blockedId], ["admin", adminId]]);
    for (const id of users.values()) await database.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `${id}@example.test`]);
    await database.query("UPDATE public.profiles SET phone_number = '+919000000010' WHERE id = $1", [studentId]);
    await database.query("UPDATE public.profiles SET is_blocked = TRUE WHERE id = $1", [blockedId]);
    await database.query("UPDATE public.profiles SET role = $1 WHERE id = $2", [ROLE.ADMIN, adminId]);
    await database.query("INSERT INTO public.teachers (id, name) VALUES ($1, 'Checkout teacher')", [teacherId]);
    verifyAccessToken.mockImplementation(async (token: string) => {
      const id = users.get(token);
      return id && { id, app_metadata: { provider: "google" } };
    });
  });

  beforeEach(async () => {
    courseId = randomUUID();
    courseIds.push(courseId);
    await database.query(
      "INSERT INTO public.courses (id, name, slug, description, price, teacher_id, is_published) VALUES ($1, 'Checkout course', $2, 'Fixture', 49900, $3, TRUE)",
      [courseId, `checkout-${courseId}`, teacherId],
    );
    createRazorpayOrder.mockReset().mockImplementation(async (amount: number) => ({
      orderId: `order_${randomUUID()}`, amount, currency: PAYMENT_CURRENCY,
    }));
  });

  afterAll(async () => {
    try {
      if (!prepared) return;
      await database.query("DELETE FROM public.payments WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE course_id = ANY($1::uuid[]))", [courseIds]);
      await database.query("DELETE FROM public.enrollments WHERE course_id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.courses WHERE id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.teachers WHERE id = $1", [teacherId]);
      await database.query("DELETE FROM public.profiles WHERE id = ANY($1::uuid[])", [[studentId, noPhoneId, blockedId, adminId]]);
      await database.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[studentId, noPhoneId, blockedId, adminId]]);
    } finally {
      await database.end();
    }
  });

  it.each([
    ["invalid", 401, ERROR_CODE.AUTH_REQUIRED], ["blocked", 403, ERROR_CODE.ACCOUNT_BLOCKED],
    ["admin", 403, ERROR_CODE.FORBIDDEN], ["no-phone", 400, ERROR_CODE.PROFILE_INCOMPLETE],
  ] as const)("rejects checkout for %s", async (token, httpStatus, code) => {
    const response = await checkout(token);
    expect(response.status).toBe(httpStatus);
    expect(response.body.error.code).toBe(code);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
    expect(await rows()).toEqual([]);
  });

  it("rejects unpublished courses and client-provided amounts", async () => {
    expect((await checkout().send({ amount: 100 })).body.error.code).toBe(ERROR_CODE.VALIDATION_FAILED);
    await database.query("UPDATE public.courses SET is_published = FALSE WHERE id = $1", [courseId]);
    expect((await checkout()).status).toBe(404);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
    expect(await rows()).toEqual([]);
  });

  it("creates one pending enrollment and reuses one order across concurrent requests and price changes", async () => {
    const [first, second] = await Promise.all([checkout(), checkout()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(first.body).toEqual({ orderId: expect.any(String), amount: 49900, currency: PAYMENT_CURRENCY });
    await database.query("UPDATE public.courses SET price = 69900 WHERE id = $1", [courseId]);
    expect((await checkout()).body).toEqual(first.body);
    expect(createRazorpayOrder).toHaveBeenCalledExactlyOnceWith(49900);
    expect(await rows()).toEqual([{
      enrollment_status: ENROLLMENT_STATUS.PENDING, payment_status: PAYMENT_STATUS.CREATED,
      amount: 49900, razorpay_order_id: first.body.orderId,
    }]);
    expect((await status()).body).toEqual({ status: ENROLLMENT_STATUS.PENDING, courseSlug: null });
    expect((await status("no-phone")).body).toEqual({ status: null, courseSlug: null });
  });

  it("rolls back an enrollment when the order request fails and allows a retry", async () => {
    createRazorpayOrder.mockRejectedValueOnce(new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "Order unavailable."));
    expect((await checkout()).status).toBe(503);
    expect(await rows()).toEqual([]);
    expect((await checkout()).status).toBe(200);
    expect(await rows()).toHaveLength(1);
  });

  it("returns the current slug only for the owner when their enrollment is paid", async () => {
    await database.query("INSERT INTO public.enrollments (user_id, course_id, status) VALUES ($1, $2, $3)",
      [studentId, courseId, ENROLLMENT_STATUS.PAID]);
    await database.query("UPDATE public.courses SET slug = $2 WHERE id = $1", [courseId, `renamed-${courseId}`]);
    expect((await status()).body).toEqual({ status: ENROLLMENT_STATUS.PAID, courseSlug: `renamed-${courseId}` });
    expect((await status("no-phone")).body).toEqual({ status: null, courseSlug: null });
    expect((await status("blocked")).status).toBe(403);
    expect((await checkout()).body.error.code).toBe(ERROR_CODE.ALREADY_ENROLLED);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
    await database.query("UPDATE public.courses SET is_published = FALSE WHERE id = $1", [courseId]);
    expect((await status()).body).toEqual({ status: ENROLLMENT_STATUS.PAID, courseSlug: null });
  });
});
