"use client";

import { ENROLLMENT_STATUS } from "@academy/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getEnrollmentStatus } from "../../lib/api/payments";
import { useAccount } from "../layout/AccountProvider";
import { rememberPaymentSuccess } from "./PaymentSuccessToast";

const INTERVAL_MS = 3_000;
const WINDOW_MS = 90_000;
const MY_COURSES = "/my-courses";

function courseDestination(slug: string | null) {
  return slug && slug.length <= 180 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ? `/courses/${slug}`
    : MY_COURSES;
}

function PollEnrollment({ courseId, token, userId }: { courseId: string; token: string; userId: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"checking" | "timeout" | "error">("checking");

  useEffect(() => {
    const controller = new AbortController();
    let nextPoll: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      controller.abort();
      clearTimeout(nextPoll);
      setState("timeout");
    }, WINDOW_MS);

    function stop() {
      controller.abort();
      clearTimeout(timeout);
      clearTimeout(nextPoll);
    }

    async function poll() {
      try {
        const result = await getEnrollmentStatus(courseId, token, controller.signal);
        if (controller.signal.aborted) return;
        if (result.status === ENROLLMENT_STATUS.PAID) {
          stop();
          const destination = courseDestination(result.courseSlug);
          rememberPaymentSuccess(userId, destination);
          router.replace(destination);
          return;
        }
        nextPoll = setTimeout(() => void poll(), INTERVAL_MS);
      } catch {
        if (controller.signal.aborted) return;
        stop();
        setState("error");
      }
    }

    void poll();
    return stop;
  }, [attempt, courseId, router, token, userId]);

  if (state === "checking") return <p role="status">Confirming your payment…</p>;

  return <>
    {state === "timeout"
      ? <p role="status">Still confirming your payment. If money was deducted, your access will appear shortly. Check My Courses.</p>
      : <p role="alert">Could not check your payment status. Please try again.</p>}
    <div className="actions">
      <Link className="button button-secondary" href={MY_COURSES}>My Courses</Link>
      <button className="button button-primary" type="button" onClick={() => {
        setState("checking");
        setAttempt((previous) => previous + 1);
      }}>Check again</button>
    </div>
  </>;
}

export function PaymentProcessing({ courseId }: { courseId: string }) {
  const { ready, signedIn, profile, token, userId, accountError } = useAccount();
  return <main className="container sections">
    <section className="admin-panel admin-editor">
      <h1>Payment confirmation</h1>
      {!profile && !accountError && (!ready || signedIn) && <p role="status">Checking your account…</p>}
      {ready && !signedIn && <p>Sign in to see your enrollment in <Link href={MY_COURSES}>My Courses</Link>.</p>}
      {profile && token && userId && <PollEnrollment key={`${userId}:${courseId}`} courseId={courseId} token={token} userId={userId} />}
    </section>
  </main>;
}
