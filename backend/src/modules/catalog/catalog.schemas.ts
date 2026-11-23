import { z } from "zod";

const name = z.string().trim().min(1).max(150);
const slug = z.string().max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const description = z.string().trim().max(10_000);
const url = z.url({ protocol: /^https?$/ }).max(2048).nullable();
const teacherFields = z.strictObject({
  name,
  bio: description.nullable().default(null),
  photoUrl: url.default(null),
  email: z.email().max(254).nullable().default(null),
  phone: z.string().trim().min(1).max(40).nullable().default(null),
});
const courseFields = z.strictObject({
  name: name.min(3),
  description,
  thumbnailUrl: url,
  pricePaise: z.number().int().positive().max(2_147_483_647),
  teacherId: z.uuid(),
});

function isNonempty(value: object) {
  return Object.keys(value).length > 0;
}

export const idParams = z.object({ id: z.uuid() });
export const slugParams = z.object({ slug });
export const createTeacherSchema = teacherFields;
export const updateTeacherSchema = z.strictObject({
  name: name.optional(),
  bio: description.nullable().optional(),
  photoUrl: url.optional(),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().trim().min(1).max(40).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine(isNonempty);
export const createCourseSchema = courseFields;
export const updateCourseSchema = courseFields.extend({ slug }).partial().refine(isNonempty);
export const publicationSchema = z.strictObject({ isPublished: z.boolean() });
export const updateLectureSchema = z.strictObject({
  name: name.optional(), isHidden: z.boolean().optional(),
}).refine(isNonempty);
export const orderLecturesSchema = z.strictObject({
  lectureIds: z.array(z.uuid()).refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length),
});
export const updateDemoSchema = z.strictObject({
  name: name.optional(),
  description: description.nullable().optional(),
  thumbnailUrl: url.optional(),
  displayOrder: z.number().int().min(0).max(2_147_483_647).optional(),
}).refine(isNonempty);
