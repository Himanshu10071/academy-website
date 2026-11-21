# Database schema

The [initial migration](../supabase/migrations/initial_schema.sql) defines the nine tables, constraints, and triggers. The authentication backend reads `user_name`, `phone_number`, `role`, and `is_blocked` from `profiles`.
