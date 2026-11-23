"use client";

import type { CourseInput } from "@academy/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";

import { useAdminCatalog } from "../../hooks/use-admin-catalog";
import { useAdminResource } from "../../hooks/use-admin-resource";
import { AdminStatus } from "./AdminStatus";

export function CourseEditor({ courseId }: { courseId?: string }) {
  const api = useAdminCatalog();
  const router = useRouter();
  const load = useCallback(async () => {
    const [teachers, course] = await Promise.all([api.listTeachers(), courseId ? api.getCourse(courseId) : null]);
    return { teachers, course };
  }, [api, courseId]);
  const { data, setData, busy, error, reload, run } = useAdminResource(load);
  const [notice, setNotice] = useState("");
  const course = data?.course;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const [rupees, fraction = ""] = String(fields.get("price")).split(".");
    const body: CourseInput = {
      name: String(fields.get("name")),
      description: String(fields.get("description")),
      thumbnailUrl: String(fields.get("thumbnailUrl")).trim() || null,
      teacherId: String(fields.get("teacherId")),
      pricePaise: Number(rupees) * 100 + Number(fraction.padEnd(2, "0")),
    };
    setNotice("");
    void run(async () => {
      if (!course) {
        const created = await api.createCourse(body);
        router.replace(`/admin/courses/${created.id}`);
        return;
      }
      const saved = await api.updateCourse(course.id, { ...body, slug: String(fields.get("slug")).trim() });
      setData((previous) => previous && { ...previous, course: saved });
      setNotice("Course saved.");
    });
  }

  function publish() {
    if (!course) return;
    setNotice("");
    void run(async () => {
      const saved = await api.publishCourse(course.id, !course.isPublished);
      setData((previous) => previous && { ...previous, course: saved });
      setNotice(saved.isPublished ? "Course published." : "Course unpublished.");
    });
  }

  return (
    <>
      <Link className="catalog-back" href="/admin/courses">← Courses</Link>
      <div className="admin-heading">
        <h1>{courseId ? "Edit course" : "Create course"}</h1>
        {course && <Link className="button button-secondary" href={`/admin/courses/${course.id}/lectures`}>Manage lectures</Link>}
      </div>
      <AdminStatus error={error} loading={!data} retry={reload} />
      {notice && <p role="status">{notice}</p>}
      {data && <section className="admin-panel admin-editor">
        {data.teachers.length === 0 ? <p><Link className="catalog-back" href="/admin/teachers">Add a teacher</Link> before creating a course.</p> :
          <form className="admin-form" onSubmit={save}>
            <fieldset disabled={busy}>
              <label>Name<input name="name" defaultValue={course?.name} required minLength={3} maxLength={150} /></label>
              {course && <label>Slug<input name="slug" defaultValue={course.slug} required maxLength={180} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>}
              <label>Teacher<select name="teacherId" defaultValue={course?.teacherId ?? ""} required>
                <option value="" disabled>Select a teacher</option>
                {data.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}{teacher.isActive ? "" : " (inactive)"}</option>)}
              </select></label>
              <label>Price (₹)<input name="price" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?"
                defaultValue={course ? (course.pricePaise / 100).toFixed(2) : ""} required /></label>
              <label>Description<textarea name="description" rows={4} defaultValue={course?.description} maxLength={10000} /></label>
              <label>Thumbnail URL<input name="thumbnailUrl" type="url" defaultValue={course?.thumbnailUrl ?? ""} /></label>
              <div className="actions">
                <button className="button button-primary" type="submit">Save course</button>
                {course && <button className="button button-secondary" type="button" onClick={publish}>
                  {course.isPublished ? "Unpublish course" : "Publish course"}
                </button>}
              </div>
            </fieldset>
          </form>}
      </section>}
    </>
  );
}
