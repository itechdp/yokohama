import { fetchOutwardPicks } from "@/lib/outward-picks";
import { fetchPlacementLogs } from "@/lib/placement-logs";
import { fetchTires } from "@/lib/tires";

export type HistoryType = "inward" | "outward";

// One row of the combined Inward/Outward history — placement_logs (Inward)
// and outward_picks (Outward) are two separate tables with different shapes
// (placement_logs only stores a raw tire_id; outward_picks already carries
// material/description/qty directly), normalized here into one shape so the
// History page can filter and sort them together.
export interface HistoryRow {
  id: string;
  type: HistoryType;
  at: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  by: string;
}

// Inward's placement_logs.location is written as "<Warehouse Label> - Bin
// <code>" (see locationForBin in warehouse-bins.ts) — split back into its
// two parts so History can show Warehouse and Location as separate columns,
// the same shape Outward's rows already come in.
function splitInwardLocation(location: string): { warehouse: string; location: string } {
  const marker = " - Bin ";
  const idx = location.indexOf(marker);
  if (idx === -1) return { warehouse: "—", location };
  return { warehouse: location.slice(0, idx), location: location.slice(idx + marker.length) };
}

// Fetches every Inward placement and every Outward pick ever recorded, joins
// Inward's entries against the tires table (for Material/Model), and merges
// both into one list sorted newest-first.
export async function fetchHistoryRows(): Promise<HistoryRow[]> {
  const [logs, picks, tires] = await Promise.all([fetchPlacementLogs(), fetchOutwardPicks(), fetchTires()]);
  const tireById = new Map(tires.map((t) => [t.id, t]));

  const inwardRows: HistoryRow[] = logs.map((log) => {
    const tire = tireById.get(log.tireId);
    const { warehouse, location } = splitInwardLocation(log.location);
    return {
      id: log.id,
      type: "inward",
      at: log.placedAt,
      material: tire?.serialNumber ?? "—",
      description: tire?.model ?? "—",
      warehouse,
      location,
      quantity: 1,
      by: log.placedBy,
    };
  });

  const outwardRows: HistoryRow[] = picks.map((p) => ({
    id: p.id,
    type: "outward",
    at: p.pickedAt,
    material: p.material,
    description: p.description,
    warehouse: p.warehouse || "—",
    location: p.location || "—",
    quantity: p.quantity,
    by: p.pickedBy,
  }));

  return [...inwardRows, ...outwardRows].sort((a, b) => b.at.localeCompare(a.at));
}

// One aggregated line within a batch — every raw row sharing the same
// material+warehouse+location within that batch collapses into one line
// with a summed quantity, instead of repeating once per physical tire.
export interface HistoryBatchLine {
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
}

// One Inward or Outward confirm action, with its individual tires/picks
// grouped underneath as lines — this is what the History page actually
// shows a card for, not the raw one-row-per-unit feed.
export interface HistoryBatch {
  key: string;
  type: HistoryType;
  at: string;
  by: string;
  totalQuantity: number;
  lines: HistoryBatchLine[];
}

// Regroups the flat, one-row-per-unit history feed back into the batches
// they were originally confirmed as. Every row written by the same confirm
// shares the exact same timestamp — handleConfirm in tire-inward.tsx /
// tire-outward.tsx computes `now` once and reuses it for every row in that
// batch — so (type, at) is a reliable grouping key with no schema change
// needed. Within a batch, rows are further aggregated by
// material+warehouse+location so a batch of 5 identical tires shows as one
// line with Qty 5, not 5 duplicate lines.
export function groupHistoryRows(rows: HistoryRow[]): HistoryBatch[] {
  const batches = new Map<string, { type: HistoryType; at: string; by: string; lines: Map<string, HistoryBatchLine> }>();

  for (const r of rows) {
    const batchKey = `${r.type}|${r.at}`;
    let batch = batches.get(batchKey);
    if (!batch) {
      batch = { type: r.type, at: r.at, by: r.by, lines: new Map() };
      batches.set(batchKey, batch);
    }

    const lineKey = `${r.material}|${r.warehouse}|${r.location}`;
    const existing = batch.lines.get(lineKey);
    if (existing) {
      existing.quantity += r.quantity;
    } else {
      batch.lines.set(lineKey, {
        material: r.material,
        description: r.description,
        warehouse: r.warehouse,
        location: r.location,
        quantity: r.quantity,
      });
    }
  }

  return Array.from(batches.entries())
    .map(([key, b]) => {
      const lines = Array.from(b.lines.values());
      return {
        key,
        type: b.type,
        at: b.at,
        by: b.by,
        totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
        lines,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}
