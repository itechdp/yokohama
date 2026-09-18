import { startOfTodayIso } from "@/lib/date-utils";
import { supabase } from "@/lib/supabase";
import type { InwardReceipt } from "@/types/tire";

interface InwardReceiptRow {
  id: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  plan_no: string;
  received_at: string;
  received_by: string;
  notes: string;
}

function toRow(r: InwardReceipt) {
  return {
    id: r.id,
    material: r.material,
    description: r.description,
    warehouse: r.warehouse,
    location: r.location,
    quantity: r.quantity,
    plan_no: r.planNo,
    received_at: r.receivedAt,
    received_by: r.receivedBy,
    notes: r.notes,
  };
}

function fromRow(row: InwardReceiptRow): InwardReceipt {
  return {
    id: row.id,
    material: row.material,
    description: row.description,
    warehouse: row.warehouse,
    location: row.location,
    quantity: row.quantity,
    planNo: row.plan_no,
    receivedAt: row.received_at,
    receivedBy: row.received_by,
    notes: row.notes,
  };
}

// Append-only — one row per Material + bin grouped within a single Inward confirm.
export async function insertInwardReceipts(rows: InwardReceipt[]): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from("inward_receipts").insert(rows.map(toRow));
  if (error) {
    console.warn("inward_receipts insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// Every receipt recorded today under one Plan No, oldest first — what the
// cumulative Inward export is built from, so an 11:30am confirm shows up
// alongside an 11:00am one under the same plan no instead of replacing it.
export async function fetchTodayInwardReceiptsForPlan(planNo: string): Promise<InwardReceipt[]> {
  const trimmed = planNo.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from("inward_receipts")
    .select("*")
    .eq("plan_no", trimmed)
    .gte("received_at", startOfTodayIso())
    .order("received_at", { ascending: true });
  if (error) {
    console.warn("inward_receipts plan fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}
