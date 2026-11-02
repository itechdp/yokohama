-- RBAC step 5 of 5 - STAGE C: replace the open "anon can do anything" policies with
-- module-based ones. THIS IS THE STEP THAT ACTUALLY CLOSES THE HOLE.
--
-- Requires rbac_01..03 and a working Supabase Auth login in the app. Run it ONLY after:
--   1. the new app version (Supabase Auth login) is live and tested, AND
--   2. every tablet has signed in with the new login at least once, AND
--   3. you have approved it explicitly.
-- From the moment it commits, the old browser key alone can no longer read or write
-- these tables, and the old login functions stop being callable. Anything still running
-- the old app version will fail until it is updated.
--
-- What it changes (policies and privileges only - NO table data is touched):
--   * every table below gets new policies gated on app_has_any_module([...]);
--   * the old open policies are dropped AFTER the new ones exist (one transaction);
--   * anon loses all privileges on these tables;
--   * the old user-id based functions (putaway_pallet, cancel_pending_pallet,
--     unblock_plan_tyre(s), app_login and the old app_*_user functions) lose EXECUTE for
--     anon/authenticated. The functions themselves are kept for rollback.
--
-- Rollback: supabase/rollback/rbac_rollback_stage_c.sql
-- Module access per table (R = may read, W = may write). Admin / Super Admin: everything.
--   tires              R inward picking outward stock history warehouses show_tire
--                      W inward picking outward stock warehouses show_tire
--   tire_skus          R inward picking outward stock prepare_plan show_tire loading_bay
--                      W show_tire
--   warehouses         R inward putaway picking outward stock warehouses   W warehouses
--   inward_pending     R inward putaway                                     W(insert) inward
--   inward_receipts    R inward history                                     W inward
--   placement_logs     R history inward                                     W inward
--   tire_history       R history                                            W inward
--   picks              R picking history                                    W picking
--   deleted_tires      R picking history                                    W picking
--   outwards           R outward history                                    W outward
--   plan_numbers       R/W inward picking outward
--   prepared_plans     R prepare_plan picking outward                       W prepare_plan
--   plan_pending_tires R/W loading_bay picking
--   plan_block_tires   R loading_bay history                                W(insert) loading_bay
--   bay_bookings       R/W loading_bay
--   bay_plan_history   R loading_bay bay_history                            W loading_bay
-- (putaway_pallet etc. write several tables as the function owner; they check the module.)

begin;

-- 1. New policies for tables that were "for all ... using (true)".
do $$
declare
  r record;
begin
  for r in select * from (values
    ('tires',              array['inward','picking','outward','stock','history','warehouses','show_tire'],
                           array['inward','picking','outward','stock','warehouses','show_tire']),
    ('tire_skus',          array['inward','picking','outward','stock','prepare_plan','show_tire','loading_bay'],
                           array['show_tire']),
    ('warehouses',         array['inward','putaway','picking','outward','stock','warehouses'],
                           array['warehouses']),
    ('inward_receipts',    array['inward','history'],            array['inward']),
    ('placement_logs',     array['history','inward'],            array['inward']),
    ('tire_history',       array['history'],                     array['inward']),
    ('picks',              array['picking','history'],           array['picking']),
    ('deleted_tires',      array['picking','history'],           array['picking']),
    ('outwards',           array['outward','history'],           array['outward']),
    ('plan_numbers',       array['inward','picking','outward'],  array['inward','picking','outward']),
    ('prepared_plans',     array['prepare_plan','picking','outward'], array['prepare_plan']),
    ('plan_pending_tires', array['loading_bay','picking'],       array['loading_bay','picking']),
    ('bay_bookings',       array['loading_bay'],                 array['loading_bay']),
    ('bay_plan_history',   array['loading_bay','bay_history'],   array['loading_bay'])
  ) as t(tbl, read_mods, write_mods)
  loop
    execute format('drop policy if exists %I on public.%I', 'rbac_' || r.tbl || '_select', r.tbl);
    execute format('drop policy if exists %I on public.%I', 'rbac_' || r.tbl || '_insert', r.tbl);
    execute format('drop policy if exists %I on public.%I', 'rbac_' || r.tbl || '_update', r.tbl);
    execute format('drop policy if exists %I on public.%I', 'rbac_' || r.tbl || '_delete', r.tbl);

    execute format($f$create policy %I on public.%I for select to authenticated
                      using ((select public.app_has_any_module(%L::text[])))$f$,
                   'rbac_' || r.tbl || '_select', r.tbl, r.read_mods);
    execute format($f$create policy %I on public.%I for insert to authenticated
                      with check ((select public.app_has_any_module(%L::text[])))$f$,
                   'rbac_' || r.tbl || '_insert', r.tbl, r.write_mods);
    execute format($f$create policy %I on public.%I for update to authenticated
                      using ((select public.app_has_any_module(%L::text[])))
                      with check ((select public.app_has_any_module(%L::text[])))$f$,
                   'rbac_' || r.tbl || '_update', r.tbl, r.write_mods, r.write_mods);
    execute format($f$create policy %I on public.%I for delete to authenticated
                      using ((select public.app_has_any_module(%L::text[])))$f$,
                   'rbac_' || r.tbl || '_delete', r.tbl, r.write_mods);
  end loop;
