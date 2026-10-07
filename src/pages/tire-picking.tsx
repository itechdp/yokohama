import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ClipboardList, MapPin, QrCode, X } from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import PlanNoPicker from "@/components/plan-no-picker";
import QrScanner from "@/components/qr-scanner";
import SelectMenu from "@/components/select-menu";
import StockLocationList, { buildStockCards, qtyToTake, type StockCard } from "@/components/stock-location-list";
import SuccessOverlay from "@/components/success-overlay";
import TireCatalogSearch from "@/components/tire-catalog-search";
import RequiredMark from "@/components/required-mark";
import type { WarehouseDef } from "@/data/warehouse-bins";
import { useStockLocations } from "@/hooks/use-stock-locations";
import { insertDeletedTires } from "@/lib/deleted-tires";
import { fetchOngoingPickingPlans, insertPicks, type OngoingPickingPlan } from "@/lib/picks";
import { getStoredPlanNo, setStoredPlanNo } from "@/lib/plan-no-draft";
import { deletePlanPendingTiresForTire } from "@/lib/plan-pending-tires";
import { fetchPreparedPlans, type PreparedPlan } from "@/lib/prepared-plans";
import { touchPlanNumber } from "@/lib/plan-numbers";
import { takeOutOfStock } from "@/lib/stock-out";
import { deleteTiresAtLocation, fetchTireBySkuQrCode } from "@/lib/tires";
import { fetchWarehouses } from "@/lib/warehouses";
import type { TireSkuRow } from "@/lib/supabase";
import type { DeletedTireRecord, PickingRecord } from "@/types/tire";

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
  // Plans made on the Prepare Plan page — listed in the same dropdown;
  // choosing one also selects all its tires in step 2.
  const [preparedPlans, setPreparedPlans] = useState<PreparedPlan[]>([]);
  const loadOngoingPlans = () => {
    fetchOngoingPickingPlans().then(setOngoingPlans);
    fetchPreparedPlans().then(setPreparedPlans);
  };
  const planOptions = [
    ...preparedPlans.map((p) => {
      const used = ongoingPlans.find((o) => o.planNo === p.planNo);
      return {
        value: p.planNo,
        label: [p.planNo, "Prepared", `${p.lines.length} tire${p.lines.length === 1 ? "" : "s"}`, used?.shift && `Shift ${used.shift}`]
          .filter(Boolean)
          .join(" · "),
      };
    }),
    ...ongoingPlans
      .filter((o) => !preparedPlans.some((p) => p.planNo === o.planNo))
      .map((o) => ({
        value: o.planNo,
        label: [o.planNo, o.pickerName, o.shift && `Shift ${o.shift}`].filter(Boolean).join(" · "),
      })),
  ];
  const selectOngoingPlan = (value: string) => {
    const prepared = preparedPlans.find((p) => p.planNo === value);
    if (prepared) {
      for (const { material, description, brand, plyRatingBottom } of prepared.lines) {
        addSelectedTire({ material, description, brand, plyRatingBottom });
      }
    }
    const plan = ongoingPlans.find((p) => p.planNo === value);
    if (!plan) {
      if (prepared) handlePlanNoChange(prepared.planNo);
      return;
    }
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
  // Location card currently being confirmed.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Card pending the "Delete this tire from this location?" confirm dialog.
  const [deleteTarget, setDeleteTarget] = useState<StockCard | null>(null);

  useEffect(() => {
    fetchWarehouses().then(setWarehouses);
    loadOngoingPlans();
  }, []);

  // Where the selected tires currently sit in stock — one card per location.
  const materials = useMemo(() => selectedTires.map((t) => t.material), [selectedTires]);
  const { stock, loading: stockLoading } = useStockLocations(materials, stockVersion);
  const cards = useMemo(() => buildStockCards(selectedTires, warehouses, stock), [selectedTires, warehouses, stock]);
  const chosen = cards.filter((c) => qtyToTake(takeQty, c) > 0);
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

  const blockedReason = !planNo.trim() || !shift ? "Fill in plan no and shift above first." : null;

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

  // Confirms one location card on its own: takes its quantity out of stock
  // and logs it straight away, so History's export picks it up.
  const handleTake = async (card: StockCard) => {
    const qty = qtyToTake(takeQty, card);
    const pallet = (palletNo[card.key] ?? "").trim();
    if (busyKey || qty === 0 || !pallet || blockedReason) return;
    setBusyKey(card.key);
    setSuccess(null);
    setConfirmError(null);

    const now = new Date().toISOString();
    const trimmedPlanNo = planNo.trim();

    // 1. Take the tires out of stock.
    const { error: stockError } = await takeOutOfStock(
      [{ material: card.material, location: card.location, qty }],
      { flow: "Picking", planNo: trimmedPlanNo, movedBy: "Forklift operator", at: now },
    );
    if (stockError) {
      setConfirmError(stockError);
      setStockVersion((v) => v + 1);
      setBusyKey(null);
      return;
    }

    // 2. The pick log History and the export read back.
    const row: PickingRecord = {
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      material: card.material,
      description: card.description,
      warehouse: card.warehouseLabel,
      location: card.code,
      quantity: qty,
      planNo: trimmedPlanNo,
      palletNo: pallet,
      shift,
      pickerName: pickerName.trim(),
      pickedAt: now,
      pickedBy: "Forklift operator",
      notes: "",
    };
    const { error } = await insertPicks([row]);
    if (error) {
      setConfirmError(`Tires were taken out of stock, but the pick record failed to save: ${error}`);
    }

    void touchPlanNumber(trimmedPlanNo, "picking");
    loadOngoingPlans();

    // Clear just this card; the rest stay as set for the next one.
    const drop = <T,>(prev: Record<string, T>) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== card.key));
    setTakeQty(drop);
    setPalletNo(drop);
    setStockVersion((v) => v + 1);
    setBusyKey(null);
    setSuccess(`${qty} tire${qty === 1 ? "" : "s"} picked from ${card.code}.`);
  };

  // Permanently wipes every unit of a tire out of one location — not a
  // Pick (the tires never go through dispatch), used for stock that should
  // simply no longer exist here (e.g. damaged/scrapped). Also clears any
  // outstanding plan_pending_tires reservation for this tire under the
  // current plan no, and logs the deletion for History's "Deleted" tab.
  const confirmDeleteCard = async () => {
    const card = deleteTarget;
    if (!card || busyKey) return;
    setBusyKey(card.key);
    setSuccess(null);
    setConfirmError(null);

    const trimmedPlanNo = planNo.trim();

    const { deletedCount, error: deleteError } = await deleteTiresAtLocation(card.material, card.location);
    if (deleteError) {
      setConfirmError(deleteError);
      setDeleteTarget(null);
      setBusyKey(null);
      return;
    }

    await deletePlanPendingTiresForTire(trimmedPlanNo, card.material);

    const row: DeletedTireRecord = {
      id: `del-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      material: card.material,
      description: card.description,
      warehouse: card.warehouseLabel,
      location: card.code,
      quantity: deletedCount,
      planNo: trimmedPlanNo,
      pickerName: pickerName.trim(),
      deletedAt: new Date().toISOString(),
      deletedBy: pickerName.trim(),
      notes: "",
    };
    const { error: logError } = await insertDeletedTires([row]);
    if (logError) {
      setConfirmError(`Tire was deleted, but the deletion record failed to save: ${logError}`);
    }

    setDeleteTarget(null);
    setStockVersion((v) => v + 1);
    setBusyKey(null);
    setSuccess(`${deletedCount} tire${deletedCount === 1 ? "" : "s"} deleted from ${card.code}.`);
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
            <span className="text-sm font-medium text-foreground">Plan No<RequiredMark /></span>
            <PlanNoPicker value={planNo} onChange={handlePlanNoChange} kind="picking" />
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className="text-sm font-medium text-foreground">Ongoing plan</span>
            <SelectMenu
              value={planOptions.some((o) => o.value === planNo.trim()) ? planNo.trim() : ""}
              placeholder={planOptions.length === 0 ? "No plans yet" : "Select ongoing plan"}
              options={planOptions}
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
          <span className="text-sm font-medium text-foreground">Shift<RequiredMark /></span>
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
          actionLabel="Pick"
          onAction={handleTake}
          busyKey={busyKey}
          blockedReason={blockedReason}
          onDeleteRequest={setDeleteTarget}
        />
      </div>


      <SuccessOverlay message={success} onDone={() => setSuccess(null)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this tire from this location?"
        message={
          deleteTarget
            ? `This permanently removes all ${deleteTarget.inStock} of ${deleteTarget.material} at ${deleteTarget.code} from stock. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDeleteCard()}
        onCancel={() => setDeleteTarget(null)}
      />

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
