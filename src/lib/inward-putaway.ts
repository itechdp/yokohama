import { supabase } from "@/lib/supabase";

// putaway_pallet writes its inward_receipts row with the id "ir-<pallet id>", and pallet ids
// always start with "pp-" - that prefix is how History tells a putaway from a normal Inward.
export const PUTAWAY_RECEIPT_PREFIX = "ir-pp-";

// The forklift employee's confirm: places one pending pallet into one bin.
//
// All of the work happens inside the database function putaway_pallet (see
// supabase/migrations/inward_pending.sql) as ONE transaction: it moves/creates
// the tires, writes tire_history, placement_logs and the inward_receipts row
// (sheet no / shift / driver come from the cage's saved pallet), and marks the
// pallet put away. Any failure rolls everything back, so there is never partial
// stock. It is also safe to call again: if the pallet was already put away
// (including by an earlier call whose answer never arrived) nothing changes and
// `alreadyDone` is true.
export async function putAwayPallet(
  palletId: string,
  warehouseKey: string,
  bin: string,
  userId: string | undefined,
): Promise<{ error: string | null; alreadyDone: boolean; location: string | null }> {
  if (!userId) {
    return { error: "You are not logged in. Log in again and retry. Nothing was saved.", alreadyDone: false, location: null };
  }
  const { data, error } = await supabase.rpc("putaway_pallet", {
    p_pallet_id: palletId,
    p_warehouse_key: warehouseKey,
    p_bin: bin,
    p_user_id: userId,
  });
  if (error) {
    console.warn("putaway_pallet failed:", error.message);
    return {
      error: `${error.message.replace(/^putaway: /, "")}. If this keeps happening, check the pending list before retrying.`,
      alreadyDone: false,
      location: null,
    };
  }
  const result = data as { result?: string; location?: string } | null;
  if (!result?.result) {
    return { error: "Unexpected answer from the server. Check the pending list before retrying.", alreadyDone: false, location: null };
  }
  return { error: null, alreadyDone: result.result === "already_put_away", location: result.location ?? null };
}
