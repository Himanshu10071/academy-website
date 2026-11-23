import { randomUUID } from "node:crypto";
import { ERROR_CODE, type DemoUpload, type LectureUpload } from "@academy/shared";

import { withTransaction } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { signVideoUpload, uploadHeaders, videoObjectExists } from "../../lib/s3.ts";
import { requireLockedCourse } from "../catalog/catalog.service.ts";
import { mapConfirmation, mapUpload } from "./uploads.mapper.ts";
import * as repository from "./uploads.repository.ts";

export async function createLectureUpload(adminId: string, input: LectureUpload) {
  const id = randomUUID();
  const key = `lectures/${input.courseId.toLowerCase()}/${id}.mp4`;
  const url = await signVideoUpload(key);
  await withTransaction(async (client) => {
    await requireLockedCourse(client, input.courseId);
    await repository.insertLectureUpload(client, id, key, adminId, input);
  });
  return mapUpload(id, url, uploadHeaders);
}

export async function confirmLectureUpload(id: string, duration: number) {
  const row = await repository.findLectureUpload(id);
  if (!row) throw new AppError(404, ERROR_CODE.NOT_FOUND, "Lecture not found.");
  if (!await videoObjectExists(row.video_key)) {
    throw new AppError(409, ERROR_CODE.UPLOAD_NOT_FOUND, "Upload the lecture video before confirming it.");
  }
  return withTransaction(async (client) => {
    await requireLockedCourse(client, row.course_id);
    const updated = await repository.confirmLectureUpload(client, id, duration);
    if (!updated) throw new AppError(404, ERROR_CODE.NOT_FOUND, "Lecture not found.");
    return mapConfirmation(updated);
  });
}

export async function createDemoUpload(adminId: string, input: DemoUpload) {
  const id = randomUUID();
  const key = `demos/${id}.mp4`;
  const url = await signVideoUpload(key);
  await repository.insertDemoUpload(id, key, adminId, input);
  return mapUpload(id, url, uploadHeaders);
}
