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

// Location a tire gets when it's pulled off a bin for outward movement, before
// the separate Dispatch flow assigns it a driver/destination.
export const PICKED_LOCATION = "Picked - Awaiting Dispatch";

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

// First empty bin in a warehouse — used to auto-place stock when the operator
// hasn't tapped a specific bin, so confirming never blocks on a missing pick.
export function firstEmptyBin(warehouse: WarehouseDef, occupied: Set<string>): string | null {
  for (const bin of binsForWarehouse(warehouse)) {
    if (!occupied.has(bin)) return bin;
  }
  return null;
}
