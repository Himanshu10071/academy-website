import { ENROLLMENT_STATUS, ERROR_CODE, VIDEO_STATUS } from "@academy/shared";

type AccessInput = {
  profile: { isBlocked: boolean };
  lecture: { courseId: string; status: string; isHidden: boolean };
  enrollment?: { courseId: string; status: string };
};

export function decideLectureAccess({ profile, lecture, enrollment }: AccessInput) {
  if (profile.isBlocked) return { allowed: false, reason: ERROR_CODE.ACCOUNT_BLOCKED } as const;
  if (lecture.status !== VIDEO_STATUS.READY || lecture.isHidden) {
    return { allowed: false, reason: ERROR_CODE.LECTURE_NOT_READY } as const;
  }
  if (enrollment?.courseId !== lecture.courseId || enrollment.status !== ENROLLMENT_STATUS.PAID) {
    return { allowed: false, reason: ERROR_CODE.NOT_ENROLLED } as const;
  }
  return { allowed: true } as const;
}
