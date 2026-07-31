-- SKU catalog table: Material / Tire Description-Brand / Ply Rating Bottom / Brand.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- After running it, use Table Editor -> tire_skus -> Insert -> Import data from CSV
-- to load your spreadsheet (columns must map to material, description, ply_rating_bottom, brand).

create table if not exists public.tire_skus (
  id bigint generated always as identity primary key,
  material text not null,
  description text not null,
  ply_rating_bottom text,
  brand text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique so the app can upsert on Material: re-adding a known SKU (Add Tire,
-- Bulk upload) updates its row instead of creating a duplicate. -U / EUDR
-- variants are distinct Material strings (e.g. "100259-36" vs "100259-36U"),
-- so this doesn't collide with them.
drop index if exists public.tire_skus_material_idx;
create unique index if not exists tire_skus_material_key on public.tire_skus (material);

-- Keep updated_at current on edits made through the Table Editor or future app code.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tire_skus_updated_at on public.tire_skus;
create trigger set_tire_skus_updated_at
  before update on public.tire_skus
  for each row
  execute function public.set_updated_at();

-- Row Level Security: this app has no login/auth layer yet, and the publishable
-- (anon) key ships in the client bundle, so anyone with it can call the API.
-- These policies allow that anon key full read/write access to this table only -
-- fine for an internal tool, but tighten this (e.g. require auth, or make it
-- read-only) if the app becomes externally accessible or auth gets added later.
alter table public.tire_skus enable row level security;

drop policy if exists "tire_skus_anon_all" on public.tire_skus;
create policy "tire_skus_anon_all"
  on public.tire_skus
  for all
  to anon, authenticated
  using (true)
  with check (true);
