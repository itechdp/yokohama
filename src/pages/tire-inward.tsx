import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowDownToLine, Check, Warehouse as WarehouseIcon } from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import QtyStepper from "@/components/qty-stepper";
import { WAREHOUSES, locationForBin, occupiedBins } from "@/data/warehouse-bins";
import { buildTireFromCatalogRow } from "@/lib/tire-catalog";
import type { PlacementLog, StageHistory, Tire } from "@/types/tire";

interface TireGroup {
  key: string;
  model: string;
  material?: string;
  brand?: string;
  plyRatingBottom?: string;
  tireIds: string[];
}

export default function TireInward() {
  const [tires, setTires] = useState<Tire[]>([]);

  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [warehouseKey, setWarehouseKey] = useState("");
  const [selectedBins, setSelectedBins] = useState<Set<string>>(new Set());

  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
  }, []);

  const candidates = useMemo(() => tires.filter((t) => t.currentStage === "production"), [tires]);

  const groups = useMemo(() => {
    const map = new Map<string, TireGroup>();
    for (const t of candidates) {
      const key = t.model;
      const existing = map.get(key);
      if (existing) {
        existing.tireIds.push(t.id);
      } else {
        map.set(key, {
          key,
          model: t.model,
          material: t.serialNumber,
          brand: t.brand,
          plyRatingBottom: t.plyRatingBottom,
          tireIds: [t.id],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.model.localeCompare(b.model));
  }, [candidates]);

  const selectedGroups = useMemo(() => groups.filter((g) => g.key in selectedQty), [groups, selectedQty]);
  const totalQty = selectedGroups.reduce((sum, g) => sum + (selectedQty[g.key] || 0), 0);

  const toggleGroup = (key: string) => {
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (key in next) delete next[key];
      else next[key] = 1;
      return next;
    });
  };

  const setQty = (key: string, value: number) => {
    setSelectedQty((prev) => ({ ...prev, [key]: value }));
  };

  const selectedWarehouse = WAREHOUSES.find((w) => w.key === warehouseKey) || null;
  const occupied = useMemo(
    () => (selectedWarehouse ? occupiedBins(selectedWarehouse, tires) : new Set<string>()),
    [selectedWarehouse, tires],
  );
  const maxRows = selectedWarehouse ? Math.max(...selectedWarehouse.columnRowCounts) : 0;

  const toggleBin = (code: string) => {
    setSelectedBins((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleConfirm = () => {
    setError(null);
    setSuccess(null);

    if (selectedGroups.length === 0) {
      setError("Select at least one tire.");
      return;
    }
    if (!selectedWarehouse) {
      setError("Select a warehouse.");
      return;
    }
    if (selectedBins.size === 0) {
      setError("Select at least one storage bin.");
      return;
    }

    const now = new Date().toISOString();
    const binsArray = Array.from(selectedBins).sort();
    const assignments: { tireId: string; bin: string; model: string }[] = [];
    const extraTires: Tire[] = [];
    let i = 0;
    for (const g of selectedGroups) {
      const qty = selectedQty[g.key] || 0;
      const existingIds = g.tireIds.slice(0, qty);
      for (const tireId of existingIds) {
        assignments.push({ tireId, bin: binsArray[i % binsArray.length], model: g.model });
        i++;
      }

      // Requested more than what's tracked in production — create the shortfall
      // as new units of the same tire spec so any quantity can be received.
      const shortfall = qty - existingIds.length;
      for (let k = 0; k < shortfall; k++) {
        const id = `t-${Date.now()}-${g.key}-${k}-${Math.random().toString(36).slice(2, 7)}`;
        const tire = buildTireFromCatalogRow(
          {
            material: g.material || g.model,
            description: g.model,
            plyRatingBottom: g.plyRatingBottom || "",
            brand: g.brand || "",
          },
          id,
          now,
        );
        extraTires.push(tire);
        assignments.push({ tireId: id, bin: binsArray[i % binsArray.length], model: g.model });
        i++;
      }
    }

    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const historyList: StageHistory[] = db.tireHistory || [];
    const logsList: PlacementLog[] = db.placementLogs || [];

    const binByTireId = new Map(assignments.map((a) => [a.tireId, a.bin]));
    const updatedTires = [
      ...tiresList.map((t) => {
        const bin = binByTireId.get(t.id);
        if (!bin) return t;
        return { ...t, currentStage: "warehouse" as const, location: locationForBin(selectedWarehouse, bin), updatedAt: now };
      }),
      ...extraTires.map((t) => ({
        ...t,
        currentStage: "warehouse" as const,
        location: locationForBin(selectedWarehouse, binByTireId.get(t.id)!),
        updatedAt: now,
      })),
    ];

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

    writeDb({
      ...db,
      tires: updatedTires,
      tireHistory: [...historyList, ...newHistory],
      placementLogs: [...logsList, ...newLogs],
    });

    setTires(updatedTires);
    setSelectedQty({});
    setSelectedBins(new Set());
    setSuccess(
      `${assignments.length} tire${assignments.length === 1 ? "" : "s"} across ${selectedGroups.length} type${selectedGroups.length === 1 ? "" : "s"} placed across ${binsArray.length} bin${binsArray.length === 1 ? "" : "s"} in ${selectedWarehouse.label}.`,
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ArrowDownToLine className="size-6 text-primary" />
            Inward - Warehouse
          </h1>
          <p className="text-muted-foreground">Tap to select tires, quantities, and bin locations.</p>
        </div>
        <Link
          to="/tires"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors shrink-0"
        >
          Back
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">1. Select tires</h2>

        {groups.length === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            No tires waiting in production.
          </div>
        ) : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {groups.map((g) => {
              const isSelected = g.key in selectedQty;
              return (
                <li
                  key={g.key}
                  onClick={() => toggleGroup(g.key)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-sm transition-colors cursor-pointer",
                    isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="size-5 rounded border-border text-primary focus:ring-ring pointer-events-none"
                      />
                      <div>
                        <p className="font-medium text-foreground">{g.model}</p>
                        <p className="text-xs text-muted-foreground">
                          {[g.material, g.brand, g.plyRatingBottom].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary shrink-0">
                      {g.tireIds.length} available
                    </span>
                  </div>
                  {isSelected && (
                    <div className="mt-3 pl-8" onClick={(e) => e.stopPropagation()}>
                      <QtyStepper value={selectedQty[g.key]} onChange={(v) => setQty(g.key, v)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {selectedGroups.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {totalQty} tire{totalQty === 1 ? "" : "s"} selected across {selectedGroups.length} type
            {selectedGroups.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
          <WarehouseIcon className="size-4 text-muted-foreground" />
          2. Warehouse
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {WAREHOUSES.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => {
                setWarehouseKey(w.key);
                setSelectedBins(new Set());
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
        <h2 className="text-base font-medium text-foreground">3. Storage bins</h2>
        {!selectedWarehouse ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Choose a warehouse first.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded bg-info/70 inline-block" /> Empty
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded bg-danger/70 inline-block" /> Full
                </span>
              </div>
              <span>Tap to select multiple bins</span>
            </div>

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
                          const isFull = occupied.has(code);
                          const isSelected = selectedBins.has(code);
                          return (
                            <td key={colIdx} className="p-0.5">
                              <button
                                type="button"
                                disabled={isFull}
                                onClick={() => toggleBin(code)}
                                title={isFull ? `${code} — full` : code}
                                className={cn(
                                  "flex h-8 w-12 items-center justify-center rounded text-[9px] font-medium leading-none text-white/90 transition-colors",
                                  isFull ? "bg-danger/70 cursor-not-allowed" : "bg-info/70 hover:bg-info",
                                  isSelected && !isFull && "ring-2 ring-primary ring-offset-1",
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

            {selectedBins.size > 0 && (
              <p className="text-sm text-foreground">
                Selected bins:{" "}
                <span className="font-medium">{Array.from(selectedBins).sort().join(", ")}</span>
              </p>
            )}
          </>
        )}
      </div>

      {error && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {success && (
        <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success flex items-center gap-2">
          <Check className="size-4" /> {success}
        </div>
      )}

      <button
        onClick={handleConfirm}
        className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        OK - Confirm inward
      </button>
    </div>
  );
}
