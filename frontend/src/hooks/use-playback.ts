import type { PlaybackSource } from "@academy/shared";
import { useEffect, useEffectEvent, useRef, useState, type SyntheticEvent } from "react";

import { playbackError } from "../lib/errors";

export function usePlayback<T extends PlaybackSource>(load: (signal: AbortSignal) => Promise<T>) {
  const [source, setSource] = useState<T>();
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef<AbortController>(null);
  const attemptedSource = useRef<string | null>(null);
  const resume = useRef<{ time: number; playing: boolean }>(null);
  const position = useRef(0);
  const playing = useRef(false);

  const start = useEffectEvent((signal: AbortSignal) => {
    void load(signal).then((result) => {
      if (!signal.aborted) setSource(result);
    }).catch((failure: unknown) => {
      if (!signal.aborted) setError(playbackError(failure));
    });
  });

  useEffect(() => {
    const controller = new AbortController();
    start(controller.signal);
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  async function onError(event: SyntheticEvent<HTMLVideoElement>) {
    if (!source || request.current) return;
    const expiration = Date.parse(source.expiresAt);
    if (!Number.isFinite(expiration) || Date.now() < expiration || attemptedSource.current === source.url) {
      setError("The video could not play. Reload the page and try again.");
      return;
    }

    attemptedSource.current = source.url;
    const video = event.currentTarget;
    resume.current = { time: video.currentTime || position.current, playing: playing.current || !video.paused };
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setError("");
    try {
      const renewed = await load(controller.signal);
      if (controller.signal.aborted) return;
      if (renewed.url === source.url || Date.parse(renewed.expiresAt) <= Date.now()) {
        setError("The playback link has expired. Reload the page and try again.");
      } else {
        setSource(renewed);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(playbackError(failure));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }

  function onLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    if (!resume.current) return;
    const video = event.currentTarget;
    const previous = resume.current;
    resume.current = null;
    video.currentTime = Math.min(previous.time, video.duration || previous.time);
    if (previous.playing) void video.play().catch(() => {});
  }

  return {
    source, error, refreshing,
    videoEvents: {
      onError, onLoadedMetadata,
      onPlay: () => { playing.current = true; },
      onPause: () => { playing.current = false; },
      onTimeUpdate: (event: SyntheticEvent<HTMLVideoElement>) => {
        position.current = event.currentTarget.currentTime;
      },
    },
  };
}
