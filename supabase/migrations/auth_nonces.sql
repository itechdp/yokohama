-- Single-use tracking for login challenge nonces, closing the replay window
-- that a purely stateless challenge token would otherwise leave open: a
-- unique-constraint violation on insert means this exact challenge is being
-- replayed, and POST /api/auth/login treats that as a rejected attempt.
-- Run once in the Supabase SQL Editor.

create table if not exists public.auth_nonces (
  nonce text primary key,
  created_at timestamptz not null default now()
);

alter table public.auth_nonces enable row level security;
-- No policies: service_role only, same rationale as app_users.
