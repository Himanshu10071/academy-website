import { ERROR_CODE } from "@academy/shared";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogImage } from "../../../../components/course/CatalogCards";
import { CourseCurriculum } from "../../../../components/course/Curriculum";
import { CoursePurchase } from "../../../../components/course/CoursePurchase";
import { PaymentSuccessToast } from "../../../../components/payment/PaymentSuccessToast";
import { getCourse } from "../../../../lib/api/catalog";
import { ApiError } from "../../../../lib/api/client";
import { formatPrice } from "../../../../lib/catalog-format";

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();

  let course;
  try {
    course = await getCourse(slug);
  } catch (error) {
    if (error instanceof ApiError && error.failure.code === ERROR_CODE.NOT_FOUND) notFound();
    return <main className="container sections"><p className="empty-state">This course is temporarily unavailable.</p></main>;
  }

  return (
    <main className="container sections course-detail">
      <PaymentSuccessToast destination={`/courses/${course.slug}`} />
      <section className="course-heading">
        <div>
          <Link className="catalog-back" href="/#courses">← Courses</Link>
          <h1>{course.name}</h1>
          <p>{course.description}</p>
          <strong>{formatPrice(course.pricePaise)}</strong>
          <div className="course-purchase"><CoursePurchase course={course} /></div>
        </div>
        {course.thumbnailUrl && <CatalogImage url={course.thumbnailUrl} />}
      </section>
      <section aria-labelledby="teacher-heading">
        <h2 id="teacher-heading">Your teacher</h2>
        <div className="teacher-panel">
          {course.teacher.photoUrl && <CatalogImage url={course.teacher.photoUrl} />}
          <div><h3>{course.teacher.name}</h3>{course.teacher.bio && <p>{course.teacher.bio}</p>}</div>
        </div>
      </section>
      <section aria-labelledby="curriculum-heading">
        <h2 id="curriculum-heading">Curriculum</h2>
        <CourseCurriculum courseId={course.id} lectures={course.lectures} />
      </section>
    </main>
  );
}
