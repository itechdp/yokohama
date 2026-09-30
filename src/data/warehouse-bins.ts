// Each warehouse maps to a bin prefix; each prefix has a number of columns,
// and each column has its own row count (racks are not uniform). Editable
// from the Warehouses page (src/pages/warehouses.tsx) and persisted in
// Supabase (src/lib/warehouses.ts) — this file only holds the shape and the
// pure helpers that operate on it.
export interface WarehouseDef {
  key: string;
  label: string;
  prefix: string;
  columnRowCounts: number[]; // index 0 = column 01, value = max row number in that column
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Every real, placeable bin in the warehouse — one per (column, row), e.g.
// "Z01-02". The bin code is the area code itself; there are no stands or
// floors within it.
export function binsForWarehouse(warehouse: WarehouseDef): string[] {
  const bins: string[] = [];
  warehouse.columnRowCounts.forEach((maxRow, colIndex) => {
    const col = colIndex + 1;
    for (let row = 1; row <= maxRow; row++) {
      bins.push(`${warehouse.prefix}${pad2(col)}-${pad2(row)}`);
    }
  });
  return bins;
}

export function locationForBin(warehouse: WarehouseDef, bin: string): string {
  return `${warehouse.label} - Bin ${bin}`;
}

// The bin code a tire's location string points at, if it's currently sitting in one.
export function binForLocation(warehouse: WarehouseDef, location: string): string | null {
  const prefix = `${warehouse.label} - Bin `;
  return location.startsWith(prefix) ? location.slice(prefix.length) : null;
}

// Bins currently holding a tire, so the picker can show occupied vs. empty like a seat map.
export function occupiedBins(warehouse: WarehouseDef, tires: { currentStage: string; location: string }[]): Set<string> {
  const prefix = `${warehouse.label} - Bin `;
  const occupied = new Set<string>();
  for (const t of tires) {
    if (t.currentStage === "warehouse" && t.location.startsWith(prefix)) {
      occupied.add(t.location.slice(prefix.length));
    }
  }
  return occupied;
}

// How many tires currently sit in each bin — a plate can hold any number of
// tires, so this is a count, not just occupied/empty.
export function binCounts(warehouse: WarehouseDef, tires: { currentStage: string; location: string }[]): Map<string, number> {
  const prefix = `${warehouse.label} - Bin `;
  const counts = new Map<string, number>();
  for (const t of tires) {
    if (t.currentStage === "warehouse" && t.location.startsWith(prefix)) {
      const bin = t.location.slice(prefix.length);
      counts.set(bin, (counts.get(bin) ?? 0) + 1);
    }
  }
  return counts;
}

// Which warehouse a raw bin code (e.g. "B03-26", no warehouse label prefix —
// what an uploaded stock sheet's LOCATION column holds) belongs to, by
// matching its own prefix. Longest-matching prefix wins so e.g. "AM" isn't
// shadowed by a coincidental "A" warehouse. Returns null if no warehouse's
// prefix matches, or the remainder after the prefix isn't a NN-NN bin code.
export function warehouseForBinCode(warehouses: WarehouseDef[], bin: string): WarehouseDef | null {
  const trimmed = bin.trim();
  let best: WarehouseDef | null = null;
  for (const w of warehouses) {
    if (!trimmed.startsWith(w.prefix)) continue;
    const rest = trimmed.slice(w.prefix.length);
    if (!/^\d+-\d+$/.test(rest)) continue;
    if (!best || w.prefix.length > best.prefix.length) best = w;
  }
  return best;
}

// First bin in the warehouse — used to auto-place stock when the operator
// hasn't tapped a specific bin, so confirming never blocks on a missing pick.
// Bins have no capacity limit, so there's no need to look for one with room.
export function firstBin(warehouse: WarehouseDef): string | null {
  return binsForWarehouse(warehouse)[0] ?? null;
}
