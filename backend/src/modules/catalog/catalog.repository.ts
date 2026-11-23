import { VIDEO_STATUS, type CourseInput, type TeacherInput, type UpdateCourse, type UpdateDemo, type UpdateLecture, type UpdateTeacher } from "@academy/shared";
import type { PoolClient } from "pg";

import { database } from "../../lib/db.ts";

export type TeacherRow = {
  id: string; name: string; bio: string | null; photo_url: string | null;
  email: string | null; phone_number: string | null; is_active: boolean;
};
export type CourseRow = {
  id: string; name: string; slug: string; description: string; thumbnail_url: string | null;
  price: number; teacher_id: string; is_published: boolean; lecture_count: number;
};
export type PublicCourseRow = Omit<CourseRow, "teacher_id" | "is_published"> & {
  teacher_name: string; teacher_bio: string | null; teacher_photo_url: string | null;
};
export type LectureRow = {
  id: string; lecture_name: string; lecture_number: number; duration: number | null;
  video_status: (typeof VIDEO_STATUS)[keyof typeof VIDEO_STATUS]; is_hidden: boolean;
};
export type DemoRow = {
  id: string; name: string; description: string | null; thumbnail_url: string | null;
  duration: number | null; is_published: boolean; display_order: number;
};

export async function listTeachers() {
  const { rows } = await database.query<TeacherRow>(
    "SELECT id, name, bio, photo_url, email, phone_number, is_active FROM public.teachers ORDER BY name, id",
  );
  return rows;
}

export async function insertTeacher(input: TeacherInput) {
  const { rows } = await database.query<TeacherRow>(
    `INSERT INTO public.teachers (name, bio, photo_url, email, phone_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, bio, photo_url, email, phone_number, is_active`,
    [input.name, input.bio, input.photoUrl, input.email, input.phone],
  );
  return rows[0];
}

export async function updateTeacher(id: string, input: UpdateTeacher) {
  const { rows } = await database.query<TeacherRow>(
    `UPDATE public.teachers SET
       name = COALESCE($2::jsonb ->> 'name', name),
       bio = CASE WHEN $2::jsonb ? 'bio' THEN $2::jsonb ->> 'bio' ELSE bio END,
       photo_url = CASE WHEN $2::jsonb ? 'photoUrl' THEN $2::jsonb ->> 'photoUrl' ELSE photo_url END,
       email = CASE WHEN $2::jsonb ? 'email' THEN $2::jsonb ->> 'email' ELSE email END,
       phone_number = CASE WHEN $2::jsonb ? 'phone' THEN $2::jsonb ->> 'phone' ELSE phone_number END,
       is_active = COALESCE(($2::jsonb ->> 'isActive')::boolean, is_active)
     WHERE id = $1 RETURNING id, name, bio, photo_url, email, phone_number, is_active`,
    [id, input],
  );
  return rows[0];
}

export async function listAdminCourses() {
  const { rows } = await database.query<CourseRow>("SELECT * FROM public.courses ORDER BY created_at DESC, id");
  return rows;
}

export async function findCourse(id: string) {
  const { rows } = await database.query<CourseRow>("SELECT * FROM public.courses WHERE id = $1", [id]);
  return rows[0];
}

export async function insertCourse(input: CourseInput, slug: string) {
  const { rows } = await database.query<CourseRow>(
    `INSERT INTO public.courses (name, slug, description, thumbnail_url, price, teacher_id)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING RETURNING *`,
    [input.name, slug, input.description, input.thumbnailUrl, input.pricePaise, input.teacherId],
  );
  return rows[0];
}

export async function updateCourse(id: string, input: UpdateCourse) {
  const { rows } = await database.query<CourseRow>(
    `UPDATE public.courses SET
       name = COALESCE($2::jsonb ->> 'name', name),
       slug = COALESCE($2::jsonb ->> 'slug', slug),
       description = COALESCE($2::jsonb ->> 'description', description),
       thumbnail_url = CASE WHEN $2::jsonb ? 'thumbnailUrl' THEN $2::jsonb ->> 'thumbnailUrl' ELSE thumbnail_url END,
       price = COALESCE(($2::jsonb ->> 'pricePaise')::integer, price),
       teacher_id = COALESCE(($2::jsonb ->> 'teacherId')::uuid, teacher_id)
     WHERE id = $1 RETURNING *`,
    [id, input],
  );
  return rows[0];
}

export async function lockCourse(client: PoolClient, id: string) {
  const { rows } = await client.query<CourseRow>("SELECT * FROM public.courses WHERE id = $1 FOR UPDATE", [id]);
  return rows[0];
}

