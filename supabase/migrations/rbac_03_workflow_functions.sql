-- RBAC step 3 of 5 - workflow functions that need to know WHO is acting.
--
-- Requires rbac_01 and rbac_02. Contains:
--   A. putaway_pallet / cancel_pending_pallet: the SAME functions as in
--      inward_pending.sql, with ONE line changed - the acting user's name is looked up
--      in app_profiles first and falls back to the legacy public.users. Without this,
--      accounts created after the switch to Supabase Auth would be rejected as
--      "unknown user". Signature, behaviour and return values are unchanged.
--   B. New app_* wrappers the app calls after the switch. They take NO user id: the
--      actor comes from the verified session, and the caller must hold the module.
--
-- IMPORTANT: part A is a replacement of an existing production function. Before running
-- it, compare it with the live definition (select pg_get_functiondef(...)) - the live
-- function may differ from the repository copy. Back up the live definition first.
--
-- DO NOT RUN ON PRODUCTION until the production migration is approved. Staging first.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- A. Existing functions - actor lookup widened (one line)
-- ---------------------------------------------------------------------------
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
  select coalesce((select p.username from public.app_profiles p where p.id = p_user_id),
                   (select u.username from public.users u where u.id = p_user_id)) into v_by;
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
  select coalesce((select p.username from public.app_profiles p where p.id = p_user_id),
                   (select u.username from public.users u where u.id = p_user_id)) into v_by;
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

-- ---------------------------------------------------------------------------
-- B. New wrappers - actor and permission come from the session
-- ---------------------------------------------------------------------------
create or replace function public.app_putaway_pallet(p_pallet_id text, p_warehouse_key text, p_bin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.app_has_module('putaway') then
    raise exception 'Not allowed';
  end if;
  return public.putaway_pallet(p_pallet_id, p_warehouse_key, p_bin, auth.uid());
end;
$$;

create or replace function public.app_cancel_pending_pallet(p_pallet_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.app_has_module('putaway') then
    raise exception 'Not allowed';
  end if;
  return public.cancel_pending_pallet(p_pallet_id, auth.uid());
end;
$$;

-- Same behaviour as unblock_plan_tyre / unblock_plan_tyres, but only Loading Bay users
-- may call them, and "unblocked_by" is the signed-in user, not a name the browser sends.
create or replace function public.app_unblock_plan_tyre(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by text;
  v_unblocked_at timestamptz;
begin
  if not public.app_has_module('loading_bay') then
    raise exception 'Not allowed';
  end if;
  select username into v_by from public.app_profiles where id = auth.uid();

  select unblocked_at into v_unblocked_at from public.plan_block_tires where id = p_id for update;
  if not found then
    raise exception 'unblock: record not found';
  end if;
  if v_unblocked_at is not null then
    return jsonb_build_object('result', 'already_unblocked');
  end if;
  update public.plan_block_tires
  set unblocked_at = now(), unblocked_by = coalesce(btrim(v_by), '')
  where id = p_id;
  return jsonb_build_object('result', 'unblocked');
end;
$$;

create or replace function public.app_unblock_plan_tyres(p_plan_no text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by text;
  v_count integer;
begin
  if not public.app_has_module('loading_bay') then
    raise exception 'Not allowed';
  end if;
  if coalesce(btrim(p_plan_no), '') = '' then
    raise exception 'unblock: plan number is required';
  end if;
  select username into v_by from public.app_profiles where id = auth.uid();

  update public.plan_block_tires
  set unblocked_at = now(), unblocked_by = coalesce(btrim(v_by), '')
  where lower(btrim(plan_no)) = lower(btrim(p_plan_no)) and unblocked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.app_putaway_pallet(text, text, text) from public, anon;
revoke all on function public.app_cancel_pending_pallet(text) from public, anon;
revoke all on function public.app_unblock_plan_tyre(bigint) from public, anon;
revoke all on function public.app_unblock_plan_tyres(text) from public, anon;
grant execute on function public.app_putaway_pallet(text, text, text) to authenticated;
grant execute on function public.app_cancel_pending_pallet(text) to authenticated;
grant execute on function public.app_unblock_plan_tyre(bigint) to authenticated;
grant execute on function public.app_unblock_plan_tyres(text) to authenticated;
