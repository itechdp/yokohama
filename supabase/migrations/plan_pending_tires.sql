-- Pending tyres per dispatch plan: the "Pending Tyre" button on the Loading Bay
-- board lists every plan number currently entered across the 13 bays, and lets
-- staff log tyre + qty still owed against that plan. Shared across devices.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.plan_pending_tires (
  id bigint generated always as identity primary key,
  plan_no text not null,
  tire text not null default '',
  qty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plan_pending_tires_plan_no_idx on public.plan_pending_tires (plan_no);

drop trigger if exists set_plan_pending_tires_updated_at on public.plan_pending_tires;
create trigger set_plan_pending_tires_updated_at
  before update on public.plan_pending_tires
  for each row
  execute function public.set_updated_at();

-- Same anon-key-can-do-everything tradeoff as tire_skus (see schema.sql) —
-- fine for this internal tool, revisit if auth gets added.
alter table public.plan_pending_tires enable row level security;

drop policy if exists "plan_pending_tires_anon_all" on public.plan_pending_tires;
create policy "plan_pending_tires_anon_all"
  on public.plan_pending_tires
  for all
  to anon, authenticated
  using (true)
  with check (true);
