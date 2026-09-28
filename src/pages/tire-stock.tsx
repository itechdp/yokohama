import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Check, Download, Loader2, PackageSearch, Plus, Search, Trash2, Warehouse as WarehouseIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/confirm-dialog";
import ExportMenu from "@/components/export-menu";
import QtyStepper from "@/components/qty-stepper";
import SelectMenu from "@/components/select-menu";
import RequiredMark from "@/components/required-mark";
import TireCatalogSearch from "@/components/tire-catalog-search";
import { binForLocation, locationForBin, type WarehouseDef } from "@/data/warehouse-bins";
import {
  exportStockToExcel,
  exportStockToPDF,
  GLOBAL_STOCK_EXPORT_COLUMNS,
  LOCATION_STOCK_EXPORT_COLUMNS,
  sanitizeForFilename,
  type StockExportRow,
} from "@/lib/stock-export";
import { addToStock, removeFromStock } from "@/lib/stock-adjust";
import type { TireSkuRow } from "@/lib/supabase";
import { fetchTires } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { Tire } from "@/types/tire";

// Same area-code shape the search filter matches against — shared here so
// "which rows/positions have stock" and "does this tire match the search"
// can never disagree.
function buildAreaCode(warehouse: WarehouseDef, col: number, row: number): string {
  return `${warehouse.prefix}${String(col).padStart(2, "0")}-${String(row).padStart(2, "0")}`;
}

// Fresh Warehouse+Row+Position matches — shared by the Search button and the
// location Export button so both can never disagree about what's "at this
// location" (see requirement: search and export must use the same data).
async function fetchTiresAtLocation(warehouse: WarehouseDef, col: string, row: string): Promise<Tire[]> {
  const areaCode = buildAreaCode(warehouse, Number(col), Number(row));
  const allTires = await fetchTires();
  return allTires.filter((t) => {
    if (t.currentStage !== "warehouse") return false;
    const bin = binForLocation(warehouse, t.location);
    return !!bin && (bin === areaCode || bin.startsWith(`${areaCode}-`));
  });
}

// The area code (prefix+col-row) a bin sits in. A bin is the area code
// itself ("Z01-01"); older bins also carry a stand/floor suffix
// ("Z01-01-X3"), which is ignored here.
function areaCodeOfBin(warehouse: WarehouseDef, bin: string): string | null {
  const [colStr, rowStr] = bin.slice(warehouse.prefix.length).split("-");
  return colStr && rowStr ? `${warehouse.prefix}${colStr}-${rowStr}` : null;
}

// How many warehouse-stage tires each area code (col+row) in this warehouse
// holds — shown next to each Row/Position dropdown entry.
function stockByAreaCode(warehouse: WarehouseDef, tires: Tire[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tires) {
    if (t.currentStage !== "warehouse") continue;
    const bin = binForLocation(warehouse, t.location);
    if (!bin) continue;
    const areaCode = areaCodeOfBin(warehouse, bin);
    if (areaCode) counts.set(areaCode, (counts.get(areaCode) ?? 0) + 1);
  }
  return counts;
}

const tyresLabel = (n: number) => `${n} tyre${n === 1 ? "" : "s"}`;

// One row per Serial No. — Quantity is the actual count of matching tyre
// records for that serial, not a stored/hardcoded value.
interface StockGroup {
  serialNumber: string;
  brand: string;
  model: string;
  quantity: number;
}

// A tire type being added to the searched location.
interface AddDraft {
  material: string;
  description: string;
  brand?: string;
  plyRatingBottom?: string;
}

function groupResultsBySerial(results: Tire[]): StockGroup[] {
  const groups = new Map<string, { brand: string; model: string; quantity: number }>();
  for (const t of results) {
    const existing = groups.get(t.serialNumber);
    if (existing) {
      existing.quantity += 1;
    } else {
      groups.set(t.serialNumber, { brand: t.brand || "—", model: t.model, quantity: 1 });
    }
  }
  return Array.from(groups.entries()).map(([serialNumber, g]) => ({
    serialNumber,
    brand: g.brand,
    model: g.model,
    quantity: g.quantity,
  }));
}

