import { supabase } from "@/lib/supabase";
import type { PlanBlockTire } from "@/types/tire";

// Block Tyres per plan - see supabase/migrations/plan_block_tires.sql and
// plan_block_tires_unblock.sql. Records are never edited or deleted: a record can
// only be added, or marked unblocked (a status change that keeps the record).

interface PlanBlockTireRow {
  id: number;
  plan_no: string;
  material: string;
  description: string;
  qty: number;
  created_by: string;
  created_at: string;
  unblocked_at?: string | null;
  unblocked_by?: string | null;
}

function fromRow(row: PlanBlockTireRow): PlanBlockTire {
  return {
    id: row.id,
    planNo: row.plan_no,
    material: row.material,
    description: row.description,
    qty: row.qty,
    createdBy: row.created_by,
    createdAt: row.created_at,
    unblockedAt: row.unblocked_at ?? undefined,
    unblockedBy: row.unblocked_by || undefined,
  };
}

// Still blocked (not unblocked yet)?
export const isBlocked = (r: PlanBlockTire): boolean => !r.unblockedAt;

export const MAX_BLOCK_QTY = 99999;

// "5" -> 5. Whole numbers from 1 to MAX_BLOCK_QTY only; anything else is null.
export function parseBlockQty(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= MAX_BLOCK_QTY ? n : null;
}

// YYYY-MM-DD of an instant in India time (what the history filters use).
export function istDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const PAGE = 1000; // Supabase returns at most 1000 rows per request

// Every record, newest first; optionally one plan and/or an IST date range
// (inclusive, YYYY-MM-DD). Reads in pages so a long history is never cut at 1000.
// A failed read is an error, not "no records".
export async function fetchPlanBlockTires(
  opts: { planNo?: string; from?: string; to?: string } = {},
): Promise<{ rows: PlanBlockTire[]; error: string | null }> {
  const rows: PlanBlockTire[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let request = supabase.from("plan_block_tires").select("*").order("created_at", { ascending: false }).order("id", { ascending: false });
    if (opts.planNo) request = request.eq("plan_no", opts.planNo);
    if (opts.from) request = request.gte("created_at", `${opts.from}T00:00:00+05:30`);
    if (opts.to) {
      const next = new Date(`${opts.to}T00:00:00+05:30`);
      next.setDate(next.getDate() + 1);
      request = request.lt("created_at", next.toISOString());
    }
    const { data, error } = await request.range(offset, offset + PAGE - 1);
    if (error) {
      console.warn("plan_block_tires fetch failed:", error.message);
      return { rows: [], error: error.message };
    }
    const page = (data ?? []) as PlanBlockTireRow[];
    rows.push(...page.map(fromRow));
    if (page.length < PAGE) break;
  }
  return { rows, error: null };
}

export type AddBlockResult =
  | { ok: true; row: PlanBlockTire }
  // The tyre is already saved under this plan: `existing` is what is on record.
  | { ok: false; duplicate: true; existing: PlanBlockTire | null; error: string }
  | { ok: false; duplicate: false; error: string };

export async function addPlanBlockTire(entry: {
  planNo: string;
  material: string;
  description: string;
  qty: number;
  createdBy: string;
}): Promise<AddBlockResult> {
  const planNo = entry.planNo.trim();
  const material = entry.material.trim();
  if (!planNo || !material) return { ok: false, duplicate: false, error: "Plan number and tyre are required." };
  if (!Number.isInteger(entry.qty) || entry.qty < 1 || entry.qty > MAX_BLOCK_QTY) {
    return { ok: false, duplicate: false, error: `Quantity must be a whole number from 1 to ${MAX_BLOCK_QTY}.` };
  }

  const { data, error } = await supabase
    .from("plan_block_tires")
    .insert({ plan_no: planNo, material, description: entry.description, qty: entry.qty, created_by: entry.createdBy })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique violation: someone (or an earlier attempt) already saved this tyre under this plan.
    if (error.code === "23505") {
      const { rows } = await fetchPlanBlockTires({ planNo });
      const existing = rows.find((r) => isBlocked(r) && r.material.trim().toLowerCase() === material.toLowerCase()) ?? null;
      return {
        ok: false,
        duplicate: true,
        existing,
        error: existing
          ? `${material} is already blocked under plan ${planNo} (qty ${existing.qty}). Saved records can't be changed.`
          : `${material} is already blocked under plan ${planNo}.`,
      };
    }
    console.warn("plan_block_tires insert failed:", error.message);
    return { ok: false, duplicate: false, error: error.message };
  }
  return { ok: true, row: fromRow(data as PlanBlockTireRow) };
}

// Unblocks one record (the SKU row on a plan). The record stays in History.
export async function unblockPlanBlockTire(id: number, by: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("unblock_plan_tyre", { p_id: id, p_by: by });
  if (error) {
    console.warn("unblock_plan_tyre failed:", error.message);
    return { error: error.message.replace(/^unblock: /, "") };
  }
  return { error: null };
}

// Unblocks every still-blocked record of a plan. Returns how many were unblocked.
export async function unblockPlanBlockTires(planNo: string, by: string): Promise<{ count: number; error: string | null }> {
  const { data, error } = await supabase.rpc("unblock_plan_tyres", { p_plan_no: planNo.trim(), p_by: by });
  if (error) {
    console.warn("unblock_plan_tyres failed:", error.message);
    return { count: 0, error: error.message.replace(/^unblock: /, "") };
  }
  return { count: Number(data) || 0, error: null };
}
