import { supabase } from "@/lib/supabase";
import type { StageHistory } from "@/types/tire";

function toRow(h: StageHistory) {
  return {
    id: h.id,
    tire_id: h.tireId,
    stage: h.stage,
    location: h.location,
    moved_at: h.movedAt,
    moved_by: h.movedBy,
    notes: h.notes,
  };
}

// Append-only — a tire's movement history is never edited after the fact.
export async function insertTireHistory(rows: StageHistory[]): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from("tire_history").insert(rows.map(toRow));
  if (error) {
    console.warn("tire_history insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