end $$;

-- 2. The two tables that were already select + insert only keep their exact insert rules.
drop policy if exists rbac_inward_pending_select on public.inward_pending;
drop policy if exists rbac_inward_pending_insert on public.inward_pending;
create policy rbac_inward_pending_select on public.inward_pending for select to authenticated
  using ((select public.app_has_any_module(array['inward','putaway']::text[])));
create policy rbac_inward_pending_insert on public.inward_pending for insert to authenticated
  with check (
    (select public.app_has_any_module(array['inward']::text[]))
    and status = 'pending'
    and putaway_by = '' and putaway_at is null and warehouse = '' and location = ''
    and cancelled_by = '' and cancelled_at is null
  );

drop policy if exists rbac_plan_block_tires_select on public.plan_block_tires;
drop policy if exists rbac_plan_block_tires_insert on public.plan_block_tires;
create policy rbac_plan_block_tires_select on public.plan_block_tires for select to authenticated
  using ((select public.app_has_any_module(array['loading_bay','history']::text[])));
create policy rbac_plan_block_tires_insert on public.plan_block_tires for insert to authenticated
  with check (
    (select public.app_has_any_module(array['loading_bay']::text[]))
    and unblocked_at is null and unblocked_by = ''
  );

-- 3. Drop the old open policies (the new ones above are already in place).
drop policy if exists "tires_anon_all" on public.tires;
drop policy if exists "tire_skus_anon_all" on public.tire_skus;
drop policy if exists "warehouses_anon_all" on public.warehouses;
drop policy if exists "inward_receipts_anon_all" on public.inward_receipts;
drop policy if exists "placement_logs_anon_all" on public.placement_logs;
drop policy if exists "tire_history_anon_all" on public.tire_history;
drop policy if exists "picks_anon_all" on public.picks;
drop policy if exists "deleted_tires_anon_all" on public.deleted_tires;
drop policy if exists "outwards_anon_all" on public.outwards;
drop policy if exists "plan_numbers_anon_all" on public.plan_numbers;
drop policy if exists "prepared_plans_anon_all" on public.prepared_plans;
drop policy if exists "plan_pending_tires_anon_all" on public.plan_pending_tires;
drop policy if exists "bay_bookings_anon_all" on public.bay_bookings;
drop policy if exists "bay_plan_history_anon_all" on public.bay_plan_history;
drop policy if exists "inward_pending_select" on public.inward_pending;
drop policy if exists "inward_pending_insert" on public.inward_pending;
drop policy if exists "plan_block_tires_select" on public.plan_block_tires;
drop policy if exists "plan_block_tires_insert" on public.plan_block_tires;

-- 4. anon (the public key with no login) gets nothing on these tables.
revoke all on table
  public.tires, public.tire_skus, public.warehouses, public.inward_receipts,
  public.placement_logs, public.tire_history, public.picks, public.deleted_tires,
  public.outwards, public.plan_numbers, public.prepared_plans, public.plan_pending_tires,
  public.bay_bookings, public.bay_plan_history, public.inward_pending, public.plan_block_tires
from anon;

-- 5. Retire the old user-id based entry points (functions are kept for rollback).
revoke execute on function public.putaway_pallet(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_pending_pallet(text, uuid) from public, anon, authenticated;
revoke execute on function public.unblock_plan_tyre(bigint, text) from public, anon, authenticated;
revoke execute on function public.unblock_plan_tyres(text, text) from public, anon, authenticated;
revoke execute on function public.app_login(text, text) from public, anon, authenticated;
revoke execute on function public.app_list_users(uuid) from public, anon, authenticated;
revoke execute on function public.app_create_user(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.app_delete_user(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.app_is_admin(uuid) from public, anon, authenticated;

-- 6. Safety check: nothing open may remain on these tables. Aborts (changes nothing) if so.
do $$
declare
  v_left integer;
begin
  select count(*) into v_left
  from pg_policies
  where schemaname = 'public'
    and tablename in ('tires','tire_skus','warehouses','inward_receipts','placement_logs','tire_history',
                      'picks','deleted_tires','outwards','plan_numbers','prepared_plans','plan_pending_tires',
                      'bay_bookings','bay_plan_history','inward_pending','plan_block_tires')
    and (roles && array['anon','public']::name[] or policyname not like 'rbac\_%');
  if v_left <> 0 then
    raise exception '% non-RBAC policies still present on operational tables - aborting', v_left;
  end if;
end $$;

commit;
