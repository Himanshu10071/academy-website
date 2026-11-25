import { Router, type RequestHandler } from "express";

import { logger } from "../../lib/logger.ts";
import { authenticate, authenticateIdentity } from "../../middleware/authenticate.ts";
import { validate } from "../../middleware/validate.ts";
import { playbackIdParams } from "./playback.schemas.ts";
import { listEnrollments, playDemo, playLecture, previewLecture } from "./playback.service.ts";

export const playbackRoutes = Router();
export const adminPlaybackRoutes = Router();
const validateId = validate(playbackIdParams, "params");

const logLecturePlayback: RequestHandler = (request, response, next) => {
  const lectureId = playbackIdParams.safeParse(request.params).data?.id ?? "unknown";
  response.on("finish", () => {
    const { requestId, userId, errorCode } = response.locals;
    const ids = `requestId=${requestId} userId=${userId ?? "anonymous"} lectureId=${lectureId}`;
    if (response.statusCode < 400) logger.info(`Playback granted ${ids}`);
    else logger.error(`Playback denied ${ids} code=${errorCode ?? response.statusCode}`);
  });
  next();
};

playbackRoutes.post("/lectures/:id/playback", logLecturePlayback, authenticateIdentity, validateId, async (_request, response) => {
  response.json(await playLecture(response.locals.userId, response.locals.validatedParams.id));
});

adminPlaybackRoutes.post("/lectures/:id/preview", logLecturePlayback, validateId, async (_request, response) => {
  response.json(await previewLecture(response.locals.userId, response.locals.validatedParams.id));
});

playbackRoutes.post("/demos/:id/playback", validateId, async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json(await playDemo(response.locals.validatedParams.id));
});

playbackRoutes.get("/me/enrollments", authenticate, async (_request, response) => {
  response.json(await listEnrollments(response.locals.userId));
});