// Warehouse + Row + Position + Serial No. is the grouping key here (unlike
// groupResultsBySerial above, which only needs Serial No. because it's
// already scoped to one location) — the global export spans every location,
// so the same serial sitting in two different bins must stay two rows.
function buildGlobalExportRows(tires: Tire[], warehouses: WarehouseDef[]): StockExportRow[] {
  const groups = new Map<
    string,
    { serialNumber: string; brand: string; model: string; warehouse: string; row: string; position: string; quantity: number }
  >();
  for (const t of tires) {
    if (t.currentStage !== "warehouse") continue;
    for (const warehouse of warehouses) {
      const bin = binForLocation(warehouse, t.location);
      if (!bin) continue;
      const [colStr, rowStr] = bin.slice(warehouse.prefix.length).split("-"); // "<col2>-<row2>"
      if (!colStr || !rowStr) continue;
      const uiRow = colStr;
      const uiPosition = String(Number(rowStr));
      const key = `${warehouse.label}|${uiRow}|${uiPosition}|${t.serialNumber}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += 1;
      } else {
        groups.set(key, {
          serialNumber: t.serialNumber,
          brand: t.brand || "—",
          model: t.model,
          warehouse: warehouse.label,
          row: uiRow,
          position: uiPosition,
          quantity: 1,
        });
      }
      break;
    }
  }
  return Array.from(groups.values()).map((g) => ({
    serialNumber: g.serialNumber,
    brand: g.brand,
    model: g.model,
    warehouse: g.warehouse,
    row: g.row,
    position: g.position,
    quantity: g.quantity,
  }));
}

export default function TireStock() {
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  // Loaded once and reused to compute which Row/Position dropdown entries
  // actually have stock — Search still fetches its own fresh copy below, so
  // this only powers dropdown filtering and never the search results.
  const [tires, setTires] = useState<Tire[]>([]);
  const [loadingTires, setLoadingTires] = useState(true);

  const [warehouseKey, setWarehouseKey] = useState("");
  // Mirrors the Inward storage-location card: the "Select Row" field is
  // actually the column, and "Select Position" is the row within that
  // column. Same real per-warehouse layout data, no separate concept here.
  const [col, setCol] = useState("");
  const [row, setRow] = useState("");

  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Tire[] | null>(null);
  const [searchedLocation, setSearchedLocation] = useState<{
    warehouse: string;
    warehouseKey: string;
    col: string;
    row: string;
  } | null>(null);

  // Stock corrections on the searched location (edit qty / remove / add).
  const [draftQty, setDraftQty] = useState<Record<string, number>>({});
  const [busySerial, setBusySerial] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StockGroup | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<AddDraft | null>(null);
  const [addQty, setAddQty] = useState(1);
  // The add panel opens at the top of the list — bring it into view whichever
  // "Add tire" button (header or bottom of the list) opened it.
  const addPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (addOpen) addPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [addOpen]);

  useEffect(() => {
    fetchWarehouses()
      .then((rows) => {
        setWarehouses(rows);
        setLoadingWarehouses(false);
      })
      .catch(() => setLoadingWarehouses(false));
    fetchTires()
      .then((rows) => {
        setTires(rows);
        setLoadingTires(false);
      })
      .catch(() => setLoadingTires(false));
  }, []);

  const selectedWarehouse = warehouses.find((w) => w.key === warehouseKey) || null;

  // Every Row/Position the warehouse layout defines — empty ones too, so a
  // missing tire can be added anywhere — each labelled with what it holds.
  const areaCounts = useMemo(
    () => (selectedWarehouse ? stockByAreaCode(selectedWarehouse, tires) : new Map<string, number>()),
    [selectedWarehouse, tires],
  );

  const columnOptions = useMemo(() => {
    if (!selectedWarehouse) return [];
    return selectedWarehouse.columnRowCounts.map((maxRow, colIndex) => {
      const colNum = colIndex + 1;
      let total = 0;
      for (let rowNum = 1; rowNum <= maxRow; rowNum++) total += areaCounts.get(buildAreaCode(selectedWarehouse, colNum, rowNum)) ?? 0;
      const label = String(colNum).padStart(2, "0");
      return { value: String(colNum), label: total > 0 ? `${label} · ${tyresLabel(total)}` : label };
    });
  }, [selectedWarehouse, areaCounts]);

  const rowOptions = useMemo(() => {
    if (!selectedWarehouse || !col) return [];
    const max = selectedWarehouse.columnRowCounts[Number(col) - 1] ?? 0;
    return Array.from({ length: max }, (_, i) => {
      const n = areaCounts.get(buildAreaCode(selectedWarehouse, Number(col), i + 1)) ?? 0;
      return { value: String(i + 1), label: n > 0 ? `${i + 1} · ${tyresLabel(n)}` : String(i + 1) };
    });
  }, [selectedWarehouse, col, areaCounts]);

  // Same raw matches the search already found (Warehouse + Row + Position,
  // untouched) — only grouped by Serial No. for display, one row per serial.
  const groupedResults = useMemo(
    () => (results && searchedLocation ? groupResultsBySerial(results) : []),
    [results, searchedLocation],
  );

  const resetAdjustments = () => {
    setDraftQty({});
    setAdjustError(null);
    setAddOpen(false);
    setAddDraft(null);
    setAddQty(1);
  };

  const clearResults = () => {
    setResults(null);
    setSearchedLocation(null);
    setError(null);
    resetAdjustments();
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
      const matches = await fetchTiresAtLocation(selectedWarehouse, col, row);
      setResults(matches);
      resetAdjustments();
      setSearchedLocation({
        warehouse: selectedWarehouse.label,
        warehouseKey: selectedWarehouse.key,
        col: String(col).padStart(2, "0"),
        row: String(row),
      });
    } catch {
      setError("Something went wrong while searching stock. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const searchedWarehouse = searchedLocation ? warehouses.find((w) => w.key === searchedLocation.warehouseKey) ?? null : null;

  // Re-reads the searched location (and the dropdown counts) after a change.
  const refreshLocation = async () => {
    if (!searchedWarehouse || !searchedLocation) return;
    const [matches, all] = await Promise.all([
      fetchTiresAtLocation(searchedWarehouse, searchedLocation.col, searchedLocation.row),
      fetchTires(),
    ]);
    setResults(matches);
    setTires(all);
  };

  // Sets how many of one tire sit at the searched location: fewer removes the
  // newest units, more adds new ones. Re-reads stock first so it works from
  // what's there now, not what was on screen.
  const applyQty = async (group: StockGroup, target: number) => {
    if (!searchedWarehouse || !searchedLocation || busySerial) return;
    setBusySerial(group.serialNumber);
    setAdjustError(null);
    const fresh = await fetchTiresAtLocation(searchedWarehouse, searchedLocation.col, searchedLocation.row);
    const units = fresh
      .filter((t) => t.serialNumber === group.serialNumber)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    let result: { error: string | null } = { error: null };
    if (target < units.length) {
      result = await removeFromStock(units.slice(0, units.length - target));
    } else if (target > units.length) {
      const sample = units[0];
      const areaCode = buildAreaCode(searchedWarehouse, Number(searchedLocation.col), Number(searchedLocation.row));
      result = await addToStock(
        {
          material: group.serialNumber,
          description: sample?.model ?? group.model,
          brand: sample?.brand,
          plyRatingBottom: sample?.plyRatingBottom,
        },
        locationForBin(searchedWarehouse, areaCode),
        target - units.length,
      );
    }
    if (result.error) setAdjustError(result.error);
    setDraftQty((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== group.serialNumber)));
    await refreshLocation();
    setBusySerial(null);
  };

  const handleAdd = async () => {
    if (!addDraft || !searchedWarehouse || !searchedLocation || busySerial) return;
    setBusySerial(addDraft.material);
    setAdjustError(null);
    const areaCode = buildAreaCode(searchedWarehouse, Number(searchedLocation.col), Number(searchedLocation.row));
    const { error: addError } = await addToStock(addDraft, locationForBin(searchedWarehouse, areaCode), addQty);
    if (addError) {
      setAdjustError(addError);
    } else {
      setAddOpen(false);
      setAddDraft(null);
      setAddQty(1);
    }
    await refreshLocation();
    setBusySerial(null);
  };

  const [globalExportOpen, setGlobalExportOpen] = useState(false);
  const [globalExportBusy, setGlobalExportBusy] = useState(false);
  const [globalExportError, setGlobalExportError] = useState<string | null>(null);

  const [locationExportOpen, setLocationExportOpen] = useState(false);
  const [locationExportBusy, setLocationExportBusy] = useState(false);
  const [locationExportError, setLocationExportError] = useState<string | null>(null);

  const handleGlobalExport = async (format: "pdf" | "excel") => {
    if (globalExportBusy) return;
    setGlobalExportBusy(true);
    setGlobalExportError(null);
    try {
      const allTires = await fetchTires();
      const rows = buildGlobalExportRows(allTires, warehouses);
      if (rows.length === 0) {
        setGlobalExportError("No stock data available to export.");
        return;
      }
      if (format === "pdf") {
        exportStockToPDF(rows, GLOBAL_STOCK_EXPORT_COLUMNS, { title: "Stock Report", filename: "stock-report.pdf" });
      } else {
        exportStockToExcel(rows, GLOBAL_STOCK_EXPORT_COLUMNS, "stock-report.xlsx");
      }
      setGlobalExportOpen(false);
    } catch {
      setGlobalExportError("Something went wrong while exporting. Please try again.");
    } finally {
      setGlobalExportBusy(false);
    }
  };

  const handleLocationExport = async (format: "pdf" | "excel") => {
    if (locationExportBusy || !selectedWarehouse || !col || !row) return;
    setLocationExportBusy(true);
    setLocationExportError(null);
    try {
      const paddedCol = String(col).padStart(2, "0");
      const matches = await fetchTiresAtLocation(selectedWarehouse, col, row);
      const grouped = groupResultsBySerial(matches);
      if (grouped.length === 0) {
        setLocationExportError("No tyres available at this location.");
        return;
      }
      const rows: StockExportRow[] = grouped.map((g) => ({
        serialNumber: g.serialNumber,
        brand: g.brand,
        model: g.model,
        warehouse: selectedWarehouse.label,
        row: paddedCol,
        position: String(row),
        quantity: g.quantity,
      }));
      const filenameBase = `stock-${sanitizeForFilename(selectedWarehouse.label)}-row-${paddedCol}-position-${row}`;
      if (format === "pdf") {
        exportStockToPDF(rows, LOCATION_STOCK_EXPORT_COLUMNS, {
          title: "Tyres in Storage Location",
          subtitleLines: [`Warehouse: ${selectedWarehouse.label}`, `Row: ${paddedCol}`, `Position: ${row}`],
          filename: `${filenameBase}.pdf`,
        });
      } else {
        exportStockToExcel(rows, LOCATION_STOCK_EXPORT_COLUMNS, `${filenameBase}.xlsx`);
      }
      setLocationExportOpen(false);
    } catch {
      setLocationExportError("Something went wrong while exporting. Please try again.");
    } finally {
      setLocationExportBusy(false);
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setGlobalExportError(null);
              setGlobalExportOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Download className="size-4" />
            Export
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Back
          </Link>
        </div>
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

          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex gap-3 sm:contents">
                <label className="block flex-1 min-w-0 space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Select Row<RequiredMark /></span>
                  <SelectMenu
                    value={col}
                    placeholder="Select row"
                    options={columnOptions}
                    onChange={selectCol}
                    disabled={!selectedWarehouse || loadingTires}
                  />
                </label>

                <label className="block flex-1 min-w-0 space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Select Position<RequiredMark /></span>
                  <SelectMenu
                    value={row}
                    placeholder="Select position"
                    options={rowOptions}
                    onChange={selectRow}
                    disabled={!selectedWarehouse || !col || loadingTires}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleSearch}
                disabled={searching || loadingTires}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 whitespace-nowrap sm:w-auto"
              >
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {searching ? "Searching…" : "Search"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setLocationExportError(null);
                  setLocationExportOpen(true);
                }}
                disabled={!selectedWarehouse || !col || !row}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 whitespace-nowrap sm:w-auto"
              >
                <Download className="size-4" />
                Export
              </button>
            </div>

            {error && (
              <p className="text-xs text-danger flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0" />
                {error}
              </p>
            )}
          </>
      </div>

      {searching && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Searching stock…
        </div>
      )}

      {!searching && searchedLocation && results && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-medium text-foreground">4. Tyres in this location</h2>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={addOpen || busySerial !== null}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="size-4" />
              Add tire
            </button>
          </div>
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

          {addOpen && (
            <div ref={addPanelRef} className="scroll-mt-4 rounded-xl border border-dashed border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  Add tire to this location
                  <RequiredMark />
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setAddDraft(null);
                    setAddQty(1);
                  }}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label="Cancel adding a tire"
                >
                  <X className="size-4" />
                </button>
              </div>
              {addDraft ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{addDraft.description}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[addDraft.material, addDraft.brand, addDraft.plyRatingBottom].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddDraft(null)}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      Change
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <QtyStepper value={addQty} min={1} onChange={setAddQty} />
                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={busySerial !== null}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {busySerial === addDraft.material ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      Add {addQty}
                    </button>
                  </div>
                </div>
              ) : (
                <TireCatalogSearch
                  alreadySelected={[]}
                  onSelect={(sku: TireSkuRow) =>
                    setAddDraft({
                      material: sku.material,
                      description: sku.description,
                      brand: sku.brand ?? undefined,
                      plyRatingBottom: sku.ply_rating_bottom ?? undefined,
                    })
                  }
                />
              )}
            </div>
          )}

          {adjustError && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger flex items-center gap-1.5">
              <AlertTriangle className="size-4 shrink-0" />
              {adjustError}
            </p>
          )}

          {results.length === 0 ? (
            <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">No tyres found</p>
              <p>
                There are currently no tyres stored at {searchedLocation.warehouse} → Row {searchedLocation.col} → Position{" "}
                {searchedLocation.row}.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {groupedResults.map((g) => {
                const draft = draftQty[g.serialNumber] ?? g.quantity;
                const changed = draft !== g.quantity;
                const busy = busySerial === g.serialNumber;
                return (
                  <li key={g.serialNumber} className="px-3 py-2.5 space-y-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{g.model}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {g.serialNumber} · {g.brand}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <QtyStepper
                        value={draft}
                        min={1}
                        onChange={(v) => setDraftQty((prev) => ({ ...prev, [g.serialNumber]: v }))}
                      />
                      {changed && (
                        <>
                          <button
                            type="button"
                            onClick={() => applyQty(g, draft)}
                            disabled={busySerial !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftQty((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== g.serialNumber)))
                            }
                            disabled={busySerial !== null}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
                            aria-label={`Undo quantity change for ${g.model}`}
                          >
                            <X className="size-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(g)}
                        disabled={busySerial !== null}
                        className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                        aria-label={`Remove ${g.model} from this location`}
                        title="Remove from this location"
                      >
                        {busy && !changed ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!addOpen && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={busySerial !== null}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <Plus className="size-4" />
              Add tire to this location
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove from this location?"
        message={
          removeTarget && searchedLocation
            ? `All ${removeTarget.quantity} of ${removeTarget.model} will be taken out of stock at ${searchedLocation.warehouse} → Row ${searchedLocation.col} → Position ${searchedLocation.row}.`
            : ""
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          const target = removeTarget;
          setRemoveTarget(null);
          if (target) void applyQty(target, 0);
        }}
        onCancel={() => setRemoveTarget(null)}
      />

      <ExportMenu
        open={globalExportOpen}
        title="Export Stock"
        busy={globalExportBusy}
        error={globalExportError}
        onExportPDF={() => handleGlobalExport("pdf")}
        onExportExcel={() => handleGlobalExport("excel")}
        onClose={() => setGlobalExportOpen(false)}
      />

      <ExportMenu
        open={locationExportOpen}
        title="Export Location"
        infoLines={
          selectedWarehouse && col && row
            ? [`Warehouse: ${selectedWarehouse.label}`, `Row: ${String(col).padStart(2, "0")}`, `Position: ${row}`]
            : []
        }
        busy={locationExportBusy}
        error={locationExportError}
        onExportPDF={() => handleLocationExport("pdf")}
        onExportExcel={() => handleLocationExport("excel")}
        onClose={() => setLocationExportOpen(false)}
      />
    </div>
  );
}
