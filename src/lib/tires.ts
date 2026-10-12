import { supabase } from "@/lib/supabase";
import { binForLocation, type WarehouseDef } from "@/data/warehouse-bins";
import { fetchWarehouses } from "@/lib/warehouses";
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

// Tires of one Material currently in stock at one exact location
// ("<warehouse label> - Bin <code>") — what Outward takes out of stock.
// Filtered in the database rather than from fetchTires(), so it stays exact
// however many tires the table holds.
export async function fetchStockAt(material: string, location: string): Promise<Tire[]> {
  const { data, error } = await supabase
    .from("tires")
    .select("*")
    .eq("current_stage", "warehouse")
    .eq("serial_number", material)
    .eq("location", location)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("tires stock lookup failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}

// Where each of these Materials currently sits in stock — one entry per
// warehouse-stage tire (Material + exact location). Backs the "where is this
// tire" lookup on Picking/Outward. Pages through the table since PostgREST
// caps a single response at 1000 rows.
export async function fetchStockLocations(materials: string[]): Promise<{ material: string; location: string }[]> {
  if (materials.length === 0) return [];
  const pageSize = 1000;
  const out: { material: string; location: string }[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("tires")
      .select("id, serial_number, location")
      .eq("current_stage", "warehouse")
      .in("serial_number", materials)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("tires stock locations fetch failed:", error.message);
      break;
    }
    for (const row of data ?? []) out.push({ material: row.serial_number as string, location: row.location as string });
    if (!data || data.length < pageSize) break;
  }
  return out;
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

// Bulk uploads can run to hundreds/thousands of rows — a single .in() with
// that many values risks a URL-length failure (PostgREST filters ride in the
// query string), so the existence check below is chunked instead of sent as
// one request.
const SKU_CHECK_CHUNK_SIZE = 200;

// Which of these SKU QR codes are already in the tires table — used by Bulk
// upload to skip rows that would otherwise trip the tires_sku_qr_code_unique
// constraint (re-uploading a file that overlaps a previous upload) instead of
// failing the whole batch with no indication of which rows collided. Throws
// if any chunk of the check fails, rather than silently treating everything
// as new (which previously let real duplicates slip through and fail at
// insert time anyway, with a much less useful error).
export async function fetchExistingSkuQrCodes(codes: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(codes.filter(Boolean)));
  if (unique.length === 0) return new Set();

  const found = new Set<string>();
  for (let i = 0; i < unique.length; i += SKU_CHECK_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + SKU_CHECK_CHUNK_SIZE);
    const { data, error } = await supabase.from("tires").select("sku_qr_code").in("sku_qr_code", chunk);
    if (error) {
      console.warn("tires sku_qr_code existence check failed:", error.message);
      throw new Error(error.message);
    }
    for (const r of data ?? []) {
      if (r.sku_qr_code) found.add(r.sku_qr_code as string);
    }
  }
  return found;
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

// Insert-or-update by id — Inward/Picking/Outward each move a mix of
// existing units (stage/location changes) and newly-synthesized ones in a
// single action, so one upsert covers both.
// ---------------------------------------------------------------------------
// Stock deletion. Deliberately conservative: nothing here uses a LIKE/pattern
// filter and nothing deletes by "everything matching a condition". Every
// delete is by explicit row id plus exact location text, always re-asserts
// current_stage = 'warehouse' in the DELETE itself so production/dispatch
// tires can never be hit, and double-checks the rows the database reports.
// ---------------------------------------------------------------------------

const LOCATION_SEPARATOR = " - Bin ";
const DELETE_CHUNK = 100;

// Which saved warehouse a tire location ("<label> - Bin <code>") belongs to.
// Longest matching label wins, so a warehouse can never claim tires of
// another warehouse whose label merely starts with its own.
function warehouseOwningLocation(warehouses: WarehouseDef[], location: string): WarehouseDef | null {
  let best: WarehouseDef | null = null;
  for (const w of warehouses) {
    if (binForLocation(w, location) === null) continue;
    if (!best || w.label.length > best.label.length) best = w;
  }
  return best;
}

// Returns an error message if the saved warehouse list can't be trusted to
// tell warehouses apart (so deleting by name could hit the wrong one).
function warehouseListProblem(warehouses: WarehouseDef[]): string | null {
  for (const w of warehouses) {
    if (!w.label || w.label !== w.label.trim() || w.label.includes(LOCATION_SEPARATOR)) {
      return `Warehouse name "${w.label}" is not safe to delete by. Fix it on the Warehouses page first.`;
    }
  }
  const labels = new Set(warehouses.map((w) => w.label));
  if (labels.size !== warehouses.length) {
    return "Two warehouses share the same name. Fix it on the Warehouses page first.";
  }
  return null;
}

// Deletes every warehouse-stage tire stored in ONE warehouse (any bin) and
// nothing else. The warehouse is re-checked against the saved list; the tires
// to delete are picked by exact-prefix match in code (no database pattern
// matching) and removed by id + exact location + stage in a single DELETE.
export async function deleteTiresInWarehouse(
  target: Pick<WarehouseDef, "key" | "label">,
): Promise<{ deletedCount: number; error: string | null }> {
  const saved = await fetchWarehouses();
  const warehouse = saved.find((w) => w.key === target.key && w.label === target.label);
  if (!warehouse) {
    return { deletedCount: 0, error: "That warehouse no longer exists (or was renamed). Nothing was deleted." };
  }
  const problem = warehouseListProblem(saved);
  if (problem) return { deletedCount: 0, error: `${problem} Nothing was deleted.` };

  const { data, error: readError } = await supabase.from("tires").select("id, location").eq("current_stage", "warehouse");
  if (readError) {
    console.warn("tires read before warehouse delete failed:", readError.message);
    return { deletedCount: 0, error: readError.message };
  }
  const candidates = ((data ?? []) as { id: string; location: string }[]).filter(
    (t) => warehouseOwningLocation(saved, t.location)?.key === warehouse.key,
  );

  // The read above can go stale (another device may move or pick a tire a
  // moment later). So the DELETE itself re-asserts, in its own WHERE clause,
  // everything we verified: stage is 'warehouse' AND location is one of this
  // warehouse's exact, verified location strings AND the id is one we chose.
  // The database re-evaluates that clause against each row's latest committed
  // state, so a tire that moved elsewhere or changed stage in the meantime
  // simply doesn't match and is left alone.
  let deletedCount = 0;
  for (let i = 0; i < candidates.length; i += DELETE_CHUNK) {
    const chunk = candidates.slice(i, i + DELETE_CHUNK);
    const { data: removed, error } = await supabase
      .from("tires")
      .delete()
      .in("id", chunk.map((t) => t.id))
      .in("location", [...new Set(chunk.map((t) => t.location))])
      .eq("current_stage", "warehouse")
      .select("id, current_stage, location");
    if (error) {
      console.warn("tires delete-in-warehouse failed:", error.message);
      return { deletedCount, error: error.message };
    }
    const rows = (removed ?? []) as { id: string; current_stage: string; location: string }[];
    deletedCount += rows.length;
    // Backstop only - the WHERE clause above is the real protection.
    const stray = rows.find(
      (r) => r.current_stage !== "warehouse" || warehouseOwningLocation(saved, r.location)?.key !== warehouse.key,
    );
    if (stray) {
      console.error("tires delete-in-warehouse removed an unexpected row:", stray);
      return {
        deletedCount,
        error: `Safety check failed: a tire outside ${warehouse.label} was removed (${stray.id}). Stopped; contact support.`,
      };
    }
  }
  return { deletedCount, error: null };
}

// Deletes every warehouse-stage tire unit of ONE Material at ONE exact bin —
// used by Picking's per-card Delete button to permanently remove a tire
// from a bin (unlike takeOutOfStock, which just moves stage/location).
// Returns how many units were actually deleted so the caller can log that
// count against the real DB state rather than whatever the UI last showed.
export async function deleteTiresAtLocation(
  material: string,
  location: string,
): Promise<{ deletedCount: number; error: string | null }> {
  if (!material.trim() || !location.trim()) {
    return { deletedCount: 0, error: "Missing tire or location. Nothing was deleted." };
  }
  const saved = await fetchWarehouses();
  const owner = warehouseOwningLocation(saved, location);
  const bin = owner ? binForLocation(owner, location) : null;
  if (!owner || !bin) {
    return { deletedCount: 0, error: "That location is not in a saved warehouse. Nothing was deleted." };
  }
  const problem = warehouseListProblem(saved);
  if (problem) return { deletedCount: 0, error: `${problem} Nothing was deleted.` };

  const { data, error } = await supabase
    .from("tires")
    .delete()
    .eq("serial_number", material)
    .eq("location", location)
    .eq("current_stage", "warehouse")
    .select("id, serial_number, location, current_stage");
  if (error) {
    console.warn("tires delete-at-location failed:", error.message);
    return { deletedCount: 0, error: error.message };
  }
  const rows = (data ?? []) as { id: string; serial_number: string; location: string; current_stage: string }[];
  const stray = rows.find(
    (r) => r.serial_number !== material || r.location !== location || r.current_stage !== "warehouse",
  );
  if (stray) {
    console.error("tires delete-at-location removed an unexpected row:", stray);
    return { deletedCount: rows.length, error: `Safety check failed: unexpected tire removed (${stray.id}). Contact support.` };
  }
  return { deletedCount: rows.length, error: null };
}

export async function upsertTires(tires: Tire[]): Promise<{ error: string | null }> {
  if (tires.length === 0) return { error: null };
  const { error } = await supabase.from("tires").upsert(tires.map(toRow), { onConflict: "id" });
  if (error) {
    console.warn("tires upsert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
