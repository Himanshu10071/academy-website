import type { OwnedCourse } from "@academy/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { CourseRefund } from "./CourseRefund";

const course: OwnedCourse = {
  id: "course-1", slug: "algebra", name: "Algebra", thumbnailUrl: null, teacherName: "Teacher",
  lectureCount: 1, paymentId: "payment-1", refundEligibleUntil: "2026-11-25T12:00:01.000Z", hasOpenRefund: false,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("hides the refund button when the window closes while My Courses is open", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T12:00:00.000Z"));
  render(<CourseRefund course={course} token="test-token" />);
  expect(screen.getByRole("button", { name: "Request refund" })).toBeTruthy();
  act(() => vi.advanceTimersByTime(1001));
  expect(screen.queryByRole("button", { name: "Request refund" })).toBeNull();
});

it("links to refund history while a request is open", () => {
  render(<CourseRefund course={{ ...course, hasOpenRefund: true }} token="test-token" />);
  expect(screen.queryByRole("button", { name: "Request refund" })).toBeNull();
  expect(screen.getByRole("link", { name: "View refund requests" }).getAttribute("href")).toBe("/account/refunds");
});
