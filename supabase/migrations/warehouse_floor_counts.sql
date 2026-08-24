-- Adds per-column floor count to warehouses: how many floors the picker
-- shows for every stand in that column. Applies uniformly to every
-- row/area in the column, same shape as column_row_counts and
-- column_stand_counts. Missing/null means every column defaults to
-- FLOOR_COUNT (6), so existing warehouses are unaffected.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.warehouses
  add column if not exists column_floor_counts integer[];
