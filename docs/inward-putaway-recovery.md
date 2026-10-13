# Inward putaway - recovery procedure

Applies to Pending Putaway on the Inward page
(`supabase/migrations/inward_pending.sql`, `src/components/pending-putaway-panel.tsx`,
`src/lib/inward-putaway.ts`).

## Why there is little to recover

Confirming a putaway is ONE database transaction (`putaway_pallet`). It either commits
everything - tires, tire_history, placement_logs, the inward_receipts row, the plan number
and the pallet's `put_away` status - or none of it. There is no "in progress" state and no
half-saved pallet. Calling it again for a pallet that is already put away changes nothing
and tells the operator so.

An interrupted putaway therefore ends in exactly one of two states:

| What the operator saw | What actually happened | What to do |
|---|---|---|
| An error message | Nothing was saved (rolled back) | Check the pallet is still in the Pending Putaway list, then confirm again. |
| Network error / timeout / app closed, no success message | EITHER nothing was saved OR it fully saved and only the reply was lost | Open Pending Putaway. Pallet still listed = nothing saved, confirm again. Pallet gone = it was put away. Confirming again is also safe: it reports "already put away" and changes nothing. |
| "was already put away at <location>" | Someone (or an earlier attempt) already did it | Nothing - no new stock was created. |

## Verifying a pallet (read-only SQL, Supabase SQL editor)

Replace `PALLET_ID` with the pallet's `id` from `inward_pending`.

```sql
select id, status, warehouse, location, putaway_by, putaway_at
from public.inward_pending where id = 'PALLET_ID';

-- its newly created tires and its receipt (they exist together, or not at all)
select count(*) as new_tires from public.tires where starts_with(id, 't-PALLET_ID-');
select count(*) as receipt   from public.inward_receipts where id = 'ir-PALLET_ID';
```

Tires REUSED from the production stage keep their old ids, so `new_tires` counts only newly
created ones; the receipt row and `inward_pending.status` are the reliable signals.

## Consistency check (should return zero rows)

```sql
select p.id from public.inward_pending p
where p.status = 'put_away'
  and not exists (select 1 from public.inward_receipts r where r.id = 'ir-' || p.id);

select r.id from public.inward_receipts r
join public.inward_pending p on r.id = 'ir-' || p.id
where p.status <> 'put_away';
```

If either returns rows, do not fix data by hand: keep the output and review it with a
developer - it means a change was made outside `putaway_pallet`.

## Removing a pallet saved by mistake

Use the ✕ on the pallet in Pending Putaway. It only works while the pallet is pending, never
touches stock, and can be repeated harmlessly. A pallet that has already been put away
can't be removed this way; reverse that stock with the Stock page's adjustments.
