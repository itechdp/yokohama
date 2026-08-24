-- Stand labels were renamed: the picker now starts stand letters at A, B, C,
-- ... (see STAND_IDS in src/data/warehouse-bins.ts) instead of X, Y, Z. Any
-- tire already placed under the old X/Y/Z labels needs its stored location
-- string updated to match, or it becomes invisible in the picker grid (the
-- grid only recognizes bin codes it can currently generate, i.e. A/B/C...).
--
-- A tire's location is built as "<warehouse label> - Bin <area>-<stand><floor>"
-- (see locationForBin in src/data/warehouse-bins.ts), e.g. "ATM - Bin Z01-01-X6".
-- The stand+floor segment is always the LAST component, so this only touches
-- a trailing "-X<digits>" / "-Y<digits>" / "-Z<digits>" at the very end of
-- the string ($ anchor) — it cannot match a warehouse's bin prefix (e.g. a
-- warehouse whose prefix happens to be "Z") or any other part of the string.
--
-- Run this ONCE in the Supabase SQL Editor, ideally right after deploying the
-- code change, so the app and the stored data agree at all times. Safe to
-- re-run — after the first run nothing will match "-X\d+$" etc. anymore, so
-- later runs are no-ops.

update public.tires
  set location = regexp_replace(location, '-X([0-9]+)$', '-A\1')
  where location ~ '-X[0-9]+$';

update public.tires
  set location = regexp_replace(location, '-Y([0-9]+)$', '-B\1')
  where location ~ '-Y[0-9]+$';

update public.tires
  set location = regexp_replace(location, '-Z([0-9]+)$', '-C\1')
  where location ~ '-Z[0-9]+$';
