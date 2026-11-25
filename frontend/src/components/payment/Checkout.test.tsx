import { ERROR_CODE, PAYMENT_CURRENCY, ROLE } from "@academy/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useAccount } from "../layout/AccountProvider";
import { Checkout } from "./Checkout";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../layout/AccountProvider", () => ({ useAccount: vi.fn() }));

const course = { id: "course-1", slug: "jee-maths", name: "Maths", pricePaise: 49900 };
const checkoutOrder = { orderId: "order_TestCheckout", amount: 51000, currency: PAYMENT_CURRENCY };
const publicKey = "rzp_test_Fixture";
const fetchRequest = vi.fn();
const open = vi.fn();
const widgets: TestWidget[] = [];

class TestWidget {
  paymentFailed?: () => void;
  open = open;

  constructor(readonly options: ConstructorParameters<NonNullable<Window["Razorpay"]>>[0]) {
    widgets.push(this);
  }

  on(_event: "payment.failed", callback: () => void) {
    this.paymentFailed = callback;
  }

  close() {
    this.options.modal.ondismiss();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  widgets.length = 0;
  window.Razorpay = TestWidget;
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  fetchRequest.mockReset().mockImplementation(async () => Response.json(checkoutOrder));
  vi.stubGlobal("fetch", fetchRequest);
  vi.mocked(useAccount).mockReturnValue({
    ready: true, signedIn: true, busy: false, accountError: "", signIn: vi.fn(), edit: vi.fn(), logout: vi.fn(),
    userId: "student-1", token: "test-token",
    profile: { id: "student-1", role: ROLE.STUDENT, phone: "+919000000010", email: "student@example.test", name: "Student" },
  });
});

afterEach(() => {
  cleanup();
  delete window.Razorpay;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function start(name = "Continue to payment") {
  fireEvent.click(screen.getByRole("button", { name }));
  await waitFor(() => expect(widgets.length).toBeGreaterThan(0));
}

it("sends no price and uses the backend order, amount and currency in Razorpay", async () => {
  render(<Checkout course={course} publicKey={publicKey} />);
  const button = screen.getByRole("button", { name: "Continue to payment" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  expect(fetchRequest).toHaveBeenCalledTimes(1);
  const [url, options] = fetchRequest.mock.calls[0];
  expect(url.href).toBe("https://api.example.test/api/v1/courses/course-1/checkout");
  expect(options.method).toBe("POST");
  expect(options.body).toBeUndefined();
  expect(options.headers.get("Authorization")).toBe("Bearer test-token");
  expect(widgets[0].options).toMatchObject({
    key: publicKey, order_id: checkoutOrder.orderId, amount: 51000, currency: PAYMENT_CURRENCY,
    name: "Prince Academy", description: "Maths",
    prefill: { name: "Student", email: "student@example.test", contact: "+919000000010" },
  });
  act(() => Reflect.apply(widgets[0].options.handler, undefined, [{ razorpay_signature: "unused" }]));
  expect(push).toHaveBeenCalledExactlyOnceWith("/payment/processing/course-1");
  expect(fetchRequest).toHaveBeenCalledTimes(1);
});

it("retries after dismissal and preserves a later payment failure when the modal closes", async () => {
  render(<Checkout course={course} publicKey={publicKey} />);
  await start();
  act(() => widgets[0].close());
  expect(screen.getByRole("status").textContent).toBe("Payment cancelled");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(widgets).toHaveLength(2));
  act(() => widgets[1].paymentFailed?.());
  expect(screen.getByRole("alert").textContent).toContain("Payment failed");
  expect(screen.queryByText("Payment cancelled")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(widgets).toHaveLength(3));
  expect(fetchRequest).toHaveBeenCalledTimes(3);
});

it.each([
  [ERROR_CODE.ALREADY_ENROLLED, 409, "You already own this course"],
  [ERROR_CODE.PROFILE_INCOMPLETE, 400, "Add a phone number to your profile before paying"],
] as const)("shows a friendly error for %s", async (code, status, message) => {
  fetchRequest.mockResolvedValueOnce(Response.json({ error: { code, message: "API error", requestId: "fixture" } }, { status }));
  render(<Checkout course={course} publicKey={publicKey} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
  expect((await screen.findByRole("alert")).textContent).toContain(message);
  expect(widgets).toHaveLength(0);
});

it("handles a missing public key before loading Razorpay", () => {
  render(<Checkout course={course} />);
  expect(screen.getByRole("alert").textContent).toContain("temporarily unavailable");
  expect(fetchRequest).not.toHaveBeenCalled();
  expect(widgets).toHaveLength(0);
});
