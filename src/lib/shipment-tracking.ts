import { supabase } from "@/lib/supabase";
import type { ShipmentTrackingUpdate } from "@/types/tire";

function toRow(t: ShipmentTrackingUpdate) {
  return {
    id: t.id,
    dispatch_id: t.dispatchId,
    tire_id: t.tireId,
    status: t.status,
    location: t.location,
    tracking_updated_at: t.updatedAt,
    updated_by: t.updatedBy,
    notes: t.notes,
  };
}

// Append-only — one row per status-change event, never edited after the fact.
export async function insertShipmentTrackingUpdates(
  rows: ShipmentTrackingUpdate[],
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from("shipment_tracking_updates").insert(rows.map(toRow));
  if (error) {
    console.warn("shipment_tracking_updates insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
