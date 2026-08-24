import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Check, Grid3x3, Pencil, Plus, Trash2, Warehouse as WarehouseIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/confirm-dialog";
import { deleteWarehouse, fetchWarehouses, upsertWarehouse } from "@/lib/warehouses";
import { FLOOR_COUNT, STAND_IDS, type WarehouseDef } from "@/data/warehouse-bins";

function emptyForm(): WarehouseDef {
  return { key: "", label: "", prefix: "", columnRowCounts: [10] };
}

// Stand count (1, 2, or 3) for a column, defaulting to 1 when the warehouse
// hasn't configured it yet.
function standCountForColumn(form: WarehouseDef, colIndex: number): number {
  return form.columnStandCounts?.[colIndex] ?? 1;
}

// Floor count for a column, defaulting to FLOOR_COUNT when the warehouse
// hasn't configured it yet.
function floorCountForColumn(form: WarehouseDef, colIndex: number): number {
  return form.columnFloorCounts?.[colIndex] ?? FLOOR_COUNT;
}

function slugify(label: string): string {
  return label
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Turns "Warehouse 3" into a unique key like "Warehouse-3", appending
// "-2", "-3"... if that slug is already taken by another warehouse.
function uniqueKeyFromLabel(label: string, existing: WarehouseDef[]): string {
  const base = slugify(label) || "warehouse";
  const taken = new Set(existing.map((w) => w.key));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);
  const [form, setForm] = useState<WarehouseDef | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseDef | null>(null);
  const columnsContainerRef = useRef<HTMLDivElement>(null);

  const load = () => {
    fetchWarehouses().then(setWarehouses);
  };

  useEffect(() => {
    load();
  }, []);

  const startAdd = () => {
    setForm(emptyForm());
    setIsNew(true);
    setError(null);
  };

  const startEdit = (w: WarehouseDef) => {
    setForm({
      ...w,
      columnRowCounts: [...w.columnRowCounts],
      columnStandCounts: w.columnStandCounts ? [...w.columnStandCounts] : undefined,
      columnFloorCounts: w.columnFloorCounts ? [...w.columnFloorCounts] : undefined,
    });
    setIsNew(false);
    setError(null);
  };

  const cancelForm = () => {
    setForm(null);
    setError(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const key = deleteTarget.key;
    setDeleteTarget(null);
    setWarehouses((prev) => prev.filter((w) => w.key !== key));
    await deleteWarehouse(key);
  };

  const updateColumn = (index: number, value: number) => {
    setForm((f) => {
      if (!f) return f;
      const columnRowCounts = f.columnRowCounts.map((v, i) => (i === index ? value : v));
      return { ...f, columnRowCounts };
    });
  };

  const addColumn = () => {
    setForm((f) => (f ? { ...f, columnRowCounts: [...f.columnRowCounts, 10] } : f));
    // New column always lands at the end — scroll it into view once the DOM
    // has the new card so operators don't have to hunt for it.
    requestAnimationFrame(() => {
      columnsContainerRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const removeColumn = (index: number) => {
    setForm((f) => {
      if (!f) return f;
      const columnRowCounts = f.columnRowCounts.filter((_, i) => i !== index);
      const columnStandCounts = f.columnStandCounts?.filter((_, i) => i !== index);
      const columnFloorCounts = f.columnFloorCounts?.filter((_, i) => i !== index);
      return { ...f, columnRowCounts, columnStandCounts, columnFloorCounts };
    });
  };

  // Sets how many stands (1, 2, or 3) the picker shows for every area in a
  // column. Lazily materializes the full array (every column = 1) the first
  // time any column gets changed.
  const updateStandCount = (colIndex: number, value: number) => {
    setForm((f) => {
      if (!f) return f;
      const columnStandCounts = f.columnRowCounts.map((_, i) => standCountForColumn(f, i));
      columnStandCounts[colIndex] = value;
      return { ...f, columnStandCounts };
    });
  };

  // Sets how many floors the picker shows for every stand in a column.
  // Lazily materializes the full array (every column = FLOOR_COUNT) the
  // first time any column's floor count gets changed.
  const updateFloorCount = (colIndex: number, value: number) => {
    setForm((f) => {
      if (!f) return f;
      const columnFloorCounts = f.columnRowCounts.map((_, i) => floorCountForColumn(f, i));
      columnFloorCounts[colIndex] = value;
      return { ...f, columnFloorCounts };
    });
  };

  const handleSave = async () => {
    if (!form) return;
    setError(null);

    const label = form.label.trim();
    const prefix = form.prefix.trim();
    if (!label || !prefix) {
      setError("Fill in the label and bin prefix.");
      return;
    }
    const key = isNew ? uniqueKeyFromLabel(label, warehouses) : form.key;
    if (form.columnRowCounts.length === 0) {
      setError("Add at least one column.");
      return;
    }
    if (form.columnRowCounts.some((n) => !Number.isFinite(n) || n < 1)) {
      setError("Every column needs at least 1 row.");
      return;
    }
    if (form.columnFloorCounts?.some((n) => !Number.isFinite(n) || n < 1)) {
      setError("Every column needs at least 1 floor.");
      return;
    }
    if (form.columnStandCounts?.some((n) => !Number.isFinite(n) || n < 1 || n > STAND_IDS.length)) {
      setError(`Every column needs 1-${STAND_IDS.length} stands.`);
      return;
    }

    setSaving(true);
    const { error: saveError } = await upsertWarehouse({
      key,
      label,
      prefix,
      columnRowCounts: form.columnRowCounts,
      columnStandCounts: form.columnStandCounts,
      columnFloorCounts: form.columnFloorCounts,
    });
    setSaving(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    setForm(null);
    load();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <WarehouseIcon className="size-6 text-primary" />
          Warehouses
        </h1>
        {!form && (
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-4" />
            Add warehouse
          </button>
        )}
      </div>

      {form && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          <h2 className="text-base font-medium text-foreground">{isNew ? "New warehouse" : `Edit ${form.label}`}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((f) => (f ? { ...f, label: e.target.value } : f))}
                placeholder="e.g. Warehouse 3"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Bin prefix</label>
              <input
                type="text"
                value={form.prefix}
                onChange={(e) => setForm((f) => (f ? { ...f, prefix: e.target.value.toUpperCase() } : f))}
                placeholder="e.g. C"
                maxLength={3}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Grid3x3 className="size-3.5" />
                Columns ({form.columnRowCounts.length})
              </label>
              <button
                type="button"
                onClick={addColumn}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
              >
                <Plus className="size-3.5" />
                Add column
              </button>
            </div>
            <div ref={columnsContainerRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto rounded-xl border border-border p-2">
              {form.columnRowCounts.map((count, i) => {
                const standCount = standCountForColumn(form, i);
                const floorCount = floorCountForColumn(form, i);
                return (
                  <div key={i} className="rounded-lg border border-border bg-card p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Column {String(i + 1).padStart(2, "0")}</span>
                      <button
                        type="button"
                        onClick={() => removeColumn(i)}
                        className="text-muted-foreground hover:text-danger"
                        aria-label={`Remove column ${i + 1}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="space-y-0.5">
                        <label className="block text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Rows</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Rows for column ${i + 1}`}
                          value={count}
                          onChange={(e) => updateColumn(i, Number(e.target.value.replace(/\D/g, "")) || 0)}
                          className="w-full rounded-md border border-border bg-card px-1 py-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="block text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Stands</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Stands for column ${i + 1}`}
                          value={standCount}
                          onChange={(e) => updateStandCount(i, Number(e.target.value.replace(/\D/g, "")) || 0)}
                          className={cn(
                            "w-full rounded-md border px-1 py-2 text-center text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                            standCount !== 1 ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground",
                          )}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="block text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Floors</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Floors for column ${i + 1}`}
                          value={floorCount}
                          onChange={(e) => updateFloorCount(i, Number(e.target.value.replace(/\D/g, "")) || 0)}
                          className={cn(
                            "w-full rounded-md border px-1 py-2 text-center text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                            floorCount !== FLOOR_COUNT ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground",
                          )}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Check className="size-4" />
              {saving ? "Saving…" : "Save warehouse"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {warehouses.length === 0 && !form ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No warehouses yet — add one to start building its bin layout.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map((w) => {
            const totalBins = w.columnRowCounts.reduce((sum, n) => sum + n, 0);
            return (
              <div key={w.key} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="flex-1 min-w-[6rem] font-medium text-foreground">{w.label}</p>
                <div className="ml-auto flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {totalBins} bins
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(w)}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    aria-label={`Edit ${w.label}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(w)}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:border-danger hover:text-danger transition-colors"
                    aria-label={`Delete ${w.label}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Link to="/" className="inline-block text-sm text-muted-foreground hover:text-foreground">
        Back to home
      </Link>

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? `Delete ${deleteTarget.label}?` : ""}
        message="Its bin layout will be lost."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
