import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeftRight, Warehouse as WarehouseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import SuccessOverlay from "@/components/success-overlay";
import { locationForBin, occupiedBins, type WarehouseDef } from "@/data/warehouse-bins";
import { insertPlacementLogs } from "@/lib/placement-logs";
import { insertTireHistory } from "@/lib/tire-history";
import { fetchTires, upsertTires } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { PlacementLog, StageHistory, Tire } from "@/types/tire";

interface LocationPick {
  warehouseKey: string;
  bin: string | null;
}

const emptyPick = (): LocationPick => ({ warehouseKey: "", bin: null });

// Swaps whatever tire(s) sit in Location A with whatever sits in Location B —
// a true exchange, not a one-way move. Either side can be empty (that's just
// a move), but not both. Logged like Inward, once per tire per direction.
export default function TireExchange() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);

  const [pickA, setPickA] = useState<LocationPick>(emptyPick());
  const [pickB, setPickB] = useState<LocationPick>(emptyPick());

  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTires().then(setTires);
    fetchWarehouses().then((rows) => {
      setWarehouses(rows);
      setPickA((p) => (p.warehouseKey ? p : { ...p, warehouseKey: rows[0]?.key || "" }));
      setPickB((p) => (p.warehouseKey ? p : { ...p, warehouseKey: rows[0]?.key || "" }));
    });
  }, []);

  const warehouseA = warehouses.find((w) => w.key === pickA.warehouseKey) || null;
  const warehouseB = warehouses.find((w) => w.key === pickB.warehouseKey) || null;

  const locationA = warehouseA && pickA.bin ? locationForBin(warehouseA, pickA.bin) : null;
  const locationB = warehouseB && pickB.bin ? locationForBin(warehouseB, pickB.bin) : null;

  const tiresA = useMemo(
    () => (locationA ? tires.filter((t) => t.currentStage === "warehouse" && t.location === locationA) : []),
    [tires, locationA],
  );
  const tiresB = useMemo(
    () => (locationB ? tires.filter((t) => t.currentStage === "warehouse" && t.location === locationB) : []),
    [tires, locationB],
  );

  // Both locations are always occupied by construction — the picker only
  // ever lists bins that already have tires in them.
  const sameLocation = locationA !== null && locationA === locationB;
  const canSwap = !!locationA && !!locationB && !sameLocation;

  const handleSwap = async () => {
    if (submitting || !canSwap || !locationA || !locationB) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const now = new Date().toISOString();
    const movedFromA = tiresA.map((t) => ({ ...t, location: locationB, updatedAt: now }));
    const movedFromB = tiresB.map((t) => ({ ...t, location: locationA, updatedAt: now }));
    const updatedTires = [...movedFromA, ...movedFromB];

    const { error: saveError } = await upsertTires(updatedTires);
    if (saveError) {
      setError(saveError);
      setSubmitting(false);
      return;
    }

    const historyFor = (tire: Tire, from: string, to: string, idx: number): StageHistory => ({
      id: `h-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: tire.id,
      stage: "warehouse",
      location: to,
      movedAt: now,
      movedBy: "Warehouse operator",
      notes: `Exchange: ${tire.model} swapped from ${from} to ${to}`,
    });
    const logFor = (tire: Tire, from: string, to: string, idx: number): PlacementLog => ({
      id: `p-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: tire.id,
      location: to,
      placedAt: now,
      placedBy: "Warehouse operator",
      notes: `Exchange: ${tire.model} swapped from ${from} to ${to}`,
    });

    const newHistory = [
      ...tiresA.map((t, i) => historyFor(t, locationA, locationB, i)),
      ...tiresB.map((t, i) => historyFor(t, locationB, locationA, tiresA.length + i)),
    ];
    const newLogs = [
      ...tiresA.map((t, i) => logFor(t, locationA, locationB, i)),
      ...tiresB.map((t, i) => logFor(t, locationB, locationA, tiresA.length + i)),
    ];

    await insertTireHistory(newHistory);
    await insertPlacementLogs(newLogs);

    setTires((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      for (const t of updatedTires) byId.set(t.id, t);
      return Array.from(byId.values());
    });
    setPickA(emptyPick());
    setPickB(emptyPick());
    setSuccess(
      tiresB.length === 0
        ? `Moved ${tiresA.length} tire${tiresA.length === 1 ? "" : "s"} from ${locationA} to ${locationB}.`
        : `Swapped ${tiresA.length} tire${tiresA.length === 1 ? "" : "s"} and ${tiresB.length} tire${tiresB.length === 1 ? "" : "s"} between ${locationA} and ${locationB}.`,
    );
    setSubmitting(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="size-6 text-primary" />
            Exchange Location
          </h1>
        </div>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors shrink-0"
        >
          Back
        </Link>
      </div>

      {warehouses.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm text-sm text-muted-foreground">
          No warehouses set up yet — add one on the{" "}
          <Link to="/warehouses" className="underline">
            Warehouses
          </Link>{" "}
          page.
        </div>
      )}

      <LocationPickerCard
        step="1. Location A"
        label="A"
        warehouses={warehouses}
        pick={pickA}
        onPick={setPickA}
        occupants={tiresA}
        allTires={tires}
      />

      <div className="flex justify-center">
        <div className="rounded-full border border-border bg-card p-2 text-muted-foreground">
          <ArrowLeftRight className="size-4" />
        </div>
      </div>

      <LocationPickerCard
        step="2. Location B"
        label="B"
        warehouses={warehouses}
        pick={pickB}
        onPick={setPickB}
        occupants={tiresB}
        allTires={tires}
      />

      {sameLocation && locationA && (
        <p className="text-xs text-danger text-center">Location A and B are the same bin.</p>
      )}
      {error && <p className="text-xs text-danger text-center">{error}</p>}

      <button
        onClick={handleSwap}
        disabled={!canSwap || submitting}
        className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Swapping…" : "OK - Confirm swap"}
      </button>

      <SuccessOverlay message={success} onDone={() => setSuccess(null)} />
    </div>
  );
}

