import type { AdminLecture, UploadTarget } from "@academy/shared";

import type { ConfirmedLectureRow } from "./uploads.repository.ts";

export function mapUpload(id: string, uploadUrl: string, headers: UploadTarget["headers"]): UploadTarget {
  return { id, uploadUrl, headers };
}

export function mapConfirmation(row: ConfirmedLectureRow): AdminLecture {
  return {
    id: row.id, name: row.lecture_name, lectureNumber: row.lecture_number, duration: row.duration,
    videoStatus: row.video_status, isHidden: row.is_hidden,
  };
}
