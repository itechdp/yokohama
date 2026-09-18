-- Adds Picker Name to inward_receipts — captured on the Inward page and
-- auto-filled into the exported sheet's "FID SUPERVISOR NAME" field.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.inward_receipts
  add column if not exists picker_name text not null default '';
