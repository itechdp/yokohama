-- Adds Pallet No and Shift to outward_picks — both now captured on the
-- Outward page (Pallet No as a text input, Shift as a 1/2/3 dropdown) and
-- shown on the exported PICK SHEET: Pallet No per row (PALLET NO column),
-- Shift as an auto-filled header field.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.outward_picks
  add column if not exists pallet_no text not null default '',
  add column if not exists shift text not null default '';
