import { supabase } from "@/lib/supabase";
import type { DeletedTireRecord } from "@/types/tire";

interface DeletedTireRow {
  id: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  plan_no: string;
  picker_name: string;
  deleted_at: string;
  deleted_by: string;
  notes: string;
}

function toRow(r: DeletedTireRecord) {
  return {
    id: r.id,
    material: r.material,
    description: r.description,
    warehouse: r.warehouse,
    location: r.location,
    quantity: r.quantity,
    plan_no: r.planNo,
    picker_name: r.pickerName,
    deleted_at: r.deletedAt,
    deleted_by: r.deletedBy,
    notes: r.notes,
  };
}

function fromRow(row: DeletedTireRow): DeletedTireRecord {
  return {
    id: row.id,
    material: row.material,
    description: row.description,
    warehouse: row.warehouse,
    location: row.location,
    quantity: row.quantity,
    planNo: row.plan_no,
    pickerName: row.picker_name,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    notes: row.notes,
  };
}

// Append-only log of tires permanently wiped from a location (Picking
// page's per-card Delete button). The actual removal happens on the tires
// table (see deleteTiresAtLocation in tires.ts); this is the record History
// and the "Deleted tires" export read back.
export async function insertDeletedTires(rows: DeletedTireRecord[]): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from("deleted_tires").insert(rows.map(toRow));
  if (error) {
    console.warn("deleted_tires insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// Full deleted-tires history, newest first — merged into the History page.
export async function fetchDeletedTires(): Promise<DeletedTireRecord[]> {
  const { data, error } = await supabase.from("deleted_tires").select("*").order("deleted_at", { ascending: false });
  if (error) {
    console.warn("deleted_tires fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}
