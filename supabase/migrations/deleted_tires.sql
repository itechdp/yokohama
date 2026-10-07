-- Log of tires permanently deleted from a location (Picking page's per-card
-- Delete button) — distinct from a normal Pick, since the tires never left
-- through dispatch, they were just wiped from stock. Backs the "Deleted"
-- tab and date-wise Excel export on the History page.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at() / gen_random_uuid() availability from
-- schema.sql - run that first if this is a fresh project.

create table if not exists public.deleted_tires (
  id text primary key,
  material text not null default '',
  description text not null default '',
  warehouse text not null default '',
  location text not null default '',
  quantity integer not null default 0,
  plan_no text not null default '',
  picker_name text not null default '',
  deleted_at timestamptz not null default now(),
  deleted_by text not null default '',
  notes text not null default ''
);

create index if not exists deleted_tires_deleted_at_idx on public.deleted_tires (deleted_at);

-- Same anon-key-can-do-everything tradeoff as outwards/picks (see schema.sql)
-- - fine for this internal tool, revisit if auth gets added.
alter table public.deleted_tires enable row level security;

drop policy if exists "deleted_tires_anon_all" on public.deleted_tires;
create policy "deleted_tires_anon_all"
  on public.deleted_tires
  for all
  to anon, authenticated
  using (true)
  with check (true);
