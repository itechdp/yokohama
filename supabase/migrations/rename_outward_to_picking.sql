-- "Outward" is now "Picking" everywhere — the page (/tires/picking), the
-- History filter, and the database:
--
-- 1. public.outward_picks is renamed to public.picks (see src/lib/picks.ts),
--    along with its indexes, updated_at trigger and RLS policy. Every
--    existing row is kept as-is.
-- 2. plan_numbers.kind 'outward' becomes 'picking' (see PlanNoKind in
--    src/lib/plan-numbers.ts), and the kind check constraint is updated to
--    allow ('inward', 'picking').
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query),
-- at the same time the new app code goes live — the old code reads
-- outward_picks / 'outward' and the new code reads picks / 'picking'.
-- Safe to re-run: every step is skipped once it has already been applied.

begin;

-- 1. outward_picks -> picks
alter table if exists public.outward_picks rename to picks;

alter index if exists public.outward_picks_material_idx rename to picks_material_idx;
alter index if exists public.outward_picks_picked_at_idx rename to picks_picked_at_idx;
alter index if exists public.outward_picks_plan_no_idx rename to picks_plan_no_idx;

drop trigger if exists set_outward_picks_updated_at on public.picks;
drop trigger if exists set_picks_updated_at on public.picks;
create trigger set_picks_updated_at
  before update on public.picks
  for each row
  execute function public.set_updated_at();

drop policy if exists "outward_picks_anon_all" on public.picks;
drop policy if exists "picks_anon_all" on public.picks;
create policy "picks_anon_all"
  on public.picks
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- 2. plan_numbers.kind 'outward' -> 'picking'
alter table public.plan_numbers drop constraint if exists plan_numbers_kind_check;
update public.plan_numbers set kind = 'picking' where kind = 'outward';
alter table public.plan_numbers
  add constraint plan_numbers_kind_check check (kind in ('inward', 'picking'));

commit;

-- Make the Supabase API pick up the renamed table right away.
notify pgrst, 'reload schema';