function LocationPickerCard({
  step,
  label,
  warehouses,
  pick,
  onPick,
  occupants,
  allTires,
}: {
  step: string;
  label: "A" | "B";
  warehouses: WarehouseDef[];
  pick: LocationPick;
  onPick: (next: LocationPick) => void;
  occupants: Tire[];
  allTires: Tire[];
}) {
  // Location A must already hold a tire (that's what's being moved).
  // Location B can be occupied (a true swap) or empty (a plain move in).
  const allowEmpty = label === "B";

  const warehouse = warehouses.find((w) => w.key === pick.warehouseKey) || null;
  const occupied = useMemo(() => (warehouse ? occupiedBins(warehouse, allTires) : new Set<string>()), [warehouse, allTires]);
  const occupiedBinCodes = useMemo(() => Array.from(occupied).sort(), [occupied]);
  const maxRows = warehouse ? Math.max(...warehouse.columnRowCounts) : 0;

  const setBin = (code: string) => onPick({ ...pick, bin: pick.bin === code ? null : code });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
        <WarehouseIcon className="size-4 text-muted-foreground" />
        {step}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {warehouses.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => onPick({ warehouseKey: w.key, bin: null })}
            className={cn(
              "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
              pick.warehouseKey === w.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {w.label}
          </button>
        ))}
      </div>

      {!warehouse ? (
        <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">Choose a warehouse first.</div>
      ) : !allowEmpty && occupiedBinCodes.length === 0 ? (
        <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
          No tires currently stored in this warehouse.
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {allowEmpty
              ? "Pick an occupied bin to swap, or an empty bin to just move the tire(s) there."
              : `Only bins with tires in them can be picked as location ${label}.`}
          </p>

          <div className="overflow-auto max-h-72 rounded-xl border border-border">
            <table className="border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th className="sticky left-0 z-20 w-8 bg-card" />
                  {warehouse.columnRowCounts.map((_, colIdx) => (
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
                      {warehouse.columnRowCounts.map((maxRow, colIdx) => {
                        if (row > maxRow) return <td key={colIdx} />;
                        const col = colIdx + 1;
                        const code = `${warehouse.prefix}${String(col).padStart(2, "0")}-${String(row).padStart(2, "0")}`;
                        const isSelected = pick.bin === code;
                        const isOccupied = occupied.has(code);
                        const isPickable = isOccupied || allowEmpty;
                        return (
                          <td key={colIdx} className="p-0.5">
                            <button
                              type="button"
                              onClick={() => isPickable && setBin(code)}
                              disabled={!isPickable}
                              title={isOccupied ? code : `${code} — empty`}
                              className={cn(
                                "flex h-8 w-12 items-center justify-center rounded text-[9px] font-bold leading-none transition-colors",
                                !isPickable && "bg-muted text-muted-foreground/40 cursor-not-allowed",
                                !isOccupied && isPickable && !isSelected && "bg-info/70 text-white hover:bg-info",
                                isOccupied && !isSelected && "bg-warning/70 text-white hover:bg-warning",
                                isSelected && "bg-success text-white ring-2 ring-success ring-offset-1",
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

          {label === "B" && pick.bin && (
            <div className="rounded-xl border border-border bg-muted p-3 space-y-1.5">
              <p className="text-sm font-medium text-foreground">{pick.bin}</p>
              {occupants.length === 0 ? (
                <p className="text-xs text-muted-foreground">Empty — the tire(s) will move here.</p>
              ) : (
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {occupants.map((t) => (
                    <li key={t.id}>
                      {t.model} · {t.serialNumber}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
