import { supabase } from "@/lib/supabase";
import type { Tire } from "@/types/tire";

interface TireRow {
  id: string;
  serial_number: string;
  model: string;
  size: string;
  production_date: string | null;
  current_stage: Tire["currentStage"];
  location: string;
  status: Tire["status"];
  notes: string;
  warranty_months: number;
  cost_price: number;
  ply_rating_bottom: string | null;
  brand: string | null;
  sku_qr_code: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: TireRow): Tire {
  return {
    id: row.id,
    serialNumber: row.serial_number,
    model: row.model,
    size: row.size,
    productionDate: row.production_date ?? "",
    currentStage: row.current_stage,
    location: row.location,
    status: row.status,
    notes: row.notes,
    warrantyMonths: row.warranty_months,
    costPrice: row.cost_price,
    plyRatingBottom: row.ply_rating_bottom ?? undefined,
    brand: row.brand ?? undefined,
    skuQrCode: row.sku_qr_code ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(tire: Tire) {
  return {
    id: tire.id,
    serial_number: tire.serialNumber,
    model: tire.model,
    size: tire.size,
    production_date: tire.productionDate || null,
    current_stage: tire.currentStage,
    location: tire.location,
    status: tire.status,
    notes: tire.notes,
    warranty_months: tire.warrantyMonths,
    cost_price: tire.costPrice,
    ply_rating_bottom: tire.plyRatingBottom || null,
    brand: tire.brand || null,
    sku_qr_code: tire.skuQrCode || null,
  };
}

export async function fetchTires(): Promise<Tire[]> {
  const { data, error } = await supabase.from("tires").select("*");
  if (error) {
    console.warn("tires fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}

// Exact SKU QR Code lookup — used by the "Scan tire QR" flow, where the code
// printed on a tire's SKU label encodes its sku_qr_code and has to resolve to
// exactly one physical tire unit.
export async function fetchTireBySkuQrCode(skuQrCode: string): Promise<Tire | null> {
  const code = skuQrCode.trim();
  if (!code) return null;

  const { data, error } = await supabase
    .from("tires")
    .select("*")
    .eq("sku_qr_code", code)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("tires sku_qr_code lookup failed:", error.message);
    return null;
  }
  return data ? fromRow(data) : null;
}

// New tire units (Add Tire, Bulk upload).
export async function insertTires(tires: Tire[]): Promise<{ error: string | null }> {
  if (tires.length === 0) return { error: null };
  const { error } = await supabase.from("tires").insert(tires.map(toRow));
  if (error) {
    console.warn("tires insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// Insert-or-update by id — Inward/Outward/Dispatch each move a mix of
// existing units (stage/location changes) and newly-synthesized ones in a
// single action, so one upsert covers both.
export async function upsertTires(tires: Tire[]): Promise<{ error: string | null }> {
  if (tires.length === 0) return { error: null };
  const { error } = await supabase.from("tires").upsert(tires.map(toRow), { onConflict: "id" });
  if (error) {
    console.warn("tires upsert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
