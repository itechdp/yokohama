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
  // Optional per-column stand count: how many stands (X, Y, Z, then A, B,
  // C, ... — see STAND_IDS) the picker shows for every area in that column. Applies
  // uniformly to every row/area in the column, same as columnRowCounts.
  // Missing entries, or a missing array entirely, default to 1 stand.
  columnStandCounts?: number[];
  // Optional per-column floor count: how many floors the picker shows for
  // every stand in that column. Missing entries, or a missing array
  // entirely, default to FLOOR_COUNT.
  columnFloorCounts?: number[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Stand letters — X, Y, Z first, then A, B, C, ... — no fixed cap, same as
// floors. 26 covers any realistic physical layout; extend here if a
// warehouse ever needs more.
export const STAND_IDS: string[] = [
  "X",
  "Y",
  "Z",
  ...Array.from({ length: 23 }, (_, i) => String.fromCharCode(65 + i)), // A..W
];
// Default floor count for a column that hasn't configured its own.
export const FLOOR_COUNT = 6;

// Stand count of an area's column — how many stands the picker shows.
export function standCountAt(warehouse: WarehouseDef, col: number): number {
  return warehouse.columnStandCounts?.[col - 1] ?? 1;
}

// Floor count of an area's column — how many floors the picker shows.
export function floorCountAt(warehouse: WarehouseDef, col: number): number {
  return warehouse.columnFloorCounts?.[col - 1] ?? FLOOR_COUNT;
}

// Every real, placeable bin in the warehouse — one per (area, stand, floor),
// using however many stands that area's column is configured for. An area
// code alone is never a placeable bin by itself; a tire always sits at a
// specific stand+floor within it.
export function binsForWarehouse(warehouse: WarehouseDef): string[] {
  const bins: string[] = [];
  warehouse.columnRowCounts.forEach((maxRow, colIndex) => {
    const col = colIndex + 1;
    const standCount = standCountAt(warehouse, col);
    const floorCount = floorCountAt(warehouse, col);
    for (let row = 1; row <= maxRow; row++) {
      const areaCode = `${warehouse.prefix}${pad2(col)}-${pad2(row)}`;
      for (const standId of STAND_IDS.slice(0, standCount)) {
        for (let floor = 1; floor <= floorCount; floor++) {
          bins.push(`${areaCode}-${standId}${floor}`);
        }
      }
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

// First bin in the warehouse — used to auto-place stock when the operator
// hasn't tapped a specific bin, so confirming never blocks on a missing pick.
// Bins have no capacity limit, so there's no need to look for one with room.
export function firstBin(warehouse: WarehouseDef): string | null {
  return binsForWarehouse(warehouse)[0] ?? null;
}
