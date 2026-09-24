-- Adds Location to inward_receipts — the column is in inward_receipts.sql,
-- but tables created from an earlier version of that file never got it, and
-- since the Inward page writes `location` on every receipt, every insert into
-- such a table fails (so Inward confirms stop showing up plan-wise in
-- History).
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.inward_receipts
  add column if not exists location text not null default '';
