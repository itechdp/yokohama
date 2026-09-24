import { fetchInwardReceipts } from "@/lib/inward-receipts";
import { fetchOutwardPicks } from "@/lib/outward-picks";
import { fetchPlacementLogs } from "@/lib/placement-logs";
import { fetchTires } from "@/lib/tires";

export type HistoryType = "inward" | "outward";

// One row of the combined Inward/Outward history — inward_receipts (Inward)
// and outward_picks (Outward) normalized into one shape so the History page
// can filter and sort them together. Inward confirms made before
// inward_receipts existed only live in placement_logs (one row per tire, no
// Plan No) — those are folded in too so older history doesn't disappear.
export interface HistoryRow {
  id: string;
  type: HistoryType;
  at: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  planNo: string;
  palletNo: string;
  shift: string;
  pickerName: string;
  by: string;
}

// Inward's location is written as "<Warehouse Label> - Bin <code>" (see
// locationForBin in warehouse-bins.ts) — split back into its two parts so
// History can show Warehouse and Location separately, the same shape
// Outward's rows already come in.
function splitInwardLocation(location: string | null | undefined): { warehouse: string; location: string } {
  if (!location) return { warehouse: "—", location: "—" };
  const marker = " - Bin ";
  const idx = location.indexOf(marker);
  if (idx === -1) return { warehouse: "—", location };
  return { warehouse: location.slice(0, idx), location: location.slice(idx + marker.length) };
}

// Local YYYY-MM-DD from an ISO timestamp — plan numbers are reused day to
// day, so a plan's history is always scoped to the day it was worked on.
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Fetches every Inward receipt and Outward pick ever recorded (plus legacy
// pre-receipt Inward placements) and merges them into one list sorted
// newest-first.
export async function fetchHistoryRows(): Promise<HistoryRow[]> {
  const [receipts, picks, logs, tires] = await Promise.all([
    fetchInwardReceipts(),
    fetchOutwardPicks(),
    fetchPlacementLogs(),
    fetchTires(),
  ]);

  const inwardRows: HistoryRow[] = receipts.map((r) => {
    const { warehouse, location } = splitInwardLocation(r.location);
    return {
      id: r.id,
      type: "inward",
      at: r.receivedAt,
      material: r.material,
      description: r.description || "—",
      warehouse: r.warehouse || warehouse,
      location,
      quantity: r.quantity,
      planNo: r.planNo ?? "",
      palletNo: r.palletNo ?? "",
      shift: r.shift ?? "",
      pickerName: r.pickerName ?? "",
      by: r.receivedBy,
    };
  });

  // Every Inward confirm writes both a placement_log per tire and a receipt
  // per Material+bin with the same timestamp. Placements with no matching
  // receipt (older confirms, or ones whose receipt insert failed) are shown
  // from placement_logs instead so they don't vanish from History.
  // Compared as epoch ms — Supabase returns "+00:00" while the app wrote "Z".
  const receiptTimes = new Set(receipts.map((r) => new Date(r.receivedAt).getTime()));
  const tireById = new Map(tires.map((t) => [t.id, t]));
  const legacyInwardRows: HistoryRow[] = logs
    .filter((log) => !receiptTimes.has(new Date(log.placedAt).getTime()))
    .map((log) => {
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
        planNo: "",
        palletNo: "",
        shift: "",
        pickerName: "",
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
    planNo: p.planNo ?? "",
    palletNo: p.palletNo ?? "",
    shift: p.shift ?? "",
    pickerName: p.pickerName ?? "",
    by: p.pickedBy,
  }));

  return [...inwardRows, ...legacyInwardRows, ...outwardRows].sort((a, b) => b.at.localeCompare(a.at));
}

// One aggregated line within a batch — every raw row sharing the same
// material+warehouse+location+pallet within that batch collapses into one
// line with a summed quantity, instead of repeating once per physical tire.
export interface HistoryBatchLine {
  material: string;
  description: string;
  warehouse: string;
  location: string;
  palletNo: string;
  quantity: number;
  // Earliest confirm time of the rows folded into this line.
  at: string;
}

// Everything done under one Plan No on one day, for one direction (Inward
// or Outward) — possibly several confirms minutes apart, possibly from
// different devices. Rows with no Plan No (older entries) fall back to one
// batch per confirm.
export interface HistoryBatch {
  key: string;
  type: HistoryType;
  planNo: string;
  // Latest confirm time in the batch — what the list is sorted by.
  at: string;
  // Earliest confirm time in the batch.
  firstAt: string;
  confirmCount: number;
  shift: string;
  pickerName: string;
  totalQuantity: number;
  lines: HistoryBatchLine[];
}

// Regroups the flat history feed by (type, Plan No, local day). Rows without
// a Plan No are grouped by exact timestamp instead — handleConfirm in
// tire-inward.tsx / tire-outward.tsx computes `now` once and reuses it for
// every row of a confirm, so (type, at) still identifies one confirm.
export function groupHistoryRows(rows: HistoryRow[]): HistoryBatch[] {
  interface Acc {
    type: HistoryType;
    planNo: string;
    at: string;
    firstAt: string;
    confirms: Set<string>;
    shift: string;
    pickerName: string;
    lines: Map<string, HistoryBatchLine>;
  }
  const batches = new Map<string, Acc>();

  for (const r of rows) {
    const planNo = r.planNo.trim();
    const batchKey = planNo ? `${r.type}|plan|${planNo}|${localDateKey(r.at)}` : `${r.type}|at|${r.at}`;
    let batch = batches.get(batchKey);
    if (!batch) {
      batch = {
        type: r.type,
        planNo,
        at: r.at,
        firstAt: r.at,
        confirms: new Set(),
        shift: r.shift,
        pickerName: r.pickerName,
        lines: new Map(),
      };
      batches.set(batchKey, batch);
    }
    batch.confirms.add(r.at);
    // Header Shift/Picker Name reflect the most recent confirm under this
    // plan — a plan is expected to stay on one shift/picker, but if it ever
    // spans more than one, the latest wins (same rule the exports used).
    if (r.at >= batch.at) {
      batch.at = r.at;
      if (r.shift) batch.shift = r.shift;
      if (r.pickerName) batch.pickerName = r.pickerName;
    }
    if (r.at < batch.firstAt) batch.firstAt = r.at;

    const lineKey = `${r.material}|${r.warehouse}|${r.location}|${r.palletNo}`;
    const existing = batch.lines.get(lineKey);
    if (existing) {
      existing.quantity += r.quantity;
      if (r.at < existing.at) existing.at = r.at;
    } else {
      batch.lines.set(lineKey, {
        material: r.material,
        description: r.description,
        warehouse: r.warehouse,
        location: r.location,
        palletNo: r.palletNo,
        quantity: r.quantity,
        at: r.at,
      });
    }
  }

  return Array.from(batches.entries())
    .map(([key, b]) => {
      const lines = Array.from(b.lines.values()).sort((x, y) => x.at.localeCompare(y.at));
      return {
        key,
        type: b.type,
        planNo: b.planNo,
        at: b.at,
        firstAt: b.firstAt,
        confirmCount: b.confirms.size,
        shift: b.shift,
        pickerName: b.pickerName,
        totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
        lines,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}
