-- Outward pick log: one row per "I took N of this tire from this location"
-- report, replacing the old Outward flow (which read locations Inward had
-- already written). Standalone — not tied to any tires-table row or stage
-- transition. Append-only — rows are inserted, never updated.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.outward_picks (
  id text primary key,
  material text not null default '',
  description text not null default '',
  warehouse text not null default '',
  location text not null default '',
  quantity integer not null default 0,
  plan_no text not null default '',
  picked_at timestamptz not null default now(),
  picked_by text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outward_picks_material_idx on public.outward_picks (material);
create index if not exists outward_picks_picked_at_idx on public.outward_picks (picked_at);
create index if not exists outward_picks_plan_no_idx on public.outward_picks (plan_no);

drop trigger if exists set_outward_picks_updated_at on public.outward_picks;
create trigger set_outward_picks_updated_at
  before update on public.outward_picks
  for each row
  execute function public.set_updated_at();

alter table public.outward_picks enable row level security;

drop policy if exists "outward_picks_anon_all" on public.outward_picks;
create policy "outward_picks_anon_all"
  on public.outward_picks
  for all
  to anon, authenticated
  using (true)
  with check (true);
