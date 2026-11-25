import { ERROR_CODE } from "@academy/shared";

import { env } from "../../config/env.ts";
import { AppError } from "../../lib/errors.ts";
import { getPlaybackUrl } from "../../lib/video-signer.ts";
import { decideLectureAccess } from "./access.ts";
import { mapDemoPlayback, mapLecturePlayback, mapOwnedCourse } from "./playback.mapper.ts";
import { findLectureAccess, findLecturePreview, findPublishedDemo, listPaidCourses } from "./playback.repository.ts";

const denialMessage = {
  [ERROR_CODE.ACCOUNT_BLOCKED]: "This account is blocked.",
  [ERROR_CODE.FORBIDDEN]: "Administrator access is required.",
  [ERROR_CODE.LECTURE_NOT_READY]: "This lecture is not available right now.",
  [ERROR_CODE.NOT_ENROLLED]: "A paid enrollment for this course is required.",
};

async function playbackSource(videoKey: string) {
  const ttl = env.SIGNED_URL_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  return { url: await getPlaybackUrl(videoKey, ttl), expiresAt };
}

export async function playLecture(userId: string, lectureId: string) {
  const row = await findLectureAccess(userId, lectureId);
  if (!row) throw new AppError(404, ERROR_CODE.NOT_FOUND, "Lecture not found.");
  if (row.is_blocked === null) throw new AppError(403, ERROR_CODE.FORBIDDEN, "This account cannot access the academy.");

  const decision = decideLectureAccess({
    purpose: "course",
    profile: { isBlocked: row.is_blocked },
    lecture: { courseId: row.course_id, status: row.video_status, isHidden: row.is_hidden },
    enrollment: row.enrollment_course_id && row.enrollment_status
      ? { courseId: row.enrollment_course_id, status: row.enrollment_status }
      : undefined,
  });
  if (!decision.allowed) throw new AppError(403, decision.reason, denialMessage[decision.reason]);

  return mapLecturePlayback(row, await playbackSource(row.video_key));
}

export async function previewLecture(userId: string, lectureId: string) {
  const row = await findLecturePreview(userId, lectureId);
  if (!row) throw new AppError(404, ERROR_CODE.NOT_FOUND, "Lecture not found.");

  const decision = decideLectureAccess({
    purpose: "preview",
    profile: { isBlocked: row.is_blocked, role: row.role },
    lecture: { courseId: row.course_id, status: row.video_status, isHidden: row.is_hidden },
  });
  if (!decision.allowed) throw new AppError(403, decision.reason, denialMessage[decision.reason]);

  return mapLecturePlayback(row, await playbackSource(row.video_key));
}

export async function playDemo(id: string) {
  const row = await findPublishedDemo(id);
  if (!row) throw new AppError(404, ERROR_CODE.NOT_FOUND, "Demo not found.");
  return mapDemoPlayback(row, await playbackSource(row.video_key));
}

export async function listEnrollments(userId: string) {
  return (await listPaidCourses(userId)).map(mapOwnedCourse);
}
