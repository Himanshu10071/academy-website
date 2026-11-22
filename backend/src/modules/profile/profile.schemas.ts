import { z } from "zod";

export const updateProfileSchema = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().regex(/^(?:\+91)?[6-9]\d{9}$/).optional(),
}).refine(({ name, phone }) => name !== undefined || phone !== undefined);
