import { Router } from "express";

import { validate } from "../../middleware/validate.ts";
import {
  createCourseSchema, createTeacherSchema, idParams, orderLecturesSchema, publicationSchema, slugParams,
  updateCourseSchema, updateDemoSchema, updateLectureSchema, updateTeacherSchema,
} from "./catalog.schemas.ts";
import * as catalog from "./catalog.service.ts";

export const publicCatalogRoutes = Router();
publicCatalogRoutes.get("/courses", async (_request, response) => {
  response.json(await catalog.listPublicCourses());
});
publicCatalogRoutes.get("/courses/:slug", validate(slugParams, "params"), async (_request, response) => {
  response.json(await catalog.getPublicCourse(response.locals.validatedParams.slug));
});
publicCatalogRoutes.get("/demos", async (_request, response) => {
  response.json(await catalog.listPublicDemos());
});

export const adminCatalogRoutes = Router();
const validateId = validate(idParams, "params");

adminCatalogRoutes.get("/teachers", async (_request, response) => {
  response.json(await catalog.listTeachers());
});
adminCatalogRoutes.post("/teachers", validate(createTeacherSchema), async (_request, response) => {
  response.status(201).json(await catalog.createTeacher(response.locals.validated));
});
adminCatalogRoutes.patch("/teachers/:id", validateId, validate(updateTeacherSchema), async (_request, response) => {
  response.json(await catalog.updateTeacher(response.locals.validatedParams.id, response.locals.validated));
});

adminCatalogRoutes.get("/courses", async (_request, response) => {
  response.json(await catalog.listAdminCourses());
});
adminCatalogRoutes.post("/courses", validate(createCourseSchema), async (_request, response) => {
  response.status(201).json(await catalog.createCourse(response.locals.validated));
});
adminCatalogRoutes.get("/courses/:id", validateId, async (_request, response) => {
  response.json(await catalog.getAdminCourse(response.locals.validatedParams.id));
});
adminCatalogRoutes.patch("/courses/:id", validateId, validate(updateCourseSchema), async (_request, response) => {
  response.json(await catalog.updateCourse(response.locals.validatedParams.id, response.locals.validated));
});
adminCatalogRoutes.patch("/courses/:id/publication", validateId, validate(publicationSchema), async (_request, response) => {
  response.json(await catalog.publishCourse(response.locals.validatedParams.id, response.locals.validated.isPublished));
});

adminCatalogRoutes.get("/courses/:id/lectures", validateId, async (_request, response) => {
  response.json(await catalog.listLectures(response.locals.validatedParams.id));
});
adminCatalogRoutes.put("/courses/:id/lectures/order", validateId, validate(orderLecturesSchema), async (_request, response) => {
  response.json(await catalog.setLectureOrder(response.locals.validatedParams.id, response.locals.validated.lectureIds));
});
adminCatalogRoutes.patch("/lectures/:id", validateId, validate(updateLectureSchema), async (_request, response) => {
  response.json(await catalog.updateLecture(response.locals.validatedParams.id, response.locals.validated));
});

adminCatalogRoutes.get("/demos", async (_request, response) => {
  response.json(await catalog.listAdminDemos());
});
adminCatalogRoutes.patch("/demos/:id", validateId, validate(updateDemoSchema), async (_request, response) => {
  response.json(await catalog.updateDemo(response.locals.validatedParams.id, response.locals.validated));
});
adminCatalogRoutes.patch("/demos/:id/publication", validateId, validate(publicationSchema), async (_request, response) => {
  response.json(await catalog.publishDemo(response.locals.validatedParams.id, response.locals.validated.isPublished));
});
