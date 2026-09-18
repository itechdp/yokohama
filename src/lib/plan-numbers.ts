import { startOfTodayIso } from "@/lib/date-utils";
import { supabase } from "@/lib/supabase";

// Backs the Plan No dropdown on Inward/Outward — a shared registry (not
// per-device) of which plan numbers are "in play" today. Inward and Outward
// each have their own pool (`kind`) — a plan no used on one never shows up
// on the other. See supabase/migrations/plan_numbers.sql: rows are upserted
// with a fresh last_used_at every time a plan no is confirmed under, and a
// plan no only shows up in fetchTodayPlanNumbers() while that timestamp
// falls on today — no cleanup job needed for yesterday's plan numbers to
// stop appearing.
export type PlanNoKind = "inward" | "outward";

export async function fetchTodayPlanNumbers(kind: PlanNoKind): Promise<string[]> {
  const { data, error } = await supabase
    .from("plan_numbers")
    .select("plan_no")
    .eq("kind", kind)
    .gte("last_used_at", startOfTodayIso())
    .order("last_used_at", { ascending: false });

  if (error) {
    console.warn("plan_numbers fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.plan_no as string);
}

// Registers a plan no as "used today" for the given flow — called on
// confirm, so it shows up for every other operator/device from then on.
export async function touchPlanNumber(planNo: string, kind: PlanNoKind): Promise<void> {
  const trimmed = planNo.trim();
  if (!trimmed) return;
  const { error } = await supabase
    .from("plan_numbers")
    .upsert({ plan_no: trimmed, kind, last_used_at: new Date().toISOString() }, { onConflict: "plan_no,kind" });
  if (error) console.warn("plan_numbers upsert failed:", error.message);
}
