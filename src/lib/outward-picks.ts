import { supabase } from "@/lib/supabase";
import type { OutwardPick } from "@/types/tire";

interface OutwardPickRow {
  id: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  picked_at: string;
  picked_by: string;
  notes: string;
}

function toRow(p: OutwardPick) {
  return {
    id: p.id,
    material: p.material,
    description: p.description,
    warehouse: p.warehouse,
    location: p.location,
    quantity: p.quantity,
    picked_at: p.pickedAt,
    picked_by: p.pickedBy,
    notes: p.notes,
  };
}

function fromRow(row: OutwardPickRow): OutwardPick {
  return {
    id: row.id,
    material: row.material,
    description: row.description,
    warehouse: row.warehouse,
    location: row.location,
    quantity: row.quantity,
    pickedAt: row.picked_at,
    pickedBy: row.picked_by,
    notes: row.notes,
  };
}

// Append-only — an Outward pick, once recorded, is never edited after the
// fact. This is the entire Outward flow now: no tires-table update, no
// stage transition, just "who took what, from where, how many."
export async function insertOutwardPicks(rows: OutwardPick[]): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from("outward_picks").insert(rows.map(toRow));
  if (error) {
    console.warn("outward_picks insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// Full Outward history — used by the "Export Excel" report on the Outward
// page. Newest first.
export async function fetchOutwardPicks(): Promise<OutwardPick[]> {
  const { data, error } = await supabase.from("outward_picks").select("*").order("picked_at", { ascending: false });
  if (error) {
    console.warn("outward_picks fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}
