import { ERROR_CODE, ROLE, type ErrorCode } from "@academy/shared";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.ts";
import { errorHandler } from "../../src/middleware/error-handler.ts";
import { authenticate } from "../../src/middleware/authenticate.ts";
import { requestId } from "../../src/middleware/request-id.ts";
import { requireAdmin } from "../../src/middleware/require-admin.ts";

const { query, verifyAccessToken, checkDatabase } = vi.hoisted(() => ({
  query: vi.fn(),
  verifyAccessToken: vi.fn(),
  checkDatabase: vi.fn(),
}));

vi.mock("../../src/config/env.ts", () => ({ env: { FRONTEND_URL: "http://localhost:3000", NODE_ENV: "test" } }));
vi.mock("../../src/lib/db.ts", () => ({ database: { query }, checkDatabase }));
vi.mock("../../src/lib/supabase-auth.ts", () => ({ verifyAccessToken }));

const id = "8bd42cf1-42cf-4c0d-aa90-e6df6959e5ec";
const profile = {
  id, user_name: "Test Student", email: "student@example.test",
  phone_number: null, role: ROLE.STUDENT, is_blocked: false,
};
const authorization = "Bearer test-token";
const me = "/api/v1/me";

function expectFailure(response: request.Response, status: number, code: ErrorCode) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error: {
    code, message: expect.any(String), requestId: response.headers["x-request-id"],
  } });
  expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
}

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [profile] });
  verifyAccessToken.mockReset().mockResolvedValue({
    id, app_metadata: { provider: "google", role: ROLE.ADMIN },
  });
  checkDatabase.mockReset().mockResolvedValue(undefined);
});

describe("profile authorization and updates", () => {
  it("returns AUTH_REQUIRED without a token", async () => {
    expectFailure(await request(app).get(me), 401, ERROR_CODE.AUTH_REQUIRED);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("returns AUTH_REQUIRED for invalid tokens", async () => {
    verifyAccessToken.mockResolvedValueOnce(null);
    expectFailure(await request(app).get(me).set("Authorization", authorization), 401, ERROR_CODE.AUTH_REQUIRED);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns ACCOUNT_BLOCKED for a blocked profile", async () => {
    query.mockResolvedValueOnce({ rows: [{ ...profile, is_blocked: true }] });
    expectFailure(await request(app).get(me).set("Authorization", authorization), 403, ERROR_CODE.ACCOUNT_BLOCKED);
  });

  it("denies a non-Google identity before loading its profile", async () => {
    verifyAccessToken.mockResolvedValueOnce({ id, app_metadata: { provider: "email" } });
    expectFailure(await request(app).get(me).set("Authorization", authorization), 403, ERROR_CODE.FORBIDDEN);
    expect(query).not.toHaveBeenCalled();
  });

  it("denies a verified Google account without a profile", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expectFailure(await request(app).get(me).set("Authorization", authorization), 403, ERROR_CODE.FORBIDDEN);
  });

  it("returns FORBIDDEN for a student at an admin-only route", async () => {
    const adminApp = express();
    adminApp.use(requestId);
    adminApp.get("/admin-only", authenticate, requireAdmin, (_request, response) => response.sendStatus(204));
    adminApp.use(errorHandler);

    expectFailure(await request(adminApp).get("/admin-only").set("Authorization", authorization), 403, ERROR_CODE.FORBIDDEN);
    query.mockResolvedValueOnce({ rows: [{ ...profile, role: ROLE.ADMIN }] });
    expect((await request(adminApp).get("/admin-only").set("Authorization", authorization)).status).toBe(204);
  });

  it("rejects attempts to change the role without issuing a database update", async () => {
    const response = await request(app).patch(me).set("Authorization", authorization)
      .send({ role: ROLE.ADMIN, name: "Edited name" });
    expectFailure(response, 400, ERROR_CODE.VALIDATION_FAILED);
    expect(query).toHaveBeenCalledTimes(1);
    const current = await request(app).get(me).set("Authorization", authorization);
    expect(current.body.role).toBe(ROLE.STUDENT);
  });

  it.each(["123", "1234567890", "+91987654321", "+449876543210"])("rejects invalid phone %s", async (phone) => {
    const response = await request(app).patch(me).set("Authorization", authorization).send({ phone });
    expectFailure(response, 400, ERROR_CODE.VALIDATION_FAILED);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("maps the database row and saves a name and normalized Indian phone", async () => {
    const current = await request(app).get(me).set("Authorization", authorization);
    expect(current.body).toEqual({ id, name: profile.user_name, email: profile.email, phone: null, role: ROLE.STUDENT });

    query.mockResolvedValueOnce({ rows: [profile] }).mockResolvedValueOnce({
      rows: [{ ...profile, user_name: "New Name", phone_number: "+919876543210" }],
    });
    const response = await request(app).patch(me).set("Authorization", authorization)
      .send({ name: " New Name ", phone: "9876543210" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...current.body, name: "New Name", phone: "+919876543210" });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("WHERE id = $1"), [id, "New Name", "+919876543210"]);
  });
});

describe("health and CORS", () => {
  it("checks database availability", async () => {
    expect((await request(app).get("/api/v1/health")).body).toEqual({ status: "ok", database: "reachable" });
    checkDatabase.mockRejectedValueOnce(new Error("database unavailable"));
    expectFailure(await request(app).get("/api/v1/health"), 503, ERROR_CODE.UPSTREAM_FAILED);
  });

  it("allows preflight only from the configured frontend origin", async () => {
    for (const origin of ["http://localhost:3000", "https://untrusted.example"]) {
      const response = await request(app).options(me).set("Origin", origin).set("Access-Control-Request-Method", "PATCH");
      expect(response.headers["access-control-allow-origin"]).toBe(origin === "http://localhost:3000" ? origin : undefined);
    }
  });
});
