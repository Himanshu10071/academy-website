import { VIDEO_STATUS, type DemoUpload, type LectureUpload } from "@academy/shared";
import type { PoolClient } from "pg";

import { database } from "../../lib/db.ts";

export type ConfirmedLectureRow = {
  id: string; lecture_name: string; lecture_number: number; duration: number | null;
  video_status: typeof VIDEO_STATUS.READY; is_hidden: boolean;
};

export async function insertLectureUpload(client: PoolClient, id: string, key: string, adminId: string, input: LectureUpload) {
  await client.query(
    `INSERT INTO public.lectures (id, course_id, lecture_name, lecture_number, video_key, video_status, uploaded_by)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(lecture_number), 0) + 1 FROM public.lectures WHERE course_id = $2),
             $4, $5, $6)`,
    [id, input.courseId, input.name, key, VIDEO_STATUS.UPLOADED, adminId],
  );
}

export async function findLectureUpload(id: string) {
  const { rows } = await database.query<{ course_id: string; video_key: string }>(
    "SELECT course_id, video_key FROM public.lectures WHERE id = $1", [id],
  );
  return rows[0];
}

export async function confirmLectureUpload(client: PoolClient, id: string, duration: number) {
  const { rows } = await client.query<ConfirmedLectureRow>(
    `UPDATE public.lectures SET
       duration = CASE WHEN video_status = $2 THEN duration ELSE $3 END,
       video_status = $2
     WHERE id = $1 RETURNING id, lecture_name, lecture_number, duration, video_status, is_hidden`,
    [id, VIDEO_STATUS.READY, duration],
  );
  return rows[0];
}

export async function insertDemoUpload(id: string, key: string, adminId: string, input: DemoUpload) {
  await database.query(
    `INSERT INTO public.demo_lectures (id, name, description, thumbnail_url, duration, video_key, uploaded_by, is_published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)`,
    [id, input.name, input.description, input.thumbnailUrl, input.duration, key, adminId],
  );
}
