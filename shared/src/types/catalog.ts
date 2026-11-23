import type { VIDEO_STATUS } from "../constants/status.js";
import type { VIDEO_CONTENT_TYPE } from "../constants/uploads.js";

export type PublicTeacher = {
  name: string;
  bio: string | null;
  photoUrl: string | null;
};

export type TeacherInput = PublicTeacher & { email: string | null; phone: string | null };
export type AdminTeacher = TeacherInput & { id: string; isActive: boolean };
export type UpdateTeacher = Partial<TeacherInput & { isActive: boolean }>;

export type CourseInput = {
  name: string;
  description: string;
  thumbnailUrl: string | null;
  pricePaise: number;
  teacherId: string;
};
type CourseSummary = Omit<CourseInput, "teacherId"> & { id: string; slug: string; lectureCount: number };
export type UpdateCourse = Partial<CourseInput & { slug: string }>;
export type AdminCourse = CourseSummary & { teacherId: string; isPublished: boolean };
export type PublicCourse = CourseSummary & { teacher: PublicTeacher };

export type PublicLecture = { id: string; lectureNumber: number; name: string; duration: number | null };
type VideoStatus = (typeof VIDEO_STATUS)[keyof typeof VIDEO_STATUS];
export type AdminLecture = PublicLecture & { videoStatus: VideoStatus; isHidden: boolean };
export type UpdateLecture = Partial<Pick<AdminLecture, "name" | "isHidden">>;
export type CourseDetail = PublicCourse & { lectures: PublicLecture[] };

export type DemoInput = { name: string; description: string | null; thumbnailUrl: string | null; duration: number };
export type PublicDemo = Omit<DemoInput, "duration"> & { id: string; duration: number | null };
export type AdminDemo = PublicDemo & { isPublished: boolean; displayOrder: number };
export type UpdateDemo = Partial<Pick<AdminDemo, "name" | "description" | "thumbnailUrl" | "displayOrder">>;

export type LectureUpload = { courseId: string; name: string; contentType: typeof VIDEO_CONTENT_TYPE };
export type DemoUpload = DemoInput & { contentType: typeof VIDEO_CONTENT_TYPE };
export type UploadTarget = {
  id: string;
  uploadUrl: string;
  headers: { "Content-Type": typeof VIDEO_CONTENT_TYPE; "If-None-Match": "*" };
};
