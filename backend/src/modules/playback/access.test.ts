import { ENROLLMENT_STATUS, ERROR_CODE, ROLE, VIDEO_STATUS } from "@academy/shared";
import { expect, it } from "vitest";

import { decideLectureAccess } from "./access.ts";

const combinations = [false, true].flatMap((blocked) =>
  [false, true].flatMap((ready) => [false, true].flatMap((hidden) =>
    [undefined, ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.PAID, ENROLLMENT_STATUS.REVOKED]
      .map((status) => ({ blocked, ready, hidden, status })),
  )),
);

it.each(combinations)("access with blocked=$blocked ready=$ready hidden=$hidden enrollment=$status", ({ blocked, ready, hidden, status }) => {
  const decision = decideLectureAccess({
    purpose: "course",
    profile: { isBlocked: blocked },
    lecture: { courseId: "course-a", status: ready ? VIDEO_STATUS.READY : VIDEO_STATUS.UPLOADED, isHidden: hidden },
    enrollment: status && { courseId: "course-a", status },
  });
  if (blocked) expect(decision).toEqual({ allowed: false, reason: ERROR_CODE.ACCOUNT_BLOCKED });
  else if (!ready || hidden) expect(decision).toEqual({ allowed: false, reason: ERROR_CODE.LECTURE_NOT_READY });
  else if (status !== ENROLLMENT_STATUS.PAID) expect(decision).toEqual({ allowed: false, reason: ERROR_CODE.NOT_ENROLLED });
  else expect(decision).toEqual({ allowed: true });
});

it("rejects a paid enrollment for a different course", () => {
  expect(decideLectureAccess({
    purpose: "course",
    profile: { isBlocked: false },
    lecture: { courseId: "course-b", status: VIDEO_STATUS.READY, isHidden: false },
    enrollment: { courseId: "course-a", status: ENROLLMENT_STATUS.PAID },
  })).toEqual({ allowed: false, reason: ERROR_CODE.NOT_ENROLLED });
});

it.each([
  { role: ROLE.ADMIN, isBlocked: false, status: VIDEO_STATUS.READY, hidden: false },
  { role: ROLE.ADMIN, isBlocked: false, status: VIDEO_STATUS.READY, hidden: true },
])("lets an unblocked admin preview a ready lecture with hidden=$hidden", ({ role, isBlocked, status, hidden }) => {
  expect(decideLectureAccess({
    purpose: "preview",
    profile: { role, isBlocked },
    lecture: { courseId: "course-a", status, isHidden: hidden },
  })).toEqual({ allowed: true });
});

it.each([
  { role: ROLE.STUDENT, isBlocked: false, status: VIDEO_STATUS.READY, reason: ERROR_CODE.FORBIDDEN },
  { role: ROLE.ADMIN, isBlocked: true, status: VIDEO_STATUS.READY, reason: ERROR_CODE.ACCOUNT_BLOCKED },
  { role: ROLE.ADMIN, isBlocked: false, status: VIDEO_STATUS.UPLOADED, reason: ERROR_CODE.LECTURE_NOT_READY },
  { role: ROLE.ADMIN, isBlocked: false, status: VIDEO_STATUS.PROCESSING, reason: ERROR_CODE.LECTURE_NOT_READY },
])("denies preview with role=$role blocked=$isBlocked status=$status", ({ role, isBlocked, status, reason }) => {
  expect(decideLectureAccess({
    purpose: "preview",
    profile: { role, isBlocked },
    lecture: { courseId: "course-a", status, isHidden: false },
  })).toEqual({ allowed: false, reason });
});
