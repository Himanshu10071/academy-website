import { randomUUID } from "node:crypto";
import {
  ERROR_CODE, type CourseInput, type TeacherInput, type UpdateCourse,
  type UpdateDemo, type UpdateLecture, type UpdateTeacher,
} from "@academy/shared";
import type { PoolClient } from "pg";

import { withTransaction } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { videoObjectExists } from "../../lib/s3.ts";
import {
  mapAdminCourse, mapAdminDemo, mapAdminLecture, mapAdminTeacher, mapPublicCourse, mapPublicDemo, mapPublicLecture,
} from "./catalog.mapper.ts";
import * as repository from "./catalog.repository.ts";

function requireRow<T>(value: T | undefined, entity: string): T {
  if (value === undefined) throw new AppError(404, ERROR_CODE.NOT_FOUND, `${entity} not found.`);
  return value;
}

export async function requireLockedCourse(client: PoolClient, id: string) {
  return requireRow(await repository.lockCourse(client, id), "Course");
}

export async function listTeachers() {
  return (await repository.listTeachers()).map(mapAdminTeacher);
}

export async function createTeacher(input: TeacherInput) {
  return mapAdminTeacher(await repository.insertTeacher(input));
}

export async function updateTeacher(id: string, input: UpdateTeacher) {
  return mapAdminTeacher(requireRow(await repository.updateTeacher(id, input), "Teacher"));
}

export async function listAdminCourses() {
  return (await repository.listAdminCourses()).map(mapAdminCourse);
}

export async function getAdminCourse(id: string) {
  return mapAdminCourse(requireRow(await repository.findCourse(id), "Course"));
}

function courseSlug(name: string) {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";
}

function courseWriteError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "23503" && "constraint" in error && error.constraint === "courses_teacher_id_fkey") {
      throw new AppError(400, ERROR_CODE.VALIDATION_FAILED, "Choose an existing teacher.");
    }
    if (error.code === "23505" && "constraint" in error && error.constraint === "courses_slug_key") {
      throw new AppError(409, ERROR_CODE.COURSE_SLUG_TAKEN, "That course slug is already in use.");
    }
  }
  throw error;
}

export async function createCourse(input: CourseInput) {
  const base = courseSlug(input.name);
  try {
    const row = await repository.insertCourse(input, base)
      ?? await repository.insertCourse(input, `${base}-${randomUUID().slice(0, 8)}`);
    if (!row) throw new AppError(409, ERROR_CODE.COURSE_SLUG_TAKEN, "Could not find an available course slug. Try again.");
    return mapAdminCourse(row);
  } catch (error) {
    courseWriteError(error);
  }
}

export async function updateCourse(id: string, input: UpdateCourse) {
  try {
    return mapAdminCourse(requireRow(await repository.updateCourse(id, input), "Course"));
  } catch (error) {
    courseWriteError(error);
  }
}

export async function publishCourse(id: string, publish: boolean) {
  return withTransaction(async (client) => {
    const course = await requireLockedCourse(client, id);
    if (publish && (!course.teacher_id || !course.description.trim() || !course.thumbnail_url?.trim()
      || !await repository.hasVisibleReadyLecture(client, id))) {
      throw new AppError(409, ERROR_CODE.COURSE_NOT_PUBLISHABLE, "Add a teacher, description, thumbnail, and at least one ready, visible lecture.");
    }
    return mapAdminCourse(await repository.setCoursePublication(client, id, publish));
  });
}

export async function listLectures(courseId: string) {
  requireRow(await repository.findCourse(courseId), "Course");
  return (await repository.listLectures(courseId)).map(mapAdminLecture);
}

export async function updateLecture(id: string, input: UpdateLecture) {
  const courseId = requireRow(await repository.findLectureCourseId(id), "Lecture");
  return withTransaction(async (client) => {
    await requireLockedCourse(client, courseId);
    return mapAdminLecture(requireRow(await repository.updateLecture(client, id, input), "Lecture"));
  });
}

export async function setLectureOrder(courseId: string, lectureIds: string[]) {
  return withTransaction(async (client) => {
    await requireLockedCourse(client, courseId);
    const lectures = await repository.listLectures(courseId, client);
    const ids = new Set(lectures.map(({ id }) => id));
    if (ids.size !== lectureIds.length || lectureIds.some((id) => !ids.delete(id.toLowerCase()))) {
      throw new AppError(400, ERROR_CODE.VALIDATION_FAILED, "Send each lecture in this course exactly once.");
    }
    await repository.reorderLectures(client, courseId, lectureIds);
    return (await repository.listLectures(courseId, client)).map(mapAdminLecture);
  });
}

export async function listAdminDemos() {
  return (await repository.listAdminDemos()).map(mapAdminDemo);
}

export async function updateDemo(id: string, input: UpdateDemo) {
  return mapAdminDemo(requireRow(await repository.updateDemo(id, input), "Demo"));
}

export async function publishDemo(id: string, publish: boolean) {
  if (publish) {
    const key = requireRow(await repository.findDemoVideoKey(id), "Demo");
    if (!await videoObjectExists(key)) throw new AppError(409, ERROR_CODE.UPLOAD_NOT_FOUND, "Upload the demo video before publishing.");
  }
  return mapAdminDemo(requireRow(await repository.setDemoPublication(id, publish), "Demo"));
}

export async function listPublicCourses() {
  return (await repository.listPublicCourses()).map(mapPublicCourse);
}

export async function getPublicCourse(slug: string) {
  const row = requireRow(await repository.findPublicCourse(slug), "Course");
  return { ...mapPublicCourse(row), lectures: row.lectures.map(mapPublicLecture) };
}

export async function listPublicDemos() {
  return (await repository.listPublicDemos()).map(mapPublicDemo);
}
