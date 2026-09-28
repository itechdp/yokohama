import { insertPlacementLogs } from "@/lib/placement-logs";
import { buildTireFromCatalogRow } from "@/lib/tire-catalog";
import { insertTireHistory } from "@/lib/tire-history";
import { upsertTires } from "@/lib/tires";
import type { PlacementLog, StageHistory, Tire } from "@/types/tire";

// Manual stock corrections made on the Stock page. Stock is one tires row per
// unit at current_stage "warehouse" (the same rows Inward creates and
// Picking/Outward take out), so adding/removing units here is immediately
// what Picking and Outward see. Every change gets a tire_history row so the
// correction stays traceable.

const MOVED_BY = "Stock adjustment";
// Where removed units go — off the warehouse stage, so they no longer count
// as stock anywhere, but still on record.
export const REMOVED_LOCATION = "Stock adjustment - removed";

const uid = (prefix: string, idx: number) => `${prefix}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`;

// Puts `qty` new units of a tire into stock at one exact tires.location
// ("<warehouse label> - Bin <code>"), same shape as an Inward placement.
export async function addToStock(
  tire: { material: string; description: string; brand?: string; plyRatingBottom?: string },
  location: string,
  qty: number,
): Promise<{ error: string | null }> {
  if (qty <= 0) return { error: null };
  const now = new Date().toISOString();
  const units: Tire[] = Array.from({ length: qty }, (_, i) => ({
    ...buildTireFromCatalogRow(
      {
        material: tire.material,
        description: tire.description,
        plyRatingBottom: tire.plyRatingBottom ?? "",
        brand: tire.brand ?? "",
        skuQrCode: "",
      },
      uid("t", i),
      now,
    ),
    currentStage: "warehouse" as const,
    location,
  }));

  const { error } = await upsertTires(units);
  if (error) return { error: `Failed to add tires to stock: ${error}` };

  const notes = `Stock adjustment: ${tire.description} added at ${location}`;
  const history: StageHistory[] = units.map((u, i) => ({
    id: uid("h", i),
    tireId: u.id,
    stage: "warehouse",
    location,
    movedAt: now,
    movedBy: MOVED_BY,
    notes,
  }));
  const logs: PlacementLog[] = units.map((u, i) => ({
    id: uid("p", i),
    tireId: u.id,
    location,
    placedAt: now,
    placedBy: MOVED_BY,
    notes,
  }));
  await insertTireHistory(history);
  await insertPlacementLogs(logs);
  return { error: null };
}

// Takes these exact units out of stock (moves them off the warehouse stage).
export async function removeFromStock(units: Tire[]): Promise<{ error: string | null }> {
  if (units.length === 0) return { error: null };
  const now = new Date().toISOString();
  const { error } = await upsertTires(
    units.map((u) => ({ ...u, currentStage: "scrapped" as const, location: REMOVED_LOCATION, updatedAt: now })),
  );
  if (error) return { error: `Failed to remove tires from stock: ${error}` };

  await insertTireHistory(
    units.map((u, i) => ({
      id: uid("h", i),
      tireId: u.id,
      stage: "scrapped",
      location: REMOVED_LOCATION,
      movedAt: now,
      movedBy: MOVED_BY,
      notes: `Stock adjustment: ${u.model} removed from ${u.location}`,
    })),
  );
  return { error: null };
}
