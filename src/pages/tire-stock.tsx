import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Loader2, PackageSearch, Search, Warehouse as WarehouseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import SelectMenu from "@/components/select-menu";
import { binForLocation, type WarehouseDef } from "@/data/warehouse-bins";
import { fetchTires } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { Tire } from "@/types/tire";

// Everything after the area code (prefix+col+row) in a bin string is the
// stand+floor suffix, e.g. "X3" -> stand X, floor 3. Stock ignores both when
// matching, but the floor half is still worth showing in the results table.
function floorFromBinSuffix(suffix: string): string | null {
  const match = /^[A-Z]+(\d+)$/.exec(suffix);
  return match ? match[1] : null;
}

// Informational only (see requirement #16) — the floor a tire sits on
// within the searched area code, read back out of its bin string.
function floorForTire(
  warehouse: WarehouseDef | null,
  location: { col: string; row: string },
  tire: Tire,
): string | null {
  if (!warehouse) return null;
  const bin = binForLocation(warehouse, tire.location);
  const areaCode = `${warehouse.prefix}${location.col}-${String(location.row).padStart(2, "0")}`;
  const suffix = bin && bin.length > areaCode.length ? bin.slice(areaCode.length + 1) : "";
  return suffix ? floorFromBinSuffix(suffix) : null;
}

// One row per Serial No. — Quantity is the actual count of matching tyre
// records for that serial, not a stored/hardcoded value. Floor is carried
// along for display only; it is never part of the grouping key, so tyres of
// the same serial on different floors still collapse into one row (their
// floors are shown together rather than silently dropped).
interface StockGroup {
  serialNumber: string;
  brand: string;
  model: string;
  floor: string;
  quantity: number;
}

function groupResultsBySerial(
  results: Tire[],
  warehouse: WarehouseDef | null,
  location: { col: string; row: string },
): StockGroup[] {
  const groups = new Map<string, { brand: string; model: string; floors: Set<string>; quantity: number }>();
  for (const t of results) {
    const floor = floorForTire(warehouse, location, t) ?? "—";
    const existing = groups.get(t.serialNumber);
    if (existing) {
      existing.quantity += 1;
      existing.floors.add(floor);
    } else {
      groups.set(t.serialNumber, { brand: t.brand || "—", model: t.model, floors: new Set([floor]), quantity: 1 });
    }
  }
  return Array.from(groups.entries()).map(([serialNumber, g]) => ({
    serialNumber,
    brand: g.brand,
    model: g.model,
    floor: Array.from(g.floors).join(", "),
    quantity: g.quantity,
  }));
}

