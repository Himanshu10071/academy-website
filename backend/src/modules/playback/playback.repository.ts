import { ENROLLMENT_STATUS } from "@academy/shared";

import { database } from "../../lib/db.ts";

export type LectureRow = {
  id: string;
  lecture_name: string;
  course_id: string;
  course_slug: string;
  video_key: string;
  video_status: string;
  is_hidden: boolean;
};

type LectureAccessRow = LectureRow & {
  is_blocked: boolean | null;
  enrollment_course_id: string | null;
  enrollment_status: string | null;
};

export async function findLectureAccess(userId: string, lectureId: string) {
  const { rows } = await database.query<LectureAccessRow>(
    `SELECT l.id, l.lecture_name, l.course_id, c.slug AS course_slug,
            l.video_key, l.video_status, l.is_hidden, p.is_blocked,
            e.course_id AS enrollment_course_id, e.status AS enrollment_status
       FROM public.lectures l
       JOIN public.courses c ON c.id = l.course_id
       LEFT JOIN public.profiles p ON p.id = $1
       LEFT JOIN LATERAL (
         SELECT course_id, status
           FROM public.enrollments
          WHERE user_id = p.id AND course_id = l.course_id
          ORDER BY (status = $3) DESC, created_at DESC, id
          LIMIT 1
       ) e ON TRUE
      WHERE l.id = $2`,
    [userId, lectureId, ENROLLMENT_STATUS.PAID],
  );
  return rows[0];
}

export async function findLecturePreview(userId: string, lectureId: string) {
  const { rows } = await database.query<LectureRow & { role: string; is_blocked: boolean }>(
    `SELECT l.id, l.lecture_name, l.course_id, c.slug AS course_slug,
            l.video_key, l.video_status, l.is_hidden, p.role, p.is_blocked
       FROM public.lectures l
       JOIN public.courses c ON c.id = l.course_id
       JOIN public.profiles p ON p.id = $1
      WHERE l.id = $2`,
    [userId, lectureId],
  );
  return rows[0];
}

export type DemoRow = { id: string; name: string; video_key: string };

export async function findPublishedDemo(id: string) {
  const { rows } = await database.query<DemoRow>(
    "SELECT id, name, video_key FROM public.demo_lectures WHERE id = $1 AND is_published",
    [id],
  );
  return rows[0];
}

export type OwnedCourseRow = {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  teacher_name: string;
  lecture_count: number;
};

export async function listPaidCourses(userId: string) {
  const { rows } = await database.query<OwnedCourseRow>(
    `SELECT c.id, c.name, c.slug, c.thumbnail_url, t.name AS teacher_name, c.lecture_count
       FROM public.enrollments e
       JOIN public.courses c ON c.id = e.course_id
       JOIN public.teachers t ON t.id = c.teacher_id
      WHERE e.user_id = $1 AND e.status = $2
      ORDER BY e.created_at DESC, c.id`,
    [userId, ENROLLMENT_STATUS.PAID],
  );
  return rows;
}
