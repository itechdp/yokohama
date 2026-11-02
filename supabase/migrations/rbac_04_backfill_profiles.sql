-- RBAC step 4 of 5 - create a profile for every EXISTING user. DATA STEP.
--
-- Requires rbac_01 and rbac_02. Reads public.users; inserts into app_profiles and
-- app_user_modules only. It does NOT modify, delete or re-hash anything in public.users,
-- and never reads or prints a password hash.
--
--   * Every existing user keeps the SAME id (users.id = app_profiles.id).
--   * 'admin'    -> Admin.   'operator' -> Operator.
--   * The one account named below becomes the Super Admin (and only that one).
--   * Operators start with EVERY module so nobody loses access on day one; an Admin
--     can narrow them afterwards.
--   * Everything runs in ONE transaction and aborts, changing nothing, if the counts
--     do not match afterwards.
--
-- The matching Supabase Auth accounts are created by scripts/migrate-auth-users.mjs
-- (run it AFTER this file). Run this on STAGING first, then production only once the
-- production migration has been approved.
--
-- Safe to re-run: users that already have a profile are skipped.

begin;

do $$
declare
  v_super constant text := 'mehul';
  v_matches integer;
  v_users integer;
  v_profiles integer;
  v_missing integer;
  v_new_operators uuid[];
begin
  select count(*) into v_matches from public.users where lower(username) = v_super;
  if v_matches <> 1 then
    raise exception 'Expected exactly one user named %, found % - aborting, nothing changed', v_super, v_matches;
  end if;

  -- Only profiles created by THIS run get default modules, so re-running never
  -- undoes an Admin's later changes.
  with ins as (
    insert into public.app_profiles (id, username, role, is_active, must_change_password, created_at)
    select u.id, u.username,
           case when lower(u.username) = v_super then 'super_admin'
                when u.role = 'admin' then 'admin'
                else 'operator' end,
           true, false, u.created_at
    from public.users u
    where not exists (select 1 from public.app_profiles p where p.id = u.id)
    returning id, role
  )
  select coalesce(array_agg(id) filter (where role = 'operator'), '{}'::uuid[]) into v_new_operators from ins;

  insert into public.app_user_modules (user_id, module_key, granted_by)
  select o, k, null
  from unnest(v_new_operators) o
  cross join unnest(public.app_module_keys()) k;

  select count(*) into v_users from public.users;
  select count(*) into v_profiles from public.app_profiles p where exists (select 1 from public.users u where u.id = p.id);
  if v_profiles <> v_users then
    raise exception 'Profile count % does not match user count % - aborting', v_profiles, v_users;
  end if;

  select count(*) into v_missing from unnest(v_new_operators) o
  where (select count(*) from public.app_user_modules m where m.user_id = o) <> cardinality(public.app_module_keys());
  if v_missing <> 0 then
    raise exception '% operators did not get every module - aborting', v_missing;
  end if;
end $$;

-- Summary (no hashes, no passwords)
select role, count(*) as users from public.app_profiles group by role order by role;

commit;
