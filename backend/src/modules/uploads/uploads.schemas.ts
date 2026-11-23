import { VIDEO_CONTENT_TYPE } from "@academy/shared";
import { z } from "zod";

const name = z.string().trim().min(1).max(150);
const duration = z.number().int().min(0).max(2_147_483_647);
const contentType = z.literal(VIDEO_CONTENT_TYPE);

export const lectureIdParams = z.object({ id: z.uuid() });
export const createLectureUploadSchema = z.strictObject({ courseId: z.uuid(), name, contentType });
export const createDemoUploadSchema = z.strictObject({
  name, contentType, duration,
  description: z.string().trim().max(10_000).nullable(),
  thumbnailUrl: z.url({ protocol: /^https?$/ }).max(2048).nullable(),
});
export const confirmLectureUploadSchema = z.strictObject({ duration });
