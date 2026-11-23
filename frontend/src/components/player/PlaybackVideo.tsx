"use client";

import type { PlaybackSource } from "@academy/shared";
import type { ReactNode } from "react";

import { usePlayback } from "../../hooks/use-playback";

export function PlaybackVideo<T extends PlaybackSource>({ label, load, children }: {
  label: string;
  load: (signal: AbortSignal) => Promise<T>;
  children?: (source: T) => ReactNode;
}) {
  const { source, error, refreshing, videoEvents } = usePlayback(load);
  return <>
    <div className={children && source ? "watch-layout" : undefined}>
      <div>
        {source && <video className="playback-video" key={source.url} src={source.url}
          aria-label={label} controls playsInline preload="metadata" {...videoEvents} />}
        {!source && !error && <p role="status">Loading video…</p>}
        {refreshing && <p role="status">Refreshing the playback link…</p>}
        {error && <p className="empty-state" role="alert">{error}</p>}
      </div>
      {source && children?.(source)}
    </div>
  </>;
}
