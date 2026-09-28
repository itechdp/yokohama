import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ClipboardList, MapPin, QrCode, X } from "lucide-react";
import PlanNoPicker from "@/components/plan-no-picker";
import QrScanner from "@/components/qr-scanner";
import SelectMenu from "@/components/select-menu";
import StockLocationList, { buildStockCards, qtyToTake } from "@/components/stock-location-list";
import SuccessOverlay from "@/components/success-overlay";
import TireCatalogSearch from "@/components/tire-catalog-search";
import type { WarehouseDef } from "@/data/warehouse-bins";
import { useStockLocations } from "@/hooks/use-stock-locations";
import { fetchOngoingPickingPlans, insertPicks, type OngoingPickingPlan } from "@/lib/picks";
import { getStoredPlanNo, setStoredPlanNo } from "@/lib/plan-no-draft";
import { touchPlanNumber } from "@/lib/plan-numbers";
import { takeOutOfStock } from "@/lib/stock-out";
import { fetchTireBySkuQrCode } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { TireSkuRow } from "@/lib/supabase";
import type { PickingRecord } from "@/types/tire";

// Selecting a tire lists every place it's in stock as a card, each with its
// own quantity; confirming takes those quantities out of stock (see
// takeOutOfStock), so Stock drops by exactly what was picked.

// A tire type selected for this pick batch.
interface SelectedTire {
  key: string;
  material: string;
  description: string;
  brand?: string;
  plyRatingBottom?: string;
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
  // Quantity to take per location card, keyed by stockCardKey.
  const [takeQty, setTakeQty] = useState<Record<string, number>>({});
  // Pallet no per location card, keyed by stockCardKey.
  const [palletNo, setPalletNo] = useState<Record<string, string>>({});
  const [scanningTire, setScanningTire] = useState(false);
  // Bumped after every confirm so stock counts refresh.
  const [stockVersion, setStockVersion] = useState(0);

  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    fetchWarehouses().then(setWarehouses);
    loadOngoingPlans();
  }, []);

  // Where the selected tires currently sit in stock — one card per location.
  const materials = useMemo(() => selectedTires.map((t) => t.material), [selectedTires]);
  const { stock, loading: stockLoading } = useStockLocations(materials, stockVersion);
  const cards = useMemo(() => buildStockCards(selectedTires, warehouses, stock), [selectedTires, warehouses, stock]);
  const chosen = cards.filter((c) => qtyToTake(takeQty, c) > 0);
  const totalQty = chosen.reduce((sum, c) => sum + qtyToTake(takeQty, c), 0);
  const takingFor = (material: string) =>
    chosen.filter((c) => c.material === material).reduce((sum, c) => sum + qtyToTake(takeQty, c), 0);

  const addSelectedTire = (entry: { material: string; description: string; brand?: string; plyRatingBottom?: string }) => {
    setSelectedTires((prev) => {
      if (prev.some((t) => t.material === entry.material)) return prev;
      return [...prev, { key: entry.material, ...entry }];
    });
  };

  const removeSelectedTire = (key: string) => {
    setSelectedTires((prev) => prev.filter((t) => t.key !== key));
    const keep = ([k]: [string, unknown]) => !k.startsWith(`${key}|`);
    setTakeQty((prev) => Object.fromEntries(Object.entries(prev).filter(keep)));
    setPalletNo((prev) => Object.fromEntries(Object.entries(prev).filter(keep)));
  };

  // Every location being taken from needs a pallet no.
  const missingPallet = chosen.some((c) => !(palletNo[c.key] ?? "").trim());

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
    if (submitting || chosen.length === 0) return;
    if (!planNo.trim() || !shift) {
      setConfirmError("Fill in plan no and shift before confirming.");
      return;
    }
    if (missingPallet) {
      setConfirmError("Fill in the pallet no for every location being picked from.");
      return;
    }
    setSubmitting(true);
    setSuccess(null);
    setConfirmError(null);

    const now = new Date().toISOString();
    const trimmedPlanNo = planNo.trim();

    // 1. Take the tires out of stock (all-or-nothing).
    const { error: stockError } = await takeOutOfStock(
      chosen.map((c) => ({ material: c.material, location: c.location, qty: qtyToTake(takeQty, c) })),
      { flow: "Picking", planNo: trimmedPlanNo, movedBy: "Forklift operator", at: now },
    );
    if (stockError) {
      setConfirmError(stockError);
      setStockVersion((v) => v + 1);
      setSubmitting(false);
      return;
    }

    // 2. The pick log History and the PICK SHEET export read back.
    const rows: PickingRecord[] = chosen.map((c, idx) => ({
      id: `op-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      material: c.material,
      description: c.description,
      warehouse: c.warehouseLabel,
      location: c.code,
      quantity: qtyToTake(takeQty, c),
      planNo: trimmedPlanNo,
      palletNo: (palletNo[c.key] ?? "").trim(),
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

    void touchPlanNumber(trimmedPlanNo, "picking");
    loadOngoingPlans();

    setTakeQty({});
    setPalletNo({});
    setSelectedTires([]);
    setStockVersion((v) => v + 1);
    setSubmitting(false);
    setSuccess(`${totalQty} tire${totalQty === 1 ? "" : "s"} picked from ${chosen.length} location${chosen.length === 1 ? "" : "s"}.`);
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
                <p className="text-xs text-muted-foreground">Picking {takingFor(t.material)} — set quantities and pallet no on the locations below.</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
          <MapPin className="size-4 text-muted-foreground" />
          3. Pick from
        </h2>
        <StockLocationList
          tires={selectedTires}
          cards={cards}
          loading={stockLoading}
          qty={takeQty}
          onQtyChange={(key, value) => setTakeQty((prev) => ({ ...prev, [key]: value }))}
          palletNo={palletNo}
          onPalletNoChange={(key, value) => setPalletNo((prev) => ({ ...prev, [key]: value }))}
        />
        {totalQty > 0 && (
          <p className="text-xs text-muted-foreground">
            {totalQty} tire{totalQty === 1 ? "" : "s"} from {chosen.length} location{chosen.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <button
        onClick={handleConfirm}
        disabled={totalQty === 0 || !planNo.trim() || !shift || missingPallet || submitting}
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
