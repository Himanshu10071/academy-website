import { ERROR_CODE } from "@academy/shared";
import { expect, it, vi } from "vitest";

import { publishCourse } from "./catalog.service.ts";

const { lockCourse, hasVisibleReadyLecture, setCoursePublication } = vi.hoisted(() => ({
  lockCourse: vi.fn(),
  hasVisibleReadyLecture: vi.fn(),
  setCoursePublication: vi.fn(),
}));

vi.mock("../../lib/db.ts", () => ({ withTransaction: (work: (client: object) => unknown) => work({}) }));
vi.mock("../../lib/s3.ts", () => ({ videoObjectExists: vi.fn() }));
vi.mock("./catalog.repository.ts", () => ({ lockCourse, hasVisibleReadyLecture, setCoursePublication }));

it("rejects publishing a course without a teacher, even though the current schema requires one", async () => {
  lockCourse.mockResolvedValue({ teacher_id: null, description: "Description", thumbnail_url: "https://example.test/cover.jpg" });
  await expect(publishCourse("course-id", true)).rejects.toMatchObject({
    status: 409, code: ERROR_CODE.COURSE_NOT_PUBLISHABLE,
  });
  expect(hasVisibleReadyLecture).not.toHaveBeenCalled();
  expect(setCoursePublication).not.toHaveBeenCalled();
});
