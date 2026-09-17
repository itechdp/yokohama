import { supabase } from "@/lib/supabase";
import type { PlacementLog } from "@/types/tire";

interface PlacementLogRow {
  id: string;
  tire_id: string;
  location: string;
  placed_at: string;
  placed_by: string;
  notes: string;
}

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

function fromRow(row: PlacementLogRow): PlacementLog {
  return {
    id: row.id,
    tireId: row.tire_id,
    location: row.location,
    placedAt: row.placed_at,
    placedBy: row.placed_by,
    notes: row.notes,
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

// Full Inward history — used by the "Export Excel" report on the Inward
// page. Newest first, same ordering convention as fetchOutwardPicks.
export async function fetchPlacementLogs(): Promise<PlacementLog[]> {
  const { data, error } = await supabase.from("placement_logs").select("*").order("placed_at", { ascending: false });
  if (error) {
    console.warn("placement_logs fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}
