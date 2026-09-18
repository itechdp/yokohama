-- Inward receipt log: one row per "this many of this tire arrived at this
-- bin" report, grouped by Material + bin within a single confirm — the
-- Inward mirror of outward_picks. Append-only — rows are inserted, never
-- updated. Backs the
-- cumulative "Daily Tire's Receipt & Put away" export: every row sharing a
-- Plan No and today's date is pulled together into one sheet, so a second
-- (or third) Inward confirmed later today under the same plan no shows up
-- alongside the first instead of replacing it.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.inward_receipts (
  id text primary key,
  material text not null default '',
  description text not null default '',
  warehouse text not null default '',
  location text not null default '',
  quantity integer not null default 0,
  plan_no text not null default '',
  received_at timestamptz not null default now(),
  received_by text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inward_receipts_material_idx on public.inward_receipts (material);
create index if not exists inward_receipts_received_at_idx on public.inward_receipts (received_at);
create index if not exists inward_receipts_plan_no_idx on public.inward_receipts (plan_no);

drop trigger if exists set_inward_receipts_updated_at on public.inward_receipts;
create trigger set_inward_receipts_updated_at
  before update on public.inward_receipts
  for each row
  execute function public.set_updated_at();

alter table public.inward_receipts enable row level security;

drop policy if exists "inward_receipts_anon_all" on public.inward_receipts;
create policy "inward_receipts_anon_all"
  on public.inward_receipts
  for all
  to anon, authenticated
  using (true)
  with check (true);
