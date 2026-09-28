-- Stands and floors are gone: a bin is now just Row + Position, e.g.
-- "Z01-01" instead of "Z01-01-X3" (see binsForWarehouse in
-- src/data/warehouse-bins.ts). The stand popup, the Select Stand / Select
-- Floor dropdowns on Inward/Outward, and the per-column Stands/Floors
-- settings on the Warehouses page were removed with it.
--
-- 1. Tires currently in stock keep their Row + Position and lose the
--    stand/floor suffix, so they still show on the bin map and in Stock.
--    The suffix is always the LAST component of a location
--    ("<warehouse label> - Bin <prefix><col>-<row>-<stand><floor>"), so this
--    only touches a trailing "-<Letters><digits?>" at the very end of the
--    string ($ anchor), right after the numeric row. Covers both the old
--    "-X3" form and the "-X" form (if remove_floors.sql was already run).
--    History (inward_receipts, outward_picks, tire_history, placement_logs)
--    is deliberately left as it was recorded.
--
-- 2. warehouses.column_stand_counts and warehouses.column_floor_counts are
--    dropped — nothing reads or writes them anymore.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Safe to re-run: once the suffix is stripped, nothing matches again.

update public.tires
set location = regexp_replace(location, '-[A-Z]+[0-9]*$', '')
where current_stage = 'warehouse'
  and location ~ ' - Bin .*-[0-9]+-[A-Z]+[0-9]*$';

alter table public.warehouses
  drop column if exists column_stand_counts,
  drop column if exists column_floor_counts;
