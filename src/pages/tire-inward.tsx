import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowDownToLine, ArrowLeftRight, Search, Warehouse as WarehouseIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ExchangeLocationModal from "@/components/exchange-location-modal";
import QtyStepper from "@/components/qty-stepper";
import StandFloorPicker from "@/components/stand-floor-picker-svg";
import SuccessOverlay from "@/components/success-overlay";
import { binCounts, FLOOR_COUNT, firstEmptyBin, locationForBin, STAND_IDS, standCountAt, type WarehouseDef } from "@/data/warehouse-bins";
import { insertPlacementLogs } from "@/lib/placement-logs";
import { buildTireFromCatalogRow } from "@/lib/tire-catalog";
import { insertTireHistory } from "@/lib/tire-history";
import { fetchTireSkusPage, searchTireSkus } from "@/lib/tire-skus";
import { fetchTires, upsertTires } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { TireSkuRow } from "@/lib/supabase";
import type { PlacementLog, StageHistory, Tire } from "@/types/tire";

interface SelectedTire {
  key: string;
  material: string;
  model: string;
  brand?: string;
  plyRatingBottom?: string;
  qty: number;
}

export default function TireInward() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);

  const [selectedTires, setSelectedTires] = useState<SelectedTire[]>([]);
  const [warehouseKey, setWarehouseKey] = useState("");
  const [selectedBins, setSelectedBins] = useState<Set<string>>(new Set());
  const [manualRow, setManualRow] = useState("");
  const [manualCol, setManualCol] = useState("");
  const [manualStand, setManualStand] = useState("");
  const [manualFloor, setManualFloor] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [pickerAreaCode, setPickerAreaCode] = useState<string | null>(null);

  useEffect(() => {
    fetchTires().then(setTires);
    fetchWarehouses().then((rows) => {
      setWarehouses(rows);
      setWarehouseKey((prev) => prev || rows[0]?.key || "");
    });
  }, []);

  const addTireFromCatalog = (sku: TireSkuRow) => {
    setSelectedTires((prev) => {
      if (prev.some((t) => t.material === sku.material)) return prev;
      return [
        ...prev,
        {
          key: sku.material,
          material: sku.material,
          model: sku.description,
          brand: sku.brand ?? undefined,
          plyRatingBottom: sku.ply_rating_bottom ?? undefined,
          qty: 1,
        },
      ];
    });
  };

  const removeSelectedTire = (key: string) => {
    setSelectedTires((prev) => prev.filter((t) => t.key !== key));
  };

  const setQty = (key: string, value: number) => {
    setSelectedTires((prev) => prev.map((t) => (t.key === key ? { ...t, qty: value } : t)));
  };

  const totalQty = selectedTires.reduce((sum, t) => sum + t.qty, 0);

  const selectedWarehouse = warehouses.find((w) => w.key === warehouseKey) || null;
  const counts = useMemo(
    () => (selectedWarehouse ? binCounts(selectedWarehouse, tires) : new Map<string, number>()),
    [selectedWarehouse, tires],
  );
  const maxRows = selectedWarehouse ? Math.max(...selectedWarehouse.columnRowCounts) : 0;

  const columnOptions = useMemo(
    () => (selectedWarehouse ? selectedWarehouse.columnRowCounts.map((_, i) => i + 1) : []),
    [selectedWarehouse],
  );

  const rowOptions = useMemo(() => {
    if (!selectedWarehouse) return [];
    if (manualCol) {
      const max = selectedWarehouse.columnRowCounts[Number(manualCol) - 1] ?? 0;
      return Array.from({ length: max }, (_, i) => i + 1);
    }
    return Array.from({ length: maxRows }, (_, i) => i + 1);
  }, [selectedWarehouse, manualCol, maxRows]);

  // How many stands the chosen column has — 1 means Stand is auto-picked as
  // X with no dropdown shown, 2 means the operator picks X or Y.
  const manualStandCount = selectedWarehouse && manualCol ? standCountAt(selectedWarehouse, Number(manualCol)) : 1;
  const standOptions = STAND_IDS.slice(0, manualStandCount);
  const floorOptions = useMemo(() => Array.from({ length: FLOOR_COUNT }, (_, i) => i + 1), []);

  const toggleBin = (code: string) => {
    setSelectedBins((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const addManualLocation = () => {
    if (!selectedWarehouse || !manualRow || !manualCol || !manualFloor) return;
    const stand = manualStandCount > 1 ? manualStand : "X";
    if (!stand) return;
    const areaCode = `${selectedWarehouse.prefix}${String(Number(manualCol)).padStart(2, "0")}-${String(Number(manualRow)).padStart(2, "0")}`;
    const code = `${areaCode}-${stand}${manualFloor}`;
    if (selectedBins.has(code)) {
      setManualError("Location already selected");
      return;
    }
    setSelectedBins((prev) => new Set(prev).add(code));
    setManualRow("");
    setManualCol("");
    setManualStand("");
    setManualFloor("");
    setManualError(null);
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSuccess(null);
    if (selectedTires.length === 0 || !selectedWarehouse) {
      setSubmitting(false);
      return;
    }

    // No bin tapped — just use the next empty one so this never blocks.
    const binsArray =
      selectedBins.size > 0 ? Array.from(selectedBins).sort() : [firstEmptyBin(selectedWarehouse, counts)].filter(Boolean) as string[];
    if (binsArray.length === 0) {
      setSubmitting(false);
      return;
    }

    const now = new Date().toISOString();
    const assignments: { tireId: string; bin: string; model: string }[] = [];
    const extraTires: Tire[] = [];
    let i = 0;
    for (const t of selectedTires) {
      // Consume any matching production-stage units already on record first,
      // then synthesize the rest fresh from the tire catalog (Supabase).
      const existingIds = tires
        .filter((existing) => existing.currentStage === "production" && existing.serialNumber === t.material)
        .slice(0, t.qty)
        .map((existing) => existing.id);

      for (const tireId of existingIds) {
        assignments.push({ tireId, bin: binsArray[i % binsArray.length], model: t.model });
        i++;
      }

      const shortfall = t.qty - existingIds.length;
      for (let k = 0; k < shortfall; k++) {
        const id = `t-${Date.now()}-${t.key}-${k}-${Math.random().toString(36).slice(2, 7)}`;
        const tire = buildTireFromCatalogRow(
          {
            material: t.material,
            description: t.model,
            plyRatingBottom: t.plyRatingBottom || "",
            brand: t.brand || "",
          },
          id,
          now,
        );
        extraTires.push(tire);
        assignments.push({ tireId: id, bin: binsArray[i % binsArray.length], model: t.model });
        i++;
      }
    }

    const binByTireId = new Map(assignments.map((a) => [a.tireId, a.bin]));
    const changedExisting = tires
      .filter((t) => binByTireId.has(t.id))
      .map((t) => ({
        ...t,
        currentStage: "warehouse" as const,
        location: locationForBin(selectedWarehouse, binByTireId.get(t.id)!),
        updatedAt: now,
      }));
    const newTireRows = extraTires.map((t) => ({
      ...t,
      currentStage: "warehouse" as const,
      location: locationForBin(selectedWarehouse, binByTireId.get(t.id)!),
      updatedAt: now,
    }));
    const tiresToSave = [...changedExisting, ...newTireRows];

    const { error } = await upsertTires(tiresToSave);
    if (error) {
      setSuccess(null);
      setSubmitting(false);
      return;
    }

    const newHistory: StageHistory[] = assignments.map((a, idx) => ({
      id: `h-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: a.tireId,
      stage: "warehouse",
      location: locationForBin(selectedWarehouse, a.bin),
      movedAt: now,
      movedBy: "Forklift operator",
      notes: `Inward: ${a.model} moved to ${locationForBin(selectedWarehouse, a.bin)}`,
    }));

    const newLogs: PlacementLog[] = assignments.map((a, idx) => ({
      id: `p-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: a.tireId,
      location: locationForBin(selectedWarehouse, a.bin),
      placedAt: now,
      placedBy: "Forklift operator",
      notes: `Inward: ${a.model} moved to ${locationForBin(selectedWarehouse, a.bin)}`,
    }));

    await insertTireHistory(newHistory);
    await insertPlacementLogs(newLogs);

    setTires((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      for (const t of tiresToSave) byId.set(t.id, t);
      return Array.from(byId.values());
    });
    setSelectedTires([]);
    setSelectedBins(new Set());
    setSuccess(
      `${assignments.length} tire${assignments.length === 1 ? "" : "s"} across ${selectedTires.length} type${selectedTires.length === 1 ? "" : "s"} placed across ${binsArray.length} bin${binsArray.length === 1 ? "" : "s"} in ${selectedWarehouse.label}.`,
    );
    setSubmitting(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ArrowDownToLine className="size-6 text-primary" />
            Inward
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
        <h2 className="text-base font-medium text-foreground">1. Select tires</h2>

        <TireCatalogSearch alreadySelected={selectedTires.map((t) => t.material)} onSelect={addTireFromCatalog} />

        {selectedTires.length > 0 && (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {selectedTires.map((t) => (
              <li key={t.key} className="rounded-xl border border-border bg-card px-4 py-3 text-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{t.model}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[t.material, t.brand, t.plyRatingBottom].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSelectedTire(t.key)}
                    className="shrink-0 text-muted-foreground hover:text-danger"
                    aria-label={`Remove ${t.model}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <QtyStepper value={t.qty} onChange={(v) => setQty(t.key, v)} />
              </li>
            ))}
          </ul>
        )}

        {selectedTires.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {totalQty} tire{totalQty === 1 ? "" : "s"} selected across {selectedTires.length} type
            {selectedTires.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
            <WarehouseIcon className="size-4 text-muted-foreground" />
            2. Warehouse
          </h2>
          <button
            type="button"
            onClick={() => setExchangeOpen(true)}
            aria-label="Exchange location"
            title="Exchange location"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card p-2 text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeftRight className="size-4" />
          </button>
        </div>
        {warehouses.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No warehouses set up yet — add one on the{" "}
            <Link to="/warehouses" className="underline">
              Warehouses
            </Link>{" "}
            page.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {warehouses.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => {
                setWarehouseKey(w.key);
                setSelectedBins(new Set());
                setManualRow("");
                setManualCol("");
                setManualStand("");
                setManualFloor("");
                setManualError(null);
              }}
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
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">3. Select storage location</h2>
        {!selectedWarehouse ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Choose a warehouse first.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {/* ROW FIRST */}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">
                  Select Row
                </span>

                <select
                  value={manualCol}
                  onChange={(e) => {
                    const col = e.target.value;

                    setManualCol(col);
                    setManualStand("");
                    setManualError(null);

                    // Validate selected row against the selected column
                    if (col && manualRow) {
                      const max =
                        selectedWarehouse.columnRowCounts[Number(col) - 1] ?? 0;

                      if (Number(manualRow) > max) {
                        setManualRow("");
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select row</option>

                  {columnOptions.map((c) => (
                    <option key={c} value={c}>
                      {String(c).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </label>

              {/* POSITION SECOND */}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">
                  Select Position
                </span>

                <select
                  value={manualRow}
                  onChange={(e) => {
                    setManualRow(e.target.value);
                    setManualError(null);
                  }}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select position</option>

                  {rowOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              {/* STAND — only shown when this column has a second stand; otherwise auto-picked as X */}
              {manualStandCount > 1 && (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Select Stand</span>

                  <select
                    value={manualStand}
                    onChange={(e) => {
                      setManualStand(e.target.value);
                      setManualError(null);
                    }}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select stand</option>

                    {standOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* FLOOR — always required */}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">Select Floor</span>

                <select
                  value={manualFloor}
                  onChange={(e) => {
                    setManualFloor(e.target.value);
                    setManualError(null);
                  }}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select floor</option>

                  {floorOptions.map((f) => (
                    <option key={f} value={f}>
                      Floor {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {manualError && (
              <p className="text-xs text-danger">
                {manualError}
              </p>
            )}

            <button
              type="button"
              onClick={addManualLocation}
              disabled={!manualCol || !manualRow || !manualFloor || (manualStandCount > 1 && !manualStand)}
              className="w-full sm:w-auto rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add Location
            </button>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Selected locations</p>
              {selectedBins.size === 0 ? (
                <p className="text-xs text-muted-foreground">No locations selected yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Array.from(selectedBins)
                    .sort()
                    .map((code) => (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success"
                      >
                        {code}
                        <button
                          type="button"
                          onClick={() => toggleBin(code)}
                          aria-label={`Remove ${code}`}
                          className="text-success hover:text-danger"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">4. Storage bins</h2>
        {!selectedWarehouse ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Choose a warehouse first.
          </div>
        ) : (
          <>
            <div className="overflow-auto max-h-96 rounded-xl border border-border">
              <table className="border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr>
                    <th className="sticky left-0 z-20 w-8 bg-card" />
                    {selectedWarehouse.columnRowCounts.map((_, colIdx) => (
                      <th key={colIdx} className="px-1 py-1 text-center font-medium text-muted-foreground">
                        {String(colIdx + 1).padStart(2, "0")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxRows }, (_, rowIdx) => {
                    const row = rowIdx + 1;
                    return (
                      <tr key={row}>
                        <td className="sticky left-0 z-10 bg-card px-1 py-1 text-center text-muted-foreground">
                          {row}
                        </td>
                        {selectedWarehouse.columnRowCounts.map((maxRow, colIdx) => {
                          if (row > maxRow) return <td key={colIdx} />;
                          const col = colIdx + 1;
                          const code = `${selectedWarehouse.prefix}${String(col).padStart(2, "0")}-${String(row).padStart(2, "0")}`;
                          const hasPick = Array.from(selectedBins).some((b) => b.startsWith(`${code}-`));
                          return (
                            <td key={colIdx} className="p-0.5">
                              <button
                                type="button"
                                onClick={() => setPickerAreaCode(code)}
                                title={code}
                                className={cn(
                                  "flex h-8 w-12 items-center justify-center rounded text-[9px] font-bold leading-none text-white transition-colors",
                                  !hasPick && "bg-info/70 hover:bg-info",
                                  hasPick && "bg-success ring-2 ring-success ring-offset-1",
                                )}
                              >
                                {String(col).padStart(2, "0")}-{String(row).padStart(2, "0")}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </>
        )}
      </div>

      <button
        onClick={handleConfirm}
        disabled={selectedTires.length === 0 || submitting}
        className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Confirming…" : "OK - Confirm inward"}
      </button>

      <SuccessOverlay message={success} onDone={() => setSuccess(null)} />

      <ExchangeLocationModal
        open={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        warehouses={warehouses}
        tires={tires}
        onTiresUpdated={(updated) => {
          setTires((prev) => {
            const byId = new Map(prev.map((t) => [t.id, t]));
            for (const t of updated) byId.set(t.id, t);
            return Array.from(byId.values());
          });
          setSuccess(`${updated.length} tire${updated.length === 1 ? "" : "s"} exchanged location.`);
        }}
      />

      {pickerAreaCode && selectedWarehouse && (
        <StandFloorPicker
          areaCode={pickerAreaCode}
          standCount={standCountAt(selectedWarehouse, Number(pickerAreaCode.slice(selectedWarehouse.prefix.length).split("-")[0]))}
          slotCounts={Object.fromEntries(
            Array.from(counts.entries())
              .filter(([bin]) => bin.startsWith(`${pickerAreaCode}-`))
              .map(([bin, n]) => [bin.slice(pickerAreaCode.length + 1), n]),
          )}
          selectedCode={Array.from(selectedBins).find((b) => b.startsWith(`${pickerAreaCode}-`)) ?? null}
          onSelect={(code) => {
            toggleBin(code);
            setPickerAreaCode(null);
          }}
          onClose={() => setPickerAreaCode(null)}
        />
      )}
    </div>
  );
}

function TireCatalogSearch({
  alreadySelected,
  onSelect,
}: {
  alreadySelected: string[];
  onSelect: (sku: TireSkuRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TireSkuRow[]>([]);
  const requestId = useRef(0);

  // Always shows something: the first page of the catalog when there's no
  // query, filtered results once the operator types. No focus/blur dance —
  // the list is a normal part of the page, not a dropdown you have to summon.
  useEffect(() => {
    const q = query.trim();
    const id = ++requestId.current;
    const timeout = setTimeout(() => {
      const request = q ? searchTireSkus(q, 20) : fetchTireSkusPage({ page: 0, pageSize: 20 }).then((p) => p.rows);
      request.then((rows) => {
        if (requestId.current === id) setResults(rows);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tire catalog by material or description"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border">
        {results.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">No matches.</li>
        ) : (
          results.map((sku) => {
            const isSelected = alreadySelected.includes(sku.material);
            return (
              <li key={sku.id}>
                <button
                  type="button"
                  disabled={isSelected}
                  onClick={() => onSelect(sku)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm transition-colors",
                    isSelected ? "cursor-not-allowed opacity-40" : "hover:bg-muted",
                  )}
                >
                  <div className="font-medium text-foreground">{sku.material}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {sku.description}
                    {isSelected ? " — already added" : ""}
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
