import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ClipboardList, MapPin, QrCode, Warehouse as WarehouseIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import PlanNoPicker from "@/components/plan-no-picker";
import QrScanner from "@/components/qr-scanner";
import QtyStepper from "@/components/qty-stepper";
import SelectMenu from "@/components/select-menu";
import SuccessOverlay from "@/components/success-overlay";
import TireCatalogSearch from "@/components/tire-catalog-search";
import { locationForBin, type WarehouseDef } from "@/data/warehouse-bins";
import { stockByRowPosition, stockInWarehouse, useStockLocations, type StockMap } from "@/hooks/use-stock-locations";
import { fetchOngoingPickingPlans, insertPicks, type OngoingPickingPlan } from "@/lib/picks";
import { takeOutOfStock } from "@/lib/stock-out";
import { getStoredPlanNo, setStoredPlanNo } from "@/lib/plan-no-draft";
import { touchPlanNumber } from "@/lib/plan-numbers";
import { fetchTireBySkuQrCode } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { TireSkuRow } from "@/lib/supabase";
import type { PickingRecord } from "@/types/tire";

// Confirming a pick takes the tires out of stock (see takeOutOfStock), same
// as Outward, so Stock drops by exactly what was picked.

// A tire type selected for this pick batch, with its own quantity — mirrors
// Inward's SelectedTire exactly, right down to the per-tire qty stepper.
interface SelectedTire {
  key: string;
  material: string;
  description: string;
  brand?: string;
  plyRatingBottom?: string;
  qty: number;
  palletNo: string;
}

// One confirmed pick queued for submission.
interface PickEntry {
  key: string;
  material: string;
  description: string;
  brand?: string;
  plyRatingBottom?: string;
  warehouseLabel: string;
  locationLabel: string;
  // Full tires.location this pick takes stock from — "<label> - Bin <code>".
  stockLocation: string;
  qty: number;
  palletNo: string;
}

const SHIFT_OPTIONS = [
  { value: "1", label: "Shift 1" },
  { value: "2", label: "Shift 2" },
  { value: "3", label: "Shift 3" },
];

