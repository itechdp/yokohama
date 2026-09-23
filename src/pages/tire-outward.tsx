import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpFromLine, MapPin, QrCode, Warehouse as WarehouseIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import PlanNoPicker from "@/components/plan-no-picker";
import QrScanner from "@/components/qr-scanner";
import QtyStepper from "@/components/qty-stepper";
import SelectMenu from "@/components/select-menu";
import StandFloorPicker from "@/components/stand-floor-picker-svg";
import SuccessOverlay from "@/components/success-overlay";
import TireCatalogSearch from "@/components/tire-catalog-search";
import { floorCountAt, STAND_IDS, standCountAt, type WarehouseDef } from "@/data/warehouse-bins";
import { insertOutwardPicks } from "@/lib/outward-picks";
import { getStoredPlanNo, setStoredPlanNo } from "@/lib/plan-no-draft";
import { touchPlanNumber } from "@/lib/plan-numbers";
import { fetchTireBySkuQrCode } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { TireSkuRow } from "@/lib/supabase";
import type { OutwardPick } from "@/types/tire";

// A tire type selected for this pick batch, with its own quantity — mirrors
// Inward's SelectedTire exactly, right down to the per-tire qty stepper. No
// tie to any tires-table row; this is purely "what, how many" as reported by
// the picker, same as Inward reports "what, how many" on arrival.
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
  qty: number;
  palletNo: string;
}

const SHIFT_OPTIONS = [
  { value: "1", label: "Shift 1" },
  { value: "2", label: "Shift 2" },
  { value: "3", label: "Shift 3" },
];

