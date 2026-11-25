import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.ts";
import { validate } from "../../middleware/validate.ts";
import { createRefundBody, paymentPageQuery, refundIdParams, refundListQuery, rejectRefundBody } from "./refund.schemas.ts";
import { adminPayments, adminRefunds, approveRefund, rejectRefund, requestRefund, studentRefunds } from "./refund.service.ts";

export const refundRoutes = Router();
export const adminRefundRoutes = Router();
const checkRefundId = validate(refundIdParams, "params");

refundRoutes.post("/refund-requests", authenticate, validate(createRefundBody), async (_request, response) => {
  const { paymentId, reason } = response.locals.validated;
  response.status(201).json(await requestRefund(response.locals.userId, paymentId, reason, response.locals.requestId));
});

refundRoutes.get("/me/refund-requests", authenticate, async (_request, response) => {
  response.json(await studentRefunds(response.locals.userId));
});

adminRefundRoutes.get("/refund-requests", validate(refundListQuery, "query"), async (_request, response) => {
  response.json(await adminRefunds(response.locals.validatedQuery.status));
});

adminRefundRoutes.post("/refund-requests/:id/reject", checkRefundId, validate(rejectRefundBody), async (_request, response) => {
  response.json(await rejectRefund(
    response.locals.validatedParams.id, response.locals.userId, response.locals.validated.adminNote, response.locals.requestId,
  ));
});

adminRefundRoutes.post("/refund-requests/:id/approve", checkRefundId, async (_request, response) => {
  response.json(await approveRefund(response.locals.validatedParams.id, response.locals.userId, response.locals.requestId));
});

adminRefundRoutes.get("/payments", validate(paymentPageQuery, "query"), async (_request, response) => {
  const { page, pageSize } = response.locals.validatedQuery;
  response.json(await adminPayments(page, pageSize));
});
