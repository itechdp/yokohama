import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import QtyStepper from "@/components/qty-stepper";
import { binForLocation, type WarehouseDef } from "@/data/warehouse-bins";
import type { StockMap } from "@/hooks/use-stock-locations";

// One place a selected tire currently sits in stock — a card in the list.
export interface StockCard {
  key: string;
  material: string;
  description: string;
  // Exact tires.location — "<warehouse label> - Bin <code>".
  location: string;
  warehouseLabel: string;
  code: string;
  inStock: number;
}

export const stockCardKey = (material: string, location: string) => `${material}|${location}`;

// Quantity to take from a card: prefilled with everything in stock there
// until the operator changes it, and never more than what's there.
export const qtyToTake = (qty: Record<string, number>, card: StockCard) =>
  Math.min(qty[card.key] ?? card.inStock, card.inStock);

// Every location holding each selected tire, in warehouse order then by bin
// code. Locations with nothing in stock simply aren't in the map, so they
// never show up.
export function buildStockCards(
  tires: { material: string; description: string }[],
  warehouses: WarehouseDef[],
  stock: StockMap,
): StockCard[] {
  const cards: StockCard[] = [];
  for (const tire of tires) {
    const forTire: (StockCard & { order: number })[] = [];
    for (const [location, byMaterial] of stock) {
      const inStock = byMaterial.get(tire.material) ?? 0;
      if (inStock <= 0) continue;
      const order = warehouses.findIndex((w) => binForLocation(w, location) !== null);
      const warehouse = warehouses[order];
      forTire.push({
        key: stockCardKey(tire.material, location),
        material: tire.material,
        description: tire.description,
        location,
        warehouseLabel: warehouse?.label ?? "—",
        code: (warehouse && binForLocation(warehouse, location)) ?? location,
        inStock,
        order: order === -1 ? warehouses.length : order,
      });
    }
    forTire.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
    cards.push(...forTire.map(({ order: _order, ...card }) => card));
  }
  return cards;
}

// The green location cards on Picking/Outward: one per place a selected tire
// is in stock, each with its own quantity to take (0 up to what's there)
// and the pallet no those tires go onto. Each card is confirmed on its own
// with its action button — one location at a time.
export default function StockLocationList({
  tires,
  cards,
  loading,
  qty,
  onQtyChange,
  palletNo,
  onPalletNoChange,
  actionLabel,
  onAction,
  busyKey,
  blockedReason,
}: {
  tires: { material: string }[];
  cards: StockCard[];
  loading: boolean;
  qty: Record<string, number>;
  onQtyChange: (key: string, value: number) => void;
  palletNo: Record<string, string>;
  onPalletNoChange: (key: string, value: string) => void;
  actionLabel: string;
  onAction: (card: StockCard) => void;
  // Card currently being confirmed; every button waits while one is.
  busyKey: string | null;
  // Why nothing can be confirmed yet (e.g. plan details missing).
  blockedReason?: string | null;
}) {
  if (tires.length === 0) {
    return (
      <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
        Select a tire above to see where it is in stock.
      </div>
    );
  }
  // Only the first lookup shows the spinner — refreshes after each card is
  // confirmed keep the list in place so the operator doesn't lose their spot.
  if (loading && cards.length === 0) {
    return (
      <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        Finding where it is in stock…
      </div>
    );
  }

  const missing = tires.filter((t) => !cards.some((c) => c.material === t.material));
  return (
    <div className="space-y-2">
      {blockedReason && cards.length > 0 && (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{blockedReason}</p>
      )}
      {cards.map((c) => {
        const taking = qtyToTake(qty, c);
        const pallet = (palletNo[c.key] ?? "").trim();
        const busy = busyKey === c.key;
        return (
          <div
            key={c.key}
            className={cn(
              "rounded-xl border px-4 py-3 text-center space-y-2 transition-colors",
              taking > 0 ? "border-success bg-success/15" : "border-success/30 bg-success/5",
            )}
          >
            <p className="text-lg font-semibold tracking-wide text-success">{c.code}</p>
            <p className="text-sm font-medium text-foreground truncate">{c.description}</p>
            <p className="text-xs text-muted-foreground truncate">
              {c.material} · {c.warehouseLabel} · {c.inStock} in stock
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="shrink-0">
                <QtyStepper value={taking} min={0} max={c.inStock} onChange={(v) => onQtyChange(c.key, v)} />
              </div>
              <div className="relative min-w-24 flex-1">
                <input
                  type="text"
                  value={palletNo[c.key] ?? ""}
                  onChange={(e) => onPalletNoChange(c.key, e.target.value)}
                  placeholder="Pallet no"
                  disabled={taking === 0}
                  aria-label={`Pallet no for ${c.code}`}
                  aria-required="true"
                  autoComplete="off"
                  className="w-full rounded-xl border border-border bg-card py-2 pl-3 pr-6 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-danger" aria-hidden="true">
                  *
                </span>
              </div>
              <button
                type="button"
                onClick={() => onAction(c)}
                disabled={taking === 0 || !pallet || !!blockedReason || busyKey !== null}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {actionLabel}
              </button>
            </div>
          </div>
        );
      })}
      {missing.map((t) => (
        <p key={t.material} className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {t.material} is not in stock in any warehouse.
        </p>
      ))}
    </div>
  );
}
