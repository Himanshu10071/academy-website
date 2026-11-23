"use client";

import { VIDEO_CONTENT_TYPE, VIDEO_STATUS, type AdminLecture } from "@academy/shared";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";

import { useAdminCatalog } from "../../hooks/use-admin-catalog";
import { useAdminResource } from "../../hooks/use-admin-resource";
import { useVideoUpload } from "../../hooks/use-video-upload";
import { formatDuration } from "../../lib/catalog-format";
import { AdminStatus } from "./AdminStatus";
import { UploadProgress } from "./UploadProgress";

export function LecturesAdmin({ courseId }: { courseId: string }) {
  const api = useAdminCatalog();
  const load = useCallback(async () => {
    const [course, lectures] = await Promise.all([api.getCourse(courseId), api.listLectures(courseId)]);
    return { course, lectures };
  }, [api, courseId]);
  const { data, setData, busy, error, reload, run } = useAdminResource(load);
  const { upload, progress } = useVideoUpload();
  const [editing, setEditing] = useState<AdminLecture>();
  const [notice, setNotice] = useState("");
  const lectures = data?.lectures;

  function uploadLecture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("video") as HTMLInputElement).files?.[0];
    if (!file) return;
    const name = String(new FormData(form).get("name"));

    setNotice("");
    void run(async () => {
      await upload(file, () => api.startLectureUpload({ courseId, name, contentType: VIDEO_CONTENT_TYPE }), async (id, duration) => {
        const lecture = await api.confirmLectureUpload(id, duration);
        setData((previous) => previous && {
          ...previous,
          lectures: [...previous.lectures.filter((item) => item.id !== lecture.id), lecture]
            .sort((left, right) => left.lectureNumber - right.lectureNumber),
        });
      });
      form.reset();
      setNotice("Lecture uploaded and ready.");
    });
  }

  function saveLecture(lecture: AdminLecture, updates: { name?: string; isHidden?: boolean }) {
    setNotice("");
    void run(async () => {
      const saved = await api.updateLecture(lecture.id, updates);
      setData((previous) => previous && { ...previous, lectures: previous.lectures.map((item) => item.id === saved.id ? saved : item) });
      setEditing(undefined);
    });
  }

  function move(index: number, direction: -1 | 1) {
    if (!lectures) return;
    const ids = lectures.map((item) => item.id);
    const position = index + direction;
    if (position < 0 || position >= ids.length) return;
    [ids[index], ids[position]] = [ids[position], ids[index]];

    setNotice("");
    void run(async () => {
      const ordered = await api.orderLectures(courseId, ids);
      setData((previous) => previous && { ...previous, lectures: ordered });
    });
  }

  return (
    <>
      <Link className="catalog-back" href={`/admin/courses/${courseId}`}>← Edit course</Link>
      <h1>{data ? `${data.course.name} lectures` : "Lectures"}</h1>
      <AdminStatus error={error} loading={!data} retry={reload} />
      {notice && <p role="status">{notice}</p>}
      {data && <div className="admin-grid">
        <section className="admin-panel">
          <h2>Upload a lecture</h2>
          <form className="admin-form" onSubmit={uploadLecture}>
            <fieldset disabled={busy}>
              <label>Lecture name<input name="name" required maxLength={150} /></label>
              <label>MP4 video<input name="video" type="file" accept={VIDEO_CONTENT_TYPE} required /></label>
              <UploadProgress progress={progress} />
              <button className="button button-primary" type="submit">{busy ? "Working…" : "Upload lecture"}</button>
            </fieldset>
          </form>
        </section>
        <section className="admin-panel">
          <h2>Lecture order</h2>
          {!data.lectures.length && <p>No lectures yet.</p>}
          <ol className="admin-list">{data.lectures.map((lecture, index) => <li key={lecture.id}>
            <div>
              <strong>{lecture.lectureNumber}. {lecture.name}</strong>
              <p>{lecture.isHidden ? "Hidden" : "Visible"} · {lecture.videoStatus === VIDEO_STATUS.READY ? formatDuration(lecture.duration) : lecture.videoStatus}</p>
            </div>
            {editing?.id === lecture.id
              ? <form className="actions" onSubmit={(event) => {
                event.preventDefault();
                saveLecture(lecture, { name: String(new FormData(event.currentTarget).get("name")) });
              }}>
                <label>Lecture name<input name="name" defaultValue={lecture.name} required maxLength={150} /></label>
                <button className="button button-primary" type="submit" disabled={busy}>Save</button>
                <button className="button button-secondary" type="button" disabled={busy} onClick={() => setEditing(undefined)}>Cancel</button>
              </form>
              : <div className="actions">
                <button className="button button-secondary" type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${lecture.name} up`}>↑</button>
                <button className="button button-secondary" type="button" disabled={busy || index === data.lectures.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${lecture.name} down`}>↓</button>
                <button className="button button-secondary" type="button" disabled={busy} onClick={() => setEditing(lecture)}>Rename</button>
                <button className="button button-quiet" type="button" disabled={busy}
                  onClick={() => saveLecture(lecture, { isHidden: !lecture.isHidden })}>{lecture.isHidden ? "Unhide" : "Hide"}</button>
              </div>}
          </li>)}</ol>
        </section>
      </div>}
    </>
  );
}
