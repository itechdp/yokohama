-- Pending putaway (cage -> forklift) for the Inward page.
--
-- The cage employee saves pallets (Pallet No + SKU + Qty, under a Driver Name /
-- Sheet No / Date / Shift) into inward_pending. They are NOT stock: nothing in
-- `tires` exists for them until the forklift employee confirms the putaway.
-- Confirming runs ONE database function (putaway_pallet below), i.e. one
-- transaction: tires, tire_history, placement_logs, the inward_receipts row and
-- the pallet's own status change all commit together or not at all, and calling
-- it again for a finished pallet changes nothing (no duplicate stock).
--
-- status:  pending -> put_away    (only through putaway_pallet)
--          pending -> cancelled   (only through cancel_pending_pallet)
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Needs the app's existing tables: tires, tire_history, placement_logs,
-- inward_receipts (with location, pallet_no, shift, picker_name), plan_numbers,
-- warehouses, users, and public.set_updated_at(). Additive only: no existing
-- table is changed.
--
-- ACCESS LIMITS (unchanged by this file - the app has no database login):
--   * The "logged in user" is only an id kept in the browser, and every request
--     uses the public anon key. The functions check the id exists in public.users
--     and take the username from that row, but cannot prove who is calling.
--   * Pending rows can only be read and inserted (as plain 'pending') directly;
--     update/delete/truncate are not granted. Status changes go through the two
--     functions only. Any valid user can put away or cancel any pending pallet.
--   * The existing stock tables keep their open "anon_all" policies, so anyone
--     with the anon key can still write them directly and bypass this workflow.
--     Tightening those needs its own review; this file does not touch them.

create table if not exists public.inward_pending (
  id text primary key,
  material text not null check (btrim(material) <> ''),
  description text not null default '',
  brand text,
  ply_rating_bottom text,
  quantity integer not null check (quantity > 0),
  pallet_no text not null check (btrim(pallet_no) <> ''),
  plan_no text not null check (btrim(plan_no) <> ''),
  shift text not null check (btrim(shift) <> ''),
  entry_date date not null default current_date, -- the Date the cage entered
  picker_name text not null default '',          -- the Driver Name the cage entered
  status text not null default 'pending'
    check (status in ('pending', 'put_away', 'cancelled')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  putaway_by text not null default '',
  putaway_at timestamptz,
  warehouse text not null default '',
  location text not null default '',
  cancelled_by text not null default '',
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists inward_pending_status_idx on public.inward_pending (status);
create index if not exists inward_pending_plan_no_idx on public.inward_pending (plan_no);

drop trigger if exists set_inward_pending_updated_at on public.inward_pending;
create trigger set_inward_pending_updated_at
  before update on public.inward_pending
  for each row
  execute function public.set_updated_at();

alter table public.inward_pending enable row level security;

drop policy if exists "inward_pending_anon_all" on public.inward_pending;
drop policy if exists "inward_pending_select" on public.inward_pending;
drop policy if exists "inward_pending_insert" on public.inward_pending;

create policy "inward_pending_select"
  on public.inward_pending
  for select
  to anon, authenticated
  using (true);

-- New rows can only be created as plain pending pallets.
create policy "inward_pending_insert"
  on public.inward_pending
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and putaway_by = '' and putaway_at is null and warehouse = '' and location = ''
    and cancelled_by = '' and cancelled_at is null
  );

-- No update/delete policy exists; also cut the table privileges back to select +
-- insert (Supabase grants everything by default, including TRUNCATE and TRIGGER).
revoke all on table public.inward_pending from anon, authenticated;
grant select, insert on table public.inward_pending to anon, authenticated;

-- ---------------------------------------------------------------------------
-- putaway_pallet: the forklift employee's confirm, as one transaction.
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

-- ---------------------------------------------------------------------------
-- cancel_pending_pallet: a pallet saved by mistake. Only touches the pending
-- row - it never reads or writes tires, so it cannot affect stock.
-- ---------------------------------------------------------------------------
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

revoke all on function public.putaway_pallet(text, text, text, uuid) from public;
revoke all on function public.cancel_pending_pallet(text, uuid) from public;
grant execute on function public.putaway_pallet(text, text, text, uuid) to anon, authenticated;
grant execute on function public.cancel_pending_pallet(text, uuid) to anon, authenticated;
