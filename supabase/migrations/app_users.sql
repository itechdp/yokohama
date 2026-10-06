-- Application-level auth: admin-provisioned accounts with hardware device
-- binding. This app has had no login/auth layer until now. Run once in the
-- Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql - run that first
-- if this is a fresh project.

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'operator')),
  device_public_key text,
  device_registered_at timestamptz,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_users_username_key
  on public.app_users (lower(username));

drop trigger if exists set_app_users_updated_at on public.app_users;
create trigger set_app_users_updated_at
  before update on public.app_users
  for each row
  execute function public.set_updated_at();

-- Unlike tire_skus/bay_bookings (see schema.sql), this table holds password
-- hashes and must NOT be reachable by the anon key. RLS is enabled with no
-- policies for anon/authenticated, so all access from those roles is denied
-- by default; only the service_role key (used exclusively from Vercel
-- functions under api/, never shipped to the client bundle) bypasses RLS.
alter table public.app_users enable row level security;
