import * as XLSX from "xlsx";
import type { Tire } from "@/types/tire";

export interface CatalogRow {
  material: string;
  description: string;
  plyRatingBottom: string;
  brand: string;
  skuQrCode: string;
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

    const [material, description = "", plyRatingBottom = "", brand = "", skuQrCode = ""] = parts;
    if (HEADER_WORDS.test(material)) continue;
    if (!material || !description) continue;

    rows.push({ material, description, plyRatingBottom, brand, skuQrCode });
  }
  return rows;
}

// Yokohama's "Traceability Register" export packs everything we need into
// two columns: "SKU QRCode" (the scan code) and "SKU Details" (a multi-line
// cell like "SKU:90600012AL-IG\nSKU Desc:10-16.5 AL SK906 10 PR 134 A2 TL\n
// Size:10X16.5NHS"). Ply rating and brand aren't present anywhere in that
// export, so they're left as "-".
const SKU_LINE = /(?:^|\n)\s*SKU\s*:\s*([^\r\n]+)/i;
const SKU_DESC_LINE = /(?:^|\n)\s*SKU\s*Desc\s*:\s*([^\r\n]+)/i;

// Scans the first few rows of a sheet for the traceability register's header
// row (title/group rows precede it), identified by having both "SKU QRCode"
// and "SKU Details" columns. Returns their column indices and the row index
// data starts on, or null if this sheet isn't in that format.
function findTraceabilityHeader(rows: unknown[][]): { skuQrCodeCol: number; skuDetailsCol: number; dataStart: number } | null {
  const searchLimit = Math.min(rows.length, 10);
  for (let i = 0; i < searchLimit; i++) {
    const row = rows[i];
    let skuQrCodeCol = -1;
    let skuDetailsCol = -1;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim().toLowerCase();
      if (cell === "sku qrcode") skuQrCodeCol = c;
      if (cell === "sku details") skuDetailsCol = c;
    }
    if (skuQrCodeCol !== -1 && skuDetailsCol !== -1) {
      return { skuQrCodeCol, skuDetailsCol, dataStart: i + 1 };
    }
  }
  return null;
}

function parseTraceabilitySheet(rows: unknown[][], header: { skuQrCodeCol: number; skuDetailsCol: number; dataStart: number }): CatalogRow[] {
  const result: CatalogRow[] = [];
  for (let i = header.dataStart; i < rows.length; i++) {
    const r = rows[i];
    const skuQrCode = String(r[header.skuQrCodeCol] ?? "").trim();
    const skuDetails = String(r[header.skuDetailsCol] ?? "");

    const materialMatch = SKU_LINE.exec(skuDetails);
    const descMatch = SKU_DESC_LINE.exec(skuDetails);
    const material = materialMatch?.[1]?.trim() ?? "";
    const description = descMatch?.[1]?.trim() ?? "";
    if (!material || !description) continue;

    result.push({ material, description, plyRatingBottom: "-", brand: "-", skuQrCode });
  }
  return result;
}

// Reads every sheet of an uploaded .xlsx/.xls/.csv file (workbooks with
// multiple tabs are common — e.g. a spreadsheet split across "Sheet1" /
// "Sheet2" — and rows on any tab but the first used to get silently dropped).
// Each sheet is checked against the traceability register format first
// ("SKU QRCode" + "SKU Details" columns); otherwise it falls back to the
// plain positional format: Material, Tire Description-Brand, Ply Rating
// Bottom, Brand, SKU QRCode (a header row matching that is optional and gets
// skipped automatically; SKU QRCode is optional per row).
export function parseCatalogWorkbook(data: ArrayBuffer): CatalogRow[] {
  const workbook = XLSX.read(data, { type: "array" });
  const result: CatalogRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
    if (rows.length === 0) continue;

    const traceabilityHeader = findTraceabilityHeader(rows);
    if (traceabilityHeader) {
      result.push(...parseTraceabilitySheet(rows, traceabilityHeader));
      continue;
    }

    const firstCell = String(rows[0][0] ?? "").trim();
    const startIndex = HEADER_WORDS.test(firstCell) ? 1 : 0;

    for (let i = startIndex; i < rows.length; i++) {
      const r = rows[i];
      const material = String(r[0] ?? "").trim();
      const description = String(r[1] ?? "").trim();
      const plyRatingBottom = String(r[2] ?? "").trim();
      const brand = String(r[3] ?? "").trim();
      const skuQrCode = String(r[4] ?? "").trim();
      if (!material || !description) continue;
      result.push({ material, description, plyRatingBottom, brand, skuQrCode });
    }
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
    skuQrCode: row.skuQrCode || undefined,
    createdAt: now,
    updatedAt: now,
  };
}
