-- Stand labeling changed again: it now starts at X, Y, Z, then continues
-- A, B, C, ... instead of starting fresh at A (see STAND_IDS in
-- src/data/warehouse-bins.ts). This reverses rename_stands_xyz_to_abc.sql
-- (which has already been run against this database) and ALSO correctly
-- shifts every stand beyond the 3rd, since that migration's A/B/C/D/E/...
-- scheme is now offset by 3 positions from the new X/Y/Z/A/B/C/... scheme.
--
-- This is a full rotation, not a simple 3-letter swap — a column configured
-- with more than 3 stands has real data under D, E, F, ... today, and every
-- one of those needs to shift too (D->A, E->B, F->C, ..., X->U, Y->V, Z->W).
-- The mapping below is: old letter (current DB state, plain A-Z order) ->
-- new letter (X,Y,Z,A,B,C,...,W order), position for position.
--
-- A tire's location is built as "<warehouse label> - Bin <area>-<stand><floor>"
-- (see locationForBin in src/data/warehouse-bins.ts), e.g. "ATM - Bin Z01-01-A6".
-- The stand+floor segment is always the LAST component, so this only touches
-- a trailing "-<Letter><digits>" at the very end of the string ($ anchor) —
-- it cannot match a warehouse's bin prefix or any other part of the string.
-- Each row is transformed in one shot from its original value (via the join
-- below), so there's no risk of a letter being shifted twice in one run.
--
-- Run this ONCE in the Supabase SQL Editor.
--
-- IMPORTANT — unlike the earlier migration, this one is NOT safe to re-run:
-- since X, Y, Z appear as both a source letter (old scheme) and a valid
-- target letter (new scheme), running it a second time would rotate every
-- stand again instead of being a no-op. Run it exactly once.

with stand_map(old_letter, new_letter) as (
  values
    ('A', 'X'), ('B', 'Y'), ('C', 'Z'), ('D', 'A'), ('E', 'B'), ('F', 'C'),
    ('G', 'D'), ('H', 'E'), ('I', 'F'), ('J', 'G'), ('K', 'H'), ('L', 'I'),
    ('M', 'J'), ('N', 'K'), ('O', 'L'), ('P', 'M'), ('Q', 'N'), ('R', 'O'),
    ('S', 'P'), ('T', 'Q'), ('U', 'R'), ('V', 'S'), ('W', 'T'), ('X', 'U'),
    ('Y', 'V'), ('Z', 'W')
)
update public.tires t
set location = regexp_replace(
  t.location,
  '-[A-Z][0-9]+$',
  '-' || m.new_letter || substring(t.location from '-[A-Z]([0-9]+)$')
)
from stand_map m
where t.location ~ ('-' || m.old_letter || '[0-9]+$');
