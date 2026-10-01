import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowDownToLine, ArrowLeftRight, FileSpreadsheet, QrCode, Warehouse as WarehouseIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ExchangeLocationModal from "@/components/exchange-location-modal";
import InwardUploadModal from "@/components/inward-upload-modal";
import PlanNoPicker from "@/components/plan-no-picker";
import QrScanner from "@/components/qr-scanner";
import QtyStepper from "@/components/qty-stepper";
import SelectMenu from "@/components/select-menu";
import SuccessOverlay from "@/components/success-overlay";
import TireCatalogSearch from "@/components/tire-catalog-search";
import RequiredMark from "@/components/required-mark";
import { locationForBin, type WarehouseDef } from "@/data/warehouse-bins";
import { insertInwardReceipts } from "@/lib/inward-receipts";
import { insertPlacementLogs } from "@/lib/placement-logs";
import { getStoredPlanNo, setStoredPlanNo } from "@/lib/plan-no-draft";
import { touchPlanNumber } from "@/lib/plan-numbers";
import { buildTireFromCatalogRow } from "@/lib/tire-catalog";
import { insertTireHistory } from "@/lib/tire-history";
import { fetchTireBySkuQrCode, fetchTires, upsertTires } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { TireSkuRow } from "@/lib/supabase";
import type { InwardReceipt, PlacementLog, StageHistory, Tire } from "@/types/tire";

interface SelectedTire {
  key: string;
  material: string;
  model: string;
  brand?: string;
  plyRatingBottom?: string;
  qty: number;
  palletNo: string;
}

// One staged entry: its own tires (with pallet nos), warehouse and locations.
// Entries are only written to the database when the final Inward button is
// pressed, so an operator can stage several before committing.
interface InwardEntry {
  id: string;
  tires: SelectedTire[];
  warehouse: WarehouseDef;
  bins: string[];
}

const SHIFT_OPTIONS = [
  { value: "1", label: "Shift 1" },
  { value: "2", label: "Shift 2" },
  { value: "3", label: "Shift 3" },
];

