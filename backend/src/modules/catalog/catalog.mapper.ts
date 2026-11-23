import type { AdminCourse, AdminDemo, AdminLecture, AdminTeacher, PublicCourse, PublicDemo, PublicLecture } from "@academy/shared";

import type { CourseRow, DemoRow, LectureRow, PublicCourseRow, TeacherRow } from "./catalog.repository.ts";

export function mapAdminTeacher(row: TeacherRow): AdminTeacher {
  return {
    id: row.id, name: row.name, bio: row.bio, photoUrl: row.photo_url,
    email: row.email, phone: row.phone_number, isActive: row.is_active,
  };
}

function mapCourse(row: Pick<CourseRow, "id" | "name" | "slug" | "description" | "thumbnail_url" | "price" | "lecture_count">) {
  return {
    id: row.id, name: row.name, slug: row.slug, description: row.description,
    thumbnailUrl: row.thumbnail_url, pricePaise: row.price, lectureCount: row.lecture_count,
  };
}

export function mapAdminCourse(row: CourseRow): AdminCourse {
  return { ...mapCourse(row), teacherId: row.teacher_id, isPublished: row.is_published };
}

export function mapPublicCourse(row: PublicCourseRow): PublicCourse {
  return {
    ...mapCourse(row),
    teacher: { name: row.teacher_name, bio: row.teacher_bio, photoUrl: row.teacher_photo_url },
  };
}

export function mapPublicLecture(row: Pick<LectureRow, "lecture_name" | "lecture_number" | "duration">): PublicLecture {
  return { name: row.lecture_name, lectureNumber: row.lecture_number, duration: row.duration };
}

export function mapAdminLecture(row: LectureRow): AdminLecture {
  return { ...mapPublicLecture(row), id: row.id, videoStatus: row.video_status, isHidden: row.is_hidden };
}

export function mapPublicDemo(row: Pick<DemoRow, "id" | "name" | "description" | "thumbnail_url" | "duration">): PublicDemo {
  return { id: row.id, name: row.name, description: row.description, thumbnailUrl: row.thumbnail_url, duration: row.duration };
}

export function mapAdminDemo(row: DemoRow): AdminDemo {
  return { ...mapPublicDemo(row), isPublished: row.is_published, displayOrder: row.display_order };
}
