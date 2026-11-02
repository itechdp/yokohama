-- Part of tests/sql/run-rbac-tests.sh. Runs ONLY against its throwaway local cluster.
\set ON_ERROR_STOP off
\set QUIET on
-- module setup for the RLS phase (as super admin, through the real function)
select t_as('mehul');
select app_set_user_modules(t_id('op1'), '{inward,putaway}');
select app_set_user_modules(t_id('op2'), '{picking,outward}');
select app_set_user_modules(t_id('op3'), '{loading_bay,history}');
reset role;
-- an operator with NO module at all
select t_service();
select app_register_profile('00000000-0000-0000-0000-0000000000aa','nomods','operator','{}', t_id('mehul'));
reset role;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000aa','nomods@x');
insert into t_ids(name,id) values ('nomods','00000000-0000-0000-0000-0000000000aa');
select t_newsession('nomods');

\echo '--- applying rbac_05_rls_cutover.sql'
\set ON_ERROR_STOP on
\i :root/supabase/migrations/rbac_05_rls_cutover.sql
\set ON_ERROR_STOP off

-- anon: nothing
select t_anon();
select t_err('RLS anon cannot read tires', 'select count(*) from tires', 'permission denied');
select t_err('RLS anon cannot write plan_numbers', $q$insert into plan_numbers(plan_no,kind) values ('x','k')$q$, 'permission denied');
select t_err('RLS anon cannot read bay_bookings', 'select count(*) from bay_bookings', 'permission denied');
select t_err('RLS anon cannot read inward_pending', 'select count(*) from inward_pending', 'permission denied');
select t_err('legacy putaway_pallet(…, user id) no longer callable by anon', $q$select putaway_pallet('x','w1','b',gen_random_uuid())$q$, 'permission denied');
select t_err('legacy app_login no longer callable by anon', $q$select * from app_login('a','b')$q$, 'permission denied');
select t_err('legacy unblock_plan_tyre no longer callable by anon', $q$select unblock_plan_tyre(1,'x')$q$, 'permission denied');

-- operator with no modules: sees and changes nothing
select t_as('nomods');
select t_val('no-module operator sees 0 tires', 'select count(*)::text from tires', '0');
select t_val('no-module operator sees 0 bay bookings', 'select count(*)::text from bay_bookings', '0');
select t_err('no-module operator cannot insert', $q$insert into plan_numbers(plan_no,kind) values ('x','k')$q$, 'row-level security');
select t_val('no-module operator cannot update tires', $q$with u as (update tires set notes='hack' returning 1) select count(*)::text from u$q$, '0');
select t_val('no-module operator cannot delete tires', $q$with d as (delete from tires returning 1) select count(*)::text from d$q$, '0');
select t_err('legacy putaway_pallet not callable by authenticated either', $q$select putaway_pallet('x','w1','b',gen_random_uuid())$q$, 'permission denied');
select t_err('no-module operator: app_putaway_pallet refused', $q$select app_putaway_pallet('x','w1','b')$q$, 'Not allowed');

-- operator 1: Inward + Putaway
select t_as('op1');
select t_val('inward operator reads tires', 'select count(*)::text from tires', '1');
select t_val('inward operator reads warehouses (all of them)', 'select (count(*) = (select t_owner_count(''warehouses'')))::text from warehouses', 'true');
select t_val('inward operator CANNOT see loading-bay data', 'select count(*)::text from bay_bookings', '0');
select t_err('inward operator cannot write loading-bay data', $q$insert into bay_bookings(bay,plan_no,status) values (9,'x','y')$q$, 'row-level security');
select t_ok('inward operator can write plan_numbers', $q$insert into plan_numbers(plan_no,kind) values ('PN1','inward')$q$);
select t_ok('inward operator can insert a valid pending pallet', $q$insert into inward_pending(id,material,quantity,pallet_no,plan_no,shift) values ('ip1','m',1,'p','pl','A')$q$);
select t_err('pending-pallet insert rule preserved (cannot pre-mark as put away)', $q$insert into inward_pending(id,material,quantity,pallet_no,plan_no,shift,status) values ('ip2','m',1,'p','pl','A','put_away')$q$, 'row-level security');
select t_val('inward operator can read pending pallets', 'select count(*)::text from inward_pending', '1');
select t_err('inward operator cannot write picks', $q$insert into picks(id) values ('x')$q$, 'row-level security');
select t_err('inward operator cannot change SKU catalogue', $q$insert into tire_skus(material,description) values ('m','d')$q$, 'row-level security');
select t_err('putaway operator: pallet not found (reached the function, actor resolved)', $q$select app_putaway_pallet('nope','w1','b1')$q$, 'pallet not found');
select t_err('putaway operator: cancel reaches the function too', $q$select app_cancel_pending_pallet('nope')$q$, 'pallet not found');
select t_err('inward/putaway operator cannot unblock bay tyres', $q$select app_unblock_plan_tyre(1)$q$, 'Not allowed');

-- operator 2: Picking + Outward
select t_as('op2');
select t_val('picking operator reads tires', 'select count(*)::text from tires', '1');
select t_val('picking operator can delete pending-plan tyres (picking flow)', $q$with d as (delete from plan_pending_tires where plan_no='P1' returning 1) select count(*)::text from d$q$, '1');
select t_val('picking operator can still read the other plan rows', 'select count(*)::text from plan_pending_tires', '1');
select t_err('picking operator cannot write bay bookings', $q$insert into bay_bookings(bay,plan_no,status) values (9,'x','y')$q$, 'row-level security');
select t_val('picking operator sees no pending pallets (RLS filter)', 'select count(*)::text from inward_pending', '0');
select t_val('picking operator update of warehouses affects 0 rows', $q$with u as (update warehouses set label='hack' returning 1) select count(*)::text from u$q$, '0');
select t_err('app_putaway_pallet refused without the putaway module', $q$select app_putaway_pallet('x','w1','b')$q$, 'Not allowed');

