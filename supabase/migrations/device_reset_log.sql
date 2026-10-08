-- Audit trail for device resets: who reset whose device, and when. Exists
-- because device binding only means something if resets are traceable - an
-- untraceable reset would let anyone quietly re-bind a compromised account
-- to a new phone with no record of it happening.
-- Run once in the Supabase SQL Editor.

create table if not exists public.device_reset_log (
  id uuid primary key default gen_random_uuid(),
  reset_by_user_id uuid not null,
  reset_by_username text not null,
  target_user_id uuid not null,
  target_username text not null,
  reset_at timestamptz not null default now()
);

create index if not exists device_reset_log_target_idx on public.device_reset_log (target_user_id);

alter table public.device_reset_log enable row level security;
-- No policies: service_role only (api/admin/users/[id]/reset-device.ts),
-- same rationale as app_users/auth_nonces - never reachable by the anon key.
