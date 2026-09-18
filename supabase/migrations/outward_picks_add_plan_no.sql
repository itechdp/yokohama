-- Adds Plan No to outward_picks so several Outward confirms made under the
-- same plan no (possibly minutes apart, possibly from different devices) can
-- be grouped, and the exported PICK SHEET can show every one of them, not
-- just the last confirm.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.outward_picks
  add column if not exists plan_no text not null default '';

create index if not exists outward_picks_plan_no_idx on public.outward_picks (plan_no);
