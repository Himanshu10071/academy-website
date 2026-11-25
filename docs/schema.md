# Database schema

The [initial migration](../supabase/migrations/initial_schema.sql) defines the nine tables, constraints, and triggers. The authentication backend reads `user_name`, `phone_number`, `role`, and `is_blocked` from `profiles`.

The profile API exposes `user_name` as `name` and `phone_number` as `phone`. New phone updates accept an Indian mobile number with or without `+91` and store it with the prefix. Existing profiles may have no phone number.

## Catalog

- Courses require a teacher. The API expresses `courses.price` as `pricePaise`. The lecture count trigger counts ready, visible lectures.
- Lecture uploads append a row to the course. The reorder endpoint uses the deferrable `lectures_course_number_key` constraint to update numbers within one transaction.
- Demo uploads create unpublished rows with duration in seconds. Public demos are ordered by `display_order`. Video keys are internal to the backend.

## Playback

The lecture access query reads `profiles.is_blocked`, `lectures.video_status`, `lectures.is_hidden`, and the caller's enrollment for that lecture's `course_id`. The owned courses endpoint reads paid enrollments only. A playback response uses the video key to sign a temporary URL and exposes no separate key field.

Admin preview reads the caller's `profiles.role` and `profiles.is_blocked` with the lecture metadata and video key. It requires a ready lecture and uses a read-only query with no enrollment lookup or financial writes.

## Razorpay webhook deliveries

The receiver copies the payment amount when supplied and resolves the optional `payment_id` by matching `payments.razorpay_order_id`. The existing unique index deduplicates verified event IDs. Verified captures lock the payment and enrollment. Successful captures update both rows and mark the event processed in the same transaction. The raw payload is immutable.

Checkout locks the student's profile before reading enrollment and order state. A newly created order and its pending enrollment are saved in one transaction. The payment row preserves the course price at order creation so retries reuse the same amount.