export default function TireStock() {
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);

  const [warehouseKey, setWarehouseKey] = useState("");
  // Mirrors the Inward storage-location card: the "Select Row" field is
  // actually the column, and "Select Position" is the row within that
  // column. Same real per-warehouse layout data, no separate concept here.
  const [col, setCol] = useState("");
  const [row, setRow] = useState("");

  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Tire[] | null>(null);
  const [searchedLocation, setSearchedLocation] = useState<{ warehouse: string; col: string; row: string } | null>(null);

  useEffect(() => {
    fetchWarehouses()
      .then((rows) => {
        setWarehouses(rows);
        setLoadingWarehouses(false);
      })
      .catch(() => setLoadingWarehouses(false));
  }, []);

  const selectedWarehouse = warehouses.find((w) => w.key === warehouseKey) || null;

  const columnOptions = useMemo(
    () => (selectedWarehouse ? selectedWarehouse.columnRowCounts.map((_, i) => i + 1) : []),
    [selectedWarehouse],
  );

  const rowOptions = useMemo(() => {
    if (!selectedWarehouse || !col) return [];
    const max = selectedWarehouse.columnRowCounts[Number(col) - 1] ?? 0;
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [selectedWarehouse, col]);

  // Same raw matches the search already found (Warehouse + Row + Position,
  // untouched) — only grouped by Serial No. for display, one row per serial.
  const groupedResults = useMemo(
    () => (results && searchedLocation ? groupResultsBySerial(results, selectedWarehouse, searchedLocation) : []),
    [results, searchedLocation, selectedWarehouse],
  );

  const clearResults = () => {
    setResults(null);
    setSearchedLocation(null);
    setError(null);
  };

  const selectWarehouse = (key: string) => {
    setWarehouseKey(key);
    setCol("");
    setRow("");
    clearResults();
  };

  const selectCol = (value: string) => {
    setCol(value);
    setRow("");
    clearResults();
  };

  const selectRow = (value: string) => {
    setRow(value);
    clearResults();
  };

  const handleSearch = async () => {
    if (searching) return;

    if (!selectedWarehouse) {
      setError("Please select a warehouse.");
      return;
    }
    if (!col || !row) {
      setError("Please select Row and Position.");
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const areaCode = `${selectedWarehouse.prefix}${String(col).padStart(2, "0")}-${String(row).padStart(2, "0")}`;
      const allTires = await fetchTires();
      const matches = allTires.filter((t) => {
        if (t.currentStage !== "warehouse") return false;
        const bin = binForLocation(selectedWarehouse, t.location);
        return !!bin && (bin === areaCode || bin.startsWith(`${areaCode}-`));
      });
      setResults(matches);
      setSearchedLocation({
        warehouse: selectedWarehouse.label,
        col: String(col).padStart(2, "0"),
        row: String(row),
      });
    } catch {
      setError("Something went wrong while searching stock. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <PackageSearch className="size-6 text-primary" />
            Stock
          </h1>
        </div>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors shrink-0"
        >
          Back
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
          <WarehouseIcon className="size-4 text-muted-foreground" />
          2. Warehouse
        </h2>
        {loadingWarehouses ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading warehouses…
          </p>
        ) : warehouses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No warehouses set up yet — add one on the{" "}
            <Link to="/warehouses" className="underline">
              Warehouses
            </Link>{" "}
            page.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {warehouses.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => selectWarehouse(w.key)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  warehouseKey === w.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">3. Select storage location</h2>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="block flex-1 space-y-1.5">
            <span className="text-sm font-medium text-foreground">Select Row</span>
            <SelectMenu
              value={col}
              placeholder="Select row"
              options={columnOptions.map((c) => ({ value: String(c), label: String(c).padStart(2, "0") }))}
              onChange={selectCol}
              disabled={!selectedWarehouse}
            />
          </label>

          <label className="block flex-1 space-y-1.5">
            <span className="text-sm font-medium text-foreground">Select Position</span>
            <SelectMenu
              value={row}
              placeholder="Select position"
              options={rowOptions.map((r) => ({ value: String(r), label: String(r) }))}
              onChange={selectRow}
              disabled={!selectedWarehouse || !col}
            />
          </label>

          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 whitespace-nowrap"
          >
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {error && (
          <p className="text-xs text-danger flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {searching && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Searching stock…
        </div>
      )}

      {!searching && searchedLocation && results && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h2 className="text-base font-medium text-foreground">4. Tyres in this location</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <p>
              <span className="text-foreground font-medium">Warehouse:</span> {searchedLocation.warehouse}
            </p>
            <p>
              <span className="text-foreground font-medium">Row:</span> {searchedLocation.col}
            </p>
            <p>
              <span className="text-foreground font-medium">Position:</span> {searchedLocation.row}
            </p>
          </div>

          {results.length === 0 ? (
            <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">No tyres found</p>
              <p>
                There are currently no tyres stored at {searchedLocation.warehouse} → Row {searchedLocation.col} → Position{" "}
                {searchedLocation.row}.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: stacked cards */}
              <div className="sm:hidden space-y-2">
                {groupedResults.map((g) => (
                  <div key={g.serialNumber} className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-foreground">{g.serialNumber}</span>
                      {g.brand !== "—" && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {g.brand}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground">{g.model}</p>
                    <p className="text-xs text-muted-foreground">
                      Floor {g.floor} · Quantity {g.quantity}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop / tablet: table */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Serial No.</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Brand</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Model</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Floor</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {groupedResults.map((g) => (
                      <tr key={g.serialNumber} className="hover:bg-muted/50 transition-colors">
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{g.serialNumber}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{g.brand}</td>
                        <td className="px-3 py-2 text-foreground whitespace-nowrap">{g.model}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{g.floor}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{g.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