export default function TireInward() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);

  // Groups every Inward confirmed today under one Plan No. Which plan
  // numbers *exist* is entirely DB-backed (plan_numbers, touched on
  // confirm); this is just which one is currently on screen, remembered
  // per device (plan-no-draft.ts) so it stays put across page visits until
  // the operator actually clears/changes it — not reset to blank each time.
  const [planNo, setPlanNo] = useState(() => getStoredPlanNo("inward"));
  const [pickerName, setPickerName] = useState("");
  const [shift, setShift] = useState("");
  const handlePlanNoChange = (value: string) => {
    setPlanNo(value);
    setStoredPlanNo("inward", value);
  };

  const [selectedTires, setSelectedTires] = useState<SelectedTire[]>([]);
  const [warehouseKey, setWarehouseKey] = useState("");
  const [selectedBins, setSelectedBins] = useState<Set<string>>(new Set());
  const [manualRow, setManualRow] = useState("");
  const [manualCol, setManualCol] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const [entries, setEntries] = useState<InwardEntry[]>([]);

  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [scanningTire, setScanningTire] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    fetchTires().then(setTires);
    fetchWarehouses().then((rows) => {
      setWarehouses(rows);
      setWarehouseKey((prev) => prev || rows[0]?.key || "");
    });
  }, []);

  const addSelectedTire = (entry: { material: string; model: string; brand?: string; plyRatingBottom?: string }) => {
    setSelectedTires((prev) => {
      if (prev.some((t) => t.material === entry.material)) return prev;
      return [...prev, { key: entry.material, qty: 1, palletNo: "", ...entry }];
    });
  };

  const addTireFromCatalog = (sku: TireSkuRow) =>
    addSelectedTire({
      material: sku.material,
      model: sku.description,
      brand: sku.brand ?? undefined,
      plyRatingBottom: sku.ply_rating_bottom ?? undefined,
    });

  // "Scan tire QR" — the code printed on a tire's SKU label encodes its
  // sku_qr_code, a per-unit code distinct from Material (the catalog/model
  // identifier). A scan resolves that sku_qr_code to exactly one physical
  // tire, then adds its Material to the selection like a search pick.
  const handleTireDecode = async (code: string): Promise<boolean> => {
    const skuQrCode = code.trim();
    if (!skuQrCode) return false;
    const tire = await fetchTireBySkuQrCode(skuQrCode);
    if (!tire) return false;
    if (selectedTires.some((t) => t.material.toLowerCase() === tire.serialNumber.toLowerCase())) return true;
    addSelectedTire({
      material: tire.serialNumber,
      model: tire.model,
      brand: tire.brand,
      plyRatingBottom: tire.plyRatingBottom,
    });
    return true;
  };

  const removeSelectedTire = (key: string) => {
    setSelectedTires((prev) => prev.filter((t) => t.key !== key));
  };

  const setQty = (key: string, value: number) => {
    setSelectedTires((prev) => prev.map((t) => (t.key === key ? { ...t, qty: value } : t)));
  };

  const setSelectedTirePalletNo = (key: string, value: string) => {
    setSelectedTires((prev) => prev.map((t) => (t.key === key ? { ...t, palletNo: value } : t)));
  };

  const allPalletNosFilled = selectedTires.every((t) => t.palletNo.trim());

  const totalQty = selectedTires.reduce((sum, t) => sum + t.qty, 0);

  const selectedWarehouse = warehouses.find((w) => w.key === warehouseKey) || null;
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

  const toggleBin = (code: string) => {
    setSelectedBins((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const addManualLocation = () => {
    if (!selectedWarehouse || !manualRow || !manualCol) return;
    const code = `${selectedWarehouse.prefix}${String(Number(manualCol)).padStart(2, "0")}-${String(Number(manualRow)).padStart(2, "0")}`;
    // One location per entry — adding another replaces it. Use a separate
    // entry for tires going to a different location.
    setSelectedBins(new Set([code]));
    setManualRow("");
    setManualCol("");
    setManualError(null);
  };

  // "Confirm" — stages the current tires + warehouse + locations as one entry
  // and clears steps 2-4 for the next one. Nothing is saved yet.
  const handleAddEntry = () => {
    setConfirmError(null);
    if (selectedTires.length === 0 || !selectedWarehouse) return;
    if (!allPalletNosFilled) {
      setConfirmError("Fill in a pallet no for every tire before confirming.");
      return;
    }
    // One location per entry, and it must be added explicitly — never guessed,
    // so the sheet's LOCATION is always where the operator put the tires.
    const bins = Array.from(selectedBins);
    if (bins.length === 0) {
      setConfirmError("Add a storage location before confirming.");
      return;
    }
    setEntries((prev) => [
      ...prev,
      { id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tires: selectedTires, warehouse: selectedWarehouse, bins },
    ]);
    setSelectedTires([]);
    setSelectedBins(new Set());
    setManualRow("");
    setManualCol("");
    setManualError(null);
  };

  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  // Why the staged entries can't be inwarded yet — shown under the Inward
  // button instead of just greying it out.
  const inwardBlockedReason = !planNo.trim() || !shift ? "Fill in Sheet No and Shift above to save to stock." : null;

  // From the upload modal — each uploaded location becomes an entry, same as
  // a manually-built one, and is inwarded (saved to stock) right away. The
  // sheet's own LOCATION / PALLET / SKU / QTY are all an upload needs; Sheet
  // No and Shift are recorded if filled in on the page but never required.
  // The entries are staged first so a failed save leaves them in "5. Entries
  // to inward" to retry instead of losing them.
  const handleUploadImport = async (imported: { tires: SelectedTire[]; warehouse: WarehouseDef; bins: string[] }[]) => {
    setConfirmError(null);
    const newEntries = imported.map((e) => ({ id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...e }));
    setEntries((prev) => [...prev, ...newEntries]);
    await saveEntries(newEntries, false);
  };

  // Final "Inward" — writes every staged entry under the shared plan details.
  const handleInward = async () => {
    if (submitting || entries.length === 0) return;
    await saveEntries(entries, true);
  };

  // Writes the given entries to stock and drops them from the staged list.
  const saveEntries = async (toSave: InwardEntry[], requirePlanDetails: boolean) => {
    if (submitting || toSave.length === 0) return;
    setSubmitting(true);
    setSuccess(null);
    setConfirmError(null);
    if (requirePlanDetails && (!planNo.trim() || !shift)) {
      setConfirmError("Fill in sheet no and shift before inwarding.");
      setSubmitting(false);
      return;
    }

    const now = new Date().toISOString();
    const assignments: { tireId: string; bin: string; model: string; material: string; palletNo: string; warehouse: WarehouseDef }[] = [];
    const extraTires: Tire[] = [];
    // Production-stage units already claimed by an earlier entry in this batch.
    const usedIds = new Set<string>();

    for (const entry of toSave) {
      // Round-robin across the entry's bins so multiple picked bins share the
      // load evenly — no capacity cap, a bin can hold any number of tires.
      let bi = 0;
      const nextBin = (): string => {
        const b = entry.bins[bi % entry.bins.length];
        bi++;
        return b;
      };

      for (const t of entry.tires) {
        // Consume any matching production-stage units already on record first,
        // then synthesize the rest fresh from the tire catalog (Supabase).
        const existingIds = tires
          .filter((existing) => existing.currentStage === "production" && existing.serialNumber === t.material && !usedIds.has(existing.id))
          .slice(0, t.qty)
          .map((existing) => existing.id);

        for (const tireId of existingIds) {
          usedIds.add(tireId);
          assignments.push({ tireId, bin: nextBin(), model: t.model, material: t.material, palletNo: t.palletNo.trim(), warehouse: entry.warehouse });
        }

        const shortfall = t.qty - existingIds.length;
        for (let k = 0; k < shortfall; k++) {
          const id = `t-${Date.now()}-${entry.id}-${t.key}-${k}-${Math.random().toString(36).slice(2, 7)}`;
          extraTires.push(
            buildTireFromCatalogRow(
              {
                material: t.material,
                description: t.model,
                plyRatingBottom: t.plyRatingBottom || "",
                brand: t.brand || "",
                skuQrCode: "",
              },
              id,
              now,
            ),
          );
          assignments.push({ tireId: id, bin: nextBin(), model: t.model, material: t.material, palletNo: t.palletNo.trim(), warehouse: entry.warehouse });
        }
      }
    }

    const assignmentById = new Map(assignments.map((a) => [a.tireId, a]));
    const locationOf = (a: { warehouse: WarehouseDef; bin: string }) => locationForBin(a.warehouse, a.bin);
    const changedExisting = tires
      .filter((t) => usedIds.has(t.id))
      .map((t) => ({
        ...t,
        currentStage: "warehouse" as const,
        location: locationOf(assignmentById.get(t.id)!),
        updatedAt: now,
      }));
    const newTireRows = extraTires.map((t) => ({
      ...t,
      currentStage: "warehouse" as const,
      location: locationOf(assignmentById.get(t.id)!),
      updatedAt: now,
    }));
    const tiresToSave = [...changedExisting, ...newTireRows];

    const { error } = await upsertTires(tiresToSave);
    if (error) {
      setSuccess(null);
      setConfirmError(`Failed to place tires: ${error}`);
      setSubmitting(false);
      return;
    }

    const newHistory: StageHistory[] = assignments.map((a, idx) => ({
      id: `h-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: a.tireId,
      stage: "warehouse",
      location: locationOf(a),
      movedAt: now,
      movedBy: "Forklift operator",
      notes: `Inward: ${a.model} moved to ${locationOf(a)}`,
    }));

    const newLogs: PlacementLog[] = assignments.map((a, idx) => ({
      id: `p-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: a.tireId,
      location: locationOf(a),
      placedAt: now,
      placedBy: "Forklift operator",
      notes: `Inward: ${a.model} moved to ${locationOf(a)}`,
    }));

    await insertTireHistory(newHistory);
    await insertPlacementLogs(newLogs);

    // One receipt row per distinct Material + pallet + bin across the batch
    // (5 of the same tire in the same bin and pallet becomes one row with Qty
    // 5 — but different bins or pallets stay separate rows, so LOCATION and
    // PALLET on the exported sheet are always exact), persisted under the
    // active Plan No so the export — and any later inward under the same plan
    // no today — can pull every receipt together.
    const grouped = new Map<string, { material: string; model: string; palletNo: string; warehouse: string; location: string; qty: number }>();
    for (const a of assignments) {
      const location = locationOf(a);
      const key = `${a.material}|${a.palletNo}|${location}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.qty += 1;
      } else {
        grouped.set(key, { material: a.material, model: a.model, palletNo: a.palletNo, warehouse: a.warehouse.label, location, qty: 1 });
      }
    }
    const receipts: InwardReceipt[] = Array.from(grouped.values()).map((g, idx) => ({
      id: `ir-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      material: g.material,
      description: g.model,
      warehouse: g.warehouse,
      location: g.location,
      quantity: g.qty,
      planNo: planNo.trim(),
      palletNo: g.palletNo,
      shift,
      pickerName: pickerName.trim(),
      receivedAt: now,
      receivedBy: "Forklift operator",
      notes: "",
    }));
    const { error: receiptError } = await insertInwardReceipts(receipts);
    if (receiptError) {
      console.warn("Failed to record inward receipts for export:", receiptError);
      setConfirmError(`Tires were placed in stock, but saving them to the Excel sheet failed: ${receiptError}`);
    }
    void touchPlanNumber(planNo.trim(), "inward");

    setTires((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      for (const t of tiresToSave) byId.set(t.id, t);
      return Array.from(byId.values());
    });
    const entryCount = toSave.length;
    const savedIds = new Set(toSave.map((e) => e.id));
    setEntries((prev) => prev.filter((e) => !savedIds.has(e.id)));
    setSuccess(
      `${assignments.length} tire${assignments.length === 1 ? "" : "s"} inwarded across ${entryCount} entr${entryCount === 1 ? "y" : "ies"}.`,
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <FileSpreadsheet className="size-4" />
            Upload Excel
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Back
          </Link>
        </div>
      </div>

      {confirmError && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{confirmError}</div>}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">1. Plan details</h2>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Driver Name</span>
          <input
            type="text"
            value={pickerName}
            onChange={(e) => setPickerName(e.target.value)}
            placeholder="Enter driver name"
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Sheet No<RequiredMark /></span>
          <PlanNoPicker value={planNo} onChange={handlePlanNoChange} kind="inward" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Shift<RequiredMark /></span>
          <SelectMenu value={shift} placeholder="Select shift" options={SHIFT_OPTIONS} onChange={setShift} />
        </label>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium text-foreground">2. Select tires</h2>
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
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Pallet No<RequiredMark /></span>
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
            3. Warehouse
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setExchangeOpen(true)}
              aria-label="Exchange location"
              title="Exchange location"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card p-2 text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeftRight className="size-4" />
            </button>
          </div>
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
        <h2 className="text-base font-medium text-foreground">4. Select storage location</h2>
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

                <SelectMenu
                  value={manualCol}
                  placeholder="Select row"
                  options={columnOptions.map((c) => ({ value: String(c), label: String(c).padStart(2, "0") }))}
                  onChange={(col) => {
                    setManualCol(col);
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
                />
              </label>

              {/* POSITION SECOND */}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">
                  Select Position
                </span>

                <SelectMenu
                  value={manualRow}
                  placeholder="Select position"
                  options={rowOptions.map((r) => ({ value: String(r), label: String(r) }))}
                  onChange={(row) => {
                    setManualRow(row);
                    setManualError(null);
                  }}
                />
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
              disabled={!manualCol || !manualRow}
              className="w-full sm:w-auto rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {selectedBins.size > 0 ? "Change Location" : "Add Location"}
            </button>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Selected location</p>
              {selectedBins.size === 0 ? (
                <p className="text-sm text-muted-foreground">No location added yet — choose a row and position, then press Add Location.</p>
              ) : (
                <div className="space-y-2">
                  {Array.from(selectedBins)
                    .sort()
                    .map((code) => (
                      <div
                        key={code}
                        className="relative flex items-center justify-center rounded-xl border border-success/30 bg-success/10 px-10 py-3"
                      >
                        <span className="text-lg font-semibold tracking-wide text-success">{code}</span>
                        <button
                          type="button"
                          onClick={() => toggleBin(code)}
                          aria-label={`Remove ${code}`}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={handleAddEntry}
        disabled={selectedTires.length === 0 || !selectedWarehouse || !allPalletNosFilled || selectedBins.size === 0}
        className="w-full rounded-xl border border-primary px-4 py-3.5 text-base font-semibold text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        OK - Confirm entry
      </button>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">5. Entries to inward</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries confirmed yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e, i) => (
              <li key={e.id} className="rounded-xl border border-border bg-card px-3 py-2 text-sm space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">
                    Entry {i + 1} · {e.warehouse.label} · {e.bins.join(", ")}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeEntry(e.id)}
                    className="shrink-0 text-muted-foreground hover:text-danger"
                    aria-label={`Remove entry ${i + 1}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {e.tires.map((t) => (
                    <li key={t.key} className="py-1.5">
                      <p className="text-xs text-foreground break-words">{t.model}</p>
                      <p className="text-xs text-muted-foreground">
                        Pallet {t.palletNo.trim()} · Qty {t.qty}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={handleInward}
        disabled={entries.length === 0 || !planNo.trim() || !shift || submitting}
        className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Inwarding…" : `Inward${entries.length > 0 ? ` (${entries.length} entr${entries.length === 1 ? "y" : "ies"})` : ""}`}
      </button>
      {entries.length > 0 && inwardBlockedReason && <p className="-mt-4 text-center text-sm text-danger">{inwardBlockedReason}</p>}

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


      {scanningTire && (
        <QrScanner
          title="Scan tire QR"
          notFoundLabel="tire"
          onDecode={handleTireDecode}
          onClose={() => setScanningTire(false)}
        />
      )}

      <InwardUploadModal
        open={uploadOpen}
        warehouses={warehouses}
        onClose={() => setUploadOpen(false)}
        onImport={(imported) => void handleUploadImport(imported)}
      />
    </div>
  );
}
