import { LecturesAdmin } from "../../../../../../components/admin/LecturesAdmin";

export default async function CourseLecturesPage({ params }: { params: Promise<{ id: string }> }) {
  return <LecturesAdmin courseId={(await params).id} />;
}
