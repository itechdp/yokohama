import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { MapPin, PackageMinus, QrCode, Warehouse as WarehouseIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import PlanNoPicker from "@/components/plan-no-picker";
import QrScanner from "@/components/qr-scanner";
import QtyStepper from "@/components/qty-stepper";
import SelectMenu from "@/components/select-menu";
import SuccessOverlay from "@/components/success-overlay";
import TireCatalogSearch from "@/components/tire-catalog-search";
import { locationForBin, type WarehouseDef } from "@/data/warehouse-bins";
import { fetchOngoingOutwardPlans, insertOutwards, type OngoingOutwardPlan } from "@/lib/outwards";
import { getStoredPlanNo, setStoredPlanNo } from "@/lib/plan-no-draft";
import { touchPlanNumber } from "@/lib/plan-numbers";
import { insertTireHistory } from "@/lib/tire-history";
import { fetchStockAt, fetchTireBySkuQrCode, upsertTires } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { TireSkuRow } from "@/lib/supabase";
import type { OutwardRecord, StageHistory, Tire } from "@/types/tire";

// Same page as Picking — same plan details, tire selection, pallet no and
// Row/Position flow — except confirming takes the tires out of stock: each
// entry moves that many warehouse-stage tires at its location to the
// dispatch stage, so Stock drops by exactly what went out.

// A tire type selected for this outward batch, with its own quantity.
interface SelectedTire {
  key: string;
  material: string;
  description: string;
  brand?: string;
  plyRatingBottom?: string;
  qty: number;
  palletNo: string;
}

// One outward entry queued for submission.
interface OutwardEntry {
  key: string;
  material: string;
  description: string;
  brand?: string;
  plyRatingBottom?: string;
  warehouseLabel: string;
  locationLabel: string;
  // Full tires.location this entry takes stock from — "<label> - Bin <code>".
  stockLocation: string;
  qty: number;
  palletNo: string;
}

const SHIFT_OPTIONS = [
  { value: "1", label: "Shift 1" },
  { value: "2", label: "Shift 2" },
  { value: "3", label: "Shift 3" },
];

const stockKey = (material: string, location: string) => `${material}|${location}`;

export default function TireOutward() {
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);

  // Groups every Outward confirmed today under one Plan No — same per-device
  // draft as Inward/Picking (plan-no-draft.ts), kept in its own pool.
  const [planNo, setPlanNo] = useState(() => getStoredPlanNo("outward"));
  const [pickerName, setPickerName] = useState("");
  const [shift, setShift] = useState("");
  const handlePlanNoChange = (value: string) => {
    setPlanNo(value);
    setStoredPlanNo("outward", value);
  };

  // Every plan used on Outward so far, latest first — choosing one fills in
  // the rest of Plan details from that plan's latest outward.
  const [ongoingPlans, setOngoingPlans] = useState<OngoingOutwardPlan[]>([]);
  const loadOngoingPlans = () => {
    fetchOngoingOutwardPlans().then(setOngoingPlans);
  };
  const selectOngoingPlan = (value: string) => {
    const plan = ongoingPlans.find((p) => p.planNo === value);
    if (!plan) return;
    handlePlanNoChange(plan.planNo);
    if (plan.pickerName) setPickerName(plan.pickerName);
    if (plan.shift) setShift(plan.shift);
  };

  const [selectedTires, setSelectedTires] = useState<SelectedTire[]>([]);
  const [warehouseKey, setWarehouseKey] = useState("");
  const [manualCol, setManualCol] = useState("");
  const [manualRow, setManualRow] = useState("");

  const [entries, setEntries] = useState<OutwardEntry[]>([]);
  const [scanningTire, setScanningTire] = useState(false);

  // Tires in stock per Material + location, looked up for whatever Row/
  // Position is chosen. Bumped after every confirm so counts refresh.
  const [stock, setStock] = useState<Map<string, number>>(new Map());
  const [stockLoading, setStockLoading] = useState(false);
  const [stockVersion, setStockVersion] = useState(0);

  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    fetchWarehouses().then((rows) => {
      setWarehouses(rows);
      setWarehouseKey((prev) => prev || rows[0]?.key || "");
    });
    loadOngoingPlans();
  }, []);

  const selectedWarehouse = warehouses.find((w) => w.key === warehouseKey) || null;

  const columnOptions = useMemo(
    () => (selectedWarehouse ? selectedWarehouse.columnRowCounts.map((_, i) => i + 1) : []),
    [selectedWarehouse],
  );

  const maxRows = selectedWarehouse ? Math.max(...selectedWarehouse.columnRowCounts) : 0;
  const rowOptions = useMemo(() => {
    if (!selectedWarehouse) return [];
    if (manualCol) {
      const max = selectedWarehouse.columnRowCounts[Number(manualCol) - 1] ?? 0;
      return Array.from({ length: max }, (_, i) => i + 1);
    }
    return Array.from({ length: maxRows }, (_, i) => i + 1);
  }, [selectedWarehouse, manualCol, maxRows]);

  // The chosen Row/Position as a bin code and as the full tires.location.
  const currentCode =
    selectedWarehouse && manualCol && manualRow
      ? `${selectedWarehouse.prefix}${String(Number(manualCol)).padStart(2, "0")}-${String(Number(manualRow)).padStart(2, "0")}`
      : null;
  const currentLocation = selectedWarehouse && currentCode ? locationForBin(selectedWarehouse, currentCode) : null;

  const materialsKey = selectedTires.map((t) => t.material).join(",");
  useEffect(() => {
    if (!currentLocation || !materialsKey) return;
    let cancelled = false;
    setStockLoading(true);
    Promise.all(
      materialsKey.split(",").map(async (material) => [material, (await fetchStockAt(material, currentLocation)).length] as const),
    ).then((counts) => {
      if (cancelled) return;
      setStock((prev) => {
        const next = new Map(prev);
        for (const [material, n] of counts) next.set(stockKey(material, currentLocation), n);
        return next;
      });
      setStockLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentLocation, materialsKey, stockVersion]);

  // Already queued below for this Material + location — not yet out of the
  // database, but no longer available to add again.
  const queuedAt = (material: string, location: string) =>
    entries.filter((e) => e.material === material && e.stockLocation === location).reduce((sum, e) => sum + e.qty, 0);

  const availableAt = (material: string, location: string): number | null => {
    const inStock = stock.get(stockKey(material, location));
    return inStock === undefined ? null : Math.max(0, inStock - queuedAt(material, location));
  };

  const addSelectedTire = (entry: { material: string; description: string; brand?: string; plyRatingBottom?: string }) => {
    setSelectedTires((prev) => {
      if (prev.some((t) => t.material === entry.material)) return prev;
      return [...prev, { key: entry.material, qty: 1, palletNo: "", ...entry }];
    });
  };

  const removeSelectedTire = (key: string) => {
    setSelectedTires((prev) => prev.filter((t) => t.key !== key));
  };

  const setSelectedTireQty = (key: string, value: number) => {
    setSelectedTires((prev) => prev.map((t) => (t.key === key ? { ...t, qty: value } : t)));
  };

  const setSelectedTirePalletNo = (key: string, value: string) => {
    setSelectedTires((prev) => prev.map((t) => (t.key === key ? { ...t, palletNo: value } : t)));
  };

  // Every selected tire must have enough stock left at the chosen location.
  const shortages =
    currentLocation && !stockLoading
      ? selectedTires.filter((t) => {
          const available = availableAt(t.material, currentLocation);
          return available !== null && t.qty > available;
        })
      : [];

  const canAddEntry =
    selectedTires.length > 0 &&
    selectedTires.every((t) => t.palletNo.trim()) &&
    !!selectedWarehouse &&
    !!currentCode &&
    !!currentLocation &&
    !stockLoading &&
    selectedTires.every((t) => availableAt(t.material, currentLocation) !== null) &&
    shortages.length === 0;

  // Every selected tire type becomes its own entry against the chosen
  // location, each keeping its own quantity. The selection is kept, so the
  // same tire(s) can be added from another location right away.
  const addEntry = () => {
    if (!canAddEntry || !selectedWarehouse || !currentCode || !currentLocation) return;
    setEntries((prev) => [
      ...prev,
      ...selectedTires.map((t) => ({
        key: `${t.material}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        material: t.material,
        description: t.description,
        brand: t.brand,
        plyRatingBottom: t.plyRatingBottom,
        warehouseLabel: selectedWarehouse.label,
        locationLabel: currentCode,
        stockLocation: currentLocation,
        qty: t.qty,
        palletNo: t.palletNo,
      })),
    ]);
  };

  const removeEntry = (key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  };

  const totalQty = entries.reduce((sum, e) => sum + e.qty, 0);

  // "Scan tire QR" — resolves the code printed on a tire's SKU label to its
  // Material/Model and adds it to step 2's selection.
  const handleTireDecode = async (code: string): Promise<boolean> => {
    const skuQrCode = code.trim();
    if (!skuQrCode) return false;
    const tire = await fetchTireBySkuQrCode(skuQrCode);
    if (!tire) return false;
    addSelectedTire({
      material: tire.serialNumber,
      description: tire.model,
      brand: tire.brand,
      plyRatingBottom: tire.plyRatingBottom,
    });
    return true;
  };

  const handleConfirm = async () => {
    if (submitting || entries.length === 0) return;
    if (!planNo.trim() || !shift) {
      setConfirmError("Fill in plan no and shift before confirming.");
      return;
    }
    setSubmitting(true);
    setSuccess(null);
    setConfirmError(null);

    // Re-read stock fresh — another device may have taken tires out since
    // they were added here — and pick exactly which tire rows go out.
    const needed = new Map<string, { material: string; location: string; qty: number }>();
    for (const e of entries) {
      const key = stockKey(e.material, e.stockLocation);
      const existing = needed.get(key);
      if (existing) existing.qty += e.qty;
      else needed.set(key, { material: e.material, location: e.stockLocation, qty: e.qty });
    }
    const outgoing: Tire[] = [];
    const short: string[] = [];
    for (const n of needed.values()) {
      const inStock = await fetchStockAt(n.material, n.location);
      if (inStock.length < n.qty) short.push(`${n.material} at ${n.location} (only ${inStock.length} in stock)`);
      else outgoing.push(...inStock.slice(0, n.qty));
    }
    if (short.length > 0) {
      setConfirmError(`Not enough stock: ${short.join("; ")}. Nothing was taken out.`);
      setStockVersion((v) => v + 1);
      setSubmitting(false);
      return;
    }

    const now = new Date().toISOString();
    const trimmedPlanNo = planNo.trim();

    // 1. Take the tires out of stock.
    const outLocation = trimmedPlanNo ? `Outward - Plan ${trimmedPlanNo}` : "Outward";
    const { error: tiresError } = await upsertTires(
      outgoing.map((t) => ({ ...t, currentStage: "dispatch" as const, location: outLocation, updatedAt: now })),
    );
    if (tiresError) {
      setConfirmError(`Failed to take tires out of stock: ${tiresError}`);
      setSubmitting(false);
      return;
    }

    // 2. Per-tire movement history.
    const history: StageHistory[] = outgoing.map((t, idx) => ({
      id: `h-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: t.id,
      stage: "dispatch",
      location: outLocation,
      movedAt: now,
      movedBy: "Forklift operator",
      notes: `Outward: ${t.model} taken out from ${t.location}`,
    }));
    await insertTireHistory(history);

    // 3. The outward log History and the export read back.
    const records: OutwardRecord[] = entries.map((e, idx) => ({
      id: `ow-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      material: e.material,
      description: e.description,
      warehouse: e.warehouseLabel,
      location: e.locationLabel,
      quantity: e.qty,
      planNo: trimmedPlanNo,
      palletNo: e.palletNo.trim(),
      shift,
      pickerName: pickerName.trim(),
      outwardAt: now,
      outwardBy: "Forklift operator",
      notes: "",
    }));
    const { error: recordError } = await insertOutwards(records);
    if (recordError) {
      setConfirmError(`Tires were taken out of stock, but the outward record failed to save: ${recordError}`);
    }

    void touchPlanNumber(trimmedPlanNo, "outward");
    loadOngoingPlans();

    setEntries([]);
    setSelectedTires([]);
    setStockVersion((v) => v + 1);
    setSubmitting(false);
    setSuccess(`${totalQty} tire${totalQty === 1 ? "" : "s"} taken out of stock across ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`);
  };

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <PackageMinus className="size-6 text-primary" />
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

      {confirmError && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{confirmError}</div>}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">1. Plan details</h2>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Ongoing plan</span>
          <SelectMenu
            value={ongoingPlans.some((p) => p.planNo === planNo.trim()) ? planNo.trim() : ""}
            placeholder={ongoingPlans.length === 0 ? "No plans yet" : "Select ongoing plan"}
            options={ongoingPlans.map((p) => ({
              value: p.planNo,
              label: [p.planNo, p.pickerName, p.shift && `Shift ${p.shift}`].filter(Boolean).join(" · "),
            }))}
            onChange={selectOngoingPlan}
            onOpen={loadOngoingPlans}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Picker Name</span>
          <input
            type="text"
            value={pickerName}
            onChange={(e) => setPickerName(e.target.value)}
            placeholder="Enter picker name"
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Plan No</span>
          <PlanNoPicker value={planNo} onChange={handlePlanNoChange} kind="outward" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Shift</span>
          <SelectMenu value={shift} placeholder="Select shift" options={SHIFT_OPTIONS} onChange={setShift} />
        </label>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium text-foreground">2. Tire</h2>
          <button
            type="button"
            onClick={() => setScanningTire(true)}
            aria-label="Scan tire QR"
            title="Scan tire QR"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card p-2 text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <QrCode className="size-4" />
          </button>
        </div>

        <TireCatalogSearch
          alreadySelected={selectedTires.map((t) => t.material)}
          onSelect={(sku: TireSkuRow) =>
            addSelectedTire({
              material: sku.material,
              description: sku.description,
              brand: sku.brand ?? undefined,
              plyRatingBottom: sku.ply_rating_bottom ?? undefined,
            })
          }
        />

        {selectedTires.length > 0 && (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {selectedTires.map((t) => (
              <li key={t.key} className="rounded-xl border border-border bg-card px-4 py-3 text-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[t.material, t.brand, t.plyRatingBottom].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSelectedTire(t.key)}
                    className="shrink-0 text-muted-foreground hover:text-danger"
                    aria-label={`Remove ${t.description}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <QtyStepper value={t.qty} onChange={(v) => setSelectedTireQty(t.key, v)} />
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Pallet No</span>
                  <input
                    type="text"
                    value={t.palletNo}
                    onChange={(e) => setSelectedTirePalletNo(t.key, e.target.value)}
                    placeholder="Enter pallet no"
                    autoComplete="off"
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
          <WarehouseIcon className="size-4 text-muted-foreground" />
          3. Taken from
        </h2>
        {warehouses.length === 0 ? (
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
                onClick={() => {
                  setWarehouseKey(w.key);
                  setManualCol("");
                  setManualRow("");
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
        )}

        {selectedWarehouse && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Select Row</span>
              <SelectMenu
                value={manualCol}
                placeholder="Select row"
                options={columnOptions.map((c) => ({ value: String(c), label: String(c).padStart(2, "0") }))}
                onChange={(col) => {
                  setManualCol(col);
                  if (col && manualRow) {
                    const max = selectedWarehouse.columnRowCounts[Number(col) - 1] ?? 0;
                    if (Number(manualRow) > max) setManualRow("");
                  }
                }}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Select Position</span>
              <SelectMenu
                value={manualRow}
                placeholder="Select position"
                options={rowOptions.map((r) => ({ value: String(r), label: String(r) }))}
                onChange={setManualRow}
              />
            </label>
          </div>
        )}

        {currentCode && currentLocation && selectedTires.length > 0 && (
          <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm space-y-1">
            <p className="font-medium text-foreground">In stock at {currentCode}</p>
            {stockLoading ? (
              <p className="text-muted-foreground">Checking stock…</p>
            ) : (
              selectedTires.map((t) => {
                const available = availableAt(t.material, currentLocation);
                const short = available !== null && t.qty > available;
                return (
                  <p key={t.key} className={cn("flex justify-between gap-2", short ? "text-danger" : "text-muted-foreground")}>
                    <span className="truncate">{t.material}</span>
                    <span className="shrink-0">
                      {available ?? "—"} available{short && ` · need ${t.qty}`}
                    </span>
                  </p>
                );
              })
            )}
          </div>
        )}

        <button
          type="button"
          onClick={addEntry}
          disabled={!canAddEntry}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {selectedTires.length > 1 ? `Add ${selectedTires.length} outwards` : "Add outward"}
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
          <MapPin className="size-4 text-muted-foreground" />
          4. Outward to record
        </h2>
        {entries.length === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Nothing added yet — select a tire and location above, then "Add outward".
          </div>
        ) : (
          <>
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {entries.map((e) => (
                <li key={e.key} className="relative rounded-xl border border-success/30 bg-success/10 px-10 py-3 text-sm text-center space-y-1">
                  <p className="text-lg font-semibold tracking-wide text-success">{e.locationLabel}</p>
                  <p className="font-medium text-foreground truncate">{e.description}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {e.material} · {e.warehouseLabel} · Qty {e.qty} · Pallet {e.palletNo}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeEntry(e.key)}
                    className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    aria-label={`Remove outward of ${e.description}`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {totalQty} tire{totalQty === 1 ? "" : "s"} across {entries.length} entr{entries.length === 1 ? "y" : "ies"}
            </p>
          </>
        )}
      </div>

      <button
        onClick={handleConfirm}
        disabled={entries.length === 0 || !planNo.trim() || !shift || submitting}
        className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Confirming…" : "OK - Confirm outward"}
      </button>

      <SuccessOverlay message={success} onDone={() => setSuccess(null)} />

      {scanningTire && (
        <QrScanner
          title="Scan tire QR"
          notFoundLabel="tire"
          onDecode={handleTireDecode}
          onClose={() => setScanningTire(false)}
        />
      )}
    </div>
  );
}
