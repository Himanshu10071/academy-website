import type { DemoPlayback, LecturePlayback, OwnedCourse, PlaybackSource } from "@academy/shared";

import type { DemoRow, LectureRow, OwnedCourseRow } from "./playback.repository.ts";

export function mapLecturePlayback(row: LectureRow, source: PlaybackSource): LecturePlayback {
  return {
    ...source,
    lecture: { id: row.id, name: row.lecture_name, courseId: row.course_id, courseSlug: row.course_slug },
  };
}

export function mapDemoPlayback(row: DemoRow, source: PlaybackSource): DemoPlayback {
  return { ...source, demo: { id: row.id, name: row.name } };
}

export function mapOwnedCourse(row: OwnedCourseRow): OwnedCourse {
  return {
    id: row.id, name: row.name, slug: row.slug, thumbnailUrl: row.thumbnail_url,
    teacherName: row.teacher_name, lectureCount: row.lecture_count,
    paymentId: row.payment_id, refundEligibleUntil: row.refund_eligible_until?.toISOString() ?? null,
    hasOpenRefund: row.has_open_refund,
  };
}