export default function TireOutward() {
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);

  // Groups every Outward confirmed today under one Plan No. Which plan
  // numbers *exist* is entirely DB-backed (plan_numbers, touched on
  // confirm); this is just which one is currently on screen, remembered
  // per device (plan-no-draft.ts) so it stays put across page visits until
  // the operator actually clears/changes it — not reset to blank each time.
  const [planNo, setPlanNo] = useState(() => getStoredPlanNo("outward"));
  const [pickerName, setPickerName] = useState("");
  const [shift, setShift] = useState("");
  const handlePlanNoChange = (value: string) => {
    setPlanNo(value);
    setStoredPlanNo("outward", value);
  };

  const [selectedTires, setSelectedTires] = useState<SelectedTire[]>([]);
  const [warehouseKey, setWarehouseKey] = useState("");
  const [manualCol, setManualCol] = useState("");
  const [manualRow, setManualRow] = useState("");
  const [manualStand, setManualStand] = useState("");
  const [manualFloor, setManualFloor] = useState("");

  const [pickEntries, setPickEntries] = useState<PickEntry[]>([]);
  const [scanningTire, setScanningTire] = useState(false);
  const [pickerAreaCode, setPickerAreaCode] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    fetchWarehouses().then((rows) => {
      setWarehouses(rows);
      setWarehouseKey((prev) => prev || rows[0]?.key || "");
    });
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

  const manualStandCount = selectedWarehouse && manualCol ? standCountAt(selectedWarehouse, Number(manualCol)) : 1;

  const maxFloors = selectedWarehouse
    ? Math.max(...selectedWarehouse.columnRowCounts.map((_, i) => floorCountAt(selectedWarehouse, i + 1)))
    : 0;
  const manualFloorCount = selectedWarehouse ? (manualCol ? floorCountAt(selectedWarehouse, Number(manualCol)) : maxFloors) : 0;
  const floorOptions = useMemo(() => Array.from({ length: manualFloorCount }, (_, i) => i + 1), [manualFloorCount]);

  // The area code (prefix+col-row) the current manual selection points at, if
  // both Row and Position are picked — used to highlight the matching cell
  // in the bin map below, and to know which cell's picker to reopen already
  // showing the current stand/floor selected.
  const currentAreaCode =
    selectedWarehouse && manualCol && manualRow
      ? `${selectedWarehouse.prefix}${String(Number(manualCol)).padStart(2, "0")}-${String(Number(manualRow)).padStart(2, "0")}`
      : null;
  const currentFullCode =
    currentAreaCode && manualFloor && (manualStandCount <= 1 || manualStand)
      ? `${currentAreaCode}-${manualStandCount > 1 ? manualStand : STAND_IDS[0]}${manualFloor}`
      : null;

  // Picking a stand+floor block on the bin map commits the pick immediately
  // — same one-tap behavior as Inward's map — instead of just filling in the
  // Row/Position/Stand/Floor dropdowns and waiting for a separate "Add pick"
  // press. It also mirrors the picked location into those dropdowns, so
  // there's visible confirmation of what was picked and it's easy to add
  // another tire to that same spot afterward without reopening the map.
  const selectFromBinMap = (areaCode: string, code: string) => {
    if (!selectedWarehouse) return;
    const [colStr, rowStr] = areaCode.slice(selectedWarehouse.prefix.length).split("-");
    const shortCode = code.slice(areaCode.length + 1);
    const match = /^([A-Za-z]+)(\d+)$/.exec(shortCode);
    if (!colStr || !rowStr || !match) return;
    setManualCol(String(Number(colStr)));
    setManualRow(String(Number(rowStr)));
    setManualStand(match[1]);
    setManualFloor(match[2]);
    setPickerAreaCode(null);
    addPickAtLocation(code);
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

  const canAddPick =
    selectedTires.length > 0 &&
    selectedTires.every((t) => t.palletNo.trim()) &&
    !!selectedWarehouse &&
    !!manualCol &&
    !!manualRow &&
    !!manualFloor;

  // Shared by the manual Row/Position/Stand/Floor "Add pick" button and by
  // tapping a slot directly on the bin map — one tire selected in step 1 can
  // become several pick entries here, every selected tire type recorded
  // against the one given location, each keeping its own quantity.
  const addPickAtLocation = (locationLabel: string) => {
    if (selectedTires.length === 0 || !selectedWarehouse) return;
    setPickEntries((prev) => [
      ...prev,
      ...selectedTires.map((t) => ({
        key: `${t.material}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        material: t.material,
        description: t.description,
        brand: t.brand,
        plyRatingBottom: t.plyRatingBottom,
        warehouseLabel: selectedWarehouse.label,
        locationLabel,
        qty: t.qty,
        palletNo: t.palletNo,
      })),
    ]);
    // Tire selection is kept as-is — picking a location (button or map tap)
    // no longer clears it, so the same tire(s) stay selected and the map
    // stays open for picking another location, right up until Confirm.
    // Operators remove a tire from the selection manually (the X button) if
    // they're done with it before then.
  };

  const addPick = () => {
    if (!canAddPick || !selectedWarehouse) return;
    const locationLabel = `${selectedWarehouse.prefix}${String(Number(manualCol)).padStart(2, "0")}-${String(Number(manualRow)).padStart(2, "0")}-${STAND_IDS[0]}${manualFloor}`;
    addPickAtLocation(locationLabel);
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
    const rows: OutwardPick[] = pickEntries.map((p, idx) => ({
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

    const { error } = await insertOutwardPicks(rows);
    setSubmitting(false);
    if (error) {
      setConfirmError(`Failed to record outward pick: ${error}`);
      return;
    }

    void touchPlanNumber(planNo.trim(), "outward");

    setPickEntries([]);
    setSelectedTires([]);
    setSuccess(`${totalQty} tire${totalQty === 1 ? "" : "s"} across ${pickEntries.length} pick${pickEntries.length === 1 ? "" : "s"} recorded.`);
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

      {confirmError && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{confirmError}</div>}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">1. Plan details</h2>
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
                  setManualStand("");
                  setManualFloor("");
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
                  setManualStand("");
                  if (col && manualRow) {
                    const max = selectedWarehouse.columnRowCounts[Number(col) - 1] ?? 0;
                    if (Number(manualRow) > max) setManualRow("");
                  }
                  if (col && manualFloor && Number(manualFloor) > floorCountAt(selectedWarehouse, Number(col))) {
                    setManualFloor("");
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

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Select Floor</span>
              <SelectMenu
                value={manualFloor}
                placeholder="Select floor"
                options={floorOptions.map((f) => ({ value: String(f), label: `Floor ${f}` }))}
                onChange={setManualFloor}
              />
            </label>
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
        <h2 className="text-base font-medium text-foreground">4. Storage bins</h2>
        {!selectedWarehouse ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Choose a warehouse first.
          </div>
        ) : selectedTires.length === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Select a tire above, then tap a spot on the map to pick it from there.
          </div>
        ) : (
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
                        const hasPick = currentAreaCode === code;
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
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
          <MapPin className="size-4 text-muted-foreground" />
          5. Picks to record
        </h2>
        {pickEntries.length === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            No picks added yet — select a tire and location above, then "Add pick".
          </div>
        ) : (
          <>
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {pickEntries.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{p.description}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.material} · {p.warehouseLabel} · {p.locationLabel} · Qty {p.qty} · Pallet {p.palletNo}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePick(p.key)}
                    className="shrink-0 text-muted-foreground hover:text-danger"
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
        {submitting ? "Confirming…" : "OK - Confirm outward"}
      </button>

      <SuccessOverlay message={success} onDone={() => setSuccess(null)} />

      {pickerAreaCode && selectedWarehouse && (
        <StandFloorPicker
          areaCode={pickerAreaCode}
          standCount={standCountAt(selectedWarehouse, Number(pickerAreaCode.slice(selectedWarehouse.prefix.length).split("-")[0]))}
          floorCount={floorCountAt(selectedWarehouse, Number(pickerAreaCode.slice(selectedWarehouse.prefix.length).split("-")[0]))}
          slotCounts={{}}
          selectedCode={currentAreaCode === pickerAreaCode ? currentFullCode : null}
          onSelect={(code) => selectFromBinMap(pickerAreaCode, code)}
          onClose={() => setPickerAreaCode(null)}
        />
      )}

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
