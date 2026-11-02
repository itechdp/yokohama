-- ROLLBACK of RBAC stage C (migration rbac_05_rls_cutover.sql).
--
-- Puts back the open policies and privileges as they are defined in the repository.
-- BEFORE running rbac_05 on a real database, ALSO export the live policies and grants
-- (pg_policies, information_schema.role_table_grants) - if the live ones ever differed
-- from the repository, restore those instead of this file.
--
-- Reopening these policies re-opens the original security hole (the public key can read
-- and write these tables again). Only run it to recover from a failed cutover, and only
-- after explicit approval. Touches policies, privileges and function grants only - no data.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['tires','tire_skus','warehouses','inward_receipts','placement_logs','tire_history',
                           'picks','deleted_tires','outwards','plan_numbers','prepared_plans',
                           'plan_pending_tires','bay_bookings','bay_plan_history']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
                   t || '_anon_all', t);
    execute format('grant all on table public.%I to anon', t);
  end loop;
end $$;

-- inward_pending and plan_block_tires: original select + insert policies and privileges.
drop policy if exists "inward_pending_select" on public.inward_pending;
drop policy if exists "inward_pending_insert" on public.inward_pending;
create policy "inward_pending_select" on public.inward_pending for select to anon, authenticated using (true);
create policy "inward_pending_insert" on public.inward_pending for insert to anon, authenticated
  with check (
    status = 'pending'
    and putaway_by = '' and putaway_at is null and warehouse = '' and location = ''
    and cancelled_by = '' and cancelled_at is null
  );
grant select, insert on table public.inward_pending to anon, authenticated;

drop policy if exists "plan_block_tires_select" on public.plan_block_tires;
drop policy if exists "plan_block_tires_insert" on public.plan_block_tires;
create policy "plan_block_tires_select" on public.plan_block_tires for select to anon, authenticated using (true);
create policy "plan_block_tires_insert" on public.plan_block_tires for insert to anon, authenticated
  with check (unblocked_at is null and unblocked_by = '');
grant select, insert on table public.plan_block_tires to anon, authenticated;

-- Remove the RBAC policies.
do $$
declare
  r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and policyname like 'rbac\_%'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Old entry points callable again.
grant execute on function public.putaway_pallet(text, text, text, uuid) to anon, authenticated;
grant execute on function public.cancel_pending_pallet(text, uuid) to anon, authenticated;
grant execute on function public.unblock_plan_tyre(bigint, text) to anon, authenticated;
grant execute on function public.unblock_plan_tyres(text, text) to anon, authenticated;
grant execute on function public.app_login(text, text) to anon, authenticated;
grant execute on function public.app_list_users(uuid) to anon, authenticated;
grant execute on function public.app_create_user(uuid, text, text, text) to anon, authenticated;
grant execute on function public.app_delete_user(uuid, uuid) to anon, authenticated;
grant execute on function public.app_is_admin(uuid) to anon, authenticated;

commit;
