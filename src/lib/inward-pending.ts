import { supabase } from "@/lib/supabase";
import type { PendingPutaway, PendingPutawayStatus } from "@/types/tire";

// Pallets the cage employee has saved that the forklift employee has not placed
// yet (table inward_pending - see supabase/migrations/inward_pending.sql).
// Status flow: pending -> put_away (only through the putaway_pallet database
// function, see inward-putaway.ts) or pending -> cancelled (only through
// cancel_pending_pallet). The browser can read pending rows and insert new
// pending rows; it cannot update or delete them directly.

interface PendingRow {
  id: string;
  material: string;
  description: string;
  brand: string | null;
  ply_rating_bottom: string | null;
  quantity: number;
  pallet_no: string;
  plan_no: string;
  shift: string;
  entry_date: string;
  picker_name: string;
  status: PendingPutawayStatus;
  created_by: string;
  created_at: string;
}

function fromRow(row: PendingRow): PendingPutaway {
  return {
    id: row.id,
    material: row.material,
    description: row.description,
    brand: row.brand ?? undefined,
    plyRatingBottom: row.ply_rating_bottom ?? undefined,
    quantity: row.quantity,
    palletNo: row.pallet_no,
    planNo: row.plan_no,
    shift: row.shift,
    entryDate: row.entry_date,
    pickerName: row.picker_name,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export type NewPending = Pick<
  PendingPutaway,
  "id" | "material" | "description" | "brand" | "plyRatingBottom" | "quantity" | "palletNo" | "planNo" | "shift" | "entryDate" | "pickerName" | "createdBy"
>;

// Cage entry: one row per pallet, always created as 'pending'. Inserted with
// "ignore duplicates" on the row id, so sending the same submission twice
// (double click, or a retry after a network error whose first attempt actually
// arrived) leaves exactly one set of rows.
export async function insertPending(rows: NewPending[]): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from("inward_pending").upsert(
    rows.map((r) => ({
      id: r.id,
      material: r.material,
      description: r.description,
      brand: r.brand ?? null,
      ply_rating_bottom: r.plyRatingBottom ?? null,
      quantity: r.quantity,
      pallet_no: r.palletNo,
      plan_no: r.planNo,
      shift: r.shift,
      entry_date: r.entryDate,
      picker_name: r.pickerName,
      status: "pending",
      created_by: r.createdBy,
    })),
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) {
    console.warn("inward_pending insert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// Pallets still waiting for the forklift, oldest first. A failed read is an
// error, not "no pallets".
export async function fetchPendingPutaways(): Promise<{ pallets: PendingPutaway[]; error: string | null }> {
  const { data, error } = await supabase
    .from("inward_pending")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("inward_pending fetch failed:", error.message);
    return { pallets: [], error: error.message };
  }
  return { pallets: ((data ?? []) as PendingRow[]).map(fromRow), error: null };
}

// Soft duplicate check for the cage: same Sheet No + Pallet No + SKU already
// waiting or already put away. Only a WARNING - the same pallet and SKU can
// legitimately be entered again, so the cage can always choose "Save anyway".
// Rows from the current submission itself (`ownIdPrefix`) are ignored, so a
// retry of a save that actually went through doesn't warn about itself.
export interface PossibleDuplicate {
  palletNo: string;
  material: string;
  quantity: number;
  status: PendingPutawayStatus;
}

export async function findPossibleDuplicates(
  planNo: string,
  items: { palletNo: string; material: string }[],
  ownIdPrefix: string,
): Promise<{ duplicates: PossibleDuplicate[]; error: string | null }> {
  if (items.length === 0) return { duplicates: [], error: null };
  const { data, error } = await supabase
    .from("inward_pending")
    .select("id, pallet_no, material, quantity, status")
    .eq("plan_no", planNo)
    .in("status", ["pending", "put_away"])
    .in("pallet_no", Array.from(new Set(items.map((i) => i.palletNo))));
  if (error) {
    console.warn("inward_pending duplicate check failed:", error.message);
    return { duplicates: [], error: error.message };
  }
  const wanted = new Set(items.map((i) => `${i.palletNo}\u0000${i.material}`));
  const duplicates = ((data ?? []) as { id: string; pallet_no: string; material: string; quantity: number; status: PendingPutawayStatus }[])
    .filter((r) => !r.id.startsWith(ownIdPrefix) && wanted.has(`${r.pallet_no}\u0000${r.material}`))
    .map((r) => ({ palletNo: r.pallet_no, material: r.material, quantity: r.quantity, status: r.status }));
  return { duplicates, error: null };
}

// A pallet saved by mistake - only while it is still pending. Done inside the
// database (cancel_pending_pallet); it never touches stock.
export async function cancelPending(
  palletId: string,
  userId: string | undefined,
): Promise<{ error: string | null }> {
  if (!userId) return { error: "You are not logged in. Log in again and retry." };
  const { error } = await supabase.rpc("cancel_pending_pallet", { p_pallet_id: palletId, p_user_id: userId });
  if (error) {
    console.warn("cancel_pending_pallet failed:", error.message);
    return { error: error.message.replace(/^cancel: /, "") };
  }
  return { error: null };
}

// Gives every cage submission one fixed id, so a repeat of the SAME submission
// (same sheet, date, shift, driver and pallets) reuses it and can't create a
// second set of pending rows, while a genuinely different one gets a fresh id.
// Call done() after a successful save so the next identical entry is a new one.
export function makeSubmissionTracker(newId: () => string = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`) {
  let last: { signature: string; id: string } | null = null;
  return {
    idFor(signature: string): string {
      if (!last || last.signature !== signature) last = { signature, id: newId() };
      return last.id;
    },
    done() {
      last = null;
    },
  };
}
