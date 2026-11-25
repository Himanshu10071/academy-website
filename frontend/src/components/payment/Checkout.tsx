"use client";

import { ROLE, type Profile, type PublicCourse } from "@academy/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createCheckoutOrder } from "../../lib/api/payments";
import { formatPrice } from "../../lib/catalog-format";
import { checkoutError } from "../../lib/errors";
import { loadRazorpay, type RazorpayCheckout } from "../../lib/razorpay-checkout";
import { useAccount } from "../layout/AccountProvider";

type Course = Pick<PublicCourse, "id" | "slug" | "name" | "pricePaise">;
type Attempt = { controller: AbortController; widget?: RazorpayCheckout };
type CheckoutState = "ready" | "opening" | "open" | "cancelled" | "failed" | "confirming";

function CheckoutButton({ course, profile, token, publicKey }: {
  course: Course; profile: Profile; token: string; publicKey: string;
}) {
  const router = useRouter();
  const current = useRef<Attempt>(undefined);
  const [state, setState] = useState<CheckoutState>("ready");
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    const attempt = current.current;
    current.current = undefined;
    attempt?.controller.abort();
    attempt?.widget?.close();
  }, []);

  async function startCheckout() {
    if (current.current) return;
    const attempt: Attempt = { controller: new AbortController() };
    current.current = attempt;
    setState("opening");
    setMessage("");
    let failureMessage = "Could not load Razorpay Checkout. Please try again.";
    try {
      const Razorpay = await loadRazorpay();
      if (current.current !== attempt) return;
      failureMessage = "";
      const order = await createCheckoutOrder(course.id, token, attempt.controller.signal);
      if (current.current !== attempt) return;
      const widget = new Razorpay({
        key: publicKey,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Prince Academy",
        description: course.name,
        prefill: { name: profile.name, email: profile.email, contact: profile.phone ?? "" },
        retry: { enabled: false },
        modal: { ondismiss: () => {
          if (current.current !== attempt) return;
          current.current = undefined;
          setState("cancelled");
        } },
        handler: () => {
          if (current.current !== attempt) return;
          current.current = undefined;
          setState("confirming");
          router.push(`/payment/processing/${encodeURIComponent(course.id)}`);
        },
      });
      attempt.widget = widget;
      widget.on("payment.failed", () => {
        if (current.current !== attempt) return;
        current.current = undefined;
        setState("failed");
        setMessage("Payment failed. Please try again.");
        widget.close();
      });
      setState("open");
      widget.open();
    } catch (error) {
      if (current.current !== attempt) return;
      current.current = undefined;
      setState("failed");
      setMessage(failureMessage || checkoutError(error));
    }
  }

  const busy = state === "opening" || state === "open" || state === "confirming";
  return <div className="checkout-actions">
    {state === "cancelled" && <p role="status">Payment cancelled</p>}
    {message && <p role="alert">{message}</p>}
    <button className="button button-primary" type="button" disabled={busy} onClick={() => void startCheckout()}>
      {busy ? "Payment in progress…" : state === "ready" ? "Continue to payment" : "Try again"}
    </button>
  </div>;
}

export function Checkout({ course, publicKey }: { course: Course; publicKey?: string }) {
  const { ready, signedIn, profile, token, accountError, busy, edit, signIn } = useAccount();
  const coursePath = `/courses/${course.slug}`;
  return <main className="container sections">
    <section className="admin-panel admin-editor">
      <Link className="catalog-back" href={coursePath}>← Back to course</Link>
      <h1>Checkout</h1>
      <p>{course.name}</p>
      <p>{formatPrice(course.pricePaise)}</p>
      {!publicKey && <p role="alert">Checkout is temporarily unavailable.</p>}
      {publicKey && !ready && !accountError && <p role="status">Checking your account…</p>}
      {publicKey && ready && !signedIn && <button className="button button-primary" type="button" disabled={busy}
        onClick={() => void signIn(coursePath)}>Sign in to buy</button>}
      {publicKey && profile && profile.role !== ROLE.STUDENT && <p role="alert">Sign in as a student to buy a course.</p>}
      {publicKey && profile?.role === ROLE.STUDENT && (!profile.phone?.trim()
        ? <button className="button button-primary" type="button" onClick={() => edit("phone")}>Add phone number</button>
        : token && <CheckoutButton key={profile.id} course={course} profile={profile} token={token} publicKey={publicKey} />)}
    </section>
  </main>;
}
