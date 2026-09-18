-- Adds Picker Name to outward_picks — captured on the Outward page and
-- auto-filled into the exported PICK SHEET's "PICKER NAME" field.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.outward_picks
  add column if not exists picker_name text not null default '';
