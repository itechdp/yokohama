import { useEffect, useMemo, useState } from "react";
import { Package, Search, Warehouse } from "lucide-react";
import { readDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import { STAGE_LABELS, type Tire } from "@/types/tire";

interface StockGroup {
  size: string;
  model: string;
  location: string;
  quantity: number;
  tireIds: string[];
}

export default function TireSearch() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
  }, []);

  const trimmedQuery = query.trim().toLowerCase();

  const stockGroups = useMemo<StockGroup[]>(() => {
    const groups = new Map<string, StockGroup>();
    for (const tire of tires) {
      if (tire.currentStage !== "warehouse") continue;
      if (tire.status === "scrapped") continue;
      if (trimmedQuery && !tire.size.toLowerCase().includes(trimmedQuery)) continue;

      const key = `${tire.size}::${tire.location}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += 1;
        existing.tireIds.push(tire.id);
      } else {
        groups.set(key, {
          size: tire.size,
          model: tire.model,
          location: tire.location,
          quantity: 1,
          tireIds: [tire.id],
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.size.localeCompare(b.size) || a.location.localeCompare(b.location),
    );
  }, [tires, trimmedQuery]);

  const totalQuantity = useMemo(
    () => stockGroups.reduce((sum, group) => sum + group.quantity, 0),
    [stockGroups],
  );

  const distinctSizes = useMemo(() => {
    const sizes = new Set<string>();
    for (const tire of tires) {
      if (tire.currentStage === "warehouse" && tire.status !== "scrapped") {
        sizes.add(tire.size);
      }
    }
    return Array.from(sizes).sort();
  }, [tires]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dispatch stock search</h1>
        <p className="text-muted-foreground">
          Enter a tire size to find warehouse locations and available quantities.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="e.g. 185/65 R15"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {distinctSizes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground py-1">Available sizes:</span>
            {distinctSizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setQuery(size)}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                  size.toLowerCase() === trimmedQuery
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                {size}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Warehouse className="size-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Warehouse locations</p>
            <p className="text-2xl font-semibold text-foreground">{stockGroups.length}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-success-soft p-3 text-success">
            <Package className="size-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total in stock</p>
            <p className="text-2xl font-semibold text-foreground">{totalQuantity}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Size</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Warehouse location</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stage</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {stockGroups.map((group) => (
              <tr key={`${group.size}-${group.location}`} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{group.size}</td>
                <td className="px-4 py-3 text-foreground">{group.model}</td>
                <td className="px-4 py-3 text-muted-foreground">{group.location}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-success-soft text-success">
                    {STAGE_LABELS.warehouse}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-foreground">{group.quantity}</td>
              </tr>
            ))}
            {stockGroups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {trimmedQuery
                    ? `No warehouse stock found for size "${query.trim()}".`
                    : "No warehouse stock available."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
