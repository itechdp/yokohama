-- Outward log: one row per "N of this tire left stock from this location"
-- confirmed on the Outward page (src/pages/tire-outward.tsx). Same columns as
-- picks, but Outward also changes stock: the page moves that many
-- warehouse-stage tires at the location to the dispatch stage. This table is
-- the record History and the export read back. Append-only.
--
-- Also lets plan_numbers hold an 'outward' pool again, next to 'inward' and
-- 'picking', so Outward's Plan No dropdown has its own plan numbers.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query),
-- AFTER rename_outward_to_picking.sql — that one turns old 'outward' plan
-- numbers into 'picking', which must happen before new Outward ones exist.
-- Depends on public.set_updated_at(), created by schema.sql.
-- Safe to re-run.

create table if not exists public.outwards (
  id text primary key,
  material text not null default '',
  description text not null default '',
  warehouse text not null default '',
  location text not null default '',
  quantity integer not null default 0,
  plan_no text not null default '',
  pallet_no text not null default '',
  shift text not null default '',
  picker_name text not null default '',
  outward_at timestamptz not null default now(),
  outward_by text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outwards_material_idx on public.outwards (material);
create index if not exists outwards_outward_at_idx on public.outwards (outward_at);
create index if not exists outwards_plan_no_idx on public.outwards (plan_no);

drop trigger if exists set_outwards_updated_at on public.outwards;
create trigger set_outwards_updated_at
  before update on public.outwards
  for each row
  execute function public.set_updated_at();

alter table public.outwards enable row level security;

drop policy if exists "outwards_anon_all" on public.outwards;
create policy "outwards_anon_all"
  on public.outwards
  for all
  to anon, authenticated
  using (true)
  with check (true);

alter table public.plan_numbers drop constraint if exists plan_numbers_kind_check;
alter table public.plan_numbers
  add constraint plan_numbers_kind_check check (kind in ('inward', 'picking', 'outward'));

-- Speeds up Outward's stock lookup (stage + material + exact location).
create index if not exists tires_stock_lookup_idx on public.tires (current_stage, serial_number, location);

notify pgrst, 'reload schema';