-- operator 3: Loading Bay + History
select t_as('op3');
select t_val('loading-bay operator reads bookings', 'select (count(*) = (select t_owner_count(''bay_bookings'')))::text from bay_bookings', 'true');
select t_ok('loading-bay operator writes bookings', $q$insert into bay_bookings(bay,plan_no,status) values (2,'P9','open')$q$);
select t_val('history operator reads tires', 'select count(*)::text from tires', '1');
select t_val('loading-bay operator cannot read warehouses', 'select count(*)::text from warehouses', '0');
select t_err('loading-bay operator: unblock reaches the function (module ok)', $q$select app_unblock_plan_tyre(999)$q$, 'record not found');
select t_err('loading-bay operator cannot write tires', $q$insert into tires(id) values ('hack')$q$, 'row-level security');

-- admin / super admin: everything
select t_as('ad_a');
select t_val('admin reads every row of every table', $q$select (((select count(*) from tires) + (select count(*) from bay_bookings) + (select count(*) from warehouses) + (select count(*) from inward_pending)) = (select t_owner_count('tires') + t_owner_count('bay_bookings') + t_owner_count('warehouses') + t_owner_count('inward_pending')))::text$q$, 'true');
select t_ok('admin writes the SKU catalogue', $q$insert into tire_skus(material,description) values ('ADM-1','d')$q$);
select t_ok('admin writes bookings', $q$insert into bay_bookings(bay,plan_no,status) values (3,'P10','open')$q$);
select t_as('mehul');
select t_ok('super admin writes warehouses', $q$update warehouses set label='W2'$q$);
select t_err('admin-only policy still preserves the pallet insert rule', $q$insert into inward_pending(id,material,quantity,pallet_no,plan_no,shift,status) values ('ip3','m',1,'p','pl','A','put_away')$q$, 'row-level security');


-- ===== end to end: putaway + cancel for a user that exists ONLY in app_profiles (not in legacy users) =====
reset role;
insert into warehouses(key,label,prefix,column_row_counts) values ('whp','WHP','Z','{3,3}') on conflict do nothing;
insert into inward_pending(id,material,description,quantity,pallet_no,plan_no,shift,entry_date,picker_name,created_by) values
  ('pa','M1','Tire M1',2,'P-pa','S-1','2','2026-10-13','Ravi','cage1'),
  ('pb','M2','Tire M2',1,'P-pb','S-1','2','2026-10-13','Ravi','cage1');
select t_service();
select app_register_profile('00000000-0000-0000-0000-0000000000bb','forklift_new','operator','{putaway}', t_id('mehul'));
reset role;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000bb','fx@x');
insert into t_ids(name,id) values ('forklift_new','00000000-0000-0000-0000-0000000000bb');
select t_newsession('forklift_new');
select t_val('new user is NOT in the legacy users table', $$select count(*)::text from public.users where id='00000000-0000-0000-0000-0000000000bb'$$, '0');
select t_as('forklift_new');
select t_val('putaway end to end as a NEW (non-legacy) user', $$select (app_putaway_pallet('pa','whp','Z01-01')->>'result')$$, 'put_away');
select t_val('putaway repeat is harmless', $$select (app_putaway_pallet('pa','whp','Z01-01')->>'result')$$, 'already_put_away');
select t_val('cancel end to end as a NEW user', $$select (app_cancel_pending_pallet('pb')->>'result')$$, 'cancelled');
select t_val('cancel twice is harmless', $$select (app_cancel_pending_pallet('pb')->>'result')$$, 'already_cancelled');
reset role;
select t_val('receipt records the NEW user''s name', $$select received_by from inward_receipts where id='ir-pa'$$, 'forklift_new');
select t_val('2 tires were placed in the bin', $$select count(*)::text from tires where location = 'WHP - Bin Z01-01'$$, '2');
select t_val('pallet marked put_away by the new user', $$select status||'|'||putaway_by from inward_pending where id='pa'$$, 'put_away|forklift_new');
select t_val('cancelled pallet records who cancelled', $$select status||'|'||cancelled_by from inward_pending where id='pb'$$, 'cancelled|forklift_new');
select t_as('forklift_new');
select t_err('putaway user still cannot touch loading-bay data', $q$insert into bay_bookings(bay,plan_no,status) values (7,'x','y')$q$, 'row-level security');

-- a deactivated user loses data access immediately
select t_as('mehul');
select app_set_user_active(t_id('op2'), false);
select t_as('op2');
select t_val('deactivated operator reads 0 tires right away', 'select count(*)::text from tires', '0');
select t_err('deactivated operator cannot write', $q$insert into plan_numbers(plan_no,kind) values ('z','k')$q$, 'row-level security');
select t_as('mehul');
select app_set_user_active(t_id('op2'), true);
reset role;

-- service role keeps working (Edge Functions)
select t_service();
select t_val('service_role still reads everything (1 seed + 2 placed by putaway)', 'select count(*)::text from tires', '3');
reset role;

-- No row of operational data was changed by the cutover itself
select t_val('operational rows are exactly what the tests created (tires: 1 seed + 2 putaway)', $$select count(*)::text from tires$$, '3');
select t_val('no open policy remains on the 16 operational tables',
  $$select count(*)::text from pg_policies where schemaname='public' and tablename in ('tires','tire_skus','warehouses','inward_receipts','placement_logs','tire_history','picks','deleted_tires','outwards','plan_numbers','prepared_plans','plan_pending_tires','bay_bookings','bay_plan_history','inward_pending','plan_block_tires') and (roles && array['anon','public']::name[] or policyname not like 'rbac\_%')$$, '0');
