"use client";

import { VIDEO_CONTENT_TYPE, type AdminDemo } from "@academy/shared";
import { useState, type FormEvent } from "react";

import { useAdminCatalog } from "../../hooks/use-admin-catalog";
import { useAdminResource } from "../../hooks/use-admin-resource";
import { useVideoUpload } from "../../hooks/use-video-upload";
import { formatDuration } from "../../lib/catalog-format";
import { AdminStatus } from "./AdminStatus";
import { UploadProgress } from "./UploadProgress";

export function DemosAdmin() {
  const api = useAdminCatalog();
  const { data, setData, busy, error, reload, run } = useAdminResource(api.listDemos);
  const { upload, progress } = useVideoUpload();
  const [editing, setEditing] = useState<AdminDemo>();
  const [notice, setNotice] = useState("");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const input = {
      name: String(fields.get("name")),
      description: String(fields.get("description")).trim() || null,
      thumbnailUrl: String(fields.get("thumbnailUrl")).trim() || null,
    };

    setNotice("");
    if (editing) {
      void run(async () => {
        const updated = await api.updateDemo(editing.id, { ...input, displayOrder: Number(fields.get("displayOrder")) });
        setData((previous) => previous?.map((demo) => demo.id === updated.id ? updated : demo)
          .sort((left, right) => left.displayOrder - right.displayOrder));
        setEditing(undefined);
        setNotice("Demo saved.");
      });
      return;
    }

    const file = (form.elements.namedItem("video") as HTMLInputElement).files?.[0];
    if (!file) return;
    void run(async () => {
      await upload(file, (duration) => api.startDemoUpload({ ...input, duration, contentType: VIDEO_CONTENT_TYPE }), async () => {});
      form.reset();
      setNotice("Demo uploaded. You can publish it from the list.");
      reload();
    });
  }

  function publish(demo: AdminDemo) {
    setNotice("");
    void run(async () => {
      const saved = await api.publishDemo(demo.id, !demo.isPublished);
      setData((previous) => previous?.map((item) => item.id === saved.id ? saved : item));
      if (editing?.id === saved.id) setEditing(saved);
    });
  }

  return (
    <>
      <h1>Free demos</h1>
      <AdminStatus error={error} loading={!data} retry={reload} />
      {notice && <p role="status">{notice}</p>}
      {data && <div className="admin-grid">
        <section className="admin-panel">
          <h2>{editing ? "Edit demo" : "Upload a demo"}</h2>
          <form key={editing?.id ?? "new"} className="admin-form" onSubmit={save}>
            <fieldset disabled={busy}>
              <label>Name<input name="name" defaultValue={editing?.name} required maxLength={150} /></label>
              <label>Description<textarea name="description" defaultValue={editing?.description ?? ""} rows={3} maxLength={10000} /></label>
              <label>Thumbnail URL<input name="thumbnailUrl" type="url" defaultValue={editing?.thumbnailUrl ?? ""} /></label>
              {editing
                ? <label>Display order<input name="displayOrder" type="number" min={0} max={2_147_483_647} step={1} defaultValue={editing.displayOrder} required /></label>
                : <><label>MP4 video<input name="video" type="file" accept={VIDEO_CONTENT_TYPE} required /></label><UploadProgress progress={progress} /></>}
              <div className="actions">
                <button className="button button-primary" type="submit">{editing ? "Save demo" : "Upload demo"}</button>
                {editing && <button className="button button-secondary" type="button" onClick={() => setEditing(undefined)}>Cancel</button>}
              </div>
            </fieldset>
          </form>
        </section>
        <section className="admin-panel">
          <h2>Demo list</h2>
          {!data.length && <p>No demos yet.</p>}
          <ul className="admin-list">{data.map((demo) => <li key={demo.id}>
            <div><strong>{demo.name}</strong><p>{demo.isPublished ? "Published" : "Draft"} · Order {demo.displayOrder} · {formatDuration(demo.duration)}</p></div>
            <div className="actions">
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => setEditing(demo)}>Edit</button>
              <button className="button button-quiet" type="button" disabled={busy} onClick={() => publish(demo)}>{demo.isPublished ? "Unpublish" : "Publish"}</button>
            </div>
          </li>)}</ul>
        </section>
      </div>}
    </>
  );
}