export async function hasVisibleReadyLecture(client: PoolClient, courseId: string) {
  const { rows: [row] } = await client.query<{ available: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.lectures
      WHERE course_id = $1 AND video_status = $2 AND NOT is_hidden) AS available`,
    [courseId, VIDEO_STATUS.READY],
  );
  return row.available;
}

export async function setCoursePublication(client: PoolClient, id: string, isPublished: boolean) {
  const { rows } = await client.query<CourseRow>(
    "UPDATE public.courses SET is_published = $2 WHERE id = $1 RETURNING *",
    [id, isPublished],
  );
  return rows[0];
}

export async function listLectures(courseId: string, client: Pick<PoolClient, "query"> = database) {
  const { rows } = await client.query<LectureRow>(
    `SELECT id, lecture_name, lecture_number, duration, video_status, is_hidden
     FROM public.lectures WHERE course_id = $1 ORDER BY lecture_number`,
    [courseId],
  );
  return rows;
}

export async function findLectureCourseId(id: string) {
  const { rows } = await database.query<{ course_id: string }>(
    "SELECT course_id FROM public.lectures WHERE id = $1", [id],
  );
  return rows[0]?.course_id;
}

export async function updateLecture(client: PoolClient, id: string, input: UpdateLecture) {
  const { rows } = await client.query<LectureRow>(
    `UPDATE public.lectures SET lecture_name = COALESCE($2, lecture_name), is_hidden = COALESCE($3, is_hidden)
     WHERE id = $1 RETURNING id, lecture_name, lecture_number, duration, video_status, is_hidden`,
    [id, input.name ?? null, input.isHidden ?? null],
  );
  return rows[0];
}

export async function reorderLectures(client: PoolClient, courseId: string, ids: string[]) {
  await client.query("SET CONSTRAINTS public.lectures_course_number_key DEFERRED");
  await client.query(
    `UPDATE public.lectures AS lecture SET lecture_number = ordered.position::integer
     FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id, position)
     WHERE lecture.course_id = $1 AND lecture.id = ordered.id`,
    [courseId, ids],
  );
}

export async function listAdminDemos() {
  const { rows } = await database.query<DemoRow>("SELECT * FROM public.demo_lectures ORDER BY display_order, id");
  return rows;
}

export async function findDemoVideoKey(id: string) {
  const { rows } = await database.query<{ video_key: string }>("SELECT video_key FROM public.demo_lectures WHERE id = $1", [id]);
  return rows[0]?.video_key;
}

export async function updateDemo(id: string, input: UpdateDemo) {
  const { rows } = await database.query<DemoRow>(
    `UPDATE public.demo_lectures SET
       name = COALESCE($2::jsonb ->> 'name', name),
       description = CASE WHEN $2::jsonb ? 'description' THEN $2::jsonb ->> 'description' ELSE description END,
       thumbnail_url = CASE WHEN $2::jsonb ? 'thumbnailUrl' THEN $2::jsonb ->> 'thumbnailUrl' ELSE thumbnail_url END,
       display_order = COALESCE(($2::jsonb ->> 'displayOrder')::integer, display_order)
     WHERE id = $1 RETURNING id, name, description, thumbnail_url, duration, is_published, display_order`,
    [id, input],
  );
  return rows[0];
}

export async function setDemoPublication(id: string, published: boolean) {
  const { rows } = await database.query<DemoRow>(
    `UPDATE public.demo_lectures SET is_published = $2 WHERE id = $1
     RETURNING id, name, description, thumbnail_url, duration, is_published, display_order`,
    [id, published],
  );
  return rows[0];
}

export async function listPublicCourses() {
  const { rows } = await database.query<PublicCourseRow>(
    `SELECT c.id, c.name, c.slug, c.description, c.thumbnail_url, c.price, c.lecture_count,
            t.name AS teacher_name, t.bio AS teacher_bio, t.photo_url AS teacher_photo_url
     FROM public.courses c JOIN public.teachers t ON c.teacher_id = t.id
     WHERE c.is_published ORDER BY c.created_at DESC, c.id`,
  );
  return rows;
}

type PublicLectureRow = Pick<LectureRow, "lecture_name" | "lecture_number" | "duration">;

export async function findPublicCourse(slug: string) {
  const { rows } = await database.query<PublicCourseRow & { lectures: PublicLectureRow[] }>(
    `SELECT c.id, c.name, c.slug, c.description, c.thumbnail_url, c.price, c.lecture_count,
            t.name AS teacher_name, t.bio AS teacher_bio, t.photo_url AS teacher_photo_url,
            ARRAY(SELECT json_build_object('lecture_name', l.lecture_name,
              'lecture_number', l.lecture_number, 'duration', l.duration)
              FROM public.lectures l WHERE l.course_id = c.id AND l.video_status = $2 AND NOT l.is_hidden
              ORDER BY l.lecture_number) AS lectures
     FROM public.courses c JOIN public.teachers t ON c.teacher_id = t.id
     WHERE c.slug = $1 AND c.is_published`,
    [slug, VIDEO_STATUS.READY],
  );
  return rows[0];
}

export async function listPublicDemos() {
  const { rows } = await database.query<Pick<DemoRow, "id" | "name" | "description" | "thumbnail_url" | "duration">>(
    `SELECT id, name, description, thumbnail_url, duration
     FROM public.demo_lectures WHERE is_published ORDER BY display_order, id`,
  );
  return rows;
}
