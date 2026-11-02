-- Part of tests/sql/run-rbac-tests.sh. Runs ONLY against its throwaway local cluster.
-- LOCAL-ONLY test of the RBAC migrations. Runs against the throwaway scratch database.
\set ON_ERROR_STOP off
\set QUIET on

-- ---------- helpers ----------
create table t_res (n serial, name text, ok boolean, detail text);
create table t_ids (name text primary key, id uuid, sid uuid);
create function t_rec(p_name text, p_ok boolean, p_detail text) returns void
  language sql security definer set search_path = public as $$ insert into t_res(name, ok, detail) values (p_name, p_ok, p_detail) $$;
create function t_ok(p_name text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; perform t_rec(p_name, true, '');
exception when others then perform t_rec(p_name, false, sqlerrm); end $$;
create function t_err(p_name text, p_sql text, p_frag text) returns void language plpgsql as $$
begin execute p_sql; perform t_rec(p_name, false, 'expected an error but it succeeded');
exception when others then perform t_rec(p_name, sqlerrm ilike '%' || p_frag || '%', sqlerrm); end $$;
create function t_val(p_name text, p_sql text, p_expected text) returns void language plpgsql as $$
declare v text;
begin execute p_sql into v;
  perform t_rec(p_name, v is not distinct from p_expected, 'got ' || coalesce(v, 'NULL') || ', expected ' || p_expected);
exception when others then perform t_rec(p_name, false, sqlerrm); end $$;
create function t_owner_count(p_tbl text) returns bigint language plpgsql security definer set search_path = public as $$ declare n bigint; begin execute format('select count(*) from public.%I', p_tbl) into n; return n; end $$;
create function t_id(p_name text) returns uuid language sql stable as $$ select id from t_ids where name = p_name $$;
create function t_as(p_name text) returns void language plpgsql as $$
declare r record;
begin
  select * into r from t_ids where name = p_name;
  perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'session_id', r.sid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create function t_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', false); execute 'set role anon'; end $$;
create function t_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', false); execute 'set role service_role'; end $$;
create function t_newsession(p_name text) returns void language plpgsql as $$
declare v uuid := gen_random_uuid(); begin
  insert into auth.sessions(id, user_id) select v, id from t_ids where name = p_name;
  update t_ids set sid = v where name = p_name; end $$;

-- ---------- legacy users (what production has today) ----------
insert into public.users(username, password, role) values
  ('mehul','Legacy-pass-1','admin'), ('ad_a','Legacy-pass-2','admin'), ('ad_b','Legacy-pass-3','admin'),
  ('op1','Legacy-pass-4','operator'), ('op2','Legacy-pass-5','operator'), ('op3','Legacy-pass-6','operator');
create table t_users_before as select id, username, password, role, created_at from public.users;

\echo '--- running rbac_04_backfill_profiles.sql'
\i :root/supabase/migrations/rbac_04_backfill_profiles.sql

-- Auth side (stand-in for the Admin-API migration) + sessions
insert into auth.users(id, email) select id, id || '@users.yokohama.invalid' from public.users;
insert into t_ids(name, id) select username, id from public.users;
select t_newsession(name) from t_ids;

-- ---------- backfill checks ----------
select t_val('backfill: every legacy user has a profile with the SAME id',
  $$select (select count(*) from public.users u join app_profiles p on p.id = u.id)::text$$, '6');
select t_val('backfill: mehul is super_admin', $$select role from app_profiles where username='mehul'$$, 'super_admin');
select t_val('backfill: exactly one super_admin', $$select count(*)::text from app_profiles where role='super_admin'$$, '1');
select t_val('backfill: legacy admins became admin', $$select count(*)::text from app_profiles where role='admin'$$, '2');
select t_val('backfill: operators became operator', $$select count(*)::text from app_profiles where role='operator'$$, '3');
select t_val('backfill: every operator has all 11 modules',
  $$select count(*)::text from (select user_id from app_user_modules group by 1 having count(*)=11) x$$, '3');
select t_val('backfill: legacy users table untouched (rows identical)',
  $$select count(*)::text from public.users u join t_users_before b using (id, username, password, role, created_at)$$, '6');
\i :root/supabase/migrations/rbac_04_backfill_profiles.sql
select t_val('backfill: re-run creates no duplicates', $$select count(*)::text from app_profiles$$, '6');

-- ---------- seed operational data (as owner) ----------
insert into tires(id, current_stage, location) values ('t1','warehouse','W - Bin A1');
insert into warehouses(key,label,prefix) values ('w1','W','p');
insert into plan_pending_tires(plan_no, tire, qty) values ('P1','T',1), ('P2','T',1);
insert into bay_bookings(bay, plan_no, status) values (1,'P1','open');

-- =====================  DATABASE-LEVEL PERMISSION RULES  =====================
-- Operator
select t_as('op1');
select t_val('operator: app_me works', $$select role from app_me()$$, 'operator');
select t_val('operator: sees own 11 modules', $$select cardinality(modules)::text from app_me()$$, '11');
select t_err('operator cannot list users', 'select * from app_list_users()', 'Not allowed');
select t_err('operator cannot read audit log', 'select * from app_list_audit(10)', 'Not allowed');
select t_err('operator cannot set modules', format($q$select app_set_user_modules(%L, '{inward}')$q$, t_id('op2')), 'Not allowed');
select t_err('operator cannot rename', format($q$select app_rename_user(%L, 'hacker')$q$, t_id('op2')), 'Not allowed');
select t_err('operator cannot deactivate', format($q$select app_set_user_active(%L, false)$q$, t_id('op2')), 'Not allowed');
select t_err('operator cannot change roles', format($q$select app_set_user_role(%L, 'admin')$q$, t_id('op1')), 'Not allowed');
select t_err('operator cannot authorise create', $q$select app_authorize_manage('create', null, 'operator')$q$, 'Not allowed');
select t_err('operator cannot read profiles table', 'select * from app_profiles', 'permission denied');
select t_err('operator cannot read modules table', 'select * from app_user_modules', 'permission denied');
select t_err('operator cannot read audit table', 'select * from app_audit_log', 'permission denied');
select t_err('operator cannot read login attempts', 'select * from app_login_attempts', 'permission denied');
select t_err('operator cannot call service-only register', format($q$select app_register_profile(%L,'zzz','operator','{}',%L)$q$, gen_random_uuid(), t_id('op1')), 'permission denied');
select t_err('operator cannot call service-only delete', format($q$select app_finalize_delete(%L,%L)$q$, t_id('op1'), t_id('op2')), 'permission denied');
select t_err('operator cannot call service-only reset', format($q$select app_after_password_reset(%L,%L)$q$, t_id('op1'), t_id('op2')), 'permission denied');
select t_err('operator cannot call login lockout functions', $q$select app_login_check('x','1.1.1.1')$q$, 'permission denied');

-- Admin
select t_as('ad_a');
select t_val('admin: lists all 6 users', $$select count(*)::text from app_list_users()$$, '6');
select t_ok('admin: sets operator modules', format($q$select app_set_user_modules(%L, '{inward,stock}')$q$, t_id('op1')));
select t_val('admin: modules stored', $$select array_to_string(modules, ',') from app_list_users() where username='op1'$$, 'inward,stock');
select t_err('admin: unknown module rejected', format($q$select app_set_user_modules(%L, '{inward,bogus}')$q$, t_id('op1')), 'Unknown module');
select t_err('admin cannot set modules of another admin', format($q$select app_set_user_modules(%L, '{inward}')$q$, t_id('ad_b')), 'Not allowed');
select t_err('admin cannot touch the super admin', format($q$select app_set_user_modules(%L, '{inward}')$q$, t_id('mehul')), 'Not allowed');
select t_err('admin cannot rename another admin', format($q$select app_rename_user(%L, 'newname')$q$, t_id('ad_b')), 'Not allowed');
select t_err('admin cannot rename super admin', format($q$select app_rename_user(%L, 'newname')$q$, t_id('mehul')), 'Not allowed');
select t_ok('admin: renames an operator', format($q$select app_rename_user(%L, 'op3_renamed')$q$, t_id('op3')));
select t_err('rename: invalid characters rejected', format($q$select app_rename_user(%L, 'bad name!')$q$, t_id('op3')), 'Username must be');
select t_err('rename: duplicate (case-insensitive) rejected', format($q$select app_rename_user(%L, 'OP1')$q$, t_id('op3')), 'already exists');
select t_err('admin cannot change roles', format($q$select app_set_user_role(%L, 'admin')$q$, t_id('op2')), 'Not allowed');
select t_err('admin cannot authorise creating an admin', $q$select app_authorize_manage('create', null, 'admin')$q$, 'Not allowed');
select t_ok('admin may authorise creating an operator', $q$select app_authorize_manage('create', null, 'operator')$q$);
select t_err('admin cannot authorise creating a super_admin', $q$select app_authorize_manage('create', null, 'super_admin')$q$, 'Not allowed');
select t_ok('admin may authorise resetting an operator password', format($q$select app_authorize_manage('reset_password', %L)$q$, t_id('op2')));
select t_err('admin cannot authorise resetting an admin password', format($q$select app_authorize_manage('reset_password', %L)$q$, t_id('ad_b')), 'Not allowed');
select t_err('admin cannot authorise resetting super admin password', format($q$select app_authorize_manage('reset_password', %L)$q$, t_id('mehul')), 'Not allowed');
select t_err('admin cannot authorise deleting an admin', format($q$select app_authorize_manage('delete', %L)$q$, t_id('ad_b')), 'Not allowed');
select t_err('admin cannot deactivate another admin', format($q$select app_set_user_active(%L, false)$q$, t_id('ad_b')), 'Not allowed');
select t_err('admin cannot deactivate self', format($q$select app_set_user_active(%L, false)$q$, t_id('ad_a')), 'Not allowed');
select t_err('admin cannot read audit log', 'select * from app_list_audit(10)', 'Not allowed');
select t_ok('admin: deactivates an operator', format($q$select app_set_user_active(%L, false)$q$, t_id('op2')));
select t_anon();
select t_as('op2');
select t_val('deactivated operator is locked out at once (app_me empty)', $$select count(*)::text from app_me()$$, '0');
select t_val('deactivated operator has no module access', $$select app_has_module('inward')::text$$, 'false');
select t_as('ad_a');
select t_ok('admin: reactivates the operator', format($q$select app_set_user_active(%L, true)$q$, t_id('op2')));
reset role;
select t_val('deactivation signed the user out everywhere (sessions deleted)',
  $$select count(*)::text from auth.sessions where user_id = (select id from t_ids where name='op2')$$, '0');
select t_newsession('op2');

-- Super Admin
select t_as('mehul');
select t_val('super admin: lists all', $$select count(*)::text from app_list_users()$$, '6');
select t_ok('super admin: renames an admin', format($q$select app_rename_user(%L, 'ad_b_renamed')$q$, t_id('ad_b')));
select t_err('super admin cannot create/set role super_admin', format($q$select app_set_user_role(%L, 'super_admin')$q$, t_id('ad_a')), 'Invalid role');
select t_err('super admin cannot change own role', format($q$select app_set_user_role(%L, 'operator')$q$, t_id('mehul')), 'Not allowed');
select t_err('super admin cannot deactivate self', format($q$select app_set_user_active(%L, false)$q$, t_id('mehul')), 'Not allowed');
select t_err('super admin cannot set modules of an admin', format($q$select app_set_user_modules(%L, '{inward}')$q$, t_id('ad_a')), 'Admins already have every module');
select t_ok('super admin may authorise creating an admin', $q$select app_authorize_manage('create', null, 'admin')$q$);
select t_ok('super admin may authorise resetting an admin password', format($q$select app_authorize_manage('reset_password', %L)$q$, t_id('ad_a')));
select t_err('nobody may authorise resetting own password via admin path', format($q$select app_authorize_manage('reset_password', %L)$q$, t_id('mehul')), 'Not allowed');
select t_ok('super admin: promotes operator to admin', format($q$select app_set_user_role(%L, 'admin')$q$, t_id('op1')));
reset role;
select t_val('role change signed the user out', $$select count(*)::text from auth.sessions where user_id=(select id from t_ids where name='op1')$$, '0');
select t_newsession('op1');
select t_as('op1');
select t_val('promoted admin has every module', $$select app_has_module('warehouses')::text$$, 'true');
select t_ok('promoted admin can now list users', 'select * from app_list_users()');
select t_as('mehul');
select t_ok('super admin: demotes admin back to operator', format($q$select app_set_user_role(%L, 'operator')$q$, t_id('op1')));
reset role;
select t_newsession('op1');
select t_val('demoted admin keeps all modules (no accidental lockout)', $$select count(*)::text from app_user_modules where user_id=(select id from t_ids where name='op1')$$, '11');
select t_as('mehul');
select t_ok('super admin reads audit log', 'select * from app_list_audit(50)');
select t_val('audit log recorded the actions', $$select (count(*) >= 7)::text from app_list_audit(500)$$, 'true');
select t_val('audit shows old and new username on rename', $$select (details->>'old_username' = 'op3' and details->>'new_username'='op3_renamed')::text from app_list_audit(500) where action='user_renamed' and target_username='op3_renamed'$$, 'true');
select t_ok('super admin trims operator modules', format($q$select app_set_user_modules(%L, '{inward}')$q$, t_id('op1')));
select t_ok('super admin trims op2', format($q$select app_set_user_modules(%L, '{picking,outward}')$q$, t_id('op2')));
select t_ok('super admin sets op3 to none', format($q$select app_set_user_modules(%L, '{}')$q$, t_id('op3')));

-- anon and direct access
select t_anon();
select t_err('anon cannot call app_me', 'select * from app_me()', 'permission denied');
select t_err('anon cannot list users', 'select * from app_list_users()', 'permission denied');
select t_err('anon cannot call has_module', $$select app_has_module('inward')$$, 'permission denied');
select t_err('anon cannot read profiles', 'select * from app_profiles', 'permission denied');
select t_err('anon cannot call register', format($q$select app_register_profile(%L,'zzz','operator','{}',%L)$q$, gen_random_uuid(), t_id('op1')), 'permission denied');

-- Session validity: no session / deleted session / forged claim
reset role;
select set_config('request.jwt.claims', json_build_object('sub', t_id('mehul'), 'role','authenticated')::text, false);
set role authenticated;
select t_val('valid user id but NO session claim => no identity', $$select count(*)::text from app_me()$$, '0');
select t_val('...and no admin power', $$select app_is_staff()::text$$, 'false');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', t_id('mehul'), 'session_id', gen_random_uuid(), 'role','authenticated')::text, false);
set role authenticated;
select t_val('valid user id but a made-up session id => no identity', $$select count(*)::text from app_me()$$, '0');
select t_err('...cannot list users with a forged session', 'select * from app_list_users()', 'Not allowed');
reset role;

-- Service-only functions (what the Edge Functions call)
select t_service();
select t_err('service: cannot register a super_admin', format($q$select app_register_profile(%L,'newsuper','super_admin','{}',%L)$q$, gen_random_uuid(), t_id('mehul')), 'Invalid role');
select t_ok('service: registers a new operator', format($q$select app_register_profile(%L,'op4','operator','{loading_bay,history}',%L)$q$, gen_random_uuid(), t_id('ad_a')));
select t_err('service: duplicate username rejected', format($q$select app_register_profile(%L,'OP4','operator','{}',%L)$q$, gen_random_uuid(), t_id('ad_a')), 'duplicate');
select t_err('service: bad username rejected', format($q$select app_register_profile(%L,'a b','operator','{}',%L)$q$, gen_random_uuid(), t_id('ad_a')), 'Username must be');
select t_err('service: unknown module rejected', format($q$select app_register_profile(%L,'op5','operator','{nope}',%L)$q$, gen_random_uuid(), t_id('ad_a')), 'Unknown module');
select t_val('new user must change password at first login', $$select must_change_password::text from app_profiles where username='op4'$$, 'true');
select t_err('service: finalize_delete respects hierarchy (admin cannot delete admin)', format($q$select app_finalize_delete(%L,%L)$q$, t_id('ad_a'), t_id('ad_b')), 'Not allowed');
select t_err('service: finalize_delete cannot delete super admin', format($q$select app_finalize_delete(%L,%L)$q$, t_id('mehul'), t_id('mehul')), 'Not allowed');
select t_ok('service: password reset marks must-change and signs out', format($q$select app_after_password_reset(%L,%L)$q$, t_id('mehul'), t_id('op3')));
select t_val('after reset: must_change_password set', $$select must_change_password::text from app_profiles where username='op3_renamed'$$, 'true');
reset role;
select t_val('after reset: target sessions deleted', $$select count(*)::text from auth.sessions where user_id=(select id from t_ids where name='op3')$$, '0');
select t_err('service: admin cannot reset another admin', format($q$select app_after_password_reset(%L,%L)$q$, t_id('ad_a'), t_id('ad_b')), 'Not allowed');
select t_newsession('op3');
select t_service();
select t_ok('service: own password change clears flag', format($q$select app_after_password_change(%L,%L)$q$, t_id('op3'), (select sid from t_ids where name='op3')));
select t_val('after change: flag cleared', $$select must_change_password::text from app_profiles where username='op3_renamed'$$, 'false');
-- lockout
select t_val('lockout: fresh user not locked', $$select (app_login_check('op1','9.9.9.9')->>'locked')$$, 'false');
select app_login_record('op1','9.9.9.9',false,(select id from public.app_profiles where username='op1')) from generate_series(1,4);
select t_val('lockout: 4 failures not locked', $$select (app_login_check('op1','9.9.9.9')->>'locked')$$, 'false');
select app_login_record('op1','9.9.9.9',false,(select id from public.app_profiles where username='op1'));
select t_val('lockout: 5th failure locks the username', $$select (app_login_check('op1','8.8.8.8')->>'locked')$$, 'true');
select t_val('lockout: other usernames unaffected', $$select (app_login_check('op2','8.8.8.8')->>'locked')$$, 'false');
select app_login_record('op1','9.9.9.9',true,(select id from public.app_profiles where username='op1'));
select t_val('lockout: a correct login clears the count', $$select (app_login_check('op1','8.8.8.8')->>'locked')$$, 'false');
select app_login_record('ghost','7.7.7.7',false,null) from generate_series(1,20);
select t_val('lockout: 20 failures from one address lock that address', $$select (app_login_check('anyone','7.7.7.7')->>'locked')$$, 'true');
select t_val('lockout: login_locked audited', $$select count(*)::text from app_audit_log where action='login_locked'$$, '1');
select t_val('login check never returns a password or hash', $$select (app_login_check('op1','1.1.1.1')::text !~* 'pass|hash|\$2a')::text$$, 'true');
reset role;

-- Hard guards (even for the database owner / dashboard edits)
select t_err('guard: super admin cannot be deleted', $q$delete from app_profiles where role='super_admin'$q$, 'cannot be deleted');
select t_err('guard: super admin cannot be demoted', $q$update app_profiles set role='admin' where role='super_admin'$q$, 'cannot be demoted');
select t_err('guard: super admin cannot be deactivated', $q$update app_profiles set is_active=false where role='super_admin'$q$, 'cannot be demoted or deactivated');
select t_err('guard: nobody can be promoted to super admin', $q$update app_profiles set role='super_admin' where username='op4'$q$, 'No account can be promoted');
select t_err('guard: a second super admin cannot be inserted', $q$insert into app_profiles(id,username,role) values (gen_random_uuid(),'x2','super_admin')$q$, 'duplicate key');
select t_err('guard: user id cannot be changed', $q$update app_profiles set id=gen_random_uuid() where username='op4'$q$, 'cannot be changed');
select t_err('guard: audit log cannot be edited', $q$update app_audit_log set action='x'$q$, 'append-only');
select t_err('guard: audit log cannot be deleted from', $q$delete from app_audit_log$q$, 'append-only');
select t_ok('service-side delete of a normal operator works', format($q$select app_finalize_delete(%L,%L)$q$, t_id('mehul'), (select id from app_profiles where username='op4')));
select t_val('...and its module rows went with it', $$select count(*)::text from app_user_modules where user_id not in (select id from app_profiles)$$, '0');
select t_val('...and the delete is audited', $$select count(*)::text from app_audit_log where action='user_deleted' and target_username='op4'$$, '1');
