import { randomUUID } from "node:crypto";
import { ENROLLMENT_STATUS, ERROR_CODE, VIDEO_STATUS } from "@academy/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.ts";
import { database } from "../../src/lib/db.ts";
import { logger } from "../../src/lib/logger.ts";

const { verifyAccessToken, getPlaybackUrl, testDatabaseUrl } = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  getPlaybackUrl: vi.fn(),
  testDatabaseUrl: process.env.DATABASE_URL_TEST,
}));

vi.mock("../../src/config/env.ts", () => ({ env: {
  NODE_ENV: "test", FRONTEND_URL: "http://localhost:3000", DATABASE_POOL_MAX: 2,
  SIGNED_URL_TTL_SECONDS: 900,
  DATABASE_URL: testDatabaseUrl ?? "postgresql://test@127.0.0.1:1/unused?sslmode=disable",
} }));
vi.mock("../../src/lib/supabase-auth.ts", () => ({ verifyAccessToken }));
vi.mock("../../src/lib/video-signer.ts", () => ({ getPlaybackUrl }));

const userId = randomUUID();
const otherId = randomUUID();
const blockedId = randomUUID();
const teacherId = randomUUID();
const paidId = randomUUID();
const courseIds: string[] = [];
const demos: string[] = [];
const url = "https://media.example.test/signed-fixture";
let prepared = false;

async function course(id = randomUUID()) {
  courseIds.push(id);
  await database.query(
    `INSERT INTO public.courses (id, name, slug, description, thumbnail_url, price, teacher_id, is_published)
     VALUES ($1, 'Playback fixture', $2, 'Sample', 'https://example.test/cover.jpg', 25000, $3, TRUE)`,
    [id, `playback-${id}`, teacherId],
  );
  return id;
}

async function lecture(courseId: string, status = VIDEO_STATUS.READY as string, hidden = false) {
  const id = randomUUID();
  const key = `lectures/${courseId}/${id}.mp4`;
  await database.query(
    `INSERT INTO public.lectures (id, course_id, lecture_name, lecture_number, video_key, video_status, is_hidden, uploaded_by)
     VALUES ($1, $2, 'Test lesson', (SELECT COUNT(*) + 1 FROM public.lectures WHERE course_id = $2), $3, $4, $5, $6)`,
    [id, courseId, key, status, hidden, otherId],
  );
  return { id, key };
}

async function enroll(id: string, courseId: string, status: string) {
  await database.query(
    "INSERT INTO public.enrollments (user_id, course_id, status, revoked_at) VALUES ($1, $2, $3, $4)",
    [id, courseId, status, status === ENROLLMENT_STATUS.REVOKED ? new Date() : null],
  );
}

function play(id: string) {
  return request(app).post(`/api/v1/lectures/${id}/playback`);
}

