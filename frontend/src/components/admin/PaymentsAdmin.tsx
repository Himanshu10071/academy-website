"use client";

import { REFUND_STATUS, type AdminPaymentPage, type AdminRefundRequest, type RefundStatus } from "@academy/shared";
import { useCallback, useState } from "react";

import { useAdminResource } from "../../hooks/use-admin-resource";
import { approveRefund, listAdminPayments, listAdminRefunds, rejectRefund } from "../../lib/api/refunds";
import { formatPrice } from "../../lib/catalog-format";
import { refundError } from "../../lib/errors";
import { formatPaymentDate, refundStatusLabel } from "../../lib/refund-format";
import { useAccount } from "../layout/AccountProvider";
import { RefundNoteDialog } from "../payment/RefundNoteDialog";
import { AdminStatus } from "./AdminStatus";

type View = "payments" | "refunds";
type Data = { view: "payments"; payments: AdminPaymentPage } | { view: "refunds"; refunds: AdminRefundRequest[] };

function PaymentTable({ payments, onPage }: { payments: AdminPaymentPage; onPage: (page: number) => void }) {
  if (!payments.items.length && payments.page === 1) return <p className="empty-state">No payments yet.</p>;
  return <section aria-label="All payments">
    <div className="admin-panel payment-table">
      <table>
        <thead><tr><th>Student</th><th>Course</th><th>Amount</th><th>Status</th><th>Paid at</th><th>Payment ID</th></tr></thead>
        <tbody>{payments.items.map((item) => <tr key={item.id}>
          <td>{item.studentName}</td><td>{item.courseName}</td><td>{formatPrice(item.amountPaise)}</td>
          <td className="payment-status">{item.status}</td><td>{item.paidAt ? formatPaymentDate(item.paidAt) : "—"}</td>
          <td>{item.id}</td>
        </tr>)}</tbody>
      </table>
      {!payments.items.length && <p>No payments on this page.</p>}
    </div>
    <div className="actions payment-pagination">
      <button className="button button-secondary" type="button" disabled={payments.page <= 1}
        onClick={() => onPage(payments.page - 1)}>Previous</button>
      <span>Page {payments.page}</span>
      <button className="button button-secondary" type="button" disabled={!payments.hasMore}
        onClick={() => onPage(payments.page + 1)}>Next</button>
    </div>
  </section>;
}

function RefundQueue({ requests, busy, onApprove, onReject }: {
  requests: AdminRefundRequest[];
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (refund: AdminRefundRequest) => void;
}) {
  if (!requests.length) return <p className="empty-state">No refund requests match this filter.</p>;
  return <section className="admin-panel" aria-label="Refund queue">
    <ul className="admin-list">{requests.map((refund) => <li key={refund.id}>
      <div>
        <strong>{refund.courseName}</strong>
        <p>{refund.studentName} · {refund.studentEmail}</p>
        <p>{formatPrice(refund.amountPaise)} · {refundStatusLabel[refund.status]} · {formatPaymentDate(refund.requestedAt)}</p>
        <p>Payment ID {refund.paymentId}</p>
        <p>{refund.reason}</p>
        {refund.adminNote && <p><strong>Admin note</strong> {refund.adminNote}</p>}
      </div>
      <div className="actions">
        {refund.status === REFUND_STATUS.REQUESTED && <>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => onApprove(refund.id)}>Approve</button>
          <button className="button button-secondary" type="button" disabled={busy} onClick={() => onReject(refund)}>Reject</button>
        </>}
        {refund.status === REFUND_STATUS.FAILED &&
          <button className="button button-primary" type="button" disabled={busy} onClick={() => onApprove(refund.id)}>Retry</button>}
      </div>
    </li>)}</ul>
  </section>;
}

export function PaymentsAdmin({ initialView }: { initialView: View }) {
  const { token } = useAccount();
  const [view, setView] = useState<View>(initialView);
  const [status, setStatus] = useState<RefundStatus | "">("");
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<AdminRefundRequest>();
  const [actionError, setActionError] = useState("");
  const load = useCallback(async (): Promise<Data> => {
    if (!token) throw new Error("An authenticated admin session is required.");
    if (view === "payments") return { view, payments: await listAdminPayments(token, page) };
    return { view, refunds: await listAdminRefunds(token, status || undefined) };
  }, [page, status, token, view]);
  const { data, setData, busy, error, reload, run } = useAdminResource(load);
  const controlsDisabled = busy || Boolean(rejecting);

  function clearList() {
    setActionError("");
    setData(undefined);
    reload();
  }

  function approve(id: string) {
    if (!token) return;
    setActionError("");
    void run(async () => {
      try {
        await approveRefund(token, id);
      } catch (failure) {
        setActionError(refundError(failure, "Could not approve the refund. Please try again."));
      } finally {
        setData(undefined);
        reload();
      }
    });
  }

  return <>
    <div className="admin-heading">
      <h1>Payments</h1>
      <div className="actions payment-filters">
        <label>View <select value={view} disabled={controlsDisabled} onChange={(event) => {
          setView(event.target.value === "refunds" ? "refunds" : "payments");
          clearList();
        }}>
          <option value="payments">All payments</option>
          <option value="refunds">Refunds</option>
        </select></label>
        {view === "refunds" && <label>Refund status <select value={status} disabled={controlsDisabled} onChange={(event) => {
          setStatus(event.target.value as RefundStatus | "");
          clearList();
        }}>
          <option value="">All statuses</option>
          {Object.values(REFUND_STATUS).map((value) => <option value={value} key={value}>{refundStatusLabel[value]}</option>)}
        </select></label>}
      </div>
    </div>
    {actionError && <p role="alert" className="admin-feedback">{actionError}</p>}
    <AdminStatus error={error} loading={!data} retry={reload} />
    {data?.view === "payments" && <PaymentTable payments={data.payments} onPage={(value) => {
      setPage(value);
      clearList();
    }} />}
    {data?.view === "refunds" && <RefundQueue requests={data.refunds} busy={controlsDisabled} onApprove={approve} onReject={setRejecting} />}
    {rejecting && token && <RefundNoteDialog title="Reject refund" label="Admin note" submitLabel="Reject refund"
      onClose={() => setRejecting(undefined)} onSubmit={async (note) => {
        await rejectRefund(token, rejecting.id, note);
        clearList();
      }} />}
  </>;
}
