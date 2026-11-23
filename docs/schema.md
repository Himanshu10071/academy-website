# Database schema

The [initial migration](../supabase/migrations/initial_schema.sql) defines the nine tables, constraints, and triggers. The authentication backend reads `user_name`, `phone_number`, `role`, and `is_blocked` from `profiles`.

The profile API exposes `user_name` as `name` and `phone_number` as `phone`. New phone updates accept an Indian mobile number with or without `+91` and store it with the prefix. Existing profiles may have no phone number.

## Catalog

- Courses require a teacher. The API expresses `courses.price` as `pricePaise`. The lecture count trigger counts ready, visible lectures.
- Lecture uploads append a row to the course. The reorder endpoint uses the deferrable `lectures_course_number_key` constraint to update numbers within one transaction.
- Demo uploads create unpublished rows with duration in seconds. Public demos are ordered by `display_order`. Video keys are internal to the backend.
