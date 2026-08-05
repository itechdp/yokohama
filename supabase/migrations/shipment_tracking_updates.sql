-- Shipment tracking updates: one row per status-change event on a dispatch
-- log (see advanceStatus in src/pages/tire-dispatch.tsx). Was previously
-- written to browser localStorage only; now shared like everything else.
-- Append-only — rows are inserted, never updated. tracking_updated_at is the
-- domain "when this status was recorded" timestamp (distinct from the
-- standard updated_at audit column below, which never changes after insert
-- since these rows are never mutated).
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Depends on public.set_updated_at(), created by schema.sql — run that first
-- if this is a fresh project.

create table if not exists public.shipment_tracking_updates (
  id text primary key,
  dispatch_id text not null,
  tire_id text not null,
  status text not null default '',
  location text not null default '',
  tracking_updated_at timestamptz not null default now(),
  updated_by text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipment_tracking_updates_dispatch_id_idx on public.shipment_tracking_updates (dispatch_id);

drop trigger if exists set_shipment_tracking_updates_updated_at on public.shipment_tracking_updates;
create trigger set_shipment_tracking_updates_updated_at
  before update on public.shipment_tracking_updates
  for each row
  execute function public.set_updated_at();

alter table public.shipment_tracking_updates enable row level security;

drop policy if exists "shipment_tracking_updates_anon_all" on public.shipment_tracking_updates;
create policy "shipment_tracking_updates_anon_all"
  on public.shipment_tracking_updates
  for all
  to anon, authenticated
  using (true)
  with check (true);
