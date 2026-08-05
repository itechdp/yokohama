-- Enforce one row per plan no. in bay_plan_history: closing the same plan
-- again (accidental double-click, toggling status back and forth, etc.)
-- should refresh that row's closed_at instead of adding a duplicate.
-- Run this once in the Supabase SQL Editor, after bay_plan_history.sql.

-- Dedupe any rows already created before this constraint existed, keeping
-- only the most recent (highest id) row per plan_no.
delete from public.bay_plan_history a
using public.bay_plan_history b
where a.plan_no = b.plan_no
  and a.id < b.id;

create unique index if not exists bay_plan_history_plan_no_key on public.bay_plan_history (plan_no);
