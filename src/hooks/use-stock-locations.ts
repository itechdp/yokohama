import { useEffect, useState } from "react";
import { binForLocation, type WarehouseDef } from "@/data/warehouse-bins";
import { fetchStockLocations } from "@/lib/tires";

// location ("<warehouse label> - Bin <code>") -> Material -> tires in stock.
export type StockMap = Map<string, Map<string, number>>;

// Where the given Materials currently sit in stock, re-fetched whenever the
// selection changes or refreshKey is bumped (e.g. after a confirm).
export function useStockLocations(materials: string[], refreshKey = 0): { stock: StockMap; loading: boolean } {
  const [stock, setStock] = useState<StockMap>(new Map());
  const [loading, setLoading] = useState(false);
  const key = [...materials].sort().join("\n");

  useEffect(() => {
    if (!key) {
      setStock(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchStockLocations(key.split("\n")).then((rows) => {
      if (cancelled) return;
      const next: StockMap = new Map();
      for (const { material, location } of rows) {
        const byMaterial = next.get(location) ?? new Map<string, number>();
        byMaterial.set(material, (byMaterial.get(material) ?? 0) + 1);
        next.set(location, byMaterial);
      }
      setStock(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);

  return { stock, loading };
}

// Tires in stock (all selected Materials together) per Row and Position of
// one warehouse: column number -> row number -> count. A location with an
// older stand/floor suffix ("Z01-02-X3") still counts toward Z01-02.
export function stockByRowPosition(warehouse: WarehouseDef, stock: StockMap): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>();
  for (const [location, byMaterial] of stock) {
    const bin = binForLocation(warehouse, location);
    if (!bin) continue;
    const [colStr, rowStr] = bin.slice(warehouse.prefix.length).split("-");
    const col = Number(colStr);
    const row = Number(rowStr);
    if (!col || !row) continue;
    let total = 0;
    for (const n of byMaterial.values()) total += n;
    const rows = out.get(col) ?? new Map<number, number>();
    rows.set(row, (rows.get(row) ?? 0) + total);
    out.set(col, rows);
  }
  return out;
}

// Total tires in stock (all selected Materials together) in one warehouse.
export function stockInWarehouse(warehouse: WarehouseDef, stock: StockMap): number {
  let total = 0;
  for (const [location, byMaterial] of stock) {
    if (!binForLocation(warehouse, location)) continue;
    for (const n of byMaterial.values()) total += n;
  }
  return total;
}
