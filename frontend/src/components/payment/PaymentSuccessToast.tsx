"use client";

import { useEffect, useState } from "react";

import { useAccount } from "../layout/AccountProvider";

const keyFor = (userId: string) => `prince-academy:payment-success:${userId}`;

export function rememberPaymentSuccess(userId: string, destination: string) {
  try {
    sessionStorage.setItem(keyFor(userId), destination);
  } catch {
    // Confirmation can still redirect when browser storage is unavailable.
  }
}

export function PaymentSuccessToast({ destination }: { destination: string }) {
  const { userId } = useAccount();
  const [shownFor, setShownFor] = useState<string>();
  useEffect(() => {
    if (!userId) return;
    try {
      const key = keyFor(userId);
      if (sessionStorage.getItem(key) === destination) {
        sessionStorage.removeItem(key);
        setShownFor(userId);
      }
    } catch {
      // The toast is optional when browser storage is unavailable.
    }
  }, [destination, userId]);

  useEffect(() => {
    if (!shownFor) return;
    const timeout = setTimeout(() => setShownFor(undefined), 5_000);
    return () => clearTimeout(timeout);
  }, [shownFor]);

  return shownFor && shownFor === userId ? <p className="payment-toast" role="status">Payment successful</p> : null;
}
