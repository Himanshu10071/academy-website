import { ENROLLMENT_STATUS, ERROR_CODE, ROLE, VIDEO_STATUS } from "@academy/shared";

type AccessInput = {
  lecture: { courseId: string; status: string; isHidden: boolean };
} & (
  | { purpose: "course"; profile: { isBlocked: boolean }; enrollment?: { courseId: string; status: string } }
  | { purpose: "preview"; profile: { isBlocked: boolean; role: string } }
);

export function decideLectureAccess(input: AccessInput) {
  const { profile, lecture } = input;
  if (profile.isBlocked) return { allowed: false, reason: ERROR_CODE.ACCOUNT_BLOCKED } as const;
  if (input.purpose === "preview" && input.profile.role !== ROLE.ADMIN) {
    return { allowed: false, reason: ERROR_CODE.FORBIDDEN } as const;
  }
  if (lecture.status !== VIDEO_STATUS.READY || (input.purpose === "course" && lecture.isHidden)) {
    return { allowed: false, reason: ERROR_CODE.LECTURE_NOT_READY } as const;
  }
  if (input.purpose === "course") {
    const { enrollment } = input;
    if (enrollment?.courseId !== lecture.courseId || enrollment.status !== ENROLLMENT_STATUS.PAID) {
      return { allowed: false, reason: ERROR_CODE.NOT_ENROLLED } as const;
    }
  }
  return { allowed: true } as const;
}
