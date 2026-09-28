import { supabase } from "@/lib/supabase";

// Plans made ahead of time on the Prepare Plan page — see
// supabase/migrations/prepared_plans.sql. Picking and Outward list them in
// their Ongoing plan dropdown; choosing one selects all its tires.

export interface PreparedPlanLine {
  material: string;
  description: string;
  brand?: string;
  plyRatingBottom?: string;
  qty: number;
}

export interface PreparedPlan {
  id: string;
  planNo: string;
  lines: PreparedPlanLine[];
  createdAt: string;
  updatedAt: string;
}

interface PreparedPlanRow {
  id: string;
  plan_no: string;
  lines: PreparedPlanLine[] | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: PreparedPlanRow): PreparedPlan {
  return {
    id: row.id,
    planNo: row.plan_no,
    lines: Array.isArray(row.lines) ? row.lines : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Newest first.
export async function fetchPreparedPlans(): Promise<PreparedPlan[]> {
  const { data, error } = await supabase.from("prepared_plans").select("*").order("created_at", { ascending: false });
  if (error) {
    console.warn("prepared_plans fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}

// Insert-or-update by id. Plan No is unique, so reusing one another plan
// already has comes back as an error.
export async function savePreparedPlan(plan: { id: string; planNo: string; lines: PreparedPlanLine[] }): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("prepared_plans")
    .upsert({ id: plan.id, plan_no: plan.planNo.trim(), lines: plan.lines }, { onConflict: "id" });
  if (error) {
    console.warn("prepared_plans save failed:", error.message);
    if (error.code === "23505") return { error: `Plan No ${plan.planNo.trim()} already exists.` };
    return { error: error.message };
  }
  return { error: null };
}

export async function deletePreparedPlan(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("prepared_plans").delete().eq("id", id);
  if (error) {
    console.warn("prepared_plans delete failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
