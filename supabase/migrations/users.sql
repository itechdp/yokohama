-- Simple username + password login, replacing the old app_users / JWT /
-- device-binding setup. No Supabase Auth, no API server, no secrets: the app
-- calls the functions below directly with the normal anon key.
--
-- Passwords are stored in public.users.password. A trigger hashes them
-- (bcrypt) on insert/update, so you can add a user or change a password
-- straight from the Table Editor by typing the plain password - it is
-- hashed as soon as the row is saved.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Safe to re-run. Existing accounts from the old app_users table are copied
-- over with their current passwords.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password text not null,
  role text not null default 'operator' check (role in ('admin', 'operator')),
  created_at timestamptz not null default now()
);

create unique index if not exists users_username_key on public.users (lower(username));

-- Hash plain-text passwords on save; leave values that are already bcrypt hashes alone.
create or replace function public.users_hash_password()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if (tg_op = 'INSERT' or new.password is distinct from old.password)
     and new.password !~ '^\$2[abxy]\$[0-9]{2}\$.{53}$' then
    new.password := extensions.crypt(new.password, extensions.gen_salt('bf'));
  end if;
  return new;
end;
$$;

drop trigger if exists users_hash_password on public.users;
create trigger users_hash_password
  before insert or update on public.users
  for each row
  execute function public.users_hash_password();

-- The table itself is not readable with the anon key (RLS on, no policies),
-- so password hashes never leave the database. The app only goes through
-- the functions below.
alter table public.users enable row level security;

-- Copy accounts from the old app_users table, keeping their passwords.
-- bcryptjs wrote $2b$ hashes; pgcrypto reads the identical $2a$ form.
do $$
begin
  if to_regclass('public.app_users') is not null then
    insert into public.users (id, username, password, role, created_at)
    select id, username, regexp_replace(password_hash, '^\$2[by]\$', '$2a$'), role, created_at
    from public.app_users
    where is_active
    on conflict do nothing;
  end if;
end $$;

-- Login: returns the user when the username + password match, otherwise no rows.
create or replace function public.app_login(p_username text, p_password text)
returns table (id uuid, username text, role text)
language sql
security definer
set search_path = public, extensions
as $$
  select u.id, u.username, u.role
  from public.users u
  where lower(u.username) = lower(trim(p_username))
    and u.password = extensions.crypt(p_password, u.password);
$$;

create or replace function public.app_is_admin(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = p_user_id and role = 'admin');
$$;

-- Admin-only user management. p_admin_id is the logged-in admin's id.
create or replace function public.app_list_users(p_admin_id uuid)
returns table (id uuid, username text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Admin access required';
  end if;
  return query
    select u.id, u.username, u.role, u.created_at
    from public.users u
    order by u.created_at;
end;
$$;

create or replace function public.app_create_user(
  p_admin_id uuid,
  p_username text,
  p_password text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Admin access required';
  end if;
  if coalesce(trim(p_username), '') = '' then
    raise exception 'Username is required';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;
  if exists (select 1 from public.users where lower(username) = lower(trim(p_username))) then
    raise exception 'Username already exists';
  end if;

  insert into public.users (username, password, role)
  values (trim(p_username), p_password, p_role)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.app_delete_user(p_admin_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_admin(p_admin_id) then
    raise exception 'Admin access required';
  end if;
  if p_user_id = p_admin_id then
    raise exception 'You cannot delete your own account';
  end if;
  delete from public.users where id = p_user_id;
end;
$$;

grant execute on function public.app_login(text, text) to anon, authenticated;
grant execute on function public.app_list_users(uuid) to anon, authenticated;
grant execute on function public.app_create_user(uuid, text, text, text) to anon, authenticated;
grant execute on function public.app_delete_user(uuid, uuid) to anon, authenticated;

-- First admin, if you have no users yet - replace the values and run:
-- insert into public.users (username, password, role) values ('admin', 'change-me-123', 'admin');