export default function TirePicking() {
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);

  // Groups every Picking confirmed today under one Plan No. Which plan
  // numbers *exist* is entirely DB-backed (plan_numbers, touched on
  // confirm); this is just which one is currently on screen, remembered
  // per device (plan-no-draft.ts) so it stays put across page visits until
  // the operator actually clears/changes it — not reset to blank each time.
  const [planNo, setPlanNo] = useState(() => getStoredPlanNo("picking"));
  const [pickerName, setPickerName] = useState("");
  const [shift, setShift] = useState("");
  const handlePlanNoChange = (value: string) => {
    setPlanNo(value);
    setStoredPlanNo("picking", value);
  };

  // Every plan picked under so far, latest first — choosing one fills in the rest of
  // Plan details from that plan's latest pick.
  const [ongoingPlans, setOngoingPlans] = useState<OngoingPickingPlan[]>([]);
  const loadOngoingPlans = () => {
    fetchOngoingPickingPlans().then(setOngoingPlans);
  };
  const selectOngoingPlan = (value: string) => {
    const plan = ongoingPlans.find((p) => p.planNo === value);
    if (!plan) return;
    handlePlanNoChange(plan.planNo);
    // Older picks predate picker name/shift — keep whatever's typed then.
    if (plan.pickerName) setPickerName(plan.pickerName);
    if (plan.shift) setShift(plan.shift);
  };

  const [selectedTires, setSelectedTires] = useState<SelectedTire[]>([]);
  const [warehouseKey, setWarehouseKey] = useState("");
  const [manualCol, setManualCol] = useState("");
  const [manualRow, setManualRow] = useState("");

  const [pickEntries, setPickEntries] = useState<PickEntry[]>([]);
  const [scanningTire, setScanningTire] = useState(false);
  // Bumped after every confirm so stock counts refresh.
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

  // Where the selected tires currently sit in stock. Warehouse / Row /
  // Position only offer places that actually hold them, with counts —
  // confirming a pick takes the tires out of stock, so it can only pick what
  // is really there.
  const materials = useMemo(() => selectedTires.map((t) => t.material), [selectedTires]);
  const { stock, loading: stockLoading } = useStockLocations(materials, stockVersion);
  const hasStock = selectedTires.length > 0 && !stockLoading && stock.size > 0;
  const stockGrid = useMemo(
    () => (selectedWarehouse ? stockByRowPosition(selectedWarehouse, stock) : new Map<number, Map<number, number>>()),
    [selectedWarehouse, stock],
  );

  const columnOptions = useMemo(
    () =>
      [...stockGrid.entries()]
        .sort(([a], [b]) => a - b)
        .map(([col, rows]) => {
          const total = [...rows.values()].reduce((sum, n) => sum + n, 0);
          return { value: String(col), label: `${String(col).padStart(2, "0")} · ${total} in stock` };
        }),
    [stockGrid],
  );

  const rowOptions = useMemo(() => {
    const rows = stockGrid.get(Number(manualCol));
    if (!rows) return [];
    return [...rows.entries()]
      .sort(([a], [b]) => a - b)
      .map(([row, n]) => ({ value: String(row), label: `${row} · ${n} in stock` }));
  }, [stockGrid, manualCol]);

  // Follow the stock: switch to a warehouse that holds the selected tires
  // (once per stock lookup, so tapping another warehouse afterwards sticks),
  // and fill in Row / Position when there's only one choice left.
  const followedStock = useRef<StockMap | null>(null);
  useEffect(() => {
    if (!hasStock || !selectedWarehouse || followedStock.current === stock) return;
    followedStock.current = stock;
    if (stockInWarehouse(selectedWarehouse, stock) > 0) return;
    const withStock = warehouses.find((w) => stockInWarehouse(w, stock) > 0);
    if (withStock) {
      setWarehouseKey(withStock.key);
      setManualCol("");
      setManualRow("");
    }
  }, [hasStock, selectedWarehouse, warehouses, stock]);
  useEffect(() => {
    if (stockLoading || columnOptions.some((o) => o.value === manualCol)) return;
    setManualCol(columnOptions.length === 1 ? columnOptions[0].value : "");
  }, [stockLoading, columnOptions, manualCol]);
  useEffect(() => {
    if (stockLoading || rowOptions.some((o) => o.value === manualRow)) return;
    setManualRow(rowOptions.length === 1 ? rowOptions[0].value : "");
  }, [stockLoading, rowOptions, manualRow]);

  // The chosen Row/Position as a bin code and as the full tires.location.
  const currentCode =
    selectedWarehouse && manualCol && manualRow
      ? `${selectedWarehouse.prefix}${String(Number(manualCol)).padStart(2, "0")}-${String(Number(manualRow)).padStart(2, "0")}`
      : null;
  const currentLocation = selectedWarehouse && currentCode ? locationForBin(selectedWarehouse, currentCode) : null;

  // Already queued below for this Material + location — not yet out of the
  // database, but no longer available to add again.
  const queuedAt = (material: string, location: string) =>
    pickEntries.filter((p) => p.material === material && p.stockLocation === location).reduce((sum, p) => sum + p.qty, 0);

  const availableAt = (material: string, location: string): number =>
    Math.max(0, (stock.get(location)?.get(material) ?? 0) - queuedAt(material, location));

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
    currentLocation && !stockLoading ? selectedTires.filter((t) => t.qty > availableAt(t.material, currentLocation)) : [];

  const canAddPick =
    selectedTires.length > 0 &&
    selectedTires.every((t) => t.palletNo.trim()) &&
    !!selectedWarehouse &&
    !!currentCode &&
    !!currentLocation &&
    !stockLoading &&
    shortages.length === 0;

  // Used by the Row/Position "Add pick" button — one tire selected in step 1
  // can become several pick entries here, every selected tire type recorded
  // against the one given location, each keeping its own quantity.
  const addPick = () => {
    if (!canAddPick || !selectedWarehouse || !currentCode || !currentLocation) return;
    setPickEntries((prev) => [
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
    // Tire selection is kept as-is — picking a location no longer clears it,
    // so the same tire(s) stay selected for picking another location, right
    // up until Confirm.
    // Operators remove a tire from the selection manually (the X button) if
    // they're done with it before then.
  };

  const removePick = (key: string) => {
    setPickEntries((prev) => prev.filter((p) => p.key !== key));
  };

  const totalQty = pickEntries.reduce((sum, p) => sum + p.qty, 0);

  // "Scan tire QR" — resolves the code printed on a tire's SKU label to its
  // Material/Model (a read-only lookup against the tires catalog). It only
  // adds to step 1's selection; the operator still has to type where they
  // physically found it, since nothing here trusts a previously-recorded
  // location.
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
    if (submitting || pickEntries.length === 0) return;
    if (!planNo.trim() || !shift) {
      setConfirmError("Fill in plan no and shift before confirming.");
      return;
    }
    setSubmitting(true);
    setSuccess(null);
    setConfirmError(null);

    const now = new Date().toISOString();

    // 1. Take the tires out of stock (all-or-nothing).
    const { error: stockError } = await takeOutOfStock(
      pickEntries.map((p) => ({ material: p.material, location: p.stockLocation, qty: p.qty })),
      { flow: "Picking", planNo: planNo.trim(), movedBy: "Forklift operator", at: now },
    );
    if (stockError) {
      setConfirmError(stockError);
      setStockVersion((v) => v + 1);
      setSubmitting(false);
      return;
    }

    // 2. The pick log History and the PICK SHEET export read back.
    const rows: PickingRecord[] = pickEntries.map((p, idx) => ({
      id: `op-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      material: p.material,
      description: p.description,
      warehouse: p.warehouseLabel,
      location: p.locationLabel,
      quantity: p.qty,
      planNo: planNo.trim(),
      palletNo: p.palletNo.trim(),
      shift,
      pickerName: pickerName.trim(),
      pickedAt: now,
      pickedBy: "Forklift operator",
      notes: "",
    }));

    const { error } = await insertPicks(rows);
    if (error) {
      setConfirmError(`Tires were taken out of stock, but the pick record failed to save: ${error}`);
    }

    void touchPlanNumber(planNo.trim(), "picking");
    loadOngoingPlans();

    setPickEntries([]);
    setSelectedTires([]);
    setStockVersion((v) => v + 1);
    setSubmitting(false);
    setSuccess(`${totalQty} tire${totalQty === 1 ? "" : "s"} across ${pickEntries.length} pick${pickEntries.length === 1 ? "" : "s"} recorded.`);
  };

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="size-6 text-primary" />
            Picking
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
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0 space-y-1.5">
            <span className="text-sm font-medium text-foreground">Plan No</span>
            <PlanNoPicker value={planNo} onChange={handlePlanNoChange} kind="picking" />
          </label>
          <label className="block min-w-0 space-y-1.5">
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
        </div>
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
          3. Picked from
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
                {hasStock && ` · ${stockInWarehouse(w, stock)}`}
              </button>
            ))}
          </div>
        )}

        {selectedTires.length === 0 ? (
          <p className="text-sm text-muted-foreground">Select a tire above to see where it is in stock.</p>
        ) : stockLoading ? (
          <p className="text-sm text-muted-foreground">Finding where it is in stock…</p>
        ) : !hasStock ? (
          <p className="text-sm text-danger">Not in stock in any warehouse.</p>
        ) : (
          selectedWarehouse &&
          columnOptions.length === 0 && <p className="text-sm text-muted-foreground">None in stock in {selectedWarehouse.label}.</p>
        )}

        {selectedWarehouse && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Select Row</span>
              <SelectMenu
                value={manualCol}
                placeholder="Select row"
                options={columnOptions}
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
                options={rowOptions}
                onChange={setManualRow}
              />
            </label>
          </div>
        )}

        {currentCode && currentLocation && selectedTires.length > 0 && !stockLoading && (
          <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm space-y-1">
            <p className="font-medium text-foreground">In stock at {currentCode}</p>
            {selectedTires.map((t) => {
              const available = availableAt(t.material, currentLocation);
              const short = t.qty > available;
              return (
                <p key={t.key} className={cn("flex justify-between gap-2", short ? "text-danger" : "text-muted-foreground")}>
                  <span className="truncate">{t.material}</span>
                  <span className="shrink-0">
                    {available} available{short && ` · need ${t.qty}`}
                  </span>
                </p>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={addPick}
          disabled={!canAddPick}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {selectedTires.length > 1 ? `Add ${selectedTires.length} picks` : "Add pick"}
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
          <MapPin className="size-4 text-muted-foreground" />
          4. Picks to record
        </h2>
        {pickEntries.length === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            No picks added yet — select a tire and location above, then "Add pick".
          </div>
        ) : (
          <>
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {pickEntries.map((p) => (
                <li key={p.key} className="relative rounded-xl border border-success/30 bg-success/10 px-10 py-3 text-sm text-center space-y-1">
                  <p className="text-lg font-semibold tracking-wide text-success">{p.locationLabel}</p>
                  <p className="font-medium text-foreground truncate">{p.description}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.material} · {p.warehouseLabel} · Qty {p.qty} · Pallet {p.palletNo}
                  </p>
                  <button
                    type="button"
                    onClick={() => removePick(p.key)}
                    className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    aria-label={`Remove pick of ${p.description}`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {totalQty} tire{totalQty === 1 ? "" : "s"} across {pickEntries.length} pick{pickEntries.length === 1 ? "" : "s"}
            </p>
          </>
        )}
      </div>

      <button
        onClick={handleConfirm}
        disabled={pickEntries.length === 0 || !planNo.trim() || !shift || submitting}
        className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Confirming…" : "OK - Confirm picking"}
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
