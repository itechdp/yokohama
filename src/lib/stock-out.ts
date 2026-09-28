import { insertTireHistory } from "@/lib/tire-history";
import { fetchStockAt, upsertTires } from "@/lib/tires";
import type { StageHistory, Tire } from "@/types/tire";

export interface StockOutItem {
  material: string;
  // Exact tires.location — "<warehouse label> - Bin <code>".
  location: string;
  qty: number;
}

// Takes tires out of stock — shared by Picking and Outward confirms. Stock
// is re-read fresh (another device may have taken tires out since they were
// added on screen); if any Material + location is short, nothing is changed.
// Otherwise exactly that many warehouse-stage tires move to the dispatch
// stage (so Stock drops by the confirmed quantity) and each gets a
// tire_history row.
export async function takeOutOfStock(
  items: StockOutItem[],
  opts: { flow: "Picking" | "Outward"; planNo: string; movedBy: string; at: string },
): Promise<{ error: string | null }> {
  const needed = new Map<string, StockOutItem>();
  for (const item of items) {
    const key = `${item.material}|${item.location}`;
    const existing = needed.get(key);
    if (existing) existing.qty += item.qty;
    else needed.set(key, { ...item });
  }

  const outgoing: Tire[] = [];
  const short: string[] = [];
  for (const n of needed.values()) {
    const inStock = await fetchStockAt(n.material, n.location);
    if (inStock.length < n.qty) short.push(`${n.material} at ${n.location} (only ${inStock.length} in stock)`);
    else outgoing.push(...inStock.slice(0, n.qty));
  }
  if (short.length > 0) return { error: `Not enough stock: ${short.join("; ")}. Nothing was taken out.` };

  const outLocation = opts.planNo ? `${opts.flow} - Plan ${opts.planNo}` : opts.flow;
  const { error } = await upsertTires(
    outgoing.map((t) => ({ ...t, currentStage: "dispatch" as const, location: outLocation, updatedAt: opts.at })),
  );
  if (error) return { error: `Failed to take tires out of stock: ${error}` };

  const history: StageHistory[] = outgoing.map((t, idx) => ({
    id: `h-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    tireId: t.id,
    stage: "dispatch",
    location: outLocation,
    movedAt: opts.at,
    movedBy: opts.movedBy,
    notes: `${opts.flow}: ${t.model} taken out from ${t.location}`,
  }));
  await insertTireHistory(history);
  return { error: null };
}
