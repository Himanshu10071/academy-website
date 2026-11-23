import { CourseEditor } from "../../../../../components/admin/CourseEditor";

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  return <CourseEditor courseId={(await params).id} />;
}
