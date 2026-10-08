import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Check, ChevronDown, ClipboardPen, Download, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/confirm-dialog";
import PlanUploadModal from "@/components/plan-upload-modal";
import QtyStepper from "@/components/qty-stepper";
import RequiredMark from "@/components/required-mark";
import TireCatalogSearch from "@/components/tire-catalog-search";
import { exportPreparedPlanExcel } from "@/lib/prepared-plan-export";
import {
  deletePreparedPlan,
  fetchPreparedPlans,
  savePreparedPlan,
  type PreparedPlan,
  type PreparedPlanLine,
} from "@/lib/prepared-plans";
import type { TireSkuRow } from "@/lib/supabase";

// Plans made ahead of time: a Plan No plus the tires it needs (Material,
// description filled in from the catalog, quantity). Saved plans show up in
// the Ongoing plan dropdown on Picking and Outward.

interface PlanForm {
  id: string;
  planNo: string;
  lines: PreparedPlanLine[];
}

const newId = () => `pp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const totalQty = (lines: PreparedPlanLine[]) => lines.reduce((sum, l) => sum + l.qty, 0);

export default function PreparePlan() {
  const [plans, setPlans] = useState<PreparedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PreparedPlan | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleDownload = async (p: PreparedPlan) => {
    if (downloadingId) return;
    setDownloadingId(p.id);
    setError(null);
    try {
      await exportPreparedPlanExcel(p);
    } catch {
      setError(`Couldn't download plan ${p.planNo}. Please try again.`);
    } finally {
      setDownloadingId(null);
    }
  };

  const load = () =>
    fetchPreparedPlans().then((rows) => {
      setPlans(rows);
      setLoading(false);
    });

  useEffect(() => {
    load();
  }, []);

  const startAdd = () => {
    setForm({ id: newId(), planNo: "", lines: [] });
    setIsNew(true);
    setError(null);
  };

  const startEdit = (p: PreparedPlan) => {
    setForm({ id: p.id, planNo: p.planNo, lines: p.lines.map((l) => ({ ...l })) });
    setIsNew(false);
    setError(null);
  };

  const cancelForm = () => {
    setForm(null);
    setError(null);
  };

  const addLine = (sku: TireSkuRow) =>
    setForm((f) =>
      f && !f.lines.some((l) => l.material === sku.material)
        ? {
            ...f,
            lines: [
              ...f.lines,
              {
                material: sku.material,
                description: sku.description,
                brand: sku.brand ?? undefined,
                plyRatingBottom: sku.ply_rating_bottom ?? undefined,
                qty: 1,
              },
            ],
          }
        : f,
    );

  const setLineQty = (material: string, qty: number) =>
    setForm((f) => (f ? { ...f, lines: f.lines.map((l) => (l.material === material ? { ...l, qty } : l)) } : f));

  const removeLine = (material: string) =>
    setForm((f) => (f ? { ...f, lines: f.lines.filter((l) => l.material !== material) } : f));

  const canSave = !!form && !!form.planNo.trim() && form.lines.length > 0 && !saving;

  const handleSave = async () => {
    if (!form || !canSave) return;
    const planNo = form.planNo.trim();
    if (plans.some((p) => p.id !== form.id && p.planNo === planNo)) {
      setError(`Plan No ${planNo} already exists.`);
      return;
    }
    setSaving(true);
    setError(null);
    const { error: saveError } = await savePreparedPlan({ ...form, planNo });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setForm(null);
    setExpanded(form.id);
    load();
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    const { error: deleteError } = await deletePreparedPlan(target.id);
    if (deleteError) setError(deleteError);
    load();
  };

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardPen className="size-6 text-primary" />
          Prepare Plan
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          {!form && (
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setUploadOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Upload className="size-4" />
              Upload
            </button>
          )}
          {!form && (
            <button
              type="button"
              onClick={startAdd}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition-colors"
            >
              <Plus className="size-4" />
              Add Plan
            </button>
          )}
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Back
          </Link>
        </div>
      </div>

      {error && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {notice && <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{notice}</div>}

      {form && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          <h2 className="text-base font-medium text-foreground">{isNew ? "New plan" : `Edit plan ${form.planNo}`}</h2>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Plan No
              <RequiredMark />
            </span>
            <input
              type="text"
              value={form.planNo}
              onChange={(e) => setForm((f) => (f ? { ...f, planNo: e.target.value } : f))}
              placeholder="Enter plan no"
              autoComplete="off"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Tires
              <RequiredMark />
            </p>
            {form.lines.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {form.lines.map((l) => (
                  <li key={l.material} className="px-3 py-2.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{l.description}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[l.material, l.brand, l.plyRatingBottom].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(l.material)}
                        className="shrink-0 text-muted-foreground hover:text-danger"
                        aria-label={`Remove ${l.description}`}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <QtyStepper value={l.qty} min={1} onChange={(v) => setLineQty(l.material, v)} />
                  </li>
                ))}
              </ul>
            )}
            <TireCatalogSearch alreadySelected={form.lines.map((l) => l.material)} onSelect={addLine} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {saving ? "Saving…" : "Save plan"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            {form.lines.length > 0 && (
              <p className="ml-auto text-xs text-muted-foreground">
                {form.lines.length} tire{form.lines.length === 1 ? "" : "s"} · {totalQty(form.lines)} qty
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-base font-medium text-foreground">Prepared plans</h2>
        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading plans…
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No plans yet — tap "Add Plan" to prepare one.
          </div>
        ) : (
          plans.map((p) => {
            const open = expanded === p.id;
            return (
              <div key={p.id} className="rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : p.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={open}
                  >
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">Plan {p.planNo}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.lines.length} tire{p.lines.length === 1 ? "" : "s"} · {totalQty(p.lines)} qty ·{" "}
                        {new Date(p.createdAt).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(p)}
                    disabled={downloadingId !== null}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40 transition-colors"
                    aria-label={`Download plan ${p.planNo} as Excel`}
                    title="Download Excel"
                  >
                    {downloadingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    disabled={!!form}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40 transition-colors"
                    aria-label={`Edit plan ${p.planNo}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(p)}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:border-danger hover:text-danger transition-colors"
                    aria-label={`Delete plan ${p.planNo}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {open && (
                  <ul className="divide-y divide-border border-t border-border">
                    {p.lines.map((l) => (
                      <li key={l.material} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{l.description}</p>
                          <p className="text-xs text-muted-foreground truncate">{l.material}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                          Qty {l.qty}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      <PlanUploadModal
        open={uploadOpen}
        existingPlanNos={plans.map((p) => p.planNo)}
        onClose={() => setUploadOpen(false)}
        onSaved={(message) => {
          setNotice(message);
          load();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete plan ${deleteTarget.planNo}?` : ""}
        message="It will no longer show up in the Picking and Outward ongoing plan lists. Tires already picked or sent out under it are not affected."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
