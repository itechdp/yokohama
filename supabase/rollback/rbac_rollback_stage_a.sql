-- ROLLBACK of RBAC stages A and B (migrations rbac_01 .. rbac_04).
--
-- Removes ONLY the objects those migrations created, and puts the two legacy functions
-- back to their original repository definitions. It never touches public.users or any
-- operational table. Run Stage C's rollback FIRST if rbac_05 was applied.
--
-- It DROPS the new tables (app_profiles, app_user_modules, app_audit_log,
-- app_login_attempts), including the audit log. Export them first if you want to keep
-- the history:  \copy (select * from public.app_audit_log) to 'audit.csv' csv header
--
-- Run only after explicit approval. Does not touch Supabase Auth users: remove those
-- separately (Dashboard -> Authentication) if you also want them gone.

begin;

-- Legacy functions back to the original definitions.
create or replace function public.putaway_pallet(
  p_pallet_id text,
  p_warehouse_key text,
  p_bin text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by text;
  v_pallet public.inward_pending%rowtype;
  v_wh public.warehouses%rowtype;
  v_now timestamptz := now();
  v_location text;
  v_rest text;
  v_col integer;
  v_row integer;
  v_ids text[] := '{}';
  v_note text;
  v_missing integer;
begin
  -- search_path is empty on purpose: every object below is schema-qualified.
  -- Who: taken from the users table, never from the caller's say-so.
  select u.username into v_by from public.users u where u.id = p_user_id;
  if v_by is null then
    raise exception 'putaway: not logged in (unknown user)';
  end if;

  -- Claim: lock the pallet row. A second request for the same pallet waits here
  -- until the first commits, then sees status = put_away below.
  select * into v_pallet from public.inward_pending where id = p_pallet_id for update;
  if not found then
    raise exception 'putaway: pallet not found';
  end if;
  if v_pallet.status = 'put_away' then
    return jsonb_build_object(
      'result', 'already_put_away',
      'warehouse', v_pallet.warehouse,
      'location', v_pallet.location,
      'quantity', v_pallet.quantity
    );
  end if;
  if v_pallet.status <> 'pending' then
    raise exception 'putaway: pallet is % and cannot be put away', v_pallet.status;
  end if;

  -- Destination: the warehouse must exist and the bin must be a real one in its
  -- layout, written exactly the way the app writes it (prefix + 2-digit row +
  -- '-' + 2-digit position).
  select * into v_wh from public.warehouses where key = p_warehouse_key;
  if not found then
    raise exception 'putaway: warehouse not found';
  end if;
  if p_bin is null or left(p_bin, length(v_wh.prefix)) <> v_wh.prefix then
    raise exception 'putaway: bin % is not in warehouse %', p_bin, v_wh.label;
  end if;
  v_rest := substr(p_bin, length(v_wh.prefix) + 1);
  if v_rest !~ '^[0-9]{2,}-[0-9]{2,}$' then
    raise exception 'putaway: bin % is not a valid bin code', p_bin;
  end if;
  v_col := split_part(v_rest, '-', 1)::integer;
  v_row := split_part(v_rest, '-', 2)::integer;
  if v_col < 1 or v_col > coalesce(cardinality(v_wh.column_row_counts), 0)
     or v_row < 1 or v_row > coalesce(v_wh.column_row_counts[v_col], 0)
     or p_bin <> v_wh.prefix || lpad(v_col::text, 2, '0') || '-' || lpad(v_row::text, 2, '0') then
    raise exception 'putaway: bin % does not exist in warehouse %', p_bin, v_wh.label;
  end if;

  v_location := v_wh.label || ' - Bin ' || p_bin;
  v_note := 'Inward (putaway): ' || v_pallet.description || ' moved to ' || v_location;

  -- Same as the Inward page: use production-stage units of this SKU already on
  -- record first (moved to the warehouse stage), then create the rest new. Any
  -- failure raises and rolls the whole transaction back.
  with picked as (
    select t.id from public.tires t
    where t.current_stage = 'production' and t.serial_number = v_pallet.material
    order by t.created_at, t.id
    limit v_pallet.quantity
    for update skip locked
  ), moved as (
    update public.tires t
    set current_stage = 'warehouse', location = v_location, updated_at = v_now
    from picked
    where t.id = picked.id
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from moved;

  v_missing := v_pallet.quantity - cardinality(v_ids);
  for k in 1..v_missing loop
    insert into public.tires (
      id, serial_number, model, size, production_date, current_stage, location,
      status, notes, warranty_months, cost_price, ply_rating_bottom, brand,
      sku_qr_code, created_at, updated_at
    ) values (
      't-' || v_pallet.id || '-' || k, v_pallet.material, v_pallet.description,
      'Unknown size', (v_now at time zone 'utc')::date, 'warehouse', v_location,
      'active', '', 60, 0, v_pallet.ply_rating_bottom, v_pallet.brand,
      null, v_now, v_now
    );
    v_ids := v_ids || ('t-' || v_pallet.id || '-' || k);
  end loop;

  insert into public.tire_history (id, tire_id, stage, location, moved_at, moved_by, notes)
  select 'h-' || tid, tid, 'warehouse', v_location, v_now, v_by, v_note
  from unnest(v_ids) as tid;

  insert into public.placement_logs (id, tire_id, location, placed_at, placed_by, notes)
  select 'p-' || tid, tid, v_location, v_now, v_by, v_note
  from unnest(v_ids) as tid;

  -- The receipt is what History and the Inward Excel read. Its time is the
  -- putaway time, the same as a normal Inward confirm.
  insert into public.inward_receipts (
    id, material, description, warehouse, location, quantity, plan_no, pallet_no,
    shift, picker_name, received_at, received_by, notes
  ) values (
    'ir-' || v_pallet.id, v_pallet.material, v_pallet.description, v_wh.label,
    v_location, v_pallet.quantity, v_pallet.plan_no, v_pallet.pallet_no,
    v_pallet.shift, v_pallet.picker_name, v_now, v_by, ''
  );

  insert into public.plan_numbers (plan_no, kind, last_used_at)
  values (v_pallet.plan_no, 'inward', v_now)
  on conflict (plan_no, kind) do update set last_used_at = excluded.last_used_at;

  update public.inward_pending
  set status = 'put_away', warehouse = v_wh.label, location = v_location,
      putaway_by = v_by, putaway_at = v_now
  where id = v_pallet.id;

  return jsonb_build_object(
    'result', 'put_away',
    'warehouse', v_wh.label,
    'location', v_location,
    'quantity', v_pallet.quantity
  );
end;
$$;

create or replace function public.cancel_pending_pallet(p_pallet_id text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by text;
  v_status text;
begin
  select u.username into v_by from public.users u where u.id = p_user_id;
  if v_by is null then
    raise exception 'cancel: not logged in (unknown user)';
  end if;

  select status into v_status from public.inward_pending where id = p_pallet_id for update;
  if not found then
    raise exception 'cancel: pallet not found';
  end if;
  if v_status = 'cancelled' then
    return jsonb_build_object('result', 'already_cancelled');
  end if;
  if v_status <> 'pending' then
    raise exception 'cancel: pallet is % and cannot be cancelled', v_status;
  end if;

  update public.inward_pending
  set status = 'cancelled', cancelled_by = v_by, cancelled_at = now()
  where id = p_pallet_id;
  return jsonb_build_object('result', 'cancelled');
end;
$$;

-- New functions
drop function if exists public.app_putaway_pallet(text, text, text);
drop function if exists public.app_cancel_pending_pallet(text);
drop function if exists public.app_unblock_plan_tyre(bigint);
drop function if exists public.app_unblock_plan_tyres(text);
drop function if exists public.app_login_record(text, text, boolean, uuid);
drop function if exists public.app_login_check(text, text);
drop function if exists public.app_after_password_change(uuid, uuid);
drop function if exists public.app_after_password_reset(uuid, uuid);
drop function if exists public.app_finalize_delete(uuid, uuid);
drop function if exists public.app_register_profile(uuid, text, text, text[], uuid);
drop function if exists public.app_authorize_manage(text, uuid, text);
drop function if exists public.app_set_user_role(uuid, text);
drop function if exists public.app_rename_user(uuid, text);
drop function if exists public.app_set_user_active(uuid, boolean);
drop function if exists public.app_set_user_modules(uuid, text[]);
drop function if exists public.app_list_audit(integer);
drop function if exists public.app_list_users();
drop function if exists public.app_me();
drop function if exists public.app_audit_write(uuid, text, uuid, text, jsonb);
drop function if exists public.app_can_manage(text, text);
drop function if exists public.app_has_any_module(text[]);
drop function if exists public.app_has_module(text);
drop function if exists public.app_is_staff();
drop function if exists public.app_actor();
drop function if exists public.app_module_keys();

-- New tables (the guard trigger blocks deleting a Super Admin row, so drop the trigger first)
drop trigger if exists app_profiles_guard on public.app_profiles;
drop trigger if exists app_audit_log_immutable on public.app_audit_log;
drop table if exists public.app_login_attempts;
drop table if exists public.app_audit_log;
drop table if exists public.app_user_modules;
drop table if exists public.app_profiles;
drop function if exists public.app_profiles_guard();
drop function if exists public.app_audit_log_immutable();

commit;