describe.skipIf(!testDatabaseUrl)("playback API with PostgreSQL", () => {
  beforeAll(async () => {
    const { rows: [row] } = await database.query<{ name: string }>("SELECT current_database() AS name");
    if (!/(?:^|_)test(?:_|$)/.test(row.name)) throw new Error("DATABASE_URL_TEST must point to a separate test database.");
    prepared = true;
    for (const id of [userId, otherId, blockedId]) {
      await database.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `${id}@example.test`]);
    }
    await database.query("UPDATE public.profiles SET is_blocked = TRUE WHERE id = $1", [blockedId]);
    await database.query("INSERT INTO public.teachers (id, name) VALUES ($1, 'Playback teacher')", [teacherId]);
    await course(paidId);
    await enroll(userId, paidId, ENROLLMENT_STATUS.PAID);
    await enroll(blockedId, paidId, ENROLLMENT_STATUS.PAID);
    verifyAccessToken.mockImplementation(async (token: string) => {
      const id = token === "owner" ? userId : token === "blocked" ? blockedId : undefined;
      return id && { id, app_metadata: { provider: "google" } };
    });
    getPlaybackUrl.mockResolvedValue(url);
  });

  afterAll(async () => {
    try {
      if (!prepared) return;
      await database.query("DELETE FROM public.lectures WHERE course_id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.demo_lectures WHERE id = ANY($1::uuid[])", [demos]);
      await database.query("DELETE FROM public.enrollments WHERE course_id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.courses WHERE id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.teachers WHERE id = $1", [teacherId]);
      await database.query("DELETE FROM public.profiles WHERE id = ANY($1::uuid[])", [[userId, otherId, blockedId]]);
      await database.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[userId, otherId, blockedId]]);
    } finally {
      await database.end();
    }
  });

  it("requires a bearer token before signing", async () => {
    const response = await play(randomUUID());
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODE.AUTH_REQUIRED);
    expect(getPlaybackUrl).not.toHaveBeenCalled();
  });

  it("denies blocked users and logs the decision with IDs and no credentials", async () => {
    const target = await lecture(paidId);
    const log = vi.spyOn(logger, "error");
    try {
      const response = await play(target.id).set("Authorization", "Bearer blocked");
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ERROR_CODE.ACCOUNT_BLOCKED);
      expect(log).toHaveBeenCalledWith(`Playback denied requestId=${response.headers["x-request-id"]} userId=${blockedId} lectureId=${target.id} code=ACCOUNT_BLOCKED`);
      expect(getPlaybackUrl).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it.each([undefined, ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.REVOKED])(
    "rejects a missing, pending, or revoked enrollment (%s), even with a paid enrollment for another course", async (status) => {
      const id = await course();
      await enroll(otherId, id, ENROLLMENT_STATUS.PAID);
      if (status) await enroll(userId, id, status);
      const target = await lecture(id);
      const response = await play(target.id).set("Authorization", "Bearer owner");
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ERROR_CODE.NOT_ENROLLED);
      expect(getPlaybackUrl).not.toHaveBeenCalled();
    },
  );

  it.each([[VIDEO_STATUS.UPLOADED, false], [VIDEO_STATUS.PROCESSING, false], [VIDEO_STATUS.READY, true]] as const)(
    "denies a paid user if the lecture status is %s and hidden is %s", async (status, hidden) => {
      const target = await lecture(paidId, status, hidden);
      const response = await play(target.id).set("Authorization", "Bearer owner");
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ERROR_CODE.LECTURE_NOT_READY);
      expect(getPlaybackUrl).not.toHaveBeenCalled();
    },
  );

  it("returns NOT_FOUND for an unknown lecture", async () => {
    const response = await play(randomUUID()).set("Authorization", "Bearer owner");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODE.NOT_FOUND);
  });

  it("returns a fresh URL and only public lecture fields to the paid user", async () => {
    const target = await lecture(paidId);
    const log = vi.spyOn(logger, "info");
    try {
      const response = await play(target.id).set("Authorization", "Bearer owner");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ url, expiresAt: expect.any(String), lecture: {
        id: target.id, name: "Test lesson", courseId: paidId, courseSlug: `playback-${paidId}`,
      } });
      expect(Date.parse(response.body.expiresAt) - Date.now()).toBeGreaterThan(895_000);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(getPlaybackUrl).toHaveBeenLastCalledWith(target.key, 900);
      expect(log).toHaveBeenCalledWith(`Playback granted requestId=${response.headers["x-request-id"]} userId=${userId} lectureId=${target.id}`);
    } finally { log.mockRestore(); }
  });

  it("only plays published demos, with no login or video key field", async () => {
    const id = randomUUID();
    demos.push(id);
    const key = `demos/${id}.mp4`;
    await database.query("INSERT INTO public.demo_lectures (id, name, video_key, uploaded_by) VALUES ($1, 'Sample demo', $2, $3)", [id, key, otherId]);
    for (const target of [id, randomUUID()]) {
      const response = await request(app).post(`/api/v1/demos/${target}/playback`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODE.NOT_FOUND);
    }
    await database.query("UPDATE public.demo_lectures SET is_published = TRUE WHERE id = $1", [id]);
    const response = await request(app).post(`/api/v1/demos/${id}/playback`);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({ url, expiresAt: expect.any(String), demo: { id, name: "Sample demo" } });
  });

  it("lists only the caller's paid course metadata", async () => {
    const response = await request(app).get("/api/v1/me/enrollments").set("Authorization", "Bearer owner");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      id: paidId, name: "Playback fixture", slug: `playback-${paidId}`,
      thumbnailUrl: "https://example.test/cover.jpg", teacherName: "Playback teacher",
      lectureCount: expect.any(Number),
    }]);
    expect((await request(app).get("/api/v1/me/enrollments")).body.error.code).toBe(ERROR_CODE.AUTH_REQUIRED);
  });
});
