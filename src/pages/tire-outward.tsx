import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpFromLine, MapPin, QrCode, Warehouse as WarehouseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import StandFloorRemovePicker, { type Occupant } from "@/components/stand-floor-remove-picker";
import SuccessOverlay from "@/components/success-overlay";
import WarehouseQrScanner from "@/components/warehouse-qr-scanner";
import {
  binForLocation,
  floorCountAt,
  locationForBin,
  occupiedBins,
  PICKED_LOCATION,
  standCountAt,
  type WarehouseDef,
} from "@/data/warehouse-bins";
import { insertTireHistory } from "@/lib/tire-history";
import { fetchTires, upsertTires } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { StageHistory, Tire } from "@/types/tire";

interface TireGroup {
  key: string;
  model: string;
  material?: string;
  brand?: string;
  plyRatingBottom?: string;
}

export default function TireOutward() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);

  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [warehouseKey, setWarehouseKey] = useState("");
  // How many tires to pick from each location, keyed by location string.
  // A location can be partially picked (fewer than everything sitting
  // there) — capped per-location at how many tires actually sit there.
  const [pickedCounts, setPickedCounts] = useState<Record<string, number>>({});
  const [pickerAreaCode, setPickerAreaCode] = useState<string | null>(null);
  const [scanningWarehouse, setScanningWarehouse] = useState(false);

  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTires().then(setTires);
    fetchWarehouses().then((rows) => {
      setWarehouses(rows);
      setWarehouseKey((prev) => prev || rows[0]?.key || "");
    });
  }, []);

  // Only tires actually sitting in a bin right now (not already picked/dispatched).
  const candidates = useMemo(
    () => tires.filter((t) => t.currentStage === "warehouse" && warehouses.some((w) => binForLocation(w, t.location))),
    [tires, warehouses],
  );

  const groups = useMemo(() => {
    const map = new Map<string, TireGroup>();
    for (const t of candidates) {
      if (map.has(t.model)) continue;
      map.set(t.model, { key: t.model, model: t.model, material: t.serialNumber, brand: t.brand, plyRatingBottom: t.plyRatingBottom });
    }
    return Array.from(map.values()).sort((a, b) => a.model.localeCompare(b.model));
  }, [candidates]);

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  // How much of the selected model(s) sits in each warehouse — helps pick the right one.
  const warehouseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of warehouses) counts[w.key] = 0;
    if (selectedModels.size === 0) return counts;
    for (const t of candidates) {
      if (!selectedModels.has(t.model)) continue;
      const w = warehouses.find((w) => binForLocation(w, t.location));
      if (w) counts[w.key] = (counts[w.key] || 0) + 1;
    }
    return counts;
  }, [candidates, selectedModels, warehouses]);

  const selectedWarehouse = warehouses.find((w) => w.key === warehouseKey) || null;
  const occupied = useMemo(
    () => (selectedWarehouse ? occupiedBins(selectedWarehouse, tires) : new Set<string>()),
    [selectedWarehouse, tires],
  );
  const maxRows = selectedWarehouse ? Math.max(...selectedWarehouse.columnRowCounts) : 0;

  // Every occupied bin across every warehouse, with its exact location text
  // and the models sitting there. This is fully independent of the
  // warehouse/bin-map above — an operator who already knows the location can
  // pick it directly here without ever choosing a warehouse or opening the map.
  const occupiedLocations = useMemo(() => {
    const list: { location: string; warehouseLabel: string; code: string; models: string[]; count: number }[] = [];
    for (const w of warehouses) {
      const occ = occupiedBins(w, tires);
      for (const code of occ) {
        const location = locationForBin(w, code);
        const atBin = tires.filter((t) => t.currentStage === "warehouse" && t.location === location);
        if (atBin.length === 0) continue;
        list.push({ location, warehouseLabel: w.label, code, models: Array.from(new Set(atBin.map((t) => t.model))), count: atBin.length });
      }
    }
    return list.sort((a, b) => a.location.localeCompare(b.location));
  }, [warehouses, tires]);

  // Only the occupied locations that actually hold a selected tire type —
  // this card only makes sense once a type is chosen in step 1.
  const pickableLocations = useMemo(
    () => occupiedLocations.filter((loc) => loc.models.some((m) => selectedModels.has(m))),
    [occupiedLocations, selectedModels],
  );

  // Total tires physically sitting at each location — the ceiling a
  // location's pick quantity can never exceed.
  const locationTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const loc of occupiedLocations) map.set(loc.location, loc.count);
    return map;
  }, [occupiedLocations]);

  const pickedQtyAt = (location: string) => pickedCounts[location] ?? 0;

  const setLocationQty = (location: string, qty: number) => {
    const max = locationTotals.get(location) ?? 0;
    const clamped = Math.max(0, Math.min(qty, max));
    setPickedCounts((prev) => {
      if (clamped === 0) {
        if (!(location in prev)) return prev;
        const next = { ...prev };
        delete next[location];
        return next;
      }
      return { ...prev, [location]: clamped };
    });
  };

  // Used by the 3D bin-map picker — a tap there is all-or-nothing (matches
  // its existing behavior), unlike the quantity stepper on the flat list.
  const toggleLocation = (location: string) => {
    setLocationQty(location, pickedQtyAt(location) > 0 ? 0 : (locationTotals.get(location) ?? 0));
  };

  // Whether an area (any of its occupied slots, including a legacy bare-area
  // tire) holds a selected model.
  const areaMatchesSelection = (areaCode: string) => {
    if (!selectedWarehouse || selectedModels.size === 0) return false;
    for (const code of occupied) {
      if (code !== areaCode && !code.startsWith(`${areaCode}-`)) continue;
      const location = locationForBin(selectedWarehouse, code);
      // A bin can hold any number of tires of different models, so every
      // tire at this location has to be checked — not just the first found.
      const atBin = tires.filter((t) => t.currentStage === "warehouse" && t.location === location);
      if (atBin.some((t) => selectedModels.has(t.model))) return true;
    }
    return false;
  };

  const areaHasPick = (areaCode: string) =>
    Object.keys(pickedCounts).some((location) => {
      if (!selectedWarehouse || pickedQtyAt(location) <= 0) return false;
      const code = binForLocation(selectedWarehouse, location);
      return code === areaCode || code?.startsWith(`${areaCode}-`);
    });

  // Which tire (if any) sits at each stand+floor slot in the currently open area.
  const occupantsForArea = (areaCode: string): Record<string, Occupant | undefined> => {
    if (!selectedWarehouse) return {};
    const result: Record<string, Occupant | undefined> = {};
    for (const code of occupied) {
      if (!code.startsWith(`${areaCode}-`)) continue;
      const shortCode = code.slice(areaCode.length + 1);
      const location = locationForBin(selectedWarehouse, code);
      const atBin = tires.filter((t) => t.currentStage === "warehouse" && t.location === location);
      const tire = atBin[0];
      if (tire)
        result[shortCode] = {
          tireId: tire.id,
          model: tire.model,
          serialNumber: tire.serialNumber,
          code,
          count: atBin.length,
          models: atBin.map((t) => t.model),
        };
    }
    return result;
  };

  // The tire sitting directly at the bare area code, if any — pre-existing
  // stock placed before stand/floor tracking existed.
  const legacyOccupantForArea = (areaCode: string): Occupant | undefined => {
    if (!selectedWarehouse || !occupied.has(areaCode)) return undefined;
    const location = locationForBin(selectedWarehouse, areaCode);
    const atBin = tires.filter((t) => t.currentStage === "warehouse" && t.location === location);
    const tire = atBin[0];
    return tire
      ? { tireId: tire.id, model: tire.model, serialNumber: tire.serialNumber, code: areaCode, count: atBin.length, models: atBin.map((t) => t.model) }
      : undefined;
  };

  const pickerSelectedCodes = new Set(
    selectedWarehouse
      ? Object.keys(pickedCounts)
          .filter((location) => pickedQtyAt(location) > 0)
          .map((location) => binForLocation(selectedWarehouse, location))
          .filter((code): code is string => code !== null)
      : [],
  );

  const togglePickerBin = (code: string) => {
    if (!selectedWarehouse) return;
    toggleLocation(locationForBin(selectedWarehouse, code));
  };

  // A location can be partially picked, so this takes exactly `qty` tire
  // records from each picked location — not every tire sitting there.
  const selectedTires = useMemo(() => {
    const result: Tire[] = [];
    for (const [location, qty] of Object.entries(pickedCounts)) {
      if (qty <= 0) continue;
      const atLocation = tires.filter((t) => t.currentStage === "warehouse" && t.location === location);
      result.push(...atLocation.slice(0, qty));
    }
    return result;
  }, [pickedCounts, tires]);

  const handleConfirm = async () => {
    if (submitting || selectedTires.length === 0) return;
    setSubmitting(true);
    setSuccess(null);

    const now = new Date().toISOString();
    const updatedTires = selectedTires.map((t) => ({ ...t, location: PICKED_LOCATION, updatedAt: now }));

    const { error } = await upsertTires(updatedTires);
    if (error) {
      setSubmitting(false);
      return;
    }

    const newHistory: StageHistory[] = selectedTires.map((t, idx) => ({
      id: `h-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: t.id,
      stage: "warehouse",
      location: PICKED_LOCATION,
      movedAt: now,
      movedBy: "Forklift operator",
      notes: `Outward: ${t.model} picked from ${t.location}`,
    }));

    await insertTireHistory(newHistory);

    setTires((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      for (const t of updatedTires) byId.set(t.id, t);
      return Array.from(byId.values());
    });
    setPickedCounts({});
    setSuccess(`${selectedTires.length} tire${selectedTires.length === 1 ? "" : "s"} picked, ready for dispatch.`);
    setSubmitting(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ArrowUpFromLine className="size-6 text-primary" />
            Outward
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
        {groups.length === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">No tires currently in the warehouse.</div>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {groups.map((g) => {
              const isSelected = selectedModels.has(g.model);
              return (
                <li
                  key={g.key}
                  onClick={() => toggleModel(g.model)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors cursor-pointer",
                    isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="size-5 rounded border-border text-primary focus:ring-ring pointer-events-none"
                  />
                  <div>
                    <p className="font-medium text-foreground">{g.model}</p>
                    <p className="text-xs text-muted-foreground">{[g.material, g.brand, g.plyRatingBottom].filter(Boolean).join(" · ")}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
            <MapPin className="size-4 text-muted-foreground" />
            2. Pick locations to remove
          </h2>
          {pickableLocations.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setPickedCounts((prev) => {
                  const allFull = pickableLocations.every((l) => (prev[l.location] ?? 0) >= l.count);
                  if (allFull) return {};
                  const next: Record<string, number> = {};
                  for (const l of pickableLocations) next[l.location] = l.count;
                  return next;
                })
              }
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              {pickableLocations.every((l) => (pickedCounts[l.location] ?? 0) >= l.count) ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
        {selectedModels.size === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">Select a tire type above to see its locations.</div>
        ) : pickableLocations.length === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">No locations found for the selected tire type.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
            {pickableLocations.map((loc) => {
              const qty = pickedQtyAt(loc.location);
              const isPicked = qty > 0;
              return (
                <div
                  key={loc.location}
                  title={loc.location}
                  className={cn(
                    "rounded-xl border-2 px-3 py-2 text-xs transition-colors",
                    isPicked ? "border-success bg-success/10" : "border-border bg-muted/40",
                  )}
                >
                  <p className="font-semibold text-foreground truncate">
                    {warehouses.length > 1 ? `${loc.warehouseLabel} · ${loc.code}` : loc.code}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => setLocationQty(loc.location, qty - 1)}
                      disabled={qty <= 0}
                      aria-label={`Pick one fewer tire from ${loc.code}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-card text-sm font-bold text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      −
                    </button>
                    <span className="font-medium text-foreground">
                      {qty}/{loc.count}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLocationQty(loc.location, qty + 1)}
                      disabled={qty >= loc.count}
                      aria-label={`Pick one more tire from ${loc.code}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-card text-sm font-bold text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
            <WarehouseIcon className="size-4 text-muted-foreground" />
            3. Warehouse
          </h2>
          {warehouses.length > 0 && (
            <button
              type="button"
              onClick={() => setScanningWarehouse(true)}
              aria-label="Scan warehouse QR"
              title="Scan warehouse QR"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card p-2 text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <QrCode className="size-4" />
            </button>
          )}
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
                setPickedCounts({});
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
        <h2 className="text-base font-medium text-foreground">Warehouse bin map</h2>
        {!selectedWarehouse ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">Choose a warehouse first.</div>
        ) : selectedModels.size === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">Select a tire type above to see its locations.</div>
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
                        <td className="sticky left-0 z-10 bg-card px-1 py-1 text-center text-muted-foreground">{row}</td>
                        {selectedWarehouse.columnRowCounts.map((maxRow, colIdx) => {
                          if (row > maxRow) return <td key={colIdx} />;
                          const col = colIdx + 1;
                          const code = `${selectedWarehouse.prefix}${String(col).padStart(2, "0")}-${String(row).padStart(2, "0")}`;
                          const isMatch = areaMatchesSelection(code);
                          const hasPick = areaHasPick(code);
                          const isRelevant = isMatch || hasPick;
                          return (
                            <td key={colIdx} className="p-0.5">
                              <button
                                type="button"
                                disabled={!isRelevant}
                                onClick={() => setPickerAreaCode(code)}
                                title={isRelevant ? code : `${code} — empty`}
                                className={cn(
                                  "flex h-8 w-12 items-center justify-center rounded text-[9px] font-bold leading-none text-white transition-colors",
                                  !isRelevant && "bg-muted text-muted-foreground/40 cursor-not-allowed",
                                  isRelevant && !hasPick && "bg-info/70 hover:bg-info",
                                  hasPick && "bg-success ring-2 ring-success ring-offset-1 hover:bg-success",
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
        {submitting ? "Confirming…" : "OK - Confirm outward"}
      </button>

      <SuccessOverlay message={success} onDone={() => setSuccess(null)} />

      {pickerAreaCode && selectedWarehouse && (
        <StandFloorRemovePicker
          areaCode={pickerAreaCode}
          standCount={standCountAt(selectedWarehouse, Number(pickerAreaCode.slice(selectedWarehouse.prefix.length).split("-")[0]))}
          floorCount={floorCountAt(selectedWarehouse, Number(pickerAreaCode.slice(selectedWarehouse.prefix.length).split("-")[0]))}
          occupants={occupantsForArea(pickerAreaCode)}
          legacyOccupant={legacyOccupantForArea(pickerAreaCode)}
          selectedCodes={pickerSelectedCodes}
          selectedModels={selectedModels}
          onToggle={togglePickerBin}
          onDone={() => setPickerAreaCode(null)}
        />
      )}

      {scanningWarehouse && (
        <WarehouseQrScanner
          warehouses={warehouses}
          onMatch={(key) => {
            setWarehouseKey(key);
            setPickedCounts({});
            setScanningWarehouse(false);
          }}
          onClose={() => setScanningWarehouse(false)}
        />
      )}
    </div>
  );
}
