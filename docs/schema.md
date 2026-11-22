# Database schema

The [initial migration](../supabase/migrations/initial_schema.sql) defines the nine tables, constraints, and triggers. The authentication backend reads `user_name`, `phone_number`, `role`, and `is_blocked` from `profiles`.

The profile API exposes `user_name` as `name` and `phone_number` as `phone`. New phone updates accept an Indian mobile number with or without `+91` and store it with the prefix. Existing profiles may have no phone number.
