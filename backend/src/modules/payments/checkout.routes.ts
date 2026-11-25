import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate.ts";
import { validate } from "../../middleware/validate.ts";
import { checkout, enrollmentStatus } from "./checkout.service.ts";

export const checkoutRoutes = Router();
const checkId = validate(z.object({ id: z.uuid() }), "params");
const checkEmptyBody = validate(z.strictObject({}).optional(), "body");

checkoutRoutes.post("/courses/:id/checkout", authenticate, checkId, checkEmptyBody, async (_request, response) => {
  response.json(await checkout(response.locals.userId, response.locals.validatedParams.id));
});

checkoutRoutes.get("/courses/:id/enrollment-status", authenticate, checkId, async (_request, response) => {
  response.json(await enrollmentStatus(response.locals.userId, response.locals.validatedParams.id));
});
