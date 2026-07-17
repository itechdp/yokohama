import * as XLSX from "xlsx";
import type { Tire } from "@/types/tire";

export interface CatalogRow {
  material: string;
  description: string;
  plyRatingBottom: string;
  brand: string;
}

const HEADER_WORDS = /^material$/i;

// Accepts tab-separated paste (straight out of Excel/Sheets). Falls back to
// runs of 2+ spaces so plain-text lists still parse.
export function parseCatalogText(text: string): CatalogRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: CatalogRow[] = [];
  for (const line of lines) {
    let parts = line.split("\t");
    if (parts.length < 2) {
      parts = line.split(/\s{2,}/);
    }
    parts = parts.map((p) => p.trim());
    if (parts.length < 2) continue;

    const [material, description = "", plyRatingBottom = "", brand = ""] = parts;
    if (HEADER_WORDS.test(material)) continue;
    if (!material || !description) continue;

    rows.push({ material, description, plyRatingBottom, brand });
  }
  return rows;
}

// Reads the first sheet of an uploaded .xlsx/.xls/.csv file. Expects columns in
// the order Material, Tire Description-Brand, Ply Rating Bottom, Brand (a header
// row matching that is optional and gets skipped automatically).
export function parseCatalogWorkbook(data: ArrayBuffer): CatalogRow[] {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (rows.length === 0) return [];

  const firstCell = String(rows[0][0] ?? "").trim();
  const startIndex = HEADER_WORDS.test(firstCell) ? 1 : 0;

  const result: CatalogRow[] = [];
  for (let i = startIndex; i < rows.length; i++) {
    const r = rows[i];
    const material = String(r[0] ?? "").trim();
    const description = String(r[1] ?? "").trim();
    const plyRatingBottom = String(r[2] ?? "").trim();
    const brand = String(r[3] ?? "").trim();
    if (!material || !description) continue;
    result.push({ material, description, plyRatingBottom, brand });
  }
  return result;
}

export function buildTireFromCatalogRow(row: CatalogRow, id: string, now: string): Tire {
  return {
    id,
    serialNumber: row.material,
    model: row.description,
    size: "Unknown size",
    productionDate: now.split("T")[0],
    currentStage: "production",
    location: "Plant",
    status: "active",
    notes: "",
    warrantyMonths: 60,
    costPrice: 0,
    plyRatingBottom: row.plyRatingBottom || undefined,
    brand: row.brand || undefined,
    createdAt: now,
    updatedAt: now,
  };
}
