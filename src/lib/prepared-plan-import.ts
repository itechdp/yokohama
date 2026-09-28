import * as XLSX from "xlsx";
import { saveGeneratedFile } from "@/lib/native-download";

// Excel upload for Prepare Plan. Format (first sheet with a header row):
//
//   PLAN NO | MATERIAL | QTY | TIRE DESCRIPTION (optional)
//
// One file can hold several plans — rows are grouped by Plan No, and a blank
// Plan No cell carries the one above it down. Tire description is filled in
// from the tire catalog by Material; the column is only used for a Material
// that isn't in the catalog. The same Material twice in one plan adds up.

export const PLAN_TEMPLATE_COLUMNS = ["PLAN NO", "MATERIAL", "QTY", "TIRE DESCRIPTION (optional)"];

export interface ParsedPlanLine {
  material: string;
  qty: number;
  description: string;
}

export interface ParsedPlan {
  planNo: string;
  lines: ParsedPlanLine[];
}

const norm = (v: unknown) => String(v ?? "").trim();
const headerKey = (v: unknown) => norm(v).toLowerCase().replace(/[^a-z]/g, "");

// Finds the header row in the first 10 rows and which column holds what.
// Without a recognisable header, falls back to the template's column order.
function findColumns(rows: unknown[][]): { planNo: number; material: number; qty: number; description: number; dataStart: number } {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const keys = rows[i].map(headerKey);
    const material = keys.findIndex((k) => k === "material" || k === "materialno" || k === "sku" || k === "skucode");
    const qty = keys.findIndex((k) => k === "qty" || k === "quantity");
    if (material === -1 || qty === -1) continue;
    return {
      planNo: keys.findIndex((k) => k === "planno" || k === "plan" || k === "plannumber"),
      material,
      qty,
      description: keys.findIndex((k) => k.startsWith("tiredescription") || k === "description" || k === "desc"),
      dataStart: i + 1,
    };
  }
  return { planNo: 0, material: 1, qty: 2, description: 3, dataStart: 0 };
}

export function parsePlanWorkbook(data: ArrayBuffer): { plans: ParsedPlan[]; errors: string[] } {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { plans: [], errors: ["The file has no sheets."] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });

  const cols = findColumns(rows);
  const plans = new Map<string, Map<string, ParsedPlanLine>>();
  const errors: string[] = [];
  let currentPlan = "";

  for (let i = cols.dataStart; i < rows.length; i++) {
    const r = rows[i];
    const excelRow = i + 1;
    const planCell = cols.planNo === -1 ? "" : norm(r[cols.planNo]);
    if (planCell) currentPlan = planCell;
    const material = norm(r[cols.material]);
    const qtyRaw = norm(r[cols.qty]);
    const description = cols.description === -1 ? "" : norm(r[cols.description]);
    if (!material && !qtyRaw) continue;

    if (!currentPlan) {
      errors.push(`Row ${excelRow}: no Plan No.`);
      continue;
    }
    if (!material) {
      errors.push(`Row ${excelRow}: Material is empty.`);
      continue;
    }
    const qty = Number(qtyRaw);
    if (!Number.isInteger(qty) || qty < 1) {
      errors.push(`Row ${excelRow}: Qty "${qtyRaw}" for ${material} must be a whole number of 1 or more.`);
      continue;
    }

    const lines = plans.get(currentPlan) ?? new Map<string, ParsedPlanLine>();
    const key = material.toUpperCase();
    const existing = lines.get(key);
    if (existing) existing.qty += qty;
    else lines.set(key, { material, qty, description });
    plans.set(currentPlan, lines);
  }

  return {
    plans: [...plans.entries()].map(([planNo, lines]) => ({ planNo, lines: [...lines.values()] })),
    errors,
  };
}

// The blank format to fill in, with two example rows.
export async function downloadPlanTemplate(): Promise<void> {
  const ws = XLSX.utils.aoa_to_sheet([
    PLAN_TEMPLATE_COLUMNS,
    ["SEP-26-509", "100259-36", 10, ""],
    ["SEP-26-509", "100260-36", 6, ""],
  ]);
  ws["!cols"] = [{ wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plan");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  await saveGeneratedFile(buffer, "plan-upload-format.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
