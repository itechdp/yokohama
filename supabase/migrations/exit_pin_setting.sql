-- A single shared PIN that gates the operator's Exit button (kiosk lock) -
-- entering it is the only way an operator can leave the locked app. Not
-- hashed: admins need to view/change the current value from the Manage
-- Users page, and this is a light "ask a supervisor" gate, not an account
-- credential. Follows the same no-API-server, anon-key-callable RPC
-- pattern as users.sql.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('exit_pin', '0000')
on conflict (key) do nothing;

-- Table itself is not readable with the anon key (RLS on, no policies) -
-- the app only goes through the functions below.
alter table public.app_settings enable row level security;

-- Operators call this from the Exit flow: proves the PIN without ever
-- exposing the stored value to their client/network traffic.
create or replace function public.app_verify_exit_pin(p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_settings where key = 'exit_pin' and value = p_pin
  );
$$;

-- Admin-only: view the current PIN on the Manage Users page.
create or replace function public.app_get_exit_pin(p_admin_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Admin access required';
  end if;
  return (select value from public.app_settings where key = 'exit_pin');
end;
$$;

-- Admin-only: change the PIN.
create or replace function public.app_set_exit_pin(p_admin_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Admin access required';
  end if;
  if coalesce(trim(p_pin), '') = '' then
    raise exception 'PIN is required';
  end if;
  update public.app_settings set value = trim(p_pin), updated_at = now() where key = 'exit_pin';
end;
$$;

grant execute on function public.app_verify_exit_pin(text) to anon, authenticated;
grant execute on function public.app_get_exit_pin(uuid) to anon, authenticated;
grant execute on function public.app_set_exit_pin(uuid, text) to anon, authenticated;
