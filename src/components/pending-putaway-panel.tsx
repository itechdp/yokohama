import { useEffect, useMemo, useRef, useState } from "react";
import { Warehouse as WarehouseIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/confirm-dialog";
import SelectMenu from "@/components/select-menu";
import { useAuth } from "@/contexts/auth-context";
import type { WarehouseDef } from "@/data/warehouse-bins";
import { cancelPending, fetchPendingPutaways } from "@/lib/inward-pending";
import { putAwayPallet } from "@/lib/inward-putaway";
import type { CaseNo, PendingPutaway } from "@/types/tire";

// The body of the Putaway page (/tires/putaway) - the forklift employee's side.
// Pick a pallet the cage has saved, choose Warehouse + Row + Position, confirm.
// Sheet no / date / shift / driver / SKU / pallet no / quantity come from the
// cage's record and can't be edited here; one pallet goes to one bin. Stock is
// created only when the putaway is confirmed (see putAwayPallet).
export default function PendingPutawayPanel({
  warehouses,
  caseNo,
  onCountChange,
  onPutAway,
}: {
  warehouses: WarehouseDef[];
  // Only this case's pallets are listed and can be put away (null = none chosen yet).
  caseNo: CaseNo | null;
  // Optional: lets a parent keep a count badge in step with the list.
  // eslint-disable-next-line no-unused-vars
  onCountChange?: (count: number) => void;
  // Called after a successful putaway so the page can refresh its own data.
  // eslint-disable-next-line no-unused-vars
  onPutAway: (message: string) => void;
}) {
  const { user } = useAuth();

  const [pending, setPending] = useState<PendingPutaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [warehouseKey, setWarehouseKey] = useState("");
  const [col, setCol] = useState("");
  const [row, setRow] = useState("");
  const [bin, setBin] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PendingPutaway | null>(null);

  // Only the newest request may update the list, so a slow answer for the
  // previous case can't overwrite the case now on screen.
  const requestId = useRef(0);

  const reload = async () => {
    if (!caseNo) {
      setPending([]);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    const { pallets, error: loadError } = await fetchPendingPutaways(caseNo);
    if (id !== requestId.current) return;
    // A failed read keeps the list already on screen and says so, instead of
    // showing an empty list as if nothing were waiting.
    if (loadError) setError(`Could not load pending pallets: ${loadError}`);
    else {
      setPending(pallets);
      onCountChange?.(pallets.length);
    }
    setLoading(false);
  };

  // Re-load whenever the case changes, and drop the selection and location
  // picked for the other case's pallet.
  useEffect(() => {
    setLoading(true);
    setPending([]);
    setSelectedId(null);
    setSearch("");
    setError(null);
    setCol("");
    setRow("");
    setBin(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseNo]);

  const selected = pending.find((p) => p.id === selectedId) ?? null;
  const selectedWarehouse = warehouses.find((w) => w.key === warehouseKey) ?? null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((p) => [p.planNo, p.palletNo, p.material, p.description].some((v) => v.toLowerCase().includes(q)));
  }, [pending, search]);

  const resetLocation = () => {
    setCol("");
    setRow("");
    setBin(null);
  };

  const columnOptions = selectedWarehouse
    ? selectedWarehouse.columnRowCounts.map((_, i) => ({ value: String(i + 1), label: String(i + 1).padStart(2, "0") }))
    : [];
  const rowOptions =
    selectedWarehouse && col
      ? Array.from({ length: selectedWarehouse.columnRowCounts[Number(col) - 1] ?? 0 }, (_, i) => ({
          value: String(i + 1),
          label: String(i + 1),
        }))
      : [];

  const addLocation = () => {
    if (!selectedWarehouse || !col || !row) return;
    setBin(`${selectedWarehouse.prefix}${String(Number(col)).padStart(2, "0")}-${String(Number(row)).padStart(2, "0")}`);
  };

  const confirmPutaway = async () => {
    if (busy || !selected || !selectedWarehouse || !bin) return;
    // A pallet of the other case is never put away from this view (pallets with
    // no case, saved before cases existed, can be placed under either).
    if (selected.caseNo && selected.caseNo !== caseNo) {
      setError(`Pallet ${selected.palletNo} belongs to Case ${selected.caseNo}. Switch case to put it away.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: putError, alreadyDone, location } = await putAwayPallet(selected.id, selectedWarehouse.key, bin, user?.id);
    setBusy(false);
    if (putError) {
      setError(putError);
      await reload();
      return;
    }
    if (alreadyDone) {
      // Someone else (or an earlier attempt of ours) already placed it - nothing was saved this time.
      setError(`Pallet ${selected.palletNo} was already put away${location ? ` at ${location}` : ""}. Nothing new was saved.`);
    } else {
      onPutAway(`Pallet ${selected.palletNo} put away at ${selectedWarehouse.label} - ${bin}.`);
    }
    // Take it off the list straight away, then confirm with the database.
    setPending((prev) => prev.filter((p) => p.id !== selected.id));
    setSelectedId(null);
    resetLocation();
    await reload();
  };

  const confirmCancel = async () => {
    const target = cancelTarget;
    setCancelTarget(null);
    if (!target) return;
    const { error: cancelError } = await cancelPending(target.id, user?.id);
    if (cancelError) setError(cancelError);
    if (selectedId === target.id) setSelectedId(null);
    await reload();
  };

  return (
    <>
      {error && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground">1. Select a pending pallet</h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sheet no, pallet no or SKU"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {!caseNo ? (
          <p className="text-sm text-muted-foreground">Select Case 1 or Case 2 above to see its pending pallets.</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {pending.length === 0 ? `No Case ${caseNo} pallets waiting for putaway.` : "No pallets match your search."}
          </p>
        ) : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {visible.map((p) => (
              <li key={p.id}>
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
                    p.id === selectedId ? "border-primary bg-primary-soft" : "border-border bg-card",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(p.id);
                      setError(null);
                      resetLocation();
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-medium text-foreground break-words">{p.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Pallet {p.palletNo} · Qty {p.quantity} · {p.material}
                      {p.caseNo ? "" : " · No case (saved before cases)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sheet {p.planNo} · {p.entryDate.split("-").reverse().join("/")} · Shift {p.shift}
                      {p.pickerName ? ` · ${p.pickerName}` : ""}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelTarget(p)}
                    disabled={busy}
                    aria-label={`Cancel pallet ${p.palletNo}`}
                    title="Remove this pallet (saved by mistake)"
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <h2 className="text-base font-medium text-foreground flex items-center gap-1.5">
              <WarehouseIcon className="size-4 text-muted-foreground" />
              2. Warehouse
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {warehouses.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => {
                    setWarehouseKey(w.key);
                    resetLocation();
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
            <h2 className="text-base font-medium text-foreground">3. Select storage location</h2>
            {!selectedWarehouse ? (
              <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">Choose a warehouse first.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Select Row</span>
                    <SelectMenu
                      value={col}
                      placeholder="Select row"
                      options={columnOptions}
                      onChange={(v) => {
                        setCol(v);
                        setRow("");
                        setBin(null);
                      }}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Select Position</span>
                    <SelectMenu
                      value={row}
                      placeholder="Select position"
                      options={rowOptions}
                      onChange={(v) => {
                        setRow(v);
                        setBin(null);
                      }}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={addLocation}
                  disabled={!col || !row}
                  className="w-full sm:w-auto rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {bin ? "Change Location" : "Add Location"}
                </button>
                {bin && (
                  <div className="flex items-center justify-center rounded-xl border border-success-border bg-success-soft px-10 py-3">
                    <span className="text-lg font-semibold tracking-wide text-foreground">{bin}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => void confirmPutaway()}
            disabled={busy || !selectedWarehouse || !bin}
            className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Putting away…" : `Confirm putaway · Pallet ${selected.palletNo} (${selected.quantity})`}
          </button>
        </>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        title="Remove this pallet?"
        message={
          cancelTarget
            ? `Pallet ${cancelTarget.palletNo} (${cancelTarget.description}, qty ${cancelTarget.quantity}) will be removed from the pending list. No stock is affected.`
            : ""
        }
        confirmLabel="Remove pallet"
        destructive
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelTarget(null)}
      />
    </>
  );
}
