import type {
  AdminCourse, AdminDemo, AdminLecture, AdminTeacher, CourseDetail, CourseInput,
  DemoUpload, LectureUpload, PublicCourse, PublicDemo, TeacherInput, UpdateCourse,
  UpdateDemo, UpdateLecture, UpdateTeacher, UploadTarget,
} from "@academy/shared";

import { apiRequest } from "./client";

export const listCourses = () => apiRequest<PublicCourse[]>("/courses");
export const getCourse = (slug: string) => apiRequest<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
export const listDemos = () => apiRequest<PublicDemo[]>("/demos");

export function adminCatalog(token: string) {
  function request<T>(path: string, options?: Parameters<typeof apiRequest>[2]) {
    return apiRequest<T>(`/admin${path}`, token, options);
  }
  return {
    listTeachers: () => request<AdminTeacher[]>("/teachers"),
    createTeacher: (body: TeacherInput) => request<AdminTeacher>("/teachers", { method: "POST", body }),
    updateTeacher: (id: string, body: UpdateTeacher) => request<AdminTeacher>(`/teachers/${id}`, { body }),
    listCourses: () => request<AdminCourse[]>("/courses"),
    getCourse: (id: string) => request<AdminCourse>(`/courses/${id}`),
    createCourse: (body: CourseInput) => request<AdminCourse>("/courses", { method: "POST", body }),
    updateCourse: (id: string, body: UpdateCourse) => request<AdminCourse>(`/courses/${id}`, { body }),
    publishCourse: (id: string, isPublished: boolean) => request<AdminCourse>(`/courses/${id}/publication`, { body: { isPublished } }),
    listLectures: (courseId: string) => request<AdminLecture[]>(`/courses/${courseId}/lectures`),
    updateLecture: (id: string, body: UpdateLecture) => request<AdminLecture>(`/lectures/${id}`, { body }),
    orderLectures: (courseId: string, lectureIds: string[]) =>
      request<AdminLecture[]>(`/courses/${courseId}/lectures/order`, { method: "PUT", body: { lectureIds } }),
    startLectureUpload: (body: LectureUpload) => request<UploadTarget>("/lectures/upload-url", { method: "POST", body }),
    confirmLectureUpload: (id: string, duration: number) =>
      request<AdminLecture>(`/lectures/${id}/confirm-upload`, { method: "POST", body: { duration } }),
    listDemos: () => request<AdminDemo[]>("/demos"),
    updateDemo: (id: string, body: UpdateDemo) => request<AdminDemo>(`/demos/${id}`, { body }),
    publishDemo: (id: string, isPublished: boolean) => request<AdminDemo>(`/demos/${id}/publication`, { body: { isPublished } }),
    startDemoUpload: (body: DemoUpload) => request<UploadTarget>("/demos/upload-url", { method: "POST", body }),
  };
}
