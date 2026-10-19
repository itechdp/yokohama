-- Unblock for Block Tyres. Run AFTER plan_block_tires.sql, once, in the Supabase
-- SQL Editor. Safe to re-run. Additive: existing records are not changed (they all
-- stay "blocked" until someone unblocks them).
--
-- Unblocking is a STATUS CHANGE, never a deletion:
--   * the record stays in History, marked Unblocked, with who and when;
--   * its plan, tyre and quantity are never altered;
--   * the browser still has no UPDATE/DELETE privilege on the table - the only way
--     to unblock is the two functions below, which touch nothing but the
--     unblocked_at / unblocked_by columns, and only on a still-blocked record.
--
-- "One row per plan + tyre" now applies to CURRENTLY BLOCKED rows only, so a tyre
-- that was unblocked can be blocked again under the same plan (as a new record).

alter table public.plan_block_tires add column if not exists unblocked_at timestamptz;
alter table public.plan_block_tires add column if not exists unblocked_by text not null default '';

drop index if exists public.plan_block_tires_plan_material_key;
create unique index if not exists plan_block_tires_active_plan_material_key
  on public.plan_block_tires (lower(btrim(plan_no)), lower(btrim(material)))
  where unblocked_at is null;

-- New records can only be created as blocked (never pre-unblocked).
drop policy if exists "plan_block_tires_insert" on public.plan_block_tires;
create policy "plan_block_tires_insert"
  on public.plan_block_tires
  for insert
  to anon, authenticated
  with check (unblocked_at is null and unblocked_by = '');

-- Unblock one record.
create or replace function public.unblock_plan_tyre(p_id bigint, p_by text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unblocked_at timestamptz;
begin
  select unblocked_at into v_unblocked_at from public.plan_block_tires where id = p_id for update;
  if not found then
    raise exception 'unblock: record not found';
  end if;
  if v_unblocked_at is not null then
    return jsonb_build_object('result', 'already_unblocked');
  end if;
  update public.plan_block_tires
  set unblocked_at = now(), unblocked_by = coalesce(btrim(p_by), '')
  where id = p_id;
  return jsonb_build_object('result', 'unblocked');
end;
$$;

-- Unblock every still-blocked record of one plan. Returns how many were unblocked.
create or replace function public.unblock_plan_tyres(p_plan_no text, p_by text default '')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if coalesce(btrim(p_plan_no), '') = '' then
    raise exception 'unblock: plan number is required';
  end if;
  update public.plan_block_tires
  set unblocked_at = now(), unblocked_by = coalesce(btrim(p_by), '')
  where lower(btrim(plan_no)) = lower(btrim(p_plan_no)) and unblocked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.unblock_plan_tyre(bigint, text) from public;
revoke all on function public.unblock_plan_tyres(text, text) from public;
grant execute on function public.unblock_plan_tyre(bigint, text) to anon, authenticated;
grant execute on function public.unblock_plan_tyres(text, text) to anon, authenticated;
