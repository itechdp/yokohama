import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MapPin, Package, Search, Warehouse, X } from "lucide-react";
import { readDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import { STAGE_LABELS, type Tire } from "@/types/tire";

export default function TireLocations() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [search, setSearch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      const db = readDb();
      if (!mounted) return;
      setTires((db.tires as Tire[]) || []);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const warehouseTires = useMemo(
    () => tires.filter((t) => t.currentStage === "warehouse"),
    [tires],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return warehouseTires.filter((t) => {
      const matchesSearch =
        !q ||
        t.size.toLowerCase().includes(q) ||
        t.model.toLowerCase().includes(q) ||
        t.serialNumber.toLowerCase().includes(q) ||
        t.location.toLowerCase().includes(q);
      const matchesLocation = !selectedLocation || t.location === selectedLocation;
      return matchesSearch && matchesLocation;
    });
  }, [warehouseTires, search, selectedLocation]);

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Tire[]>>();
    for (const tire of filtered) {
      if (!map.has(tire.location)) map.set(tire.location, new Map());
      const bySize = map.get(tire.location)!;
      if (!bySize.has(tire.size)) bySize.set(tire.size, []);
      bySize.get(tire.size)!.push(tire);
    }
    return map;
  }, [filtered]);

  const locationTotals = useMemo(() => {
    const out = new Map<string, number>();
    for (const tire of warehouseTires) {
      out.set(tire.location, (out.get(tire.location) || 0) + 1);
    }
    return out;
  }, [warehouseTires]);

  const chartData = useMemo(
    () =>
      Array.from(locationTotals.entries())
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count),
    [locationTotals],
  );

  const locations = useMemo(
    () => Array.from(new Set(warehouseTires.map((t) => t.location))).sort(),
    [warehouseTires],
  );

  const stats = useMemo(() => {
    const totalStock = warehouseTires.length;
    const uniqueSizes = new Set(warehouseTires.map((t) => t.size)).size;
    const locationsUsed = locations.length;
    return { totalStock, uniqueSizes, locationsUsed };
  }, [warehouseTires, locations]);

  const clearFilters = () => {
    setSearch("");
    setSelectedLocation(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Warehouse className="size-6 text-primary" />
          Tire locations
        </h1>
        <p className="text-muted-foreground">
          See where every tire size is currently stored in the warehouse so staff can find stock
          without manual searches.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Package} label="Warehouse stock" value={stats.totalStock.toString()} />
        <StatCard icon={MapPin} label="Locations used" value={stats.locationsUsed.toString()} />
        <StatCard icon={Search} label="Unique sizes" value={stats.uniqueSizes.toString()} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-medium text-foreground mb-4">Stock by location</h2>
        <div className="h-64 w-full">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No warehouse stock to display.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 64 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="location"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.75rem",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  itemStyle={{ color: "hsl(var(--primary))" }}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  radius={[6, 6, 0, 0]}
                  animationDuration={1200}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by size, model, serial or location"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {(search || selectedLocation) && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <X className="size-4" />
            Clear filters
          </button>
        )}
      </div>

      {locations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedLocation(null)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selectedLocation === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            All
          </button>
          {locations.map((loc) => (
            <button
              key={loc}
              onClick={() => setSelectedLocation(loc)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                selectedLocation === loc
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {loc}
            </button>
          ))}
        </div>
      )}

      {grouped.size === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          No matching warehouse locations found.
          {warehouseTires.length === 0 && (
            <>
              {" "}
              <Link to="/tires/receive" className="text-primary hover:underline">
                Receive tires from production
              </Link>{" "}
              or{" "}
              <Link to="/tires/place" className="text-primary hover:underline">
                place available stock
              </Link>{" "}
              to populate locations.
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from(grouped.entries()).map(([location, bySize]) => {
            const locationTotal = Array.from(bySize.values()).reduce(
              (sum, arr) => sum + arr.length,
              0,
            );
            return (
              <div
                key={location}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="rounded-xl bg-primary/10 p-2 text-primary shrink-0">
                      <MapPin className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-foreground leading-tight truncate">
                        {location}
                      </h3>
                      <p className="text-xs text-muted-foreground">{STAGE_LABELS.warehouse}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary shrink-0">
                    {locationTotal}
                  </span>
                </div>

                <div className="space-y-3">
                  {Array.from(bySize.entries())
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([size, tiresForSize]) => {
                      const model = tiresForSize[0]?.model ?? "—";
                      return (
                        <div key={size} className="rounded-xl border border-border bg-muted/30 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{size}</p>
                              <p className="text-xs text-muted-foreground truncate">{model}</p>
                            </div>
                            <span className="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success shrink-0">
                              {tiresForSize.length} in stock
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {tiresForSize.map((t) => (
                              <Link
                                key={t.id}
                                to={`/tires/${t.id}`}
                                className="inline-flex items-center rounded-full bg-card border border-border px-2 py-0.5 text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
                              >
                                {t.serialNumber}
                              </Link>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-4">
      <div className="rounded-xl bg-primary/10 p-3 text-primary">
        <Icon className="size-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
