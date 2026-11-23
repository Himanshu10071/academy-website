import type { UploadTarget } from "@academy/shared";
import { useRef, useState } from "react";

import { putVideo, readVideoDuration } from "../lib/video-upload";

type PendingUpload = { file: File; duration: number; target: UploadTarget; uploaded: boolean };

export function useVideoUpload() {
  const pending = useRef<PendingUpload>(null);
  const [progress, setProgress] = useState<number>();

  async function upload(
    file: File,
    reserve: (duration: number) => Promise<UploadTarget>,
    complete: (id: string, duration: number) => Promise<void>,
  ) {
    if (pending.current?.file !== file) {
      setProgress(0);
      const duration = await readVideoDuration(file);
      pending.current = { file, duration, target: await reserve(duration), uploaded: false };
    }
    const item = pending.current;
    if (!item.uploaded) {
      setProgress(0);
      await putVideo(item.target, file, setProgress);
      item.uploaded = true;
    }
    setProgress(100);
    await complete(item.target.id, item.duration);
    pending.current = null;
  }

  return { upload, progress };
}
