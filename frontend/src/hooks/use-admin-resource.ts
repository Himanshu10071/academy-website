import { useEffect, useRef, useState } from "react";

import { ApiError } from "../lib/api/client";
import { VideoUploadError } from "../lib/video-upload";

export function useAdminResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const running = useRef(false);

  useEffect(() => {
    let current = true;
    void load().then((value) => {
      if (current) setData(value);
    }).catch((error: unknown) => {
      if (current) setError(message(error, "Could not load the catalog."));
    });
    return () => { current = false; };
  }, [load, revision]);

  function reload() {
    setError("");
    setRevision((value) => value + 1);
  }

  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (error) {
      setError(message(error, "Could not save your change. Please try again."));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return { data, setData, busy, error, reload, run };
}

function message(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof VideoUploadError ? error.message : fallback;
}
