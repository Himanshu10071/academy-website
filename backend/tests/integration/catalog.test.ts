import { randomUUID } from "node:crypto";
import { ERROR_CODE, ROLE, VIDEO_CONTENT_TYPE, VIDEO_STATUS } from "@academy/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.ts";
import { database } from "../../src/lib/db.ts";

const { verifyAccessToken, signVideoUpload, videoObjectExists, testDatabaseUrl } = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  signVideoUpload: vi.fn(),
  videoObjectExists: vi.fn(),
  testDatabaseUrl: process.env.DATABASE_URL_TEST,
}));

vi.mock("../../src/config/env.ts", () => ({ env: {
  NODE_ENV: "test", FRONTEND_URL: "http://localhost:3000", DATABASE_POOL_MAX: 2,
  DATABASE_URL: testDatabaseUrl ?? "postgresql://test@127.0.0.1:1/unused?sslmode=disable",
} }));
vi.mock("../../src/lib/supabase-auth.ts", () => ({ verifyAccessToken }));
vi.mock("../../src/lib/s3.ts", () => ({
  signVideoUpload, videoObjectExists,
  uploadHeaders: { "Content-Type": "video/mp4", "If-None-Match": "*" },
}));

const prefix = "/api/v1";
const admin = `${prefix}/admin`;
const adminId = randomUUID();
const studentId = randomUUID();
const teacherId = randomUUID();
const courseIds: string[] = [];
const demoIds: string[] = [];
const extraTeachers: string[] = [];
const teacherEmail = "teacher-private@example.test";
const teacherPhone = "+919999999999";

function asAdmin(test: request.Test) {
  return test.set("Authorization", "Bearer catalog-admin");
}

async function addCourse(fields: { description?: string; thumbnail?: string | null; published?: boolean } = {}) {
  const id = randomUUID();
  const slug = `test-${id}`;
  courseIds.push(id);
  await database.query(
    `INSERT INTO public.courses (id, name, slug, description, thumbnail_url, price, teacher_id, is_published)
     VALUES ($1, 'Sample course', $2, $3, $4, 29900, $5, $6)`,
    [id, slug, fields.description ?? "Description", fields.thumbnail === undefined ? "https://example.test/cover.jpg" : fields.thumbnail, teacherId, fields.published ?? false],
  );
  return { id, slug };
}

async function addLecture(courseId: string, name: string, number: number, status: string, hidden = false) {
  const id = randomUUID();
  const key = `lectures/${courseId}/${id}.mp4`;
  await database.query(
    `INSERT INTO public.lectures (id, course_id, lecture_name, lecture_number, duration, video_status, is_hidden, video_key, uploaded_by)
     VALUES ($1, $2, $3, $4, 90, $5, $6, $7, $8)`,
    [id, courseId, name, number, status, hidden, key, adminId],
  );
  return { id, key };
}

