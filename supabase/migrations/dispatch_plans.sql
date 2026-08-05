-- Dispatch plans: one truck/driver/destination plan that tyres get added to
-- before the truck is marked dispatched (see src/pages/tire-dispatch.tsx).
-- Was previously written to browser localStorage only (invisible across
-- devices); now shared like everything else.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.dispatch_plans (
  id text primary key,
  driver_name text not null default '',
  destination text not null default '',
  truck_number text not null default '',
  notes text not null default '',
  status text not null default 'open',
  created_by text not null default '',
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispatch_plans_status_idx on public.dispatch_plans (status);

drop trigger if exists set_dispatch_plans_updated_at on public.dispatch_plans;
create trigger set_dispatch_plans_updated_at
  before update on public.dispatch_plans
  for each row
  execute function public.set_updated_at();

alter table public.dispatch_plans enable row level security;

drop policy if exists "dispatch_plans_anon_all" on public.dispatch_plans;
create policy "dispatch_plans_anon_all"
  on public.dispatch_plans
  for all
  to anon, authenticated
  using (true)
  with check (true);
