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

export async function deletePlanPendingTire(id: number): Promise<{ error: string | null }> {
  const { error } = await supabase.from("plan_pending_tires").delete().eq("id", id);
  if (error) {
    console.warn("plan_pending_tires delete failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
