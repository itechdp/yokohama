-- Loading bay board: one row per bay (1-13, fixed by the app) tracking what's
-- pending there. Shared across devices so the whole floor sees the same board.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.bay_bookings (
  bay integer primary key,
  pending_tire text not null default '',
  plan_no text not null default '',
  status text not null default 'running',
  qty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_bay_bookings_updated_at on public.bay_bookings;
create trigger set_bay_bookings_updated_at
  before update on public.bay_bookings
  for each row
  execute function public.set_updated_at();

-- Same anon-key-can-do-everything tradeoff as tire_skus (see schema.sql) —
-- fine for this internal tool, revisit if auth gets added.
alter table public.bay_bookings enable row level security;

drop policy if exists "bay_bookings_anon_all" on public.bay_bookings;
create policy "bay_bookings_anon_all"
  on public.bay_bookings
  for all
  to anon, authenticated
  using (true)
  with check (true);
