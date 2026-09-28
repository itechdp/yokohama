import { supabase } from "@/lib/supabase";
import type { OutwardRecord } from "@/types/tire";

interface OutwardRow {
  id: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  plan_no: string;
  pallet_no: string;
  shift: string;
  picker_name: string;
  outward_at: string;
  outward_by: string;
  notes: string;
}

function toRow(r: OutwardRecord) {
  return {
    id: r.id,
    material: r.material,
    description: r.description,
    warehouse: r.warehouse,
    location: r.location,
    quantity: r.quantity,
    plan_no: r.planNo,
    pallet_no: r.palletNo,
    shift: r.shift,
    picker_name: r.pickerName,
    outward_at: r.outwardAt,
    outward_by: r.outwardBy,
    notes: r.notes,
  };
}

function fromRow(row: OutwardRow): OutwardRecord {
  return {
    id: row.id,
    material: row.material,
    description: row.description,
    warehouse: row.warehouse,
    location: row.location,
    quantity: row.quantity,
    planNo: row.plan_no,
    palletNo: row.pallet_no,
    shift: row.shift,
    pickerName: row.picker_name,
    outwardAt: row.outward_at,
    outwardBy: row.outward_by,
    notes: row.notes,
  };
}

// Append-only log of what left stock through Outward. The stock change
// itself happens on the tires table (see tire-outward.tsx); this is the
// record History and the export read back.
export async function insertOutwards(rows: OutwardRecord[]): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from("outwards").insert(rows.map(toRow));
  if (error) {
    console.warn("outwards insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// Full Outward history, newest first — merged into the History page.
export async function fetchOutwards(): Promise<OutwardRecord[]> {
  const { data, error } = await supabase.from("outwards").select("*").order("outward_at", { ascending: false });
  if (error) {
    console.warn("outwards fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}

// A plan already used on Outward, with the details it was last confirmed
// under — backs the "Ongoing plan" dropdown on Outward, same as Picking's.
export interface OngoingOutwardPlan {
  planNo: string;
  pickerName: string;
  shift: string;
  lastOutwardAt: string;
}

// One entry per Plan No ever used on Outward, most recently active first,
// each carrying the picker name/shift from that plan's latest outward. Pages
// through the table since PostgREST caps a single response at 1000 rows.
export async function fetchOngoingOutwardPlans(): Promise<OngoingOutwardPlan[]> {
  const pageSize = 1000;
  const seen = new Map<string, OngoingOutwardPlan>();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("outwards")
      .select("plan_no, picker_name, shift, outward_at")
      .order("outward_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("outwards ongoing plans fetch failed:", error.message);
      break;
    }
    for (const row of data ?? []) {
      const planNo = (row.plan_no as string)?.trim();
      if (!planNo || seen.has(planNo)) continue;
      seen.set(planNo, {
        planNo,
        pickerName: (row.picker_name as string) ?? "",
        shift: (row.shift as string) ?? "",
        lastOutwardAt: row.outward_at as string,
      });
    }
    if (!data || data.length < pageSize) break;
  }
  return [...seen.values()];
}
