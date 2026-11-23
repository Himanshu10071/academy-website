export function UploadProgress({ progress }: { progress: number | undefined }) {
  if (progress === undefined) return null;
  return <label className="upload-progress">
    Upload progress ({progress}%)
    <progress value={progress} max={100} />
  </label>;
}
