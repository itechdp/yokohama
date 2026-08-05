-- Bin placement log: one row per tire placed into a warehouse bin (Inward).
-- Was previously written to browser localStorage only; now shared like
-- everything else. Append-only — rows are inserted, never updated.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.placement_logs (
  id text primary key,
  tire_id text not null,
  location text not null default '',
  placed_at timestamptz not null default now(),
  placed_by text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists placement_logs_tire_id_idx on public.placement_logs (tire_id);

drop trigger if exists set_placement_logs_updated_at on public.placement_logs;
create trigger set_placement_logs_updated_at
  before update on public.placement_logs
  for each row
  execute function public.set_updated_at();

alter table public.placement_logs enable row level security;

drop policy if exists "placement_logs_anon_all" on public.placement_logs;
create policy "placement_logs_anon_all"
  on public.placement_logs
  for all
  to anon, authenticated
  using (true)
  with check (true);
