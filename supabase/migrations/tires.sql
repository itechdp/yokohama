-- Core tire inventory: one row per physical tire unit, tracked through its
-- lifecycle stage (production -> quality-check -> warehouse -> dispatch ->
-- dealer -> mounted -> retread -> scrapped). Written by Add Tire, Bulk
-- Upload, Inward, Outward, and Dispatch; shared across devices.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.tires (
  id text primary key,
  serial_number text not null default '',
  model text not null default '',
  size text not null default '',
  production_date date,
  current_stage text not null default 'production',
  location text not null default '',
  status text not null default 'active',
  notes text not null default '',
  warranty_months integer not null default 0,
  cost_price numeric not null default 0,
  ply_rating_bottom text,
  brand text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tires_current_stage_idx on public.tires (current_stage);
create index if not exists tires_serial_number_idx on public.tires (serial_number);

drop trigger if exists set_tires_updated_at on public.tires;
create trigger set_tires_updated_at
  before update on public.tires
  for each row
  execute function public.set_updated_at();

-- Same anon-key-can-do-everything tradeoff as tire_skus (see schema.sql) —
-- fine for this internal tool, revisit if auth gets added.
alter table public.tires enable row level security;

drop policy if exists "tires_anon_all" on public.tires;
create policy "tires_anon_all"
  on public.tires
  for all
  to anon, authenticated
  using (true)
  with check (true);
