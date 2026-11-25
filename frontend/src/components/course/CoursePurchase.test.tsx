import { ROLE } from "@academy/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useOwnedCourses } from "../../hooks/use-owned-courses";
import { useAccount } from "../layout/AccountProvider";
import { CoursePurchase } from "./CoursePurchase";

vi.mock("../layout/AccountProvider", () => ({ useAccount: vi.fn() }));
vi.mock("../../hooks/use-owned-courses", () => ({ useOwnedCourses: vi.fn() }));

const course = { id: "course-1", slug: "jee-maths", pricePaise: 49900 };
const signIn = vi.fn();
const edit = vi.fn();
const account: ReturnType<typeof useAccount> = {
  ready: true, signedIn: true, busy: false, accountError: "", signIn, edit, logout: vi.fn(),
  userId: "student-1", token: "test-token",
  profile: { id: "student-1", role: ROLE.STUDENT, phone: "+919000000010", email: "student@example.test", name: "Student" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAccount).mockReturnValue(account);
  vi.mocked(useOwnedCourses).mockReturnValue({ token: "test-token", courses: [] });
});
afterEach(cleanup);

it("waits for both the profile and ownership", () => {
  vi.mocked(useOwnedCourses).mockReturnValue(undefined);
  render(<CoursePurchase course={course} />);
  expect(screen.getByRole("status").textContent).toContain("Checking course access");
  expect(screen.queryByRole("link", { name: /buy/i })).toBeNull();
});

it("returns a signed-out student to this course after sign-in", () => {
  vi.mocked(useAccount).mockReturnValue({ ...account, signedIn: false, profile: undefined, token: undefined });
  render(<CoursePurchase course={course} />);
  fireEvent.click(screen.getByRole("button", { name: "Sign in to buy" }));
  expect(signIn).toHaveBeenCalledWith("/courses/jee-maths");
});

it("lets a paid student jump to the curriculum even without a phone", () => {
  vi.mocked(useAccount).mockReturnValue({ ...account, profile: { ...account.profile!, phone: null } });
  vi.mocked(useOwnedCourses).mockReturnValue({ token: "test-token", courses: [{
    ...course, name: "Maths", teacherName: "Teacher", thumbnailUrl: null, lectureCount: 1,
  }] });
  render(<CoursePurchase course={course} />);
  expect(screen.getByRole("link", { name: "Go to course" }).getAttribute("href")).toBe("#curriculum-heading");
  expect(screen.queryByRole("button", { name: "Add phone number" })).toBeNull();
  expect(screen.queryByRole("link", { name: /buy/i })).toBeNull();
});

it("opens the existing phone form and shows the Buy link after saving", () => {
  vi.mocked(useAccount).mockReturnValue({ ...account, profile: { ...account.profile!, phone: null } });
  const { rerender } = render(<CoursePurchase course={course} />);
  fireEvent.click(screen.getByRole("button", { name: "Add phone number" }));
  expect(edit).toHaveBeenCalledWith("phone");
  vi.mocked(useAccount).mockReturnValue(account);
  rerender(<CoursePurchase course={course} />);
  expect(screen.getByRole("link", { name: "Buy for ₹499.00" }).getAttribute("href")).toBe("/checkout/jee-maths");
});
