import { useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { warehouseForBinCode, type WarehouseDef } from "@/data/warehouse-bins";
import { downloadInwardTemplate, INWARD_TEMPLATE_COLUMNS, parseInwardWorkbook, type ParsedInwardLocation } from "@/lib/inward-upload";
import { fetchTireSkusByMaterials } from "@/lib/tire-skus";

// Upload an Excel stock sheet instead of picking tires one at a time. Each
// distinct LOCATION in the file becomes one Inward entry (same shape the
// manual "Confirm entry" step produces) with every SKU at that location as
// its own tire line — reviewed here, pallet nos fillable inline. The import
// button hands the entries to the Inward page, which saves them to stock
// straight away — the sheet's own columns are all that's needed.

export interface UploadedTireLine {
  key: string;
  material: string;
  model: string;
  brand?: string;
  plyRatingBottom?: string;
  qty: number;
  palletNo: string;
}

export interface UploadedInwardEntry {
  tires: UploadedTireLine[];
  warehouse: WarehouseDef;
  bins: string[];
}

interface PreviewLine {
  material: string;
  model: string;
  brand?: string;
  plyRatingBottom?: string;
  qty: number;
  palletNo: string;
  // Not in the tire catalog — left out of the import.
  missing: boolean;
}

interface PreviewLocation {
  location: string;
  warehouse: WarehouseDef | null;
  lines: PreviewLine[];
}

export default function InwardUploadModal({
  open,
  warehouses,
  onClose,
  onImport,
}: {
  open: boolean;
  warehouses: WarehouseDef[];
  onClose: () => void;
  onImport: (entries: UploadedInwardEntry[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<PreviewLocation[] | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Pallet no overrides keyed by "<locationIndex>|<lineIndex>" — the file's
  // PALLET column is often blank, so it's editable here before import.
  const [palletOverrides, setPalletOverrides] = useState<Record<string, string>>({});

  if (!open) return null;

  const reset = () => {
    setFileName(null);
    setPreview(null);
    setRowErrors([]);
    setError(null);
    setPalletOverrides({});
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    reset();
    setReading(true);
    try {
      const { locations, errors }: { locations: ParsedInwardLocation[]; errors: string[] } = parseInwardWorkbook(await file.arrayBuffer());
      setFileName(file.name);
      setRowErrors(errors);
      if (locations.length === 0) {
        setError(`No rows found in that file. Use the columns: ${INWARD_TEMPLATE_COLUMNS.join(", ")}.`);
        return;
      }
      const skus = await fetchTireSkusByMaterials(locations.flatMap((l) => l.lines.map((line) => line.material)));
      setPreview(
        locations.map((loc) => ({
          location: loc.location,
          warehouse: warehouseForBinCode(warehouses, loc.location),
          lines: loc.lines.map((line) => {
            const sku = skus.get(line.material.toUpperCase());
            return {
              material: sku?.material ?? line.material,
              model: sku?.description ?? "",
              brand: sku?.brand ?? undefined,
              plyRatingBottom: sku?.ply_rating_bottom ?? undefined,
              qty: line.qty,
              palletNo: line.palletNo,
              missing: !sku,
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

  const palletFor = (locIdx: number, lineIdx: number, fileValue: string) =>
    palletOverrides[`${locIdx}|${lineIdx}`] ?? fileValue;

  const setPalletFor = (locIdx: number, lineIdx: number, value: string) =>
    setPalletOverrides((prev) => ({ ...prev, [`${locIdx}|${lineIdx}`]: value }));

  // A location is importable once its warehouse is resolved and at least one
  // of its tire lines is in the catalog with a pallet no filled in.
  const importableLocations = (preview ?? [])
    .map((loc, locIdx) => ({
      loc,
      locIdx,
      goodLines: loc.lines
        .map((line, lineIdx) => ({ line, lineIdx, palletNo: palletFor(locIdx, lineIdx, line.palletNo).trim() }))
        .filter(({ line, palletNo }) => !line.missing && palletNo),
    }))
    .filter(({ loc, goodLines }) => loc.warehouse && goodLines.length > 0);

  const totalTires = importableLocations.reduce((sum, { goodLines }) => sum + goodLines.reduce((s, g) => s + g.line.qty, 0), 0);

  const handleImport = () => {
    if (importableLocations.length === 0) return;
    const entries: UploadedInwardEntry[] = importableLocations.map(({ loc, goodLines }, i) => ({
      warehouse: loc.warehouse!,
      bins: [loc.location],
      tires: goodLines.map(({ line, lineIdx, palletNo }, k) => ({
        key: `${line.material}-${i}-${lineIdx}-${k}`,
        material: line.material,
        model: line.model,
        brand: line.brand,
        plyRatingBottom: line.plyRatingBottom,
        qty: line.qty,
        palletNo,
      })),
    }));
    onImport(entries);
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upload inward stock"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            Upload stock from Excel
          </h2>
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <button
            type="button"
            onClick={() => void downloadInwardTemplate()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Download className="size-3.5" />
            Download format
          </button>

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
            disabled={reading}
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
            preview.map((loc, locIdx) => (
              <div
                key={`${loc.location}-${locIdx}`}
                className={cn("rounded-xl border", loc.warehouse ? "border-border" : "border-danger/40")}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <p className="font-semibold text-foreground">{loc.location}</p>
                  {loc.warehouse ? (
                    <span className="text-xs text-muted-foreground">{loc.warehouse.label}</span>
                  ) : (
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                      No matching warehouse — skipped
                    </span>
                  )}
                </div>
                <ul className="divide-y divide-border">
                  {loc.lines.map((line, lineIdx) => {
                    const pallet = palletFor(locIdx, lineIdx, line.palletNo);
                    return (
                      <li key={`${line.material}-${lineIdx}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate", line.missing ? "text-danger" : "text-foreground")}>
                            {line.missing ? "Not in tire catalog — left out" : line.model}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {line.material} · Qty {line.qty}
                          </p>
                        </div>
                        {!line.missing && loc.warehouse && (
                          <input
                            type="text"
                            value={pallet}
                            onChange={(e) => setPalletFor(locIdx, lineIdx, e.target.value)}
                            placeholder="Pallet no"
                            className={cn(
                              "w-28 shrink-0 rounded-lg border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                              pallet.trim() ? "border-border" : "border-danger/50",
                            )}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importableLocations.length === 0 || reading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {importableLocations.length > 0
              ? `Inward ${importableLocations.length} entr${importableLocations.length === 1 ? "y" : "ies"} (${totalTires} tires)`
              : "Inward"}
          </button>
        </div>
      </div>
    </div>
  );
}
