-- Registry of Plan Nos "in play" today, shared across every device — backs
-- the Plan No dropdown on Inward and Outward. Several plan numbers can be
-- active on the same day, each grouping any number of confirms made under
-- it. Inward and Outward each have their OWN pool — the same text ("123")
-- can independently exist as an Inward plan no and an Outward plan no,
-- tracked as separate rows via the (plan_no, kind) primary key, so one
-- flow's plan numbers never show up in the other's dropdown.
--
-- A row is upserted (not inserted) every time a plan no is picked or typed,
-- bumping last_used_at to now — that's what lets a plan no reused on a later
-- day work correctly: today's dropdown only lists rows whose last_used_at
-- falls on today, so a stale plan no from a previous day simply doesn't show
-- up, with no cleanup job needed. Rows are never deleted, so history isn't lost.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.plan_numbers (
  plan_no text not null,
  kind text not null check (kind in ('inward', 'outward')),
  last_used_at timestamptz not null default now(),
  primary key (plan_no, kind)
);

create index if not exists plan_numbers_last_used_at_idx on public.plan_numbers (last_used_at);

alter table public.plan_numbers enable row level security;

drop policy if exists "plan_numbers_anon_all" on public.plan_numbers;
create policy "plan_numbers_anon_all"
  on public.plan_numbers
  for all
  to anon, authenticated
  using (true)
  with check (true);
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
-- Adds Plan No to outward_picks so several Outward confirms made under the
-- same plan no (possibly minutes apart, possibly from different devices) can
-- be grouped, and the exported PICK SHEET can show every one of them, not
-- just the last confirm.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.outward_picks
  add column if not exists plan_no text not null default '';

create index if not exists outward_picks_plan_no_idx on public.outward_picks (plan_no);
