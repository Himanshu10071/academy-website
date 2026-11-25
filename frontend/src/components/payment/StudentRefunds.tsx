"use client";

import type { StudentRefundRequest } from "@academy/shared";
import Link from "next/link";
import { useEffect, useState } from "react";

import { listMyRefunds } from "../../lib/api/refunds";
import { formatPaymentDate, refundStatusLabel } from "../../lib/refund-format";
import { GoogleSignIn } from "../layout/AcademyHeader";
import { useAccount } from "../layout/AccountProvider";

function RefundHistory({ token }: { token: string }) {
  const [requests, setRequests] = useState<StudentRefundRequest[]>();
  const [failed, setFailed] = useState(false);
  const [check, setCheck] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void listMyRefunds(token, controller.signal).then((data) => {
      if (!controller.signal.aborted) setRequests(data);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [token, check]);

  if (failed) return <div>
    <p role="alert">Could not load your refund requests.</p>
    <button className="button button-secondary" type="button" onClick={() => {
      setFailed(false);
      setCheck((value) => value + 1);
    }}>Try again</button>
  </div>;
  if (!requests) return <p role="status">Loading refund requests…</p>;
  if (!requests.length) return <p className="empty-state">You haven’t requested any refunds.</p>;

  return <ul className="admin-list admin-panel">
    {requests.map((request) => <li key={request.id}>
      <div>
        <strong>{request.courseName}</strong>
        <p>{formatPaymentDate(request.requestedAt)} · {refundStatusLabel[request.status]}</p>
        <p>{request.reason}</p>
        {request.adminNote && <p><strong>Admin note</strong> {request.adminNote}</p>}
      </div>
    </li>)}
  </ul>;
}

export function StudentRefunds() {
  const { token, ready, accountError } = useAccount();
  return <main className="container sections">
    <section aria-labelledby="refund-history-heading">
      <Link className="catalog-back" href="/my-courses">← My Courses</Link>
      <h1 id="refund-history-heading">Refund requests</h1>
      {!ready && <p role="status">{accountError || "Checking your account…"}</p>}
      {ready && !token && <div className="empty-state">
        <p>Sign in to see your refund requests.</p><GoogleSignIn primary />
      </div>}
      {token && <RefundHistory key={token} token={token} />}
    </section>
  </main>;
}
