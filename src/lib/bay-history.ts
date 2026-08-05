import { supabase } from "@/lib/supabase";
import type { BayBooking, BayHistorySession, BayStatus } from "@/types/tire";

interface BayPlanHistoryRow {
  id: number;
  bay: number;
  plan_no: string;
  status: BayStatus;
  qty: number;
  pending_tire: string;
  opened_at: string;
  closed_at: string | null;
}

function fromRow(row: BayPlanHistoryRow): BayHistorySession {
  return {
    id: row.id,
    bay: row.bay,
    planNo: row.plan_no,
    status: row.status,
    qty: row.qty,
    pendingTire: row.pending_tire,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

const IST_OFFSET = "+05:30";

// [start, end) bounds, in UTC, for the given IST calendar day ("YYYY-MM-DD").
function istDayRangeUtc(dateStr: string): { start: string; end: string } {
  const start = new Date(`${dateStr}T00:00:00${IST_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// [start, end) bounds, in UTC, for the given IST calendar month.
function istMonthRangeUtc(year: number, month: number): { start: string; end: string } {
  const start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00${IST_OFFSET}`);
  const end = new Date(Date.UTC(year, month, 1, -5, -30)); // first of next month, IST -> UTC
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatIst(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todayIst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Records only actual closures — one row per plan no., ever. Other
// status/plan edits (Running, Hold, QC Pending, editing the plan no.) are
// not tracked at all. Upserts on plan_no (unique in the DB — see
// bay_plan_history_unique_plan.sql) so an accidental double "Closed" click,
// or toggling status back and forth, just refreshes that row's closed_at
// instead of creating a duplicate.
export async function syncBayHistory(_prev: BayBooking, next: BayBooking): Promise<void> {
  const nextPlan = next.planNo.trim();
  if (!nextPlan) return;
  if (next.status !== "closed") return;

  const { error } = await supabase.from("bay_plan_history").upsert(
    {
      bay: next.bay,
      plan_no: nextPlan,
      status: "closed",
      qty: next.qty,
      pending_tire: next.pendingTire,
      closed_at: next.updatedAt,
    },
    { onConflict: "plan_no" },
  );
  if (error) console.warn("bay_plan_history upsert failed:", error.message);
}

export async function fetchClosedOnDate(dateStr: string, bay?: number): Promise<BayHistorySession[]> {
  const { start, end } = istDayRangeUtc(dateStr);
  let query = supabase
    .from("bay_plan_history")
    .select("*")
    .not("closed_at", "is", null)
    .gte("closed_at", start)
    .lt("closed_at", end)
    .order("bay", { ascending: true })
    .order("closed_at", { ascending: true });
  if (bay) query = query.eq("bay", bay);

  const { data, error } = await query;
  if (error) {
    console.warn("bay_plan_history fetchClosedOnDate failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => fromRow(r as BayPlanHistoryRow));
}

export async function fetchMonthlyReport(
  year: number,
  month: number,
  bay?: number,
): Promise<BayHistorySession[]> {
  const { start, end } = istMonthRangeUtc(year, month);
  let query = supabase
    .from("bay_plan_history")
    .select("*")
    .not("closed_at", "is", null)
    .gte("closed_at", start)
    .lt("closed_at", end)
    .order("bay", { ascending: true })
    .order("closed_at", { ascending: true });
  if (bay) query = query.eq("bay", bay);

  const { data, error } = await query;
  if (error) {
    console.warn("bay_plan_history fetchMonthlyReport failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => fromRow(r as BayPlanHistoryRow));
}
