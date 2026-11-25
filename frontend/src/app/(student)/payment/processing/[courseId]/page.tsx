import { notFound } from "next/navigation";

import { PaymentProcessing } from "../../../../../components/payment/PaymentProcessing";

export default async function PaymentProcessingPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(courseId)) notFound();
  return <PaymentProcessing courseId={courseId} />;
}
