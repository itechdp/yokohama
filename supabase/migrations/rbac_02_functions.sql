-- RBAC step 2 of 5 - identity, permission and user-management functions. ADDITIVE ONLY.
--
-- Requires rbac_01_foundation.sql. Creates new functions only; nothing existing is touched.
--
-- Identity comes from the verified Supabase Auth session (auth.uid() and the session
-- id inside the JWT) - never from a value the browser supplies. A deleted session
-- stops working immediately, so password resets, deactivation and role changes take
-- effect at once, not when the token expires.
--
-- Who can call what:
--   authenticated  : the app_* functions the screens use. Each checks the caller's
--                    role itself and refuses anything outside the hierarchy.
--   service_role   : the "service-only" functions at the bottom, called by the Edge
--                    Functions after they have authorised the request.
--   anon / public  : nothing.
--
-- DO NOT RUN ON PRODUCTION until the production migration is approved. Staging first.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Identity and permission helpers
-- ---------------------------------------------------------------------------
create or replace function public.app_module_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['inward', 'putaway', 'picking', 'outward', 'stock', 'prepare_plan',
               'show_tire', 'history', 'loading_bay', 'bay_history', 'warehouses']::text[];
$$;

-- The caller's active profile, or no row at all. Requires a live Auth session.
create or replace function public.app_actor()
returns setof public.app_profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.app_profiles p
  where p.id = auth.uid()
    and p.is_active
    and exists (
      select 1 from auth.sessions s
      where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    );
$$;

create or replace function public.app_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_actor() a where a.role in ('super_admin', 'admin'));
$$;

create or replace function public.app_has_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_actor() a
    where a.role in ('super_admin', 'admin')
       or exists (select 1 from public.app_user_modules m where m.user_id = a.id and m.module_key = p_module)
  );
$$;

create or replace function public.app_has_any_module(p_modules text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_actor() a
    where a.role in ('super_admin', 'admin')
       or exists (select 1 from public.app_user_modules m where m.user_id = a.id and m.module_key = any (p_modules))
  );
$$;

