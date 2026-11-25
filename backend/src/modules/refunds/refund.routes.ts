import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.ts";
import { validate } from "../../middleware/validate.ts";
import { createRefundBody } from "./refund.schemas.ts";
import { requestRefund, studentRefunds } from "./refund.service.ts";

export const refundRoutes = Router();

refundRoutes.post("/refund-requests", authenticate, validate(createRefundBody), async (_request, response) => {
  const { paymentId, reason } = response.locals.validated;
  response.status(201).json(await requestRefund(response.locals.userId, paymentId, reason, response.locals.requestId));
});

refundRoutes.get("/me/refund-requests", authenticate, async (_request, response) => {
  response.json(await studentRefunds(response.locals.userId));
});
