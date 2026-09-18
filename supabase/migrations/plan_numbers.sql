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
