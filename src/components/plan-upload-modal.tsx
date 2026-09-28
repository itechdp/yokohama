import { useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadPlanTemplate, parsePlanWorkbook, PLAN_TEMPLATE_COLUMNS } from "@/lib/prepared-plan-import";
import { savePreparedPlan, type PreparedPlanLine } from "@/lib/prepared-plans";
import { fetchTireSkusByMaterials } from "@/lib/tire-skus";

// Upload an Excel of one or more plans instead of building them by hand on
// Prepare Plan. Shows the format (with a downloadable blank), then a preview
// of what was read — descriptions filled in from the tire catalog — before
// anything is saved.

interface PreviewLine extends PreparedPlanLine {
  // Not in the tire catalog and no description in the file — left out.
  missing: boolean;
}

interface PreviewPlan {
  planNo: string;
  lines: PreviewLine[];
  // A prepared plan with this Plan No already exists — skipped, not overwritten.
  exists: boolean;
}

const newId = (i: number) => `pp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;

export default function PlanUploadModal({
  open,
  existingPlanNos,
  onClose,
  onSaved,
}: {
  open: boolean;
  existingPlanNos: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewPlan[] | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setFileName(null);
    setPreview(null);
    setRowErrors([]);
    setError(null);
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    reset();
    setReading(true);
    try {
      const { plans, errors } = parsePlanWorkbook(await file.arrayBuffer());
      setFileName(file.name);
      setRowErrors(errors);
      if (plans.length === 0) {
        setError(`No plans found in that file. Use the columns: ${PLAN_TEMPLATE_COLUMNS.join(", ")}.`);
        return;
      }
      const skus = await fetchTireSkusByMaterials(plans.flatMap((p) => p.lines.map((l) => l.material)));
      setPreview(
        plans.map((p) => ({
          planNo: p.planNo,
          exists: existingPlanNos.includes(p.planNo),
          lines: p.lines.map((l) => {
            const sku = skus.get(l.material.toUpperCase());
            const description = sku?.description ?? l.description;
            return {
              material: sku?.material ?? l.material,
              description,
              brand: sku?.brand ?? undefined,
              plyRatingBottom: sku?.ply_rating_bottom ?? undefined,
              qty: l.qty,
              missing: !description,
            };
          }),
        })),
      );
    } catch {
      setError("Couldn't read that file. Make sure it's a valid .xlsx, .xls or .csv file.");
    } finally {
      setReading(false);
    }
  };

  const toSave = (preview ?? []).filter((p) => !p.exists && p.lines.some((l) => !l.missing));

  const handleSave = async () => {
    if (toSave.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const failed: string[] = [];
    for (const [i, p] of toSave.entries()) {
      const lines = p.lines.filter((l) => !l.missing).map(({ missing: _missing, ...line }) => line);
      const { error: saveError } = await savePreparedPlan({ id: newId(i), planNo: p.planNo, lines });
      if (saveError) failed.push(`${p.planNo}: ${saveError}`);
    }
    setSaving(false);
    const saved = toSave.length - failed.length;
    if (failed.length > 0) {
      setError(`Saved ${saved} of ${toSave.length} plans. Failed — ${failed.join("; ")}`);
      if (saved > 0) onSaved(`${saved} plan${saved === 1 ? "" : "s"} uploaded.`);
      return;
    }
    onSaved(`${saved} plan${saved === 1 ? "" : "s"} uploaded.`);
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upload plans"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            Upload plans from Excel
          </h2>
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl bg-muted/60 p-3 space-y-2 text-sm">
            <p className="font-medium text-foreground">Format</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {PLAN_TEMPLATE_COLUMNS.map((c) => (
                      <th key={c} className="border border-border bg-card px-2 py-1 text-left font-semibold text-foreground whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr>
                    <td className="border border-border px-2 py-1">SEP-26-509</td>
                    <td className="border border-border px-2 py-1">100259-36</td>
                    <td className="border border-border px-2 py-1">10</td>
                    <td className="border border-border px-2 py-1" />
                  </tr>
                  <tr>
                    <td className="border border-border px-2 py-1">SEP-26-509</td>
                    <td className="border border-border px-2 py-1">100260-36</td>
                    <td className="border border-border px-2 py-1">6</td>
                    <td className="border border-border px-2 py-1" />
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              <li>One row per tire. Several plans can go in one file — rows are grouped by Plan No.</li>
              <li>Tire description is filled in automatically from the tire catalog.</li>
              <li>A Plan No that's already prepared is skipped, not overwritten.</li>
            </ul>
            <button
              type="button"
              onClick={() => void downloadPlanTemplate()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Download className="size-3.5" />
              Download format
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={reading || saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            {reading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {reading ? "Reading file…" : fileName ? `${fileName} — choose another` : "Choose Excel file"}
          </button>

          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          {rowErrors.length > 0 && (
            <div className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning space-y-0.5">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} skipped
              </p>
              {rowErrors.slice(0, 8).map((e) => (
                <p key={e}>{e}</p>
              ))}
              {rowErrors.length > 8 && <p>…and {rowErrors.length - 8} more.</p>}
            </div>
          )}

          {preview &&
            preview.map((p) => {
              const good = p.lines.filter((l) => !l.missing);
              return (
                <div key={p.planNo} className={cn("rounded-xl border", p.exists ? "border-warning/40 opacity-70" : "border-border")}>
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <p className="font-semibold text-foreground">Plan {p.planNo}</p>
                    {p.exists ? (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">Already exists — skipped</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {good.length} tire{good.length === 1 ? "" : "s"} · {good.reduce((s, l) => s + l.qty, 0)} qty
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-border">
                    {p.lines.map((l) => (
                      <li key={l.material} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                        <div className="min-w-0">
                          <p className={cn("truncate", l.missing ? "text-danger" : "text-foreground")}>
                            {l.missing ? "Not in tire catalog — left out" : l.description}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{l.material}</p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-foreground">Qty {l.qty}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={toSave.length === 0 || saving || reading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {toSave.length > 0 ? `Save ${toSave.length} plan${toSave.length === 1 ? "" : "s"}` : "Save plans"}
          </button>
        </div>
      </div>
    </div>
  );
}
