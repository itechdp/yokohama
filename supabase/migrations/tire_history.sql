-- Tire stage/movement history: one row per "tire moved" event (Inward,
-- Outward, Dispatch). Was previously written to browser localStorage only
-- (invisible across devices); now shared like everything else. Append-only —
-- rows are inserted, never updated.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.tire_history (
  id text primary key,
  tire_id text not null,
  stage text not null default '',
  location text not null default '',
  moved_at timestamptz not null default now(),
  moved_by text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tire_history_tire_id_idx on public.tire_history (tire_id);

drop trigger if exists set_tire_history_updated_at on public.tire_history;
create trigger set_tire_history_updated_at
  before update on public.tire_history
  for each row
  execute function public.set_updated_at();

-- Same anon-key-can-do-everything tradeoff as tire_skus (see schema.sql) —
-- fine for this internal tool, revisit if auth gets added.
alter table public.tire_history enable row level security;

drop policy if exists "tire_history_anon_all" on public.tire_history;
create policy "tire_history_anon_all"
  on public.tire_history
  for all
  to anon, authenticated
  using (true)
  with check (true);
