"use client";

import Link from "next/link";

import { useAdminCatalog } from "../../hooks/use-admin-catalog";
import { useAdminResource } from "../../hooks/use-admin-resource";
import { formatPrice } from "../../lib/catalog-format";
import { AdminStatus } from "./AdminStatus";

export function CoursesAdmin() {
  const api = useAdminCatalog();
  const { data, error, reload } = useAdminResource(api.listCourses);

  return (
    <>
      <div className="admin-heading">
        <h1>Courses</h1>
        <Link className="button button-primary" href="/admin/courses/new">Create course</Link>
      </div>
      <AdminStatus error={error} loading={!data} retry={reload} />
      {data && <section className="admin-panel" aria-label="Course list">
        {data.length === 0 ? <p>No courses yet.</p> : <ul className="admin-list">{data.map((course) =>
          <li key={course.id}>
            <div><strong>{course.name}</strong><p>{course.isPublished ? "Published" : "Draft"} · {formatPrice(course.pricePaise)}</p></div>
            <div className="actions">
              <Link className="button button-secondary" href={`/admin/courses/${course.id}`}>Edit course</Link>
              <Link className="button button-quiet" href={`/admin/courses/${course.id}/lectures`}>Lectures</Link>
            </div>
          </li>,
        )}</ul>}
      </section>}
    </>
  );
}
