"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { refundError } from "../../lib/errors";

export function RefundNoteDialog({ title, label, submitLabel, onSubmit, onClose }: {
  title: string;
  label: string;
  submitLabel: string;
  onSubmit: (note: string) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    if (!note) {
      setError(`Enter the ${label.toLowerCase()}.`);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onSubmit(note);
      onClose();
    } catch (error) {
      setError(refundError(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="profile-dialog refund-dialog" aria-labelledby={titleId} onCancel={(event) => {
    event.preventDefault();
    if (!submitting.current) onClose();
  }}>
    <form onSubmit={submit}>
      <h2 id={titleId}>{title}</h2>
      <label>{label}<textarea name="note" rows={4} maxLength={1_000} required disabled={busy} /></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="actions">
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        <button className="button button-secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </form>
  </dialog>;
}
