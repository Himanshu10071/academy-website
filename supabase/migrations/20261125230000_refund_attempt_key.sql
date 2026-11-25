-- Reuse the same provider key on an uncertain retry and rotate it after a confirmed failure.
ALTER TABLE public.refund_requests
  ADD COLUMN razorpay_attempt_key uuid NOT NULL DEFAULT gen_random_uuid();
