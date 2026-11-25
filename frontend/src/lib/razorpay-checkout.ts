import type { CheckoutOrder } from "@academy/shared";

type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: CheckoutOrder["currency"];
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  handler: () => void;
  modal: { ondismiss: () => void };
  retry: { enabled: boolean };
};

export type RazorpayCheckout = {
  open(): void;
  close(): void;
  on(event: "payment.failed", callback: () => void): void;
};

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayCheckout;
declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<RazorpayConstructor> | undefined;

export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      loading = undefined;
      reject(new Error("Razorpay Checkout could not load."));
    };
    const timeout = setTimeout(fail, 12_000);
    script.onerror = fail;
    script.onload = () => {
      if (!window.Razorpay) return fail();
      clearTimeout(timeout);
      resolve(window.Razorpay);
    };
    document.head.appendChild(script);
  });
  return loading;
}
