import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Ban, LockOpen, X } from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import SuccessOverlay from "@/components/success-overlay";
import TireCatalogSearch from "@/components/tire-catalog-search";
import { useAuth } from "@/contexts/auth-context";
import { fetchBayBookings } from "@/lib/bay-bookings";
import {
  addPlanBlockTire,
  fetchPlanBlockTires,
  isBlocked,
  MAX_BLOCK_QTY,
  parseBlockQty,
  unblockPlanBlockTire,
  unblockPlanBlockTires,
} from "@/lib/plan-block-tires";
import type { TireSkuRow } from "@/lib/supabase";
import type { PlanBlockTire } from "@/types/tire";

// Block Tyres, step 2: pick a tyre (SKU) and a quantity for one plan, then Save.
// Saved records are never edited or deleted: a tyre can be blocked, and later
// unblocked (the record stays in History, marked Unblocked).
export default function BlockTyreDetail() {
  const { planNo = "" } = useParams<{ planNo: string }>();
  const { user } = useAuth();
  const [entries, setEntries] = useState<PlanBlockTire[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null until the bays have loaded; a plan that is on no bay can't be blocked.
  const [planOnBay, setPlanOnBay] = useState<boolean | null>(null);

  const [picked, setPicked] = useState<TireSkuRow | null>(null);
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchBayBookings().then((bays) => setPlanOnBay(bays.some((b) => b.planNo.trim() === planNo)));
    fetchPlanBlockTires({ planNo }).then(({ rows, error }) => {
      setEntries(rows);
      setLoadError(error);
    });
  }, [planNo]);

  const blockedEntries = entries.filter(isBlocked);
  const unblockedEntries = entries.filter((e) => !isBlocked(e));
  const total = blockedEntries.reduce((sum, t) => sum + t.qty, 0);
  // Only a tyre that is still blocked counts as a duplicate; an unblocked one can be blocked again.
  const existingFor = (material: string) => blockedEntries.find((e) => e.material.trim().toLowerCase() === material.trim().toLowerCase());

  // What the confirm dialog is asking about: one SKU row, or every blocked tyre of the plan.
  const [unblockTarget, setUnblockTarget] = useState<PlanBlockTire | "all" | null>(null);
  const [unblocking, setUnblocking] = useState(false);

  const reloadEntries = async () => {
    const { rows, error } = await fetchPlanBlockTires({ planNo });
    if (!error) setEntries(rows);
    setLoadError(error);
  };

  const confirmUnblock = async () => {
    const target = unblockTarget;
    if (!target || unblocking) return;
    setUnblocking(true);
    setFormError(null);
    const by = user?.username ?? "";
    if (target === "all") {
      const { count, error } = await unblockPlanBlockTires(planNo, by);
      if (error) setFormError(`Could not unblock: ${error}`);
      else setSuccess(`${count} tyre record${count === 1 ? "" : "s"} unblocked for plan ${planNo}.`);
    } else {
      const { error } = await unblockPlanBlockTire(target.id, by);
      if (error) setFormError(`Could not unblock: ${error}`);
      else setSuccess(`${target.material} unblocked for plan ${planNo}.`);
    }
    await reloadEntries();
    setUnblocking(false);
    setUnblockTarget(null);
  };

  const handlePick = (sku: TireSkuRow) => {
    setFormError(null);
    const existing = existingFor(sku.material);
    if (existing) {
      setPicked(null);
      setFormError(`${sku.material} is already blocked under plan ${planNo} (qty ${existing.qty}). Saved records can't be changed.`);
      return;
    }
    setPicked(sku);
  };

  const handleSave = async () => {
    if (saving || !picked) return;
    setFormError(null);
    const qtyNum = parseBlockQty(qty);
    if (qtyNum === null) {
      setFormError(`Enter a whole number of tyres from 1 to ${MAX_BLOCK_QTY}.`);
      return;
    }
    const existing = existingFor(picked.material);
    if (existing) {
      setFormError(`${picked.material} is already blocked under plan ${planNo} (qty ${existing.qty}). Saved records can't be changed.`);
      return;
    }
    setSaving(true);
    const result = await addPlanBlockTire({
      planNo,
      material: picked.material,
      description: picked.description,
      qty: qtyNum,
      createdBy: user?.username ?? "",
    });
    setSaving(false);
    if (!result.ok) {
      if (result.duplicate && result.existing) setEntries((prev) => (prev.some((e) => e.id === result.existing!.id) ? prev : [result.existing!, ...prev]));
      setFormError(result.error);
      return;
    }
    setEntries((prev) => [result.row, ...prev]);
    setSuccess(`${qtyNum} × ${picked.material} blocked for plan ${planNo}.`);
    setPicked(null);
    setQty("");
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-xl mx-auto">
      <Link to="/bays/block" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Block Tyres by Plan
      </Link>

      <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <Ban className="size-6 text-primary" />
        Plan {planNo}
      </h1>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{total > 0 ? `${total} tyre blocked` : "No tyre blocked"}</p>
        {blockedEntries.length > 0 && (
          <button
            type="button"
            onClick={() => setUnblockTarget("all")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <LockOpen className="size-4" />
            Unblock all
          </button>
        )}
      </div>

      {planOnBay === false ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Plan {planNo} isn't entered on any bay, so tyres can't be blocked for it.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h2 className="text-base font-medium text-foreground">Block a tyre</h2>
          <TireCatalogSearch alreadySelected={[]} onSelect={handlePick} />

          {picked && (
            <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{picked.material}</p>
                  <p className="text-xs text-muted-foreground break-words">{picked.description}</p>
                </div>
                <button type="button" onClick={() => setPicked(null)} aria-label="Clear selected tyre" className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
                  placeholder="Qty"
                  className="w-24 rounded-lg border border-border bg-transparent px-3 py-2 text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !qty}
                  className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          {formError && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}
        </div>
      )}

      {loadError && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Could not load saved records: {loadError}</p>}

      {blockedEntries.length > 0 && (
        <ul className="space-y-2">
          {blockedEntries.map((e) => (
            <li key={e.id} className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{e.material}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium text-foreground">Qty {e.qty}</span>
                  <button
                    type="button"
                    onClick={() => setUnblockTarget(e)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    aria-label={`Unblock ${e.material}`}
                  >
                    <LockOpen className="size-3.5" />
                    Unblock
                  </button>
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{e.description}</p>
            </li>
          ))}
        </ul>
      )}

      {unblockedEntries.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Unblocked earlier</h2>
          <ul className="space-y-2">
            {unblockedEntries.map((e) => (
              <li key={e.id} className="rounded-xl border border-border bg-muted px-4 py-3 opacity-70">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{e.material}</span>
                  <span className="shrink-0 text-sm text-foreground">Qty {e.qty} · Unblocked</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{e.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={unblockTarget !== null}
        title="Unblock tyres?"
        message={
          unblockTarget === "all"
            ? `All ${total} blocked tyres under plan ${planNo} will be unblocked. The records stay in History.`
            : unblockTarget
              ? `${unblockTarget.qty} × ${unblockTarget.material} will be unblocked for plan ${planNo}. The record stays in History.`
              : ""
        }
        confirmLabel={unblocking ? "Unblocking…" : "Unblock"}
        onConfirm={confirmUnblock}
        onCancel={() => (unblocking ? undefined : setUnblockTarget(null))}
      />

      <SuccessOverlay message={success} onDone={() => setSuccess(null)} />
    </div>
  );
}
