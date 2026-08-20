import { useMemo, useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import SelectMenu from "@/components/select-menu";
import { cn } from "@/lib/utils";
import { locationForBin, type WarehouseDef } from "@/data/warehouse-bins";
import { insertPlacementLogs } from "@/lib/placement-logs";
import { insertTireHistory } from "@/lib/tire-history";
import { upsertTires } from "@/lib/tires";
import type { PlacementLog, StageHistory, Tire } from "@/types/tire";

interface LocationForm {
  warehouseKey: string;
  material: string;
  col: string;
  row: string;
  bin: string | null;
}

const emptyForm = (): LocationForm => ({ warehouseKey: "", material: "", col: "", row: "", bin: null });

const pad2 = (n: number) => String(n).padStart(2, "0");

// Popup for swapping what's stored at one bin with what's stored at another —
// triggered from an icon button on Inward rather than living on its own page.
// From/To each resolve to a single bin through the same Select Row (stand) /
// Select Position (level) / Add Location flow Inward already uses elsewhere.
export default function ExchangeLocationModal({
  open,
  onClose,
  warehouses,
  tires,
  onTiresUpdated,
}: {
  open: boolean;
  onClose: () => void;
  warehouses: WarehouseDef[];
  tires: Tire[];
  onTiresUpdated: (updated: Tire[]) => void;
}) {
  const [fromForm, setFromForm] = useState<LocationForm>(emptyForm());
  const [toForm, setToForm] = useState<LocationForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setFromForm(emptyForm());
    setToForm(emptyForm());
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const fromWarehouse = warehouses.find((w) => w.key === fromForm.warehouseKey) || null;
  const toWarehouse = warehouses.find((w) => w.key === toForm.warehouseKey) || null;
  const fromLocation = fromWarehouse && fromForm.bin ? locationForBin(fromWarehouse, fromForm.bin) : null;
  const toLocation = toWarehouse && toForm.bin ? locationForBin(toWarehouse, toForm.bin) : null;

  const handleConfirm = async () => {
    if (submitting || !fromLocation || !toLocation) return;
    if (fromLocation === toLocation) {
      setError("From and To are the same location.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const tiresAtFrom = tires.filter((t) => t.currentStage === "warehouse" && t.location === fromLocation);
    const tiresAtTo = tires.filter((t) => t.currentStage === "warehouse" && t.location === toLocation);
    if (tiresAtFrom.length === 0 && tiresAtTo.length === 0) {
      setError("Both locations are empty — nothing to exchange.");
      setSubmitting(false);
      return;
    }

    const now = new Date().toISOString();
    const movedFromFrom = tiresAtFrom.map((t) => ({ ...t, location: toLocation, updatedAt: now }));
    const movedFromTo = tiresAtTo.map((t) => ({ ...t, location: fromLocation, updatedAt: now }));
    const updatedTires = [...movedFromFrom, ...movedFromTo];

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
      ...tiresAtFrom.map((t, i) => historyFor(t, fromLocation, toLocation, i)),
      ...tiresAtTo.map((t, i) => historyFor(t, toLocation, fromLocation, tiresAtFrom.length + i)),
    ];
    const newLogs = [
      ...tiresAtFrom.map((t, i) => logFor(t, fromLocation, toLocation, i)),
      ...tiresAtTo.map((t, i) => logFor(t, toLocation, fromLocation, tiresAtFrom.length + i)),
    ];

    await insertTireHistory(newHistory);
    await insertPlacementLogs(newLogs);

    onTiresUpdated(updatedTires);
    setSubmitting(false);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card p-4 sm:p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="size-5 text-primary" />
            Exchange Location
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          <div className="flex-1 min-w-0">
            <LocationFormCard title="From" warehouses={warehouses} tires={tires} showTireSelect form={fromForm} onChange={setFromForm} />
          </div>

          <div className="hidden sm:flex items-center justify-center px-1">
            <div className="rounded-full border border-border bg-muted p-2 text-muted-foreground">
              <ArrowLeftRight className="size-4" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <LocationFormCard title="To" warehouses={warehouses} tires={tires} form={toForm} onChange={setToForm} />
          </div>
        </div>

        {error && <p className="text-xs text-danger text-center">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!fromLocation || !toLocation || submitting}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Exchanging…" : "Done - Exchange location"}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function LocationFormCard({
  title,
  warehouses,
  tires,
  showTireSelect,
  form,
  onChange,
}: {
  title: string;
  warehouses: WarehouseDef[];
  tires: Tire[];
  showTireSelect?: boolean;
  form: LocationForm;
  onChange: (next: LocationForm) => void;
}) {
  const warehouse = warehouses.find((w) => w.key === form.warehouseKey) || null;

  // Tires currently sitting in this warehouse — the "Select Tire" list, and
  // the source for filtering Row/Position down to only where that tire is.
  const tiresInWarehouse = useMemo(
    () => (warehouse ? tires.filter((t) => t.currentStage === "warehouse" && t.location.startsWith(`${warehouse.label} - Bin `)) : []),
    [warehouse, tires],
  );

  const tireOptions = useMemo(() => {
    const seen = new Map<string, string>(); // material (serialNumber) -> model
    for (const t of tiresInWarehouse) {
      if (!seen.has(t.serialNumber)) seen.set(t.serialNumber, t.model);
    }
    return Array.from(seen.entries()).map(([material, model]) => ({ material, model }));
  }, [tiresInWarehouse]);

  // Bin codes that actually hold the selected tire, so Row/Position only
  // offer positions where it's really sitting.
  const binsWithTire = useMemo(() => {
    if (!warehouse || !form.material) return new Set<string>();
    const prefix = `${warehouse.label} - Bin `;
    const set = new Set<string>();
    for (const t of tiresInWarehouse) {
      if (t.serialNumber === form.material) set.add(t.location.slice(prefix.length));
    }
    return set;
  }, [warehouse, form.material, tiresInWarehouse]);

  const tireGate = !!showTireSelect && !form.material;

  const columnOptions = useMemo(() => {
    if (!warehouse || tireGate) return [];
    const all = warehouse.columnRowCounts.map((_, i) => i + 1);
    if (!showTireSelect) return all;
    return all.filter((c) => Array.from(binsWithTire).some((code) => code.startsWith(`${warehouse.prefix}${pad2(c)}-`)));
  }, [warehouse, tireGate, showTireSelect, binsWithTire]);

  const rowOptions = useMemo(() => {
    if (!warehouse || !form.col) return [];
    const max = warehouse.columnRowCounts[Number(form.col) - 1] ?? 0;
    const all = Array.from({ length: max }, (_, i) => i + 1);
    if (!showTireSelect) return all;
    return all.filter((r) => binsWithTire.has(`${warehouse.prefix}${pad2(Number(form.col))}-${pad2(r)}`));
  }, [warehouse, form.col, showTireSelect, binsWithTire]);

  const setBin = () => {
    if (!warehouse || !form.col || !form.row) return;
    const bin = `${warehouse.prefix}${pad2(Number(form.col))}-${pad2(Number(form.row))}`;
    onChange({ ...form, bin });
  };

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2.5">
      <p className="text-sm font-semibold text-foreground">{title}</p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Warehouse</label>
        <SelectMenu
          value={form.warehouseKey}
          placeholder="Select warehouse"
          options={warehouses.map((w) => ({ value: w.key, label: w.label }))}
          onChange={(v) => onChange({ ...emptyForm(), warehouseKey: v })}
        />
      </div>

      {showTireSelect && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Select Tire</label>
          <SelectMenu
            value={form.material}
            disabled={!warehouse}
            placeholder={warehouse && tireOptions.length === 0 ? "No tires in this warehouse" : "Select tire"}
            options={tireOptions.map(({ material, model }) => ({ value: material, label: `${model} · ${material}` }))}
            onChange={(v) => onChange({ ...form, material: v, col: "", row: "", bin: null })}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Select Row</label>
          <SelectMenu
            value={form.col}
            disabled={!warehouse || tireGate}
            placeholder="Select row"
            options={columnOptions.map((c) => ({ value: String(c), label: pad2(c) }))}
            onChange={(v) => onChange({ ...form, col: v, row: "", bin: null })}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Select Position</label>
          <SelectMenu
            value={form.row}
            disabled={!form.col}
            placeholder="Select position"
            options={rowOptions.map((r) => ({ value: String(r), label: String(r) }))}
            onChange={(v) => onChange({ ...form, row: v, bin: null })}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={setBin}
        disabled={!form.col || !form.row}
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          form.bin ? "border-success/30 bg-success/10 text-success" : "border-border bg-card text-foreground hover:bg-muted",
        )}
      >
        {form.bin ? `Location: ${form.bin}` : "Add Location"}
      </button>
    </div>
  );
}
