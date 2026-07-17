import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Check, FileSpreadsheet, ListChecks, UploadCloud } from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { buildTireFromCatalogRow, parseCatalogText, parseCatalogWorkbook } from "@/lib/tire-catalog";
import type { Tire } from "@/types/tire";

interface CatalogEntry {
  material: string;
  model: string;
  plyRatingBottom?: string;
  brand?: string;
  count: number;
}

export default function TireBulkUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tires, setTires] = useState<Tire[]>([]);

  useEffect(() => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
  }, []);

  const rows = useMemo(() => parseCatalogText(text), [text]);

  const catalog = useMemo<CatalogEntry[]>(() => {
    const map = new Map<string, CatalogEntry>();
    for (const t of tires) {
      const existing = map.get(t.serialNumber);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(t.serialNumber, {
          material: t.serialNumber,
          model: t.model,
          plyRatingBottom: t.plyRatingBottom,
          brand: t.brand,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.material.localeCompare(b.material));
  }, [tires]);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsedRows = parseCatalogWorkbook(buffer);
      if (parsedRows.length === 0) {
        setError("No rows found in that file. Expected columns: Material, Tire Description-Brand, Ply Rating Bottom, Brand.");
        return;
      }
      setFileName(file.name);
      setText(parsedRows.map((r) => [r.material, r.description, r.plyRatingBottom, r.brand].join("\t")).join("\n"));
    } catch {
      setError("Couldn't read that file. Make sure it's a valid .xlsx, .xls, or .csv file.");
    }
  };

  const handleUpload = () => {
    setError(null);
    if (rows.length === 0) {
      setError("Paste rows or upload an Excel file with Material, Tire Description-Brand, Ply Rating Bottom, and Brand.");
      return;
    }

    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const now = new Date().toISOString();

    const newTires = rows.map((row, i) => buildTireFromCatalogRow(row, `t-${Date.now()}-${i}`, now));
    const updatedTires = [...tiresList, ...newTires];

    writeDb({ ...db, tires: updatedTires });
    setTires(updatedTires);
    setText("");
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
            Upload an Excel file or paste rows: Material, Tire Description-Brand, Ply Rating Bottom, Brand.
          </p>
        </div>
        <Link
          to="/tires"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors shrink-0"
        >
          Back to inventory
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

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Or paste rows directly</label>
          <textarea
            value={text}
            onChange={(e) => {
              setFileName(null);
              setText(e.target.value);
            }}
            rows={8}
            placeholder={"Material\tTire Description-Brand\tPly Rating Bottom\tBrand\n135046-36\t54 × 31.00-26 NHS MIGHTY MOW 10 PR TL - GALAXY\t10 PR\tGalaxy"}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{rows.length} tire{rows.length === 1 ? "" : "s"} ready to add</p>
            <div className="overflow-x-auto rounded-xl border border-border max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Material</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tire Description-Brand</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ply Rating Bottom</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Brand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => (
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

        <button
          onClick={handleUpload}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Check className="size-4" />
          Add {rows.length > 0 ? `${rows.length} tire${rows.length === 1 ? "" : "s"}` : "tires"} to production
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
          <ListChecks className="size-5 text-primary" />
          Tire types available ({catalog.length})
        </h2>
        {catalog.length === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            No tires uploaded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Material</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tire Description-Brand</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ply Rating Bottom</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Brand</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty in stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {catalog.map((c) => (
                  <tr key={c.material}>
                    <td className="px-3 py-2 font-medium text-foreground">{c.material}</td>
                    <td className="px-3 py-2 text-foreground">{c.model}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.plyRatingBottom || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.brand || "—"}</td>
                    <td className="px-3 py-2 text-right text-foreground">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button
        onClick={() => navigate("/tires")}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Done — go to inventory
      </button>
    </div>
  );
}
