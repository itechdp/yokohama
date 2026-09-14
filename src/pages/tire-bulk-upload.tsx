import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Check, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import SelectMenu from "@/components/select-menu";
import { buildTireFromCatalogRow, parseCatalogWorkbook, type CatalogRow } from "@/lib/tire-catalog";
import { upsertTireSkus } from "@/lib/tire-skus";
import { fetchExistingSkuQrCodes, insertTires } from "@/lib/tires";

// Large uploads (thousands of rows) shouldn't render every row in the
// preview table at once — it's paginated instead, so every row stays
// reachable without ever rendering the full set to the DOM at the same time.
// The full parsed set still gets uploaded on confirm regardless of page/size.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function TireBulkUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<CatalogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [previewPage, setPreviewPage] = useState(0);
  const [previewPageSize, setPreviewPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const handleFile = async (file: File) => {
    setError(null);
    setSuccess(null);
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseCatalogWorkbook(buffer);
      if (rows.length === 0) {
        setError("No rows found in that file. Expected columns: Material, Tire Description-Brand, Ply Rating Bottom, Brand, SKU QRCode.");
        setParsedRows([]);
        setFileName(null);
        return;
      }
      setFileName(file.name);
      setParsedRows(rows);
      setPreviewPage(0);
    } catch {
      setError("Couldn't read that file. Make sure it's a valid .xlsx, .xls, or .csv file.");
      setParsedRows([]);
      setFileName(null);
    }
  };

  const handleConfirm = async () => {
    setError(null);
    setSuccess(null);
    if (parsedRows.length === 0) {
      setError("Upload an Excel file with Material, Tire Description-Brand, Ply Rating Bottom, Brand, and SKU QRCode.");
      return;
    }

    setUploading(true);

    // Rows with a SKU QR code already in the tires table (a previous upload
    // of an overlapping file) would trip the tires_sku_qr_code_unique
    // constraint and fail the whole batch, so they're skipped here instead —
    // along with any code repeated more than once within this same file,
    // which would collide with itself the same way.
    const seenInFile = new Set<string>();
    const duplicateInFile: CatalogRow[] = [];
    const dedupedRows: CatalogRow[] = [];
    for (const row of parsedRows) {
      if (row.skuQrCode && seenInFile.has(row.skuQrCode)) {
        duplicateInFile.push(row);
        continue;
      }
      if (row.skuQrCode) seenInFile.add(row.skuQrCode);
      dedupedRows.push(row);
    }

    let existingCodes: Set<string>;
    try {
      existingCodes = await fetchExistingSkuQrCodes(dedupedRows.map((r) => r.skuQrCode));
    } catch {
      setUploading(false);
      setError("Couldn't check for already-added tires — please try again.");
      return;
    }
    const alreadyInSystem = dedupedRows.filter((r) => r.skuQrCode && existingCodes.has(r.skuQrCode));
    const rowsToInsert = dedupedRows.filter((r) => !r.skuQrCode || !existingCodes.has(r.skuQrCode));

    if (rowsToInsert.length === 0) {
      setUploading(false);
      setError(
        "All rows in this file were already added previously (matched by SKU QR code) — nothing new to upload.",
      );
      return;
    }

    const now = new Date().toISOString();
    const newTires = rowsToInsert.map((row, i) => buildTireFromCatalogRow(row, `t-${Date.now()}-${i}`, now));

    const [{ error: tiresError }, { error: skuError }] = await Promise.all([
      insertTires(newTires),
      upsertTireSkus(rowsToInsert),
    ]);
    setUploading(false);

    if (tiresError) {
      const isDuplicate = tiresError.toLowerCase().includes("sku_qr_code");
      setError(
        isDuplicate
          ? "Failed to add tires: one of these SKU QR codes was just added by someone else. Please re-upload the file — already-added rows will be skipped automatically."
          : `Failed to add tires to production: ${tiresError}`,
      );
      return;
    }
    if (skuError) {
      setError(`Tires were added to production, but the SKU catalog update failed: ${skuError}`);
      return;
    }

    const skippedCount = alreadyInSystem.length + duplicateInFile.length;
    const skippedNote = skippedCount > 0 ? ` (${skippedCount} row${skippedCount === 1 ? "" : "s"} skipped — already added previously or repeated in this file)` : "";
    setSuccess(
      `${rowsToInsert.length} tire${rowsToInsert.length === 1 ? "" : "s"} added to production and synced to the SKU catalog${skippedNote}.`,
    );
    setParsedRows([]);
    setFileName(null);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <UploadCloud className="size-6 text-primary" />
            Bulk upload tires
          </h1>
        </div>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors shrink-0"
        >
          Back to home
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <FileSpreadsheet className="size-4" />
            Upload Excel file
          </button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>

        {parsedRows.length > 0 && (() => {
          const pageCount = Math.max(1, Math.ceil(parsedRows.length / previewPageSize));
          const page = Math.min(previewPage, pageCount - 1);
          const rangeStart = page * previewPageSize + 1;
          const rangeEnd = Math.min(parsedRows.length, rangeStart + previewPageSize - 1);
          const pageRows = parsedRows.slice(rangeStart - 1, rangeEnd);

          return (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {parsedRows.length} tire{parsedRows.length === 1 ? "" : "s"} ready to add — showing {rangeStart}–{rangeEnd}
                </p>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  Per page
                  <SelectMenu
                    value={String(previewPageSize)}
                    options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                    onChange={(v) => {
                      setPreviewPageSize(Number(v));
                      setPreviewPage(0);
                    }}
                    className="w-20"
                  />
                </label>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Material</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tire Description-Brand</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ply Rating Bottom</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Brand</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU QRCode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageRows.map((row, i) => (
                      <tr key={rangeStart - 1 + i}>
                        <td className="px-3 py-2 font-medium text-foreground">{row.material}</td>
                        <td className="px-3 py-2 text-foreground">{row.description}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.plyRatingBottom || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.brand || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.skuQrCode || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Page {page + 1} of {pageCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPage((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={page >= pageCount - 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {error && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
        {success && <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{success}</div>}

        <button
          onClick={handleConfirm}
          disabled={uploading || parsedRows.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {uploading
            ? "Uploading…"
            : `Add ${parsedRows.length > 0 ? `${parsedRows.length} tire${parsedRows.length === 1 ? "" : "s"}` : "tires"} to production`}
        </button>
      </div>

      <button
        onClick={() => navigate("/")}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Done — go to home
      </button>
    </div>
  );
}
