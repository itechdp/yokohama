-- Loading bay history: one row per "occupancy session" — a plan no. sitting
-- on a bay from the moment it's entered until the bay is marked Closed (or
-- the plan is cleared/replaced). Lets the app answer "what closed on bay N
-- on date D" and "what closed on bay N in month M" without scanning raw
-- change logs. Populated client-side by src/lib/bay-history.ts whenever
-- bay_bookings is saved; bay_bookings itself stays current-state-only.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.bay_plan_history (
  id bigint generated always as identity primary key,
  bay integer not null,
  plan_no text not null,
  status text not null default 'running',
  qty integer not null default 0,
  pending_tire text not null default '',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bay_plan_history_bay_idx on public.bay_plan_history (bay);
create index if not exists bay_plan_history_closed_at_idx on public.bay_plan_history (closed_at);
create index if not exists bay_plan_history_open_idx on public.bay_plan_history (bay, opened_at) where closed_at is null;

drop trigger if exists set_bay_plan_history_updated_at on public.bay_plan_history;
create trigger set_bay_plan_history_updated_at
  before update on public.bay_plan_history
  for each row
  execute function public.set_updated_at();

-- Same anon-key-can-do-everything tradeoff as bay_bookings (see schema.sql) —
-- fine for this internal tool, revisit if auth gets added.
alter table public.bay_plan_history enable row level security;

drop policy if exists "bay_plan_history_anon_all" on public.bay_plan_history;
create policy "bay_plan_history_anon_all"
  on public.bay_plan_history
  for all
  to anon, authenticated
  using (true)
  with check (true);
