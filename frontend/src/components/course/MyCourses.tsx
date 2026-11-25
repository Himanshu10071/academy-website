"use client";

import Link from "next/link";

import { useOwnedCourses } from "../../hooks/use-owned-courses";
import { GoogleSignIn } from "../layout/AcademyHeader";
import { useAccount } from "../layout/AccountProvider";
import { CourseRefund } from "../payment/CourseRefund";
import { CatalogImage } from "./CatalogCards";

export function MyCourses() {
  const { token, ready, accountError } = useAccount();
  const result = useOwnedCourses(token);
  return (
    <main className="container sections">
      <section aria-labelledby="my-courses-heading">
        <div className="admin-heading">
          <h1 id="my-courses-heading">My Courses</h1>
          {token && <Link className="button button-secondary" href="/account/refunds">Refund requests</Link>}
        </div>
        {!ready && <p role="status">{accountError || "Checking your account…"}</p>}
        {ready && !token && <div className="empty-state">
          <p>Sign in to see your courses.</p><GoogleSignIn primary />
        </div>}
        {token && !result && <p role="status">Loading your courses…</p>}
        {result?.failed && <p role="alert">{accountError || "Could not load your courses. Please try again."}</p>}
        {result?.courses?.length === 0 && <p className="empty-state">You haven’t enrolled in any courses yet. <Link className="catalog-back" href="/#courses">Browse courses</Link></p>}
        {result?.courses && result.courses.length > 0 && <div className="catalog-grid">
          {result.courses.map((course) => <article className="owned-course" key={`${course.id}:${course.paymentId ?? ""}`}>
            <Link className="catalog-card" href={`/courses/${course.slug}`}>
              <CatalogImage url={course.thumbnailUrl} />
              <div className="catalog-card-body">
                <h2>{course.name}</h2><p>{course.teacherName}</p>
                <span className="catalog-card-meta">{course.lectureCount} lectures</span>
              </div>
            </Link>
            {token && <CourseRefund course={course} token={token} />}
          </article>)}
        </div>}
      </section>
    </main>
  );
}
