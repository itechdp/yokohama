-- Adds per-column stand count to warehouses: how many physical stands (1 or
-- 2) sit in every area of that column — e.g. some columns only fit a single
-- stand, others fit two side by side. Applies uniformly to every row/area in
-- the column, same shape as column_row_counts. Floor count within a stand is
-- fixed everywhere and isn't configured here. Missing/null means every
-- column defaults to 1 stand, so existing warehouses are unaffected.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.warehouses
  add column if not exists column_stand_counts integer[];
