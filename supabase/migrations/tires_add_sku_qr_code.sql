-- Adds the SKU QRCode field to tires (Add Tire / Bulk Upload, and the Inward
-- "Scan tire QR" lookup). Nullable so existing rows keep working unchanged.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.tires
  add column if not exists sku_qr_code text;

-- Unique so a scanned SKU QR Code resolves to exactly one tire. NULLs don't
-- conflict with each other, so existing rows without a code are unaffected.
create unique index if not exists tires_sku_qr_code_key on public.tires (sku_qr_code);
