import { supabase } from "@/lib/supabase";
import type { PlacementLog } from "@/types/tire";

function toRow(p: PlacementLog) {
  return {
    id: p.id,
    tire_id: p.tireId,
    location: p.location,
    placed_at: p.placedAt,
    placed_by: p.placedBy,
    notes: p.notes,
  };
}

// Append-only — a placement log entry is never edited after the fact.
export async function insertPlacementLogs(rows: PlacementLog[]): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from("placement_logs").insert(rows.map(toRow));
  if (error) {
    console.warn("placement_logs insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
