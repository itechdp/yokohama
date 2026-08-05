import { supabase } from "@/lib/supabase";
import type { DispatchStatus, TireDispatch } from "@/types/tire";

interface DispatchLogRow {
  id: string;
  tire_id: string;
  plan_id: string | null;
  driver_name: string;
  destination: string;
  status: DispatchStatus;
  notes: string;
  dispatched_at: string;
  dispatched_by: string;
}

function fromRow(row: DispatchLogRow): TireDispatch {
  return {
    id: row.id,
    tireId: row.tire_id,
    planId: row.plan_id ?? undefined,
    driverName: row.driver_name,
    destination: row.destination,
    dispatchedAt: row.dispatched_at,
    dispatchedBy: row.dispatched_by,
    status: row.status,
    notes: row.notes,
  };
}

export async function fetchDispatchLogs(): Promise<TireDispatch[]> {
  const { data, error } = await supabase.from("dispatch_logs").select("*").order("dispatched_at", { ascending: true });
  if (error) {
    console.warn("dispatch_logs fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => fromRow(r as DispatchLogRow));
}

export async function insertDispatchLogs(rows: TireDispatch[]): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from("dispatch_logs").insert(
    rows.map((r) => ({
      id: r.id,
      tire_id: r.tireId,
      plan_id: r.planId ?? null,
      driver_name: r.driverName,
      destination: r.destination,
      status: r.status,
      notes: r.notes,
      dispatched_at: r.dispatchedAt,
      dispatched_by: r.dispatchedBy,
    })),
  );
  if (error) {
    console.warn("dispatch_logs insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// The one place a dispatch log gets mutated after creation — advancing a
// tire's status (holding-bay -> loading -> loaded).
export async function updateDispatchLogStatus(id: string, status: DispatchStatus): Promise<{ error: string | null }> {
  const { error } = await supabase.from("dispatch_logs").update({ status }).eq("id", id);
  if (error) {
    console.warn("dispatch_logs update failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
