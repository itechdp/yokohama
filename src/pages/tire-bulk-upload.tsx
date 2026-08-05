import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Check, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { buildTireFromCatalogRow, parseCatalogWorkbook, type CatalogRow } from "@/lib/tire-catalog";
import { upsertTireSkus } from "@/lib/tire-skus";
import { insertTires } from "@/lib/tires";

// Large uploads (thousands of rows) shouldn't render every row in the
// preview table — just enough to sanity-check the parse. The full parsed
// set still gets uploaded on confirm regardless of this cap.
const PREVIEW_ROW_LIMIT = 10;

export default function TireBulkUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<CatalogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setSuccess(null);
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseCatalogWorkbook(buffer);
      if (rows.length === 0) {
        setError("No rows found in that file. Expected columns: Material, Tire Description-Brand, Ply Rating Bottom, Brand.");
        setParsedRows([]);
        setFileName(null);
        return;
      }
      setFileName(file.name);
      setParsedRows(rows);
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
      setError("Upload an Excel file with Material, Tire Description-Brand, Ply Rating Bottom, and Brand.");
      return;
    }

    setUploading(true);

    const now = new Date().toISOString();
    const newTires = parsedRows.map((row, i) => buildTireFromCatalogRow(row, `t-${Date.now()}-${i}`, now));

    const [{ error: tiresError }, { error: skuError }] = await Promise.all([
      insertTires(newTires),
      upsertTireSkus(parsedRows),
    ]);
    setUploading(false);

    if (tiresError) {
      setError(`Failed to add tires to production: ${tiresError}`);
      return;
    }
    if (skuError) {
      setError(`Tires were added to production, but the SKU catalog update failed: ${skuError}`);
      return;
    }

    setSuccess(`${parsedRows.length} tire${parsedRows.length === 1 ? "" : "s"} added to production and synced to the SKU catalog.`);
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
          <p className="text-muted-foreground">
            Upload an Excel file with columns: Material, Tire Description-Brand, Ply Rating Bottom, Brand.
          </p>
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

        {parsedRows.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {parsedRows.length} tire{parsedRows.length === 1 ? "" : "s"} ready to add
              {parsedRows.length > PREVIEW_ROW_LIMIT && ` — showing the first ${PREVIEW_ROW_LIMIT}`}
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Material</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tire Description-Brand</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ply Rating Bottom</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Brand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsedRows.slice(0, PREVIEW_ROW_LIMIT).map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-foreground">{row.material}</td>
                      <td className="px-3 py-2 text-foreground">{row.description}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.plyRatingBottom || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.brand || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
