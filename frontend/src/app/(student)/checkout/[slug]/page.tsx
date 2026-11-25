import { ERROR_CODE } from "@academy/shared";
import { notFound } from "next/navigation";

import { Checkout } from "../../../../components/payment/Checkout";
import { getCourse } from "../../../../lib/api/catalog";
import { ApiError } from "../../../../lib/api/client";

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();

  try {
    const { id, name, pricePaise } = await getCourse(slug);
    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const publicKey = key && /^rzp_test_[A-Za-z0-9]+$/.test(key) ? key : undefined;
    return <Checkout course={{ id, slug, name, pricePaise }} publicKey={publicKey} />;
  } catch (error) {
    if (error instanceof ApiError && error.failure.code === ERROR_CODE.NOT_FOUND) notFound();
    return <main className="container sections"><p role="alert">Checkout is temporarily unavailable.</p></main>;
  }
}
