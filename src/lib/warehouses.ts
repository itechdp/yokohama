import { supabase } from "@/lib/supabase";
import type { WarehouseDef } from "@/data/warehouse-bins";

interface WarehouseRow {
  key: string;
  label: string;
  prefix: string;
  column_row_counts: number[];
}

function fromRow(row: WarehouseRow): WarehouseDef {
  return {
    key: row.key,
    label: row.label,
    prefix: row.prefix,
    columnRowCounts: row.column_row_counts,
  };
}

// Fixed display order (matches the warehouse layout sheet) rather than
// alphabetical - "WH-1, WH-2" before "Domestic, RMS" etc. isn't something
// alphabetical sorting could ever produce. Anything not in this list (a
// newly added warehouse) sorts after it, alphabetically.
const WAREHOUSE_ORDER = ["WH-1", "WH-2", "Domestic", "RMS", "Tin Sade01", "Parking", "Tin Sade02", "ATM"];

// Ignores spacing/hyphen differences ("WH- 1" vs "WH-1") so the match
// doesn't silently fail over formatting instead of actually sorting.
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[\s-]+/g, "");
}

function sortByFixedOrder(warehouses: WarehouseDef[]): WarehouseDef[] {
  const order = WAREHOUSE_ORDER.map(normalizeLabel);
  return [...warehouses].sort((a, b) => {
    const ai = order.indexOf(normalizeLabel(a.label));
    const bi = order.indexOf(normalizeLabel(b.label));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.label.localeCompare(b.label);
  });
}

export async function fetchWarehouses(): Promise<WarehouseDef[]> {
  const { data, error } = await supabase.from("warehouses").select("*");
  if (error) {
    console.warn("warehouses fetch failed:", error.message);
    return [];
  }
  return sortByFixedOrder((data ?? []).map(fromRow));
}

// Keyed on `key` — used both to create a new warehouse and to save edits to
// an existing one's label/prefix/bin layout.
export async function upsertWarehouse(warehouse: WarehouseDef): Promise<{ error: string | null }> {
  const { error } = await supabase.from("warehouses").upsert(
    {
      key: warehouse.key,
      label: warehouse.label,
      prefix: warehouse.prefix,
      column_row_counts: warehouse.columnRowCounts,
    },
    { onConflict: "key" },
  );

  if (error) {
    console.warn("warehouses upsert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteWarehouse(key: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("warehouses").delete().eq("key", key);
  if (error) {
    console.warn("warehouses delete failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
