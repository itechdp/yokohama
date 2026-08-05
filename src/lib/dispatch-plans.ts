import { supabase } from "@/lib/supabase";
import type { DispatchPlan } from "@/types/tire";

interface DispatchPlanRow {
  id: string;
  driver_name: string;
  destination: string;
  truck_number: string;
  notes: string;
  status: DispatchPlan["status"];
  created_by: string;
  dispatched_at: string | null;
  created_at: string;
}

function fromRow(row: DispatchPlanRow): DispatchPlan {
  return {
    id: row.id,
    driverName: row.driver_name,
    destination: row.destination,
    truckNumber: row.truck_number,
    createdAt: row.created_at,
    createdBy: row.created_by,
    notes: row.notes,
    status: row.status,
    dispatchedAt: row.dispatched_at ?? undefined,
  };
}

export async function fetchDispatchPlans(): Promise<DispatchPlan[]> {
  const { data, error } = await supabase.from("dispatch_plans").select("*").order("created_at", { ascending: true });
  if (error) {
    console.warn("dispatch_plans fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => fromRow(r as DispatchPlanRow));
}

export async function insertDispatchPlan(plan: DispatchPlan): Promise<{ error: string | null }> {
  const { error } = await supabase.from("dispatch_plans").insert({
    id: plan.id,
    driver_name: plan.driverName,
    destination: plan.destination,
    truck_number: plan.truckNumber,
    notes: plan.notes,
    status: plan.status,
    created_by: plan.createdBy,
    created_at: plan.createdAt,
    dispatched_at: plan.dispatchedAt ?? null,
  });
  if (error) {
    console.warn("dispatch_plans insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateDispatchPlanStatus(
  id: string,
  status: DispatchPlan["status"],
  dispatchedAt: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("dispatch_plans").update({ status, dispatched_at: dispatchedAt }).eq("id", id);
  if (error) {
    console.warn("dispatch_plans update failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
