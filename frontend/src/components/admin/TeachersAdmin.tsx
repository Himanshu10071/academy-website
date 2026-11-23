"use client";

import type { AdminTeacher, TeacherInput } from "@academy/shared";
import { useState, type FormEvent } from "react";

import { useAdminCatalog } from "../../hooks/use-admin-catalog";
import { useAdminResource } from "../../hooks/use-admin-resource";
import { AdminStatus } from "./AdminStatus";

export function TeachersAdmin() {
  const api = useAdminCatalog();
  const { data, setData, busy, error, reload, run } = useAdminResource(api.listTeachers);
  const [editing, setEditing] = useState<AdminTeacher | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const input: TeacherInput = {
      name: String(fields.get("name")),
      email: String(fields.get("email")).trim() || null,
      phone: String(fields.get("phone")).trim() || null,
      bio: String(fields.get("bio")).trim() || null,
      photoUrl: String(fields.get("photoUrl")).trim() || null,
    };
    void run(async () => {
      const saved = editing ? await api.updateTeacher(editing.id, input) : await api.createTeacher(input);
      setData((previous) => [...(previous ?? []).filter(({ id }) => id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
      form.reset();
    });
  }

  function toggle(teacher: AdminTeacher) {
    void run(async () => {
      const saved = await api.updateTeacher(teacher.id, { isActive: !teacher.isActive });
      setData((previous) => previous?.map((item) => item.id === saved.id ? saved : item));
      if (editing?.id === saved.id) setEditing(saved);
    });
  }

  return (
    <>
      <h1>Teachers</h1>
      <AdminStatus error={error} loading={!data} retry={reload} />
      {data && <div className="admin-grid">
        <section className="admin-panel">
          <h2>{editing ? "Edit teacher" : "Add teacher"}</h2>
          <form key={editing?.id ?? "new"} className="admin-form" onSubmit={save}>
            <fieldset disabled={busy}>
              <label>Name<input name="name" defaultValue={editing?.name} required maxLength={150} /></label>
              <label>Bio<textarea name="bio" defaultValue={editing?.bio ?? ""} rows={3} maxLength={10000} /></label>
              <label>Photo URL<input name="photoUrl" type="url" defaultValue={editing?.photoUrl ?? ""} /></label>
              <label>Email<input name="email" type="email" defaultValue={editing?.email ?? ""} /></label>
              <label>Phone<input name="phone" type="tel" defaultValue={editing?.phone ?? ""} maxLength={40} /></label>
              <div className="actions">
                <button className="button button-primary" type="submit">Save teacher</button>
                {editing && <button className="button button-secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>}
              </div>
            </fieldset>
          </form>
        </section>
        <section className="admin-panel">
          <h2>Teacher list</h2>
          {data.length === 0 && <p>No teachers yet.</p>}
          <ul className="admin-list">{data.map((teacher) => <li key={teacher.id}>
            <div><strong>{teacher.name}</strong><p>{teacher.isActive ? "Active" : "Inactive"}</p></div>
            <div className="actions">
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => setEditing(teacher)}>Edit</button>
              <button className="button button-quiet" type="button" disabled={busy} onClick={() => toggle(teacher)}>
                {teacher.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          </li>)}</ul>
        </section>
      </div>}
    </>
  );
}
