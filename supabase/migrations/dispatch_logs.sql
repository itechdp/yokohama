-- Dispatch logs: one row per tire added to a dispatch plan, tracking its
-- delivery status (Holding in Bay -> Loading -> Loaded -> ...). Was
-- previously written to browser localStorage only (invisible across
-- devices); now shared like everything else. Rows are updated in place as
-- status advances (see advanceStatus in src/pages/tire-dispatch.tsx).
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.dispatch_logs (
  id text primary key,
  tire_id text not null,
  plan_id text,
  driver_name text not null default '',
  destination text not null default '',
  status text not null default 'holding-bay',
  notes text not null default '',
  dispatched_at timestamptz not null default now(),
  dispatched_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispatch_logs_plan_id_idx on public.dispatch_logs (plan_id);
create index if not exists dispatch_logs_tire_id_idx on public.dispatch_logs (tire_id);

drop trigger if exists set_dispatch_logs_updated_at on public.dispatch_logs;
create trigger set_dispatch_logs_updated_at
  before update on public.dispatch_logs
  for each row
  execute function public.set_updated_at();

alter table public.dispatch_logs enable row level security;

drop policy if exists "dispatch_logs_anon_all" on public.dispatch_logs;
create policy "dispatch_logs_anon_all"
  on public.dispatch_logs
  for all
  to anon, authenticated
  using (true)
  with check (true);
