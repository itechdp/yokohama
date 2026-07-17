import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpFromLine, Check, Warehouse as WarehouseIcon } from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import QtyStepper from "@/components/qty-stepper";
import { binForLocation, PICKED_LOCATION, WAREHOUSES } from "@/data/warehouse-bins";
import type { StageHistory, Tire } from "@/types/tire";

interface TireGroup {
  key: string;
  model: string;
  material?: string;
  brand?: string;
  plyRatingBottom?: string;
  tireIds: string[];
}

export default function TireOutward() {
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

  // Only tires actually sitting in a bin right now (not already picked/dispatched).
  const candidates = useMemo(
    () =>
      tires.filter(
        (t) => t.currentStage === "warehouse" && WAREHOUSES.some((w) => binForLocation(w, t.location)),
      ),
    [tires],
  );

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
  const selectedModels = useMemo(() => new Set(selectedGroups.map((g) => g.model)), [selectedGroups]);
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

  // How much of the searched/selected tires sits in each warehouse — helps pick the right one.
  const warehouseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of WAREHOUSES) counts[w.key] = 0;
    if (selectedModels.size === 0) return counts;
    for (const t of candidates) {
      if (!selectedModels.has(t.model)) continue;
      const w = WAREHOUSES.find((w) => binForLocation(w, t.location));
      if (w) counts[w.key] = (counts[w.key] || 0) + 1;
    }
    return counts;
  }, [candidates, selectedModels]);

  const selectedWarehouse = WAREHOUSES.find((w) => w.key === warehouseKey) || null;
  const maxRows = selectedWarehouse ? Math.max(...selectedWarehouse.columnRowCounts) : 0;

  // bin code -> count of the selected tire types sitting there right now.
  const binMatches = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedWarehouse || selectedModels.size === 0) return map;
    for (const t of candidates) {
      if (!selectedModels.has(t.model)) continue;
      const bin = binForLocation(selectedWarehouse, t.location);
      if (!bin) continue;
      map.set(bin, (map.get(bin) || 0) + 1);
    }
    return map;
  }, [candidates, selectedWarehouse, selectedModels]);

  const toggleBin = (code: string) => {
    if (!binMatches.has(code)) return;
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
    for (const g of selectedGroups) {
      const qty = selectedQty[g.key] || 0;
      if (qty < 1) {
        setError(`Set a quantity for ${g.model}.`);
        return;
      }
      if (qty > g.tireIds.length) {
        setError(`Only ${g.tireIds.length} available for ${g.model}.`);
        return;
      }
    }
    if (!selectedWarehouse) {
      setError("Select a warehouse.");
      return;
    }
    if (selectedBins.size === 0) {
      setError("Select at least one bin to pick from.");
      return;
    }

    const remaining: Record<string, number> = {};
    for (const g of selectedGroups) remaining[g.key] = selectedQty[g.key] || 0;

    const withdrawals: { tireId: string; bin: string; model: string }[] = [];
    for (const bin of Array.from(selectedBins).sort()) {
      const tiresInBin = candidates.filter((t) => binForLocation(selectedWarehouse, t.location) === bin);
      for (const t of tiresInBin) {
        const group = selectedGroups.find((g) => g.model === t.model);
        if (!group) continue;
        if ((remaining[group.key] || 0) > 0) {
          withdrawals.push({ tireId: t.id, bin, model: t.model });
          remaining[group.key]--;
        }
      }
    }

    const shortGroups = selectedGroups.filter((g) => (remaining[g.key] || 0) > 0);
    if (shortGroups.length > 0) {
      setError(`Not enough stock in the selected bin(s) for ${shortGroups.map((g) => g.model).join(", ")}. Select more bins.`);
      return;
    }

    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const historyList: StageHistory[] = db.tireHistory || [];
    const now = new Date().toISOString();

    const withdrawnIds = new Set(withdrawals.map((w) => w.tireId));
    const updatedTires = tiresList.map((t) =>
      withdrawnIds.has(t.id) ? { ...t, location: PICKED_LOCATION, updatedAt: now } : t,
    );

    const newHistory: StageHistory[] = withdrawals.map((w, idx) => ({
      id: `h-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: w.tireId,
      stage: "warehouse",
      location: PICKED_LOCATION,
      movedAt: now,
      movedBy: "Forklift operator",
      notes: `Outward: ${w.model} picked from ${selectedWarehouse.label} - Bin ${w.bin}`,
    }));

    writeDb({ ...db, tires: updatedTires, tireHistory: [...historyList, ...newHistory] });

    setTires(updatedTires);
    setSelectedQty({});
    setSelectedBins(new Set());
    setSuccess(
      `${withdrawals.length} tire${withdrawals.length === 1 ? "" : "s"} across ${selectedGroups.length} type${selectedGroups.length === 1 ? "" : "s"} picked from ${selectedWarehouse.label}, ready for dispatch.`,
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ArrowUpFromLine className="size-6 text-primary" />
            Outward - Warehouse
          </h1>
          <p className="text-muted-foreground">Tap to find a tire, pick quantities and bins to pull from.</p>
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
            No tires currently in the warehouse.
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
                    <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger shrink-0">
                      {g.tireIds.length} in stock
                    </span>
                  </div>
                  {isSelected && (
                    <div className="mt-3 pl-8" onClick={(e) => e.stopPropagation()}>
                      <QtyStepper value={selectedQty[g.key]} onChange={(v) => setQty(g.key, v)} max={g.tireIds.length} />
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
                "relative rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                warehouseKey === w.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              {w.label}
              {selectedModels.size > 0 && warehouseCounts[w.key] > 0 && (
                <span
                  className={cn(
                    "ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    warehouseKey === w.key ? "bg-primary-foreground/20" : "bg-danger/10 text-danger",
                  )}
                >
                  {warehouseCounts[w.key]} here
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">3. Pick bins</h2>
        {!selectedWarehouse ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Choose a warehouse first.
          </div>
        ) : selectedModels.size === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Select a tire above — matching bins will light up red.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded bg-info/70 inline-block" /> Not this tire
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded bg-danger/70 inline-block" /> Here — qty shown
                </span>
              </div>
              <span>Tap red bins to pick from</span>
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
                          const matchCount = binMatches.get(code) || 0;
                          const hasMatch = matchCount > 0;
                          const isSelected = selectedBins.has(code);
                          return (
                            <td key={colIdx} className="p-0.5">
                              <button
                                type="button"
                                disabled={!hasMatch}
                                onClick={() => toggleBin(code)}
                                title={hasMatch ? `${code} — ${matchCount} here` : `${code} — not this tire`}
                                className={cn(
                                  "flex h-8 w-12 items-center justify-center rounded text-[9px] font-medium leading-none text-white/90 transition-colors",
                                  hasMatch ? "bg-danger/70 hover:bg-danger" : "bg-info/70 cursor-not-allowed",
                                  isSelected && "ring-2 ring-primary ring-offset-1",
                                )}
                              >
                                {hasMatch ? matchCount : `${String(col).padStart(2, "0")}-${String(row).padStart(2, "0")}`}
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
        OK - Confirm outward
      </button>

      <p className="text-xs text-muted-foreground">
        Picked tires stay in inventory but are freed from their bin — use{" "}
        <Link to="/tires/dispatch" className="underline">
          Dispatch tires
        </Link>{" "}
        next to assign a driver and destination.
      </p>
    </div>
  );
}
