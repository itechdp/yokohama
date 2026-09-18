-- Adds Pallet No and Shift to inward_receipts — both now captured on the
-- Inward page (Pallet No as a text input, Shift as a 1/2/3 dropdown) and
-- shown on the exported "Daily Tire's Receipt & Put away" sheet: Pallet No
-- per row (PALLET NO column), Shift as an auto-filled header field.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.inward_receipts
  add column if not exists pallet_no text not null default '',
  add column if not exists shift text not null default '';
