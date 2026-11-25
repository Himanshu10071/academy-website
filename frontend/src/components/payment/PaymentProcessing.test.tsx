import { ENROLLMENT_STATUS, ROLE } from "@academy/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { getEnrollmentStatus } from "../../lib/api/payments";
import { PaymentProcessing } from "./PaymentProcessing";
import { PaymentSuccessToast } from "./PaymentSuccessToast";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../../lib/api/payments", () => ({ getEnrollmentStatus: vi.fn() }));
vi.mock("../layout/AccountProvider", () => ({ useAccount: () => ({
  ready: true, signedIn: true, token: "test-token", userId: "student-1",
  profile: { id: "student-1", role: ROLE.STUDENT },
}) }));

const status = vi.mocked(getEnrollmentStatus);
const pending = { status: ENROLLMENT_STATUS.PENDING, courseSlug: null };
const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  router.replace.mockReset();
  status.mockReset().mockResolvedValue(pending);
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("polls immediately, redirects on paid, and shows the toast once on the current course", async () => {
  status.mockResolvedValueOnce(pending)
    .mockResolvedValueOnce({ status: ENROLLMENT_STATUS.PAID, courseSlug: "renamed-maths" });
  const { unmount } = render(<PaymentProcessing courseId="course-1" />);
  expect(status).toHaveBeenCalledExactlyOnceWith("course-1", "test-token", expect.any(AbortSignal));
  await flush();
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(router.replace).toHaveBeenCalledExactlyOnceWith("/courses/renamed-maths");
  unmount();

  const toast = render(<PaymentSuccessToast destination="/courses/renamed-maths" />);
  expect(screen.getByRole("status").textContent).toBe("Payment successful");
  toast.unmount();
  render(<PaymentSuccessToast destination="/courses/renamed-maths" />);
  expect(screen.queryByRole("status")).toBeNull();
});

it("uses My Courses when the backend cannot resolve a safe slug", async () => {
  status.mockResolvedValueOnce({ status: ENROLLMENT_STATUS.PAID, courseSlug: null });
  render(<PaymentProcessing courseId="course-1" />);
  await flush();
  expect(router.replace).toHaveBeenCalledExactlyOnceWith("/my-courses");
});

it("times out after 90 seconds and Check again starts a fresh polling window", async () => {
  render(<PaymentProcessing courseId="course-1" />);
  await flush();
  await act(() => vi.advanceTimersByTimeAsync(90_000));
  expect(screen.getByRole("status").textContent).toContain("Still confirming your payment.");
  expect(screen.getByRole("link", { name: "My Courses" }).getAttribute("href")).toBe("/my-courses");
  const previousCount = status.mock.calls.length;
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await flush();
  expect(status).toHaveBeenCalledTimes(previousCount + 1);
});

it("keeps status errors separate and aborts an in-flight request on unmount", async () => {
  status.mockRejectedValueOnce(new Error("API unavailable"));
  let signal: AbortSignal | undefined;
  status.mockImplementationOnce((_id, _token, currentSignal) => {
    signal = currentSignal;
    return new Promise(() => {});
  });
  const { unmount } = render(<PaymentProcessing courseId="course-1" />);
  await flush();
  expect(screen.getByRole("alert").textContent).toContain("Could not check your payment status");
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await act(() => vi.advanceTimersByTimeAsync(9000));
  expect(status).toHaveBeenCalledTimes(2);
  unmount();
  expect(signal?.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(90_000));
  expect(status).toHaveBeenCalledTimes(2);
});
