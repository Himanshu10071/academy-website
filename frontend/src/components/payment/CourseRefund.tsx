"use client";

import type { OwnedCourse, StudentRefundRequest } from "@academy/shared";
import Link from "next/link";
import { useEffect, useState } from "react";

import { requestRefund } from "../../lib/api/refunds";
import { refundStatusLabel } from "../../lib/refund-format";
import { RefundNoteDialog } from "./RefundNoteDialog";

export function CourseRefund({ course, token }: { course: OwnedCourse; token: string }) {
  const [dialog, setDialog] = useState(false);
  const [request, setRequest] = useState<StudentRefundRequest>();
  const [elapsedDeadline, markElapsed] = useState<number>();
  const deadline = course.refundEligibleUntil ? Date.parse(course.refundEligibleUntil) : NaN;
  const eligible = course.paymentId !== null && elapsedDeadline !== deadline && Date.now() <= deadline;

  useEffect(() => {
    if (!eligible) return;
    const timeout = setTimeout(() => markElapsed(deadline), Math.max(0, deadline - Date.now() + 1));
    return () => clearTimeout(timeout);
  }, [deadline, eligible]);

  if (request || course.hasOpenRefund) {
    return <p className="refund-card-action" role="status">
      {request ? `Refund ${refundStatusLabel[request.status].toLowerCase()}` : "Refund request open"} ·{" "}
      <Link href="/account/refunds">View refund requests</Link>
    </p>;
  }

  if (!eligible || !course.paymentId) return null;
  const paymentId = course.paymentId;
  return <div className="refund-card-action">
    <button className="button button-secondary" type="button" onClick={() => setDialog(true)}>Request refund</button>
    {dialog && <RefundNoteDialog title="Request a refund" label="Reason" submitLabel="Submit refund request"
      onClose={() => setDialog(false)} onSubmit={async (reason) => setRequest(await requestRefund(token, paymentId, reason))} />}
  </div>;
}
