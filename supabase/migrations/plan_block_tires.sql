-- Block Tyres per dispatch plan: the "Block Tyres" button on the Loading Bay board
-- lists every plan number currently on a bay and lets staff record which tyre (SKU /
-- Material) and how many are blocked for that plan. Record-keeping only: it never
-- reads or changes stock (tires) or picking, and Pending Tyres (plan_pending_tires)
-- is a separate table, untouched.
--
-- Records are PERMANENT: the app can read and insert only. There is no update or
-- delete policy and no UPDATE/DELETE privilege for the app's key, so a saved record
-- can't be edited or removed from the browser.
--
-- One row per plan + tyre: saving the same tyre under the same plan again is refused
-- (unique index), and the app shows the quantity already saved.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Safe to re-run. Needs nothing else (it does not depend on any other table).

create table if not exists public.plan_block_tires (
  id bigint generated always as identity primary key,
  plan_no text not null check (btrim(plan_no) <> ''),
  material text not null check (btrim(material) <> ''), -- the SKU / Material code from tire_skus
  description text not null default '',
  qty integer not null check (qty between 1 and 99999),
  created_by text not null default '',                  -- username of whoever saved it
  created_at timestamptz not null default now()
);

create unique index if not exists plan_block_tires_plan_material_key
  on public.plan_block_tires (lower(btrim(plan_no)), lower(btrim(material)));
create index if not exists plan_block_tires_created_at_idx on public.plan_block_tires (created_at desc);

alter table public.plan_block_tires enable row level security;

drop policy if exists "plan_block_tires_select" on public.plan_block_tires;
drop policy if exists "plan_block_tires_insert" on public.plan_block_tires;

create policy "plan_block_tires_select"
  on public.plan_block_tires
  for select
  to anon, authenticated
  using (true);

create policy "plan_block_tires_insert"
  on public.plan_block_tires
  for insert
  to anon, authenticated
  with check (true);

-- Supabase grants everything by default; cut it back to read + add only.
revoke all on table public.plan_block_tires from anon, authenticated;
grant select, insert on table public.plan_block_tires to anon, authenticated;
