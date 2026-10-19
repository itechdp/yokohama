-- Case 1 / Case 2 for the Inward and Putaway pages.
--
-- Each tire SKU belongs to one case, and each saved pallet / inward receipt
-- remembers which case it was entered under. Inward only offers the selected
-- case's SKUs; Putaway only lists the selected case's pending pallets.
--
-- Run once in the Supabase SQL Editor, AFTER inward_pending.sql, and BEFORE
-- deploying the app version that uses it (the app writes/reads case_no).
-- Safe to re-run. Additive only: nothing is deleted or rewritten, and every
-- existing row keeps case_no = NULL ("no case yet") - this file never guesses
-- a case for old data.
--
--   * tire_skus.case_no       NULL until an admin tags the SKU. Inward shows the
--                             selected case's SKUs plus untagged ones (so the
--                             catalog works as before until it is tagged); a
--                             tagged SKU shows only under its own case. Tag your
--                             catalog (see the example at the bottom).
--   * inward_pending.case_no  set by the app when the cage saves the pallet.
--                             Old pending pallets stay NULL and are shown under
--                             BOTH cases (flagged "No case") so none gets stuck.
--   * inward_receipts.case_no set by the app for direct inwards; receipts made
--                             by putaway_pallet copy it from the pallet (trigger
--                             below - putaway_pallet itself is unchanged).

alter table public.tire_skus add column if not exists case_no smallint
  check (case_no in (1, 2));
alter table public.inward_pending add column if not exists case_no smallint
  check (case_no in (1, 2));
alter table public.inward_receipts add column if not exists case_no smallint
  check (case_no in (1, 2));

create index if not exists tire_skus_case_no_idx on public.tire_skus (case_no);
create index if not exists inward_pending_case_status_idx on public.inward_pending (status, case_no);

-- Receipts created inside putaway_pallet get the pallet's case ('ir-' || pallet id).
create or replace function public.inward_receipts_fill_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.case_no is null and new.id like 'ir-%' then
    select p.case_no into new.case_no from public.inward_pending p where p.id = substr(new.id, 4);
  end if;
  return new;
end;
$$;

drop trigger if exists inward_receipts_fill_case on public.inward_receipts;
create trigger inward_receipts_fill_case
  before insert on public.inward_receipts
  for each row
  execute function public.inward_receipts_fill_case();

-- Tagging the catalog (run yourself, with your own list - NOT run by this file):
--   update public.tire_skus set case_no = 1 where material in ('100259-36', '100260-36');
--   update public.tire_skus set case_no = 2 where material in ('135046-36');
