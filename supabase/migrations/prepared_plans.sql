-- Prepared plans: a Plan No made ahead of time on the Prepare Plan page
-- (src/pages/prepare-plan.tsx) with the tires it needs — one line per
-- Material with its description and quantity, kept as a jsonb array:
--   [{ "material": "100259-36", "description": "10-16.5 GX BB II ...", "qty": 20 }, ...]
-- Every prepared plan shows up in the Ongoing plan dropdown on Picking and
-- Outward; choosing it fills in the Plan No and selects all its tires there.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.prepared_plans (
  id text primary key,
  plan_no text not null unique,
  lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prepared_plans_created_at_idx on public.prepared_plans (created_at);

drop trigger if exists set_prepared_plans_updated_at on public.prepared_plans;
create trigger set_prepared_plans_updated_at
  before update on public.prepared_plans
  for each row
  execute function public.set_updated_at();

alter table public.prepared_plans enable row level security;

drop policy if exists "prepared_plans_anon_all" on public.prepared_plans;
create policy "prepared_plans_anon_all"
  on public.prepared_plans
  for all
  to anon, authenticated
  using (true)
  with check (true);
