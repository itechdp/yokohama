import { supabase } from "@/lib/supabase";
import type { PlanPendingTire } from "@/types/tire";

interface PlanPendingTireRow {
  id: number;
  plan_no: string;
  tire: string;
  qty: number;
  created_at: string;
}

function fromRow(row: PlanPendingTireRow): PlanPendingTire {
  return {
    id: row.id,
    planNo: row.plan_no,
    tire: row.tire,
    qty: row.qty,
    createdAt: row.created_at,
  };
}

export async function fetchPlanPendingTires(): Promise<PlanPendingTire[]> {
  const { data, error } = await supabase
    .from("plan_pending_tires")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("plan_pending_tires fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}

export async function addPlanPendingTire(
  planNo: string,
  tire: string,
  qty: number,
): Promise<{ row: PlanPendingTire | null; error: string | null }> {
  const { data, error } = await supabase
    .from("plan_pending_tires")
    .insert({ plan_no: planNo, tire, qty })
    .select("*")
    .single();

  if (error) {
    console.warn("plan_pending_tires insert failed:", error.message);
    return { row: null, error: error.message };
  }
  return { row: fromRow(data), error: null };
}

export async function updatePlanPendingTireQty(id: number, qty: number): Promise<{ error: string | null }> {
  const { error } = await supabase.from("plan_pending_tires").update({ qty }).eq("id", id);
  if (error) {
    console.warn("plan_pending_tires update failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deletePlanPendingTire(id: number): Promise<{ error: string | null }> {
  const { error } = await supabase.from("plan_pending_tires").delete().eq("id", id);
  if (error) {
    console.warn("plan_pending_tires delete failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// Clears any outstanding reservation for this tire under this plan — used
// when a tire is permanently deleted from a location (Picking's Delete
// button), so the plan no longer expects tires that no longer exist.
// No-ops if planNo is blank (nothing to clear).
export async function deletePlanPendingTiresForTire(planNo: string, tire: string): Promise<{ error: string | null }> {
  const trimmed = planNo.trim();
  if (!trimmed) return { error: null };
  const { error } = await supabase.from("plan_pending_tires").delete().eq("plan_no", trimmed).eq("tire", tire);
  if (error) {
    console.warn("plan_pending_tires delete-for-tire failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
