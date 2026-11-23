import type { Profile } from "@academy/shared";
import { Router } from "express";

import { validate } from "../../middleware/validate.ts";
import { confirmLectureUploadSchema, createDemoUploadSchema, createLectureUploadSchema, lectureIdParams } from "./uploads.schemas.ts";
import * as uploads from "./uploads.service.ts";

export const uploadRoutes = Router();

uploadRoutes.post("/lectures/upload-url", validate(createLectureUploadSchema), async (_request, response) => {
  const { id }: Profile = response.locals.profile;
  response.status(201).json(await uploads.createLectureUpload(id, response.locals.validated));
});
uploadRoutes.post("/lectures/:id/confirm-upload", validate(lectureIdParams, "params"), validate(confirmLectureUploadSchema), async (_request, response) => {
  response.json(await uploads.confirmLectureUpload(response.locals.validatedParams.id, response.locals.validated.duration));
});
uploadRoutes.post("/demos/upload-url", validate(createDemoUploadSchema), async (_request, response) => {
  const { id }: Profile = response.locals.profile;
  response.status(201).json(await uploads.createDemoUpload(id, response.locals.validated));
});
