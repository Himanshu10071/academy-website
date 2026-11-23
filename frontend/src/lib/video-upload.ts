import { VIDEO_CONTENT_TYPE, type UploadTarget } from "@academy/shared";

export class VideoUploadError extends Error {}

export function readVideoDuration(file: File) {
  if (file.type !== VIDEO_CONTENT_TYPE || file.size === 0) {
    return Promise.reject(new VideoUploadError("Choose a non-empty MP4 video."));
  }

  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const timeout = window.setTimeout(() => finish(), 15_000);

    function finish(duration?: number) {
      window.clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (duration === undefined) reject(new VideoUploadError("Could not read the duration from this MP4 file."));
      else resolve(duration);
    }

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const seconds = video.duration;
      finish(Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined);
    };
    video.onerror = () => finish();
    video.src = url;
  });
}

export function putVideo(target: UploadTarget, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.floor(event.loaded / event.total * 100));
    };
    request.onload = () => {
      // A retry can get 412 when S3 received the first upload but its response was lost.
      if ((request.status >= 200 && request.status < 300) || request.status === 412) resolve();
      else reject(new VideoUploadError("S3 rejected the upload. Check the connection and bucket settings, then retry."));
    };
    request.onerror = () => reject(new VideoUploadError("Could not reach S3. Check the connection and try again."));
    request.onabort = () => reject(new VideoUploadError("The upload was interrupted. Try again."));
    request.open("PUT", target.uploadUrl);
    for (const [name, value] of Object.entries(target.headers)) request.setRequestHeader(name, value);
    request.send(file);
  });
}
