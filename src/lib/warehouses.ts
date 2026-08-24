import { supabase } from "@/lib/supabase";
import type { WarehouseDef } from "@/data/warehouse-bins";

interface WarehouseRow {
  key: string;
  label: string;
  prefix: string;
  column_row_counts: number[];
  column_stand_counts: number[] | null;
  column_floor_counts: number[] | null;
}

function fromRow(row: WarehouseRow): WarehouseDef {
  return {
    key: row.key,
    label: row.label,
    prefix: row.prefix,
    columnRowCounts: row.column_row_counts,
    columnStandCounts: row.column_stand_counts ?? undefined,
    columnFloorCounts: row.column_floor_counts ?? undefined,
  };
}

export async function fetchWarehouses(): Promise<WarehouseDef[]> {
  const { data, error } = await supabase.from("warehouses").select("*").order("label", { ascending: true });
  if (error) {
    console.warn("warehouses fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
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
      column_stand_counts: warehouse.columnStandCounts ?? null,
      column_floor_counts: warehouse.columnFloorCounts ?? null,
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