describe.skipIf(!testDatabaseUrl)("catalog API with PostgreSQL", () => {
  beforeAll(async () => {
    const { rows: [row] } = await database.query<{ name: string }>("SELECT current_database() AS name");
    if (!/(?:^|_)test(?:_|$)/.test(row.name)) throw new Error("DATABASE_URL_TEST must point to a separate test database.");
    await database.query("INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4)",
      [adminId, `${adminId}@example.test`, studentId, `${studentId}@example.test`]);
    await database.query("UPDATE public.profiles SET role = $2 WHERE id = $1", [adminId, ROLE.ADMIN]);
    await database.query("INSERT INTO public.teachers (id, name, email, phone_number, bio) VALUES ($1, $2, $3, $4, $5)",
      [teacherId, "Sample teacher", teacherEmail, teacherPhone, "Teacher biography"]);
    verifyAccessToken.mockImplementation(async (token: string) => (
      token === "catalog-admin" || token === "catalog-student"
        ? { id: token === "catalog-admin" ? adminId : studentId, app_metadata: { provider: "google" } }
        : null
    ));
    signVideoUpload.mockImplementation(async (key: string) => `https://s3.example.test/${key}?signature=fixture`);
  });

  afterAll(async () => {
    try {
      if (!verifyAccessToken.getMockImplementation()) return;
      await database.query("DELETE FROM public.lectures WHERE course_id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.demo_lectures WHERE id = ANY($1::uuid[])", [demoIds]);
      await database.query("DELETE FROM public.courses WHERE id = ANY($1::uuid[])", [courseIds]);
      await database.query("DELETE FROM public.teachers WHERE id = ANY($1::uuid[])", [[teacherId, ...extraTeachers]]);
      await database.query("DELETE FROM public.profiles WHERE id = ANY($1::uuid[])", [[adminId, studentId]]);
      await database.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[adminId, studentId]]);
    } finally {
      await database.end();
    }
  });

  it.each([
    ["get", "/teachers"], ["post", "/teachers"], ["get", "/courses"], ["post", "/courses"],
    ["get", "/courses/example"], ["patch", "/courses/example"], ["patch", "/courses/example/publication"],
    ["get", "/courses/example/lectures"], ["put", "/courses/example/lectures/order"],
    ["post", "/lectures/upload-url"], ["post", "/lectures/example/confirm-upload"], ["patch", "/lectures/example"],
    ["get", "/demos"], ["post", "/demos/upload-url"], ["patch", "/demos/example/publication"],
    ["patch", "/demos/example"], ["patch", "/teachers/example"],
  ] as const)("protects admin %s %s before validation", async (method, path) => {
    const anonymous = await request(app)[method](admin + path);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe(ERROR_CODE.AUTH_REQUIRED);
    const student = await request(app)[method](admin + path).set("Authorization", "Bearer catalog-student");
    expect(student.status).toBe(403);
    expect(student.body.error.code).toBe(ERROR_CODE.FORBIDDEN);
  });

  it("publishes only safe metadata and excludes hidden and unfinished lectures", async () => {
    const course = await addCourse({ published: true });
    const ready = await addLecture(course.id, "Public lecture", 1, VIDEO_STATUS.READY);
    await addLecture(course.id, "Hidden lecture", 2, VIDEO_STATUS.READY, true);
    await addLecture(course.id, "Unfinished lecture", 3, VIDEO_STATUS.UPLOADED);
    const draft = await addCourse();
    const demo = await asAdmin(request(app).post(`${admin}/demos/upload-url`))
      .send({ name: "Sample demo", description: null, thumbnailUrl: null, duration: 45, contentType: VIDEO_CONTENT_TYPE });
    expect(demo.status).toBe(201);
    demoIds.push(demo.body.id);
    videoObjectExists.mockResolvedValueOnce(false);
    const missing = await asAdmin(request(app).patch(`${admin}/demos/${demo.body.id}/publication`)).send({ isPublished: true });
    expect(missing.body.error.code).toBe(ERROR_CODE.UPLOAD_NOT_FOUND);
    videoObjectExists.mockResolvedValueOnce(true);
    expect((await asAdmin(request(app).patch(`${admin}/demos/${demo.body.id}/publication`)).send({ isPublished: true })).status).toBe(200);

    const list = await request(app).get(`${prefix}/courses`);
    const detail = await request(app).get(`${prefix}/courses/${course.slug}`);
    const demos = await request(app).get(`${prefix}/demos`);
    for (const response of [list, detail, demos]) {
      expect(response.status).toBe(200);
      expect(response.text).not.toMatch(/video_key|videoKey|phone_number|teacherPhone/);
      expect(response.text).not.toContain(ready.key);
      expect(response.text).not.toContain(teacherEmail);
      expect(response.text).not.toContain(teacherPhone);
    }
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: course.id })]));
    expect(list.body.some(({ id }: { id: string }) => id === draft.id)).toBe(false);
    expect((await request(app).get(`${prefix}/courses/${draft.slug}`)).status).toBe(404);
    expect(detail.body.teacher).toEqual({ name: "Sample teacher", bio: "Teacher biography", photoUrl: null });
    expect(detail.body.lectures).toEqual([{ lectureNumber: 1, name: "Public lecture", duration: 90 }]);
    expect(demos.body).toContainEqual({
      id: demo.body.id, name: "Sample demo", description: null, thumbnailUrl: null, duration: 45,
    });
  });

  it.each(["description", "thumbnail", "ready lecture"])("rejects publishing without %s", async (missing) => {
    const course = await addCourse({
      description: missing === "description" ? "" : undefined,
      thumbnail: missing === "thumbnail" ? null : undefined,
    });
    if (missing !== "ready lecture") await addLecture(course.id, "Ready", 1, VIDEO_STATUS.READY);
    else await addLecture(course.id, "Hidden", 1, VIDEO_STATUS.READY, true);
    const response = await asAdmin(request(app).patch(`${admin}/courses/${course.id}/publication`)).send({ isPublished: true });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODE.COURSE_NOT_PUBLISHABLE);
  });

  it("validates upload type, checks S3, then confirms the lecture and publishes the course", async () => {
    const course = await addCourse();
    const invalid = await asAdmin(request(app).post(`${admin}/lectures/upload-url`))
      .send({ courseId: course.id, name: "Upload", contentType: "video/webm" });
    expect(invalid.body.error.code).toBe(ERROR_CODE.VALIDATION_FAILED);
    const upload = await asAdmin(request(app).post(`${admin}/lectures/upload-url`))
      .send({ courseId: course.id, name: "Upload", contentType: VIDEO_CONTENT_TYPE });
    expect(upload.status).toBe(201);
    const key = `lectures/${course.id}/${upload.body.id}.mp4`;
    expect(signVideoUpload).toHaveBeenLastCalledWith(key);
    const confirm = `${admin}/lectures/${upload.body.id}/confirm-upload`;
    videoObjectExists.mockResolvedValueOnce(false);
    const missing = await asAdmin(request(app).post(confirm)).send({ duration: 123 });
    expect(missing.status).toBe(409);
    expect(missing.body.error.code).toBe(ERROR_CODE.UPLOAD_NOT_FOUND);
    expect(videoObjectExists).toHaveBeenLastCalledWith(key);
    const pending = await asAdmin(request(app).get(`${admin}/courses/${course.id}/lectures`));
    expect(pending.body[0].videoStatus).toBe(VIDEO_STATUS.UPLOADED);
    videoObjectExists.mockResolvedValueOnce(true);
    const confirmed = await asAdmin(request(app).post(confirm)).send({ duration: 123 });
    expect(confirmed.body).toMatchObject({ videoStatus: VIDEO_STATUS.READY, duration: 123 });
    const published = await asAdmin(request(app).patch(`${admin}/courses/${course.id}/publication`)).send({ isPublished: true });
    expect(published.body).toMatchObject({ isPublished: true, lectureCount: 1 });
  });

  it("swaps two actual lecture numbers under the deferred unique constraint", async () => {
    const { id } = await addCourse();
    const first = await addLecture(id, "First", 1, VIDEO_STATUS.READY);
    const second = await addLecture(id, "Second", 2, VIDEO_STATUS.UPLOADED);
    const response = await asAdmin(request(app).put(`${admin}/courses/${id}/lectures/order`))
      .send({ lectureIds: [second.id, first.id] });
    expect(response.status).toBe(200);
    const { rows } = await database.query(
      "SELECT id, lecture_number FROM public.lectures WHERE course_id = $1 ORDER BY lecture_number", [id],
    );
    expect(rows).toEqual([{ id: second.id, lecture_number: 1 }, { id: first.id, lecture_number: 2 }]);
    const hidden = await asAdmin(request(app).patch(`${admin}/lectures/${first.id}`)).send({ name: "Renamed", isHidden: true });
    expect(hidden.body).toMatchObject({ name: "Renamed", isHidden: true });
    expect((await asAdmin(request(app).get(`${admin}/courses/${id}`))).body.lectureCount).toBe(0);
  });

  it("edits nullable catalog fields and creates unique editable slugs", async () => {
    const teacherResponse = await asAdmin(request(app).post(`${admin}/teachers`))
      .send({ name: "New teacher", photoUrl: "https://example.test/photo.jpg", email: "staff@example.test" });
    expect(teacherResponse.status).toBe(201);
    const newTeacherId: string = teacherResponse.body.id;
    extraTeachers.push(newTeacherId);
    const changedTeacher = await asAdmin(request(app).patch(`${admin}/teachers/${newTeacherId}`))
      .send({ isActive: false, photoUrl: null });
    expect(changedTeacher.body).toMatchObject({ isActive: false, photoUrl: null, email: "staff@example.test" });

    const input = { name: `Fresh course ${randomUUID().slice(0, 8)}`, description: "", thumbnailUrl: null, pricePaise: 29901, teacherId: newTeacherId };
    const created = await Promise.all([1, 2].map(() => asAdmin(request(app).post(`${admin}/courses`)).send(input)));
    for (const course of created) {
      expect(course.status).toBe(201);
      courseIds.push(course.body.id);
    }
    const [first, second] = created.map(({ body }) => body);
    expect(first.slug).not.toBe(second.slug);
    const duplicate = await asAdmin(request(app).patch(`${admin}/courses/${second.id}`)).send({ slug: first.slug });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe(ERROR_CODE.COURSE_SLUG_TAKEN);
    const updated = await asAdmin(request(app).patch(`${admin}/courses/${second.id}`))
      .send({ slug: `${first.slug}-edited`, thumbnailUrl: "https://example.test/new.jpg" });
    expect(updated.body).toMatchObject({ slug: `${first.slug}-edited`, pricePaise: 29901, thumbnailUrl: "https://example.test/new.jpg" });

    const demo = await asAdmin(request(app).post(`${admin}/demos/upload-url`))
      .send({ name: "Demo edit test", description: "Before", thumbnailUrl: null, duration: 45, contentType: VIDEO_CONTENT_TYPE });
    expect(demo.status).toBe(201);
    demoIds.push(demo.body.id);
    const updatedDemo = await asAdmin(request(app).patch(`${admin}/demos/${demo.body.id}`))
      .send({ displayOrder: 3, description: null });
    expect(updatedDemo.body).toMatchObject({ displayOrder: 3, description: null, isPublished: false });
  });
});
