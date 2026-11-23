"use client";

import { useEffect, useRef, useState } from "react";

import { getDemoPlayback } from "../../lib/api/playback";
import { PlaybackVideo } from "./PlaybackVideo";

export function PlayDemo({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [open]);

  return <>
    <button className="button button-secondary" type="button" onClick={() => setOpen(true)} aria-label={`Play demo: ${name}`}>Play demo</button>
    {open && <dialog className="profile-dialog demo-dialog" ref={dialog}
      aria-label={name} onCancel={() => setOpen(false)}>
      <div className="admin-heading">
        <h2>{name}</h2>
        <button className="button button-quiet" type="button" onClick={() => setOpen(false)}>Close</button>
      </div>
      <PlaybackVideo label={`${name} video`} load={(signal) => getDemoPlayback(id, signal)} />
    </dialog>}
  </>;
}
