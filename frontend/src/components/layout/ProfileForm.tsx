"use client";

import type { Profile, UpdateProfile } from "@academy/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { profileError } from "../../lib/errors";

type Props = {
  mode: "phone" | "edit";
  profile: Profile;
  save: (updates: UpdateProfile, signal: AbortSignal) => Promise<void>;
  close: () => void;
};

export function ProfileForm({ mode, profile, save, close }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const storedPhone = profile.phone?.trim() ?? "";

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      request.current?.abort();
      element?.close();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const fields = new FormData(event.currentTarget);
    const phone = String(fields.get("phone") ?? "").trim();
    const name = String(fields.get("name") ?? "").trim();
    const updates: UpdateProfile = mode === "phone" ? { phone } : { name };
    if (mode === "edit" && phone !== storedPhone) updates.phone = phone;

    const controller = new AbortController();
    request.current = controller;
    setError("");
    setSaving(true);
    try {
      await save(updates, controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted) setError(profileError(failure, "Could not save your profile. Please try again."));
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return (
    <dialog className="profile-dialog" ref={dialog} onCancel={close} aria-labelledby="profile-title">
      <form onSubmit={submit}>
        <h2 id="profile-title">{mode === "phone" ? "Add your phone number" : "Edit profile"}</h2>
        {mode === "edit" && <label>Name<input name="name" autoComplete="name" defaultValue={profile.name} required maxLength={100} /></label>}
        <label>
          Phone number
          <input name="phone" type="tel" autoComplete="tel" defaultValue={storedPhone}
            placeholder="+919876543210" required={mode === "phone" || Boolean(storedPhone)}
            aria-describedby="phone-hint" />
        </label>
        <p id="phone-hint">Enter 10 digits, with an optional +91 prefix and no spaces.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
          <button className="button button-secondary" type="button" onClick={close}>Cancel</button>
        </div>
      </form>
    </dialog>
  );
}
