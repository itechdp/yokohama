-- Warehouses and their bin layout: each warehouse has a bin-code prefix and
-- a list of columns, where each column has its own row count (racks aren't
-- uniform). Previously hardcoded in src/data/warehouse-bins.ts — now editable
-- from the Warehouses page instead of requiring a code change. Read by
-- Inward/Outward to build the bin-picker grid.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.warehouses (
  key text primary key,
  label text not null,
  prefix text not null,
  column_row_counts integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_warehouses_updated_at on public.warehouses;
create trigger set_warehouses_updated_at
  before update on public.warehouses
  for each row
  execute function public.set_updated_at();

alter table public.warehouses enable row level security;

drop policy if exists "warehouses_anon_all" on public.warehouses;
create policy "warehouses_anon_all"
  on public.warehouses
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Seed with the 3 warehouses that used to be hardcoded, so Inward/Outward
-- keep working immediately after this migration runs. Safe to re-run.
insert into public.warehouses (key, label, prefix, column_row_counts) values
  ('Warehouse-1', 'Warehouse 1', 'A', '{29,31,31,30,30,31,31,33,33,33,33,33,33,32}'),
  ('Warehouse-2', 'Warehouse 2', 'B', '{28,34,37,37,32,34,35,35,35,33,33,33,33,29}'),
  ('warehouse-4 (Domestic)', 'Warehouse 4 (Domestic)', 'D', '{20,22,21,21,21,25,27}')
on conflict (key) do nothing;