-- Who may manage whom. Super Admin: Admins and Operators. Admin: Operators only.
create or replace function public.app_can_manage(p_actor_role text, p_target_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_actor_role = 'super_admin' then p_target_role in ('admin', 'operator')
    when p_actor_role = 'admin' then p_target_role = 'operator'
    else false
  end;
$$;

-- Internal: write one audit row.
create or replace function public.app_audit_write(
  p_actor uuid, p_action text, p_target uuid, p_target_username text, p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_audit_log (actor_id, actor_username, action, target_id, target_username, details)
  values (
    p_actor,
    (select username from public.app_profiles where id = p_actor),
    p_action, p_target, p_target_username, coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Screens: who am I, who is there
-- ---------------------------------------------------------------------------
create or replace function public.app_me()
returns table (id uuid, username text, role text, must_change_password boolean, modules text[])
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.username, a.role, a.must_change_password,
         case when a.role in ('super_admin', 'admin') then public.app_module_keys()
              else coalesce(
                (select array_agg(m.module_key order by m.module_key)
                   from public.app_user_modules m where m.user_id = a.id),
                '{}'::text[])
         end
  from public.app_actor() a;
$$;

create or replace function public.app_list_users()
returns table (
  id uuid, username text, role text, is_active boolean,
  must_change_password boolean, created_at timestamptz, modules text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.app_is_staff() then
    raise exception 'Not allowed';
  end if;
  return query
    select p.id, p.username, p.role, p.is_active, p.must_change_password, p.created_at,
           case when p.role in ('super_admin', 'admin') then public.app_module_keys()
                else coalesce(
                  (select array_agg(m.module_key order by m.module_key)
                     from public.app_user_modules m where m.user_id = p.id),
                  '{}'::text[])
           end
    from public.app_profiles p
    order by case p.role when 'super_admin' then 0 when 'admin' then 1 else 2 end, lower(p.username);
end;
$$;

create or replace function public.app_list_audit(p_limit integer default 100)
returns table (at timestamptz, actor_username text, action text, target_username text, details jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not exists (select 1 from public.app_actor() a where a.role = 'super_admin') then
    raise exception 'Not allowed';
  end if;
  return query
    select l.at, l.actor_username, l.action, l.target_username, l.details
    from public.app_audit_log l
    order by l.at desc, l.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- ---------------------------------------------------------------------------
-- User management (database-only changes; each one is audited)
-- ---------------------------------------------------------------------------
create or replace function public.app_set_user_modules(p_user_id uuid, p_modules text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.app_profiles;
  t public.app_profiles;
  v_new text[];
  v_before text[];
begin
  select * into a from public.app_actor();
  if a.id is null then raise exception 'Not allowed'; end if;
  select * into t from public.app_profiles where id = p_user_id;
  if t.id is null or not public.app_can_manage(a.role, t.role) then
    raise exception 'Not allowed';
  end if;
  if t.role <> 'operator' then
    raise exception 'Admins already have every module';
  end if;

  select coalesce(array_agg(distinct k order by k), '{}'::text[]) into v_new
  from unnest(coalesce(p_modules, '{}'::text[])) k;
  if exists (select 1 from unnest(v_new) k where k <> all (public.app_module_keys())) then
    raise exception 'Unknown module';
  end if;

  select coalesce(array_agg(module_key order by module_key), '{}'::text[]) into v_before
  from public.app_user_modules where user_id = t.id;

  delete from public.app_user_modules where user_id = t.id and module_key <> all (v_new);
  insert into public.app_user_modules (user_id, module_key, granted_by)
  select t.id, k, a.id from unnest(v_new) k
  on conflict do nothing;

  perform public.app_audit_write(a.id, 'modules_changed', t.id, t.username,
    jsonb_build_object('before', v_before, 'after', v_new));
end;
$$;

create or replace function public.app_set_user_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.app_profiles;
  t public.app_profiles;
begin
  select * into a from public.app_actor();
  if a.id is null then raise exception 'Not allowed'; end if;
  select * into t from public.app_profiles where id = p_user_id;
  if t.id is null or t.id = a.id or not public.app_can_manage(a.role, t.role) then
    raise exception 'Not allowed';
  end if;

  update public.app_profiles
  set is_active = p_active,
      deactivated_at = case when p_active then null else now() end
  where id = t.id;

  if not p_active then
    delete from auth.sessions where user_id = t.id;   -- signs them out everywhere, now
  end if;

  perform public.app_audit_write(a.id,
    case when p_active then 'user_activated' else 'user_deactivated' end,
    t.id, t.username, '{}'::jsonb);
end;
$$;

-- Renaming only changes the login name. Historical records keep the old name as text.
create or replace function public.app_rename_user(p_user_id uuid, p_new_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.app_profiles;
  t public.app_profiles;
  v_new text := btrim(coalesce(p_new_username, ''));
begin
  select * into a from public.app_actor();
  if a.id is null then raise exception 'Not allowed'; end if;
  select * into t from public.app_profiles where id = p_user_id;
  if t.id is null or not public.app_can_manage(a.role, t.role) then
    raise exception 'Not allowed';
  end if;
  if v_new !~ '^[A-Za-z0-9._-]{3,64}$' then
    raise exception 'Username must be 3-64 characters: letters, numbers, dot, dash or underscore';
  end if;
  if exists (select 1 from public.app_profiles where lower(username) = lower(v_new) and id <> t.id) then
    raise exception 'Username already exists';
  end if;

  update public.app_profiles set username = v_new where id = t.id;

  perform public.app_audit_write(a.id, 'user_renamed', t.id, v_new,
    jsonb_build_object('old_username', t.username, 'new_username', v_new));
end;
$$;

-- Super Admin only. Never produces a Super Admin.
create or replace function public.app_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.app_profiles;
  t public.app_profiles;
begin
  select * into a from public.app_actor();
  if a.id is null or a.role <> 'super_admin' then raise exception 'Not allowed'; end if;
  if p_role not in ('admin', 'operator') then raise exception 'Invalid role'; end if;
  select * into t from public.app_profiles where id = p_user_id;
  if t.id is null or t.id = a.id or t.role = 'super_admin' then raise exception 'Not allowed'; end if;
  if t.role = p_role then return; end if;

  update public.app_profiles set role = p_role where id = t.id;

  -- Demoted Admins keep working: they start with every module, to be trimmed afterwards.
  if p_role = 'operator' then
    insert into public.app_user_modules (user_id, module_key, granted_by)
    select t.id, k, a.id from unnest(public.app_module_keys()) k
    on conflict do nothing;
  end if;

  delete from auth.sessions where user_id = t.id;   -- re-login with the new role

  perform public.app_audit_write(a.id, 'role_changed', t.id, t.username,
    jsonb_build_object('before', t.role, 'after', p_role));
end;
$$;

-- Authorisation check used by the Edge Functions BEFORE they do anything privileged.
-- Raises 'Not allowed' or returns who is who. Has no side effects.
create or replace function public.app_authorize_manage(
  p_action text, p_target uuid default null, p_role text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.app_profiles;
  t public.app_profiles;
begin
  select * into a from public.app_actor();
  if a.id is null then raise exception 'Not allowed'; end if;

  if p_action = 'create' then
    if p_role = 'operator' and a.role in ('super_admin', 'admin') then
      null;
    elsif p_role = 'admin' and a.role = 'super_admin' then
      null;
    else
      raise exception 'Not allowed';
    end if;
    return jsonb_build_object('actor_id', a.id, 'actor_role', a.role);
  end if;

  if p_action in ('reset_password', 'delete') then
    select * into t from public.app_profiles where id = p_target;
    if t.id is null or t.id = a.id or not public.app_can_manage(a.role, t.role) then
      raise exception 'Not allowed';
    end if;
    return jsonb_build_object(
      'actor_id', a.id, 'actor_role', a.role,
      'target_id', t.id, 'target_role', t.role, 'target_username', t.username);
  end if;

  raise exception 'Not allowed';
end;
$$;

-- ---------------------------------------------------------------------------
-- SERVICE-ONLY functions (Edge Functions, after authorising the request)
-- ---------------------------------------------------------------------------
create or replace function public.app_register_profile(
  p_id uuid, p_username text, p_role text, p_modules text[], p_created_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := btrim(coalesce(p_username, ''));
  v_modules text[] := coalesce(p_modules, '{}'::text[]);
begin
  if p_role not in ('admin', 'operator') then
    raise exception 'Invalid role';          -- a Super Admin can never be created here
  end if;
  if v_username !~ '^[A-Za-z0-9._-]{3,64}$' then
    raise exception 'Username must be 3-64 characters: letters, numbers, dot, dash or underscore';
  end if;
  if exists (select 1 from unnest(v_modules) k where k <> all (public.app_module_keys())) then
    raise exception 'Unknown module';
  end if;

  insert into public.app_profiles (id, username, role, must_change_password, created_by)
  values (p_id, v_username, p_role, true, p_created_by);

  if p_role = 'operator' then
    insert into public.app_user_modules (user_id, module_key, granted_by)
    select p_id, k, p_created_by from unnest(v_modules) k
    on conflict do nothing;
  end if;

  perform public.app_audit_write(p_created_by, 'user_created', p_id, v_username,
    jsonb_build_object('role', p_role, 'modules', v_modules));
end;
$$;

create or replace function public.app_finalize_delete(p_actor uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.app_profiles;
  t public.app_profiles;
begin
  select * into a from public.app_profiles where id = p_actor and is_active;
  select * into t from public.app_profiles where id = p_target;
  if a.id is null or t.id is null or t.id = a.id or not public.app_can_manage(a.role, t.role) then
    raise exception 'Not allowed';
  end if;

  delete from public.app_profiles where id = t.id;

  perform public.app_audit_write(a.id, 'user_deleted', t.id, t.username,
    jsonb_build_object('role', t.role));
end;
$$;

create or replace function public.app_after_password_reset(p_actor uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.app_profiles;
  t public.app_profiles;
begin
  select * into a from public.app_profiles where id = p_actor and is_active;
  select * into t from public.app_profiles where id = p_target;
  if a.id is null or t.id is null or t.id = a.id or not public.app_can_manage(a.role, t.role) then
    raise exception 'Not allowed';
  end if;

  update public.app_profiles set must_change_password = true where id = t.id;
  delete from auth.sessions where user_id = t.id;

  perform public.app_audit_write(a.id, 'password_reset', t.id, t.username, '{}'::jsonb);
end;
$$;

create or replace function public.app_after_password_change(p_user_id uuid, p_keep_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.app_profiles;
begin
  select * into t from public.app_profiles where id = p_user_id;
  if t.id is null then raise exception 'Not allowed'; end if;

  update public.app_profiles set must_change_password = false where id = t.id;
  delete from auth.sessions where user_id = t.id and id is distinct from p_keep_session;

  perform public.app_audit_write(t.id, 'password_changed', t.id, t.username, '{}'::jsonb);
end;
$$;

-- Brute-force lockout: 5 wrong passwords for one username, or 20 from one address,
-- within 15 minutes. A correct login clears the username's count.
create or replace function public.app_login_check(p_username text, p_ip text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_user_id uuid;
  v_active boolean;
  v_last_ok timestamptz;
  v_user_fails integer;
  v_ip_fails integer;
begin
  select p.id, p.is_active into v_user_id, v_active
  from public.app_profiles p where lower(p.username) = v_name;

  select max(at) into v_last_ok from public.app_login_attempts where username_lower = v_name and success;

  select count(*) into v_user_fails from public.app_login_attempts
  where username_lower = v_name and not success
    and at > greatest(now() - interval '15 minutes', coalesce(v_last_ok, '-infinity'::timestamptz));

  select count(*) into v_ip_fails from public.app_login_attempts
  where p_ip <> '' and ip = p_ip and not success and at > now() - interval '15 minutes';

  return jsonb_build_object(
    'user_id', v_user_id,
    'active', coalesce(v_active, false),
    'locked', v_user_fails >= 5 or v_ip_fails >= 20);
end;
$$;

create or replace function public.app_login_record(p_username text, p_ip text, p_success boolean, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_fails integer;
begin
  insert into public.app_login_attempts (username_lower, ip, success, user_id)
  values (left(v_name, 100), left(coalesce(p_ip, ''), 100), p_success, p_user_id);

  if not p_success and p_user_id is not null then
    select count(*) into v_fails from public.app_login_attempts
    where username_lower = v_name and not success
      and at > greatest(now() - interval '15 minutes',
                        coalesce((select max(at) from public.app_login_attempts where username_lower = v_name and success),
                                 '-infinity'::timestamptz));
    if v_fails = 5 then
      perform public.app_audit_write(null, 'login_locked', p_user_id, v_name,
        jsonb_build_object('failed_attempts', v_fails));
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute permissions: nothing for anon / public.
-- ---------------------------------------------------------------------------
revoke all on function public.app_module_keys() from public, anon, authenticated;
revoke all on function public.app_actor() from public, anon, authenticated;
revoke all on function public.app_can_manage(text, text) from public, anon, authenticated;
revoke all on function public.app_audit_write(uuid, text, uuid, text, jsonb) from public, anon, authenticated;

revoke all on function public.app_is_staff() from public, anon;
revoke all on function public.app_has_module(text) from public, anon;
revoke all on function public.app_has_any_module(text[]) from public, anon;
revoke all on function public.app_me() from public, anon;
revoke all on function public.app_list_users() from public, anon;
revoke all on function public.app_list_audit(integer) from public, anon;
revoke all on function public.app_set_user_modules(uuid, text[]) from public, anon;
revoke all on function public.app_set_user_active(uuid, boolean) from public, anon;
revoke all on function public.app_rename_user(uuid, text) from public, anon;
revoke all on function public.app_set_user_role(uuid, text) from public, anon;
revoke all on function public.app_authorize_manage(text, uuid, text) from public, anon;

grant execute on function public.app_is_staff() to authenticated;
grant execute on function public.app_has_module(text) to authenticated;
grant execute on function public.app_has_any_module(text[]) to authenticated;
grant execute on function public.app_me() to authenticated;
grant execute on function public.app_list_users() to authenticated;
grant execute on function public.app_list_audit(integer) to authenticated;
grant execute on function public.app_set_user_modules(uuid, text[]) to authenticated;
grant execute on function public.app_set_user_active(uuid, boolean) to authenticated;
grant execute on function public.app_rename_user(uuid, text) to authenticated;
grant execute on function public.app_set_user_role(uuid, text) to authenticated;
grant execute on function public.app_authorize_manage(text, uuid, text) to authenticated;

revoke all on function public.app_register_profile(uuid, text, text, text[], uuid) from public, anon, authenticated;
revoke all on function public.app_finalize_delete(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_after_password_reset(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_after_password_change(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_login_check(text, text) from public, anon, authenticated;
revoke all on function public.app_login_record(text, text, boolean, uuid) from public, anon, authenticated;

grant execute on function public.app_register_profile(uuid, text, text, text[], uuid) to service_role;
grant execute on function public.app_finalize_delete(uuid, uuid) to service_role;
grant execute on function public.app_after_password_reset(uuid, uuid) to service_role;
grant execute on function public.app_after_password_change(uuid, uuid) to service_role;
grant execute on function public.app_login_check(text, text) to service_role;
grant execute on function public.app_login_record(text, text, boolean, uuid) to service_role;
