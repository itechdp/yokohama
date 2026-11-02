-- RBAC step 1 of 5 - foundation tables. ADDITIVE ONLY.
--
-- Creates the tables for Super Admin / Admin / Operator roles, per-module
-- permissions, an append-only audit log and login-attempt tracking.
-- It does not read, change or delete any existing table, row, function or policy.
-- public.users (the old login table) is left exactly as it is.
--
-- DO NOT RUN ON PRODUCTION until the production migration is approved. Staging first.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Profiles: one row per person who may use the app.
--   id = the id the person already has in public.users = their Supabase Auth id.
-- ---------------------------------------------------------------------------
create table if not exists public.app_profiles (
  id uuid primary key,
  username text not null,
  role text not null check (role in ('super_admin', 'admin', 'operator')),
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz
);

create unique index if not exists app_profiles_username_key on public.app_profiles (lower(username));

-- At most ONE Super Admin can ever exist.
create unique index if not exists app_profiles_one_super_admin on public.app_profiles ((true)) where role = 'super_admin';

-- Module permissions for Operators. Admin / Super Admin get every module from their role.
create table if not exists public.app_user_modules (
  user_id uuid not null references public.app_profiles (id) on delete cascade,
  module_key text not null check (module_key in (
    'inward', 'putaway', 'picking', 'outward', 'stock', 'prepare_plan',
    'show_tire', 'history', 'loading_bay', 'bay_history', 'warehouses'
  )),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, module_key)
);

-- Append-only record of user-management events.
create table if not exists public.app_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_username text,
  action text not null,
  target_id uuid,
  target_username text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists app_audit_log_at_idx on public.app_audit_log (at desc);

-- Login attempts, used for brute-force lockout. Contains no passwords.
create table if not exists public.app_login_attempts (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  username_lower text not null,
  ip text not null default '',
  success boolean not null,
  user_id uuid
);

create index if not exists app_login_attempts_user_idx on public.app_login_attempts (username_lower, at desc);
create index if not exists app_login_attempts_ip_idx on public.app_login_attempts (ip, at desc);

-- ---------------------------------------------------------------------------
-- Guards that hold even for edits made directly in the Supabase dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.app_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'super_admin' then
      raise exception 'The Super Admin account cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id then
      raise exception 'A user id cannot be changed';
    end if;
    if old.role = 'super_admin' and (new.role <> 'super_admin' or new.is_active = false) then
      raise exception 'The Super Admin cannot be demoted or deactivated';
    end if;
    if new.role = 'super_admin' and old.role <> 'super_admin' then
      raise exception 'No account can be promoted to Super Admin';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists app_profiles_guard on public.app_profiles;
create trigger app_profiles_guard
  before update or delete on public.app_profiles
  for each row execute function public.app_profiles_guard();

create or replace function public.app_audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The audit log is append-only';
end;
$$;

drop trigger if exists app_audit_log_immutable on public.app_audit_log;
create trigger app_audit_log_immutable
  before update or delete on public.app_audit_log
  for each row execute function public.app_audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Lock the tables: nobody reads or writes them directly with the public key.
-- Everything goes through the functions in rbac_02_functions.sql.
-- ---------------------------------------------------------------------------
alter table public.app_profiles enable row level security;
alter table public.app_user_modules enable row level security;
alter table public.app_audit_log enable row level security;
alter table public.app_login_attempts enable row level security;

revoke all on table public.app_profiles from public, anon, authenticated;
revoke all on table public.app_user_modules from public, anon, authenticated;
revoke all on table public.app_audit_log from public, anon, authenticated;
revoke all on table public.app_login_attempts from public, anon, authenticated;
